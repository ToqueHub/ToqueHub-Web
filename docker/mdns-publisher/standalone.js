const { Bonjour } = require('bonjour-service');

const truthy = (value) => ['true', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const enabled = process.env.TOQUEHUB_DISCOVERY_ENABLED == null || truthy(process.env.TOQUEHUB_DISCOVERY_ENABLED);
const host = String(process.env.TOQUEHUB_DISCOVERY_HOST || '').trim();
const port = Number(process.env.TOQUEHUB_DISCOVERY_PORT || process.env.TOQUEHUB_HTTP_PORT || 8080);
const https = truthy(process.env.TOQUEHUB_DISCOVERY_HTTPS);
const discoveryUrl = process.env.TOQUEHUB_DISCOVERY_URL || `http://127.0.0.1:${port}/api/discovery`;

if (!enabled) {
  console.log('ToqueHub mDNS publisher disabled by TOQUEHUB_DISCOVERY_ENABLED.');
  setInterval(() => undefined, 60_000);
} else if (!host) {
  console.warn('TOQUEHUB_DISCOVERY_HOST is empty; mDNS will start but mobile clients may not resolve the host reliably.');
}

let bonjour;
let service;

const stop = () => {
  if (service?.published) service.stop();
  service = undefined;
  if (bonjour) bonjour.destroy();
  bonjour = undefined;
};

const readDiscoveryInfo = async () => {
  for (;;) {
    try {
      const response = await fetch(discoveryUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.instanceId && data?.instanceName) return data;
      throw new Error('Invalid discovery payload');
    } catch (error) {
      console.warn(`Waiting for ToqueHub discovery endpoint ${discoveryUrl}: ${error.message}`);
      await sleep(3000);
    }
  }
};

const publish = async () => {
  if (!enabled) return;
  const info = await readDiscoveryInfo();
  const name = String(process.env.TOQUEHUB_DISCOVERY_NAME || info.instanceName || 'ToqueHub').trim();
  const instanceSuffix = String(info.instanceId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const serviceName = instanceSuffix ? `${name} (${instanceSuffix})` : name;
  const organization = String(process.env.TOQUEHUB_DISCOVERY_ORGANIZATION || info.organization || name).trim();

  stop();
  bonjour = new Bonjour(undefined, (error) => {
    console.warn(`mDNS error: ${error.message}`);
  });

  service = bonjour.publish({
    name: serviceName,
    type: 'toquehub',
    protocol: 'tcp',
    port,
    host: host || undefined,
    // The stable instance suffix prevents collisions with other ToqueHub
    // servers; skipping the probe avoids stale records after a restart.
    probe: false,
    txt: {
      instanceId: String(info.instanceId),
      instanceName: name,
      version: String(info.version || ''),
      apiVersion: String(info.apiVersion || 1),
      organization,
      https: String(https),
      ...(host ? { host } : {}),
      port: String(port),
    },
  });

  service.on('up', () => {
    console.log(`ToqueHub mDNS published: ${serviceName}._toquehub._tcp.local -> ${host || 'default-host'}:${port}`);
  });
  service.on('error', (error) => {
    console.warn(`mDNS publish failed: ${error.message}`);
  });
};

process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});
process.on('SIGINT', () => {
  stop();
  process.exit(0);
});

void publish();
