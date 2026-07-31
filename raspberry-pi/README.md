# ToqueHub Raspberry Pi image

This directory contains the appliance image assets for Raspberry Pi 4 64-bit.

The target image is Raspberry Pi OS Lite 64-bit with Docker installed, ToqueHub
Compose files under `/opt/toquehub`, configuration under `/etc/toquehub`, and
persistent data under `/var/lib/toquehub`.

## Build strategy

ToqueHub is not compiled on the Raspberry Pi at first boot. Build four ARM64
Docker archives first, then provide their directory and an SSH public key:

```bash
TOQUEHUB_RPI_RELEASE_TAG=1.1.45 \
TOQUEHUB_RPI_SSH_PUBLIC_KEY_FILE=/secure/path/to/toquehub_pi_test_ed25519.pub \
TOQUEHUB_RPI_CONTAINER_BUNDLE_DIR=/secure/path/to/arm64-images \
npm run pi:image
```

The required archive names are:

- `toquehub-api-1.1.45-arm64.tar`
- `toquehub-web-1.1.45-arm64.tar`
- `toquehub-mdns-1.1.45-arm64.tar`
- `toquehub-updater-1.1.45-arm64.tar`

They are verified and loaded into Docker on first boot, then removed to reclaim
space. Public third-party images are downloaded normally.

The image build uses `rpi-image-gen` v2.7.0 by default. The wrapper copies the
ToqueHub appliance layer into the image project and leaves the exact image
artifact in `raspberry-pi/build/rpi-image-gen/work/`.

Quick builder checklist:

```bash
sudo apt-get update
sudo apt-get install -y git sudo binfmt-support qemu-user-static debian-archive-keyring
git clone https://github.com/ToqueHub/ToqueHub-Web.git
cd ToqueHub-Web
npm run pi:image
```

To only prepare the generated `rpi-image-gen` project before launching the long
image build:

```bash
./scripts/build-rpi-image.sh --prepare-only
```

Useful overrides:

```bash
TOQUEHUB_RPI_WORK_DIR=/mnt/build/toquehub-rpi npm run pi:image
TOQUEHUB_RPI_IMAGE_NAME=toquehub-2026-07-04 npm run pi:image
RPI_IMAGE_GEN_REF=v2.7.0 npm run pi:image
```

If `rpi-image-gen` reports mount, namespace or chroot permission errors on a VM
or container, rebuild on native Raspberry Pi OS/Debian arm64 or give the builder
the required privileged namespace capabilities. Native Raspberry Pi 5 with SSD or
NVMe is the smoothest test path.

## Runtime

After flashing with Raspberry Pi Imager, set Wi-Fi, SSH and hostname in Imager.
On first boot:

- secrets are generated in `/etc/toquehub/toquehub.env`
- Tailscale is installed/enabled for private remote access when
  `TOQUEHUB_TAILSCALE_ENABLED=true`
- the ToqueHub remote access agent starts automatically

When the machine joins a tailnet with MagicDNS enabled, ToqueHub automatically
uses the assigned `*.ts.net` address for remote access and retains the
Tailscale IP as a fallback. Run `toquehub address` after connecting Tailscale
to display and verify both addresses.
- Docker Compose pulls the published ToqueHub images
- ToqueHub starts automatically
- Zigbee2MQTT is enabled only when a Zigbee USB adapter is detected. The Sonoff
  Dongle Lite MG21 and ZBDongle-E are configured automatically with the `ember`
  adapter; TI-based coordinators use `zstack`.

Useful commands on the Pi:

```bash
toquehub status
toquehub logs
toquehub update
toquehub backup
toquehub restart
toquehub remote-status
toquehub remote-up
```

First boot validation:

```bash
systemctl status toquehub-firstboot.service --no-pager
systemctl status toquehub.service --no-pager
systemctl status toquehub-remote-agent.service --no-pager
command -v tailscale && tailscale status
docker compose --env-file /etc/toquehub/toquehub.env -f /opt/toquehub/docker-compose.pi.yml ps
curl -fsS http://localhost/api/system/status
```

Default URL:

```text
http://toquehub.local
```
