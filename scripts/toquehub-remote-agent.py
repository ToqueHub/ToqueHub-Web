#!/usr/bin/env python3
import json
import os
import re
import shutil
import socket
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get("TOQUEHUB_REMOTE_AGENT_HOST", "0.0.0.0")
PORT = int(os.environ.get("TOQUEHUB_REMOTE_AGENT_PORT", "3101"))
SECRET = os.environ.get("TOQUEHUB_REMOTE_AGENT_SECRET", "")
ENV_FILE = Path(os.environ.get("TOQUEHUB_REMOTE_AGENT_ENV_FILE", "/etc/toquehub/toquehub.env"))
LOGIN_RE = re.compile(r"https://login\.tailscale\.com/[^\s]+")


def read_env():
    values = {}
    if not ENV_FILE.exists():
        return values
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values


def set_env(key, value):
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
    found = False
    next_lines = []
    for line in lines:
        if line.startswith(f"{key}="):
            next_lines.append(f"{key}={value}")
            found = True
        else:
            next_lines.append(line)
    if not found:
        next_lines.append(f"{key}={value}")
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    ENV_FILE.write_text("\n".join(next_lines).rstrip() + "\n", encoding="utf-8")
    try:
        ENV_FILE.chmod(0o600)
    except OSError:
        pass


def run(args, timeout=20):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        return result.returncode, (result.stdout or "") + (result.stderr or "")
    except subprocess.TimeoutExpired as error:
        output = ""
        if error.stdout:
            output += error.stdout if isinstance(error.stdout, str) else error.stdout.decode("utf-8", "ignore")
        if error.stderr:
            output += error.stderr if isinstance(error.stderr, str) else error.stderr.decode("utf-8", "ignore")
        return 124, output
    except OSError as error:
        return 127, str(error)


def tailscale_installed():
    return shutil.which("tailscale") is not None


def tailscale_ip():
    if not tailscale_installed():
        return ""
    code, output = run(["tailscale", "ip", "-4"], timeout=8)
    if code != 0:
        return ""
    return output.strip().splitlines()[0] if output.strip() else ""


def tailscale_dns_name():
    """Return the MagicDNS name assigned by the tailnet, without its final dot."""
    if not tailscale_installed():
        return ""
    code, output = run(["tailscale", "status", "--json"], timeout=8)
    if code != 0:
        return ""
    try:
        dns_name = json.loads(output).get("Self", {}).get("DNSName", "")
    except json.JSONDecodeError:
        return ""
    return dns_name.rstrip(".") if isinstance(dns_name, str) else ""


def magic_dns_resolves(dns_name, attempts=5):
    """Confirm that this host accepts the tailnet DNS configuration."""
    if not dns_name:
        return False
    for attempt in range(attempts):
        try:
            socket.getaddrinfo(dns_name, None, socket.AF_INET)
            return True
        except socket.gaierror:
            if attempt + 1 < attempts:
                time.sleep(1)
    return False


def remote_url(host, env):
    if not host:
        return ""
    port = env.get('TOQUEHUB_HTTP_PORT', '8080')
    return f"http://{host}" if port == "80" else f"http://{host}:{port}"


def sync_env(status, ip="", dns_name="", url=""):
    set_env("TOQUEHUB_TAILSCALE_INSTALLED", "true" if tailscale_installed() else "false")
    set_env("TOQUEHUB_TAILSCALE_ENABLED", "true" if status in ("active", "needs_login") else "false")
    set_env("TOQUEHUB_TAILSCALE_IP", ip)
    set_env("TOQUEHUB_TAILSCALE_DNS_NAME", dns_name)
    set_env("TOQUEHUB_REMOTE_ACCESS_URL", url)


def status_payload(message=None, login_url=None):
    env = read_env()
    hostname = env.get("TOQUEHUB_TAILSCALE_HOSTNAME", "toquehub") or "toquehub"
    if not tailscale_installed():
        return {
            "status": "unavailable",
            "url": None,
            "loginUrl": None,
            "hostname": hostname,
            "ip": None,
            "message": message or "Tailscale n'est pas installé sur cette machine.",
        }
    ip = tailscale_ip()
    if ip:
        dns_name = tailscale_dns_name()
        dns_url = remote_url(dns_name, env)
        magic_dns_ready = magic_dns_resolves(dns_name)
        url = dns_url if magic_dns_ready else remote_url(ip, env)
        sync_env("active", ip, dns_name, url)
        if magic_dns_ready:
            active_message = "Accès distant actif avec adresse MagicDNS."
        elif dns_name:
            active_message = (
                "Accès distant actif par IP Tailscale. L’adresse MagicDNS a été détectée, "
                "mais n’est pas encore résolue : vérifiez MagicDNS dans l’administration Tailscale."
            )
        else:
            active_message = "Accès distant actif par IP Tailscale."
        return {
            "status": "active",
            "url": url,
            "loginUrl": None,
            "hostname": hostname,
            "dnsName": dns_name or None,
            "dnsUrl": dns_url or None,
            "magicDnsReady": magic_dns_ready,
            "ip": ip,
            "message": message or active_message,
        }
    sync_env("needs_login" if login_url else "inactive")
    return {
        "status": "needs_login" if login_url else "inactive",
        "url": None,
        "loginUrl": login_url,
        "hostname": hostname,
        "ip": None,
        "message": message or ("Connexion Tailscale à finaliser." if login_url else "Accès distant prêt à être activé."),
    }


def activate_payload():
    env = read_env()
    hostname = env.get("TOQUEHUB_TAILSCALE_HOSTNAME", "toquehub") or "toquehub"
    if not tailscale_installed():
        return status_payload("Tailscale n'est pas installé sur cette machine.")
    authkey = env.get("TOQUEHUB_TAILSCALE_AUTHKEY", "").strip()
    args = ["tailscale", "up", "--hostname", hostname]
    if authkey:
        args.extend(["--authkey", authkey])
    code, output = run(args, timeout=25)
    ip = tailscale_ip()
    if ip:
        if authkey:
            set_env("TOQUEHUB_TAILSCALE_AUTHKEY", "")
        return status_payload()
    match = LOGIN_RE.search(output)
    if match:
        return status_payload("Ouvrez le lien Tailscale pour connecter cette machine.", match.group(0))
    return status_payload(output.strip() or f"Activation Tailscale incomplète (code {code}).")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def respond(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        return SECRET and self.headers.get("X-ToqueHub-Remote-Agent-Secret") == SECRET

    def handle_request(self, method):
        if self.path == "/health":
            return self.respond(200, {"ok": True})
        if not self.authorized():
            return self.respond(403, {"status": "unavailable", "message": "Secret agent invalide."})
        if method == "GET" and self.path == "/status":
            return self.respond(200, status_payload())
        if method == "POST" and self.path == "/activate":
            return self.respond(200, activate_payload())
        if method == "POST" and self.path == "/refresh":
            return self.respond(200, status_payload())
        return self.respond(404, {"error": "Not found"})

    def do_GET(self):
        self.handle_request("GET")

    def do_POST(self):
        self.handle_request("POST")


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
