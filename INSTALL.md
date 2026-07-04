# ToqueHub installation

## Ubuntu Server

Run this on a fresh Ubuntu Server:

```bash
curl -fsSL https://raw.githubusercontent.com/ToqueHub/ToqueHub-Web/1.0.0/scripts/install-toquehub-ubuntu.sh | bash
```

The installer sets up system packages, Node.js, Docker Engine, Docker Compose, ToqueHub, PostgreSQL, Mosquitto, Zigbee2MQTT, the web app, the API and the updater.

Open ToqueHub after install:

```text
http://SERVER_IP:8080
```

Useful commands:

```bash
cd /opt/toquehub
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f api web postgres mosquitto zigbee2mqtt updater
docker compose --env-file .env.docker up -d
```

## Raspberry Pi OS 64-bit

On Raspberry Pi OS Lite 64-bit:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
git clone --branch 1.0.0 https://github.com/ToqueHub/ToqueHub-Web.git toquehub
cd toquehub
./scripts/install-toquehub-pi.sh
```

Open ToqueHub after install:

```text
http://toquehub.local:8080
```

Useful commands on the Pi:

```bash
toquehub status
toquehub logs
toquehub update
toquehub restart
```

## Docker images

Stable Docker images are published by GitHub Actions to:

```text
ghcr.io/toquehub/toquehub-api
ghcr.io/toquehub/toquehub-web
ghcr.io/toquehub/toquehub-updater
```

The workflow publishes `linux/amd64` for Ubuntu PCs and `linux/arm64` for Raspberry Pi.
