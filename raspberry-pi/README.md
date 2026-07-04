# ToqueHub Raspberry Pi image

This directory contains the appliance image assets for Raspberry Pi 4/5 64-bit.

The target image is Raspberry Pi OS Lite 64-bit with Docker installed, ToqueHub
Compose files under `/opt/toquehub`, configuration under `/etc/toquehub`, and
persistent data under `/var/lib/toquehub`.

## Build strategy

ToqueHub is not compiled on the Raspberry Pi at first boot. Publish the Docker
images first:

```bash
npm run docker:publish
```

Then build the SD image on a Linux or Raspberry Pi OS 64-bit builder with enough
free disk space:

```bash
npm run pi:image
```

The image build uses `rpi-image-gen` when available. The wrapper copies the
ToqueHub overlay into the image project and leaves the exact image artifact in
`raspberry-pi/build/`.

## Runtime

After flashing with Raspberry Pi Imager, set Wi-Fi, SSH and hostname in Imager.
On first boot:

- secrets are generated in `/etc/toquehub/toquehub.env`
- Docker Compose pulls the published ToqueHub images
- ToqueHub starts automatically
- Zigbee2MQTT is enabled only when a Zigbee USB adapter is detected

Useful commands on the Pi:

```bash
toquehub status
toquehub logs
toquehub update
toquehub backup
toquehub restart
```

Default URL:

```text
http://toquehub.local:8080
```
