# ToqueHub Docker workspace

## Prototype ToqueHub complet

Le prototype Docker lance les briques principales de ToqueHub:

- interface web sur `http://localhost:8080`
- API NestJS derriere `/api`
- Swagger sur `http://localhost:8080/api/docs`
- PostgreSQL persistant
- Mosquitto MQTT
- Zigbee2MQTT sur `http://localhost:8081`

Premiere preparation:

```bash
npm run docker:setup
```

Lancement:

```bash
npm run docker:up
```

Arret:

```bash
npm run docker:down
```

Logs:

```bash
npm run docker:logs
```

Le script cree `.env.docker` depuis `.env.docker.example` si besoin et prepare `.toquehub-iot/zigbee2mqtt-data/configuration.yaml`.

Les donnees PostgreSQL, fichiers uploades, sauvegardes, Mosquitto et Zigbee2MQTT sont persistants via volumes Docker ou dossier local `.toquehub-iot`.

Si la cle Zigbee n'est pas detectee automatiquement, modifie `ZIGBEE_ADAPTER_PATH` dans `.env.docker`, puis relance:

```bash
npm run docker:down
npm run docker:up
```

Ce prototype cible Raspberry Pi OS 64 bits et Linux PC 64 bits. Le support PC 32 bits n'est pas prevu pour cette version.

## Images Docker multi-arch

Les images installables pour Raspberry Pi et vieux PC 64 bits sont publiees sur GHCR:

- `ghcr.io/powarthy/toquehub-api`
- `ghcr.io/powarthy/toquehub-web`

Publication manuelle:

```bash
npm run docker:publish
```

Par defaut, le script construit et pousse:

- `linux/arm64` pour Raspberry Pi 4/5 64 bits
- `linux/amd64` pour PC Linux 64 bits

Pour tester localement une seule architecture sans push:

```bash
npm run docker:publish -- --load --platforms linux/arm64
```

Le workflow GitHub `.github/workflows/docker-publish.yml` publie les images sur GHCR lors d'un tag `v*` ou via lancement manuel.

## Installation Raspberry Pi par script

Sur un Raspberry Pi OS Lite 64 bits deja flashe:

```bash
git clone https://github.com/Powarthy/toquehub.git
cd toquehub
npm run pi:install
```

Le script installe Docker si necessaire, copie les fichiers ToqueHub dans `/opt/toquehub`, genere les secrets dans `/etc/toquehub/toquehub.env`, cree les dossiers persistants dans `/var/lib/toquehub`, puis demarre ToqueHub.

URL par defaut:

```text
http://toquehub.local:8080
```

Commandes sur le Pi:

```bash
toquehub status
toquehub logs
toquehub update
toquehub backup
toquehub restart
```

## Image SD Raspberry Pi

Les assets de l'image SD sont dans `raspberry-pi/`.

Construction depuis un builder Linux ou Raspberry Pi OS 64 bits avec au moins 25-30 Go libres:

```bash
npm run pi:image
```

Ce script prepare un projet `rpi-image-gen`, copie l'overlay ToqueHub et lance la generation de l'image. Sur macOS, il s'arrete volontairement: `rpi-image-gen` indique fonctionner au mieux sur Raspberry Pi OS/Debian arm64 avec les capacites systeme necessaires.

L'image cible est une appliance Raspberry Pi OS Lite 64 bits:

- Docker + Compose preinstalles
- ToqueHub demarre au boot via systemd
- secrets generes au premier demarrage
- Zigbee2MQTT active seulement si une cle Zigbee USB est detectee
- Wi-Fi, SSH et hostname a configurer avec Raspberry Pi Imager avant flash

## Profil HACCP IoT

Le profil IoT fournit Mosquitto et Zigbee2MQTT pour les capteurs HACCP Zigbee.

Sur Raspberry Pi ou PC Linux avec Docker:

```bash
npm run iot:docker:up
```

Le script prépare `.toquehub-iot/zigbee2mqtt-data/configuration.yaml`, détecte un coordinateur Zigbee USB si possible, met à jour `.env`, puis démarre:

- Mosquitto sur `localhost:1883`
- Zigbee2MQTT sur `http://localhost:8080`

Si la clé Zigbee n’est pas détectée automatiquement:

```bash
ZIGBEE_ADAPTER_PATH=/dev/ttyUSB0 npm run iot:docker:up
```

Commandes utiles:

```bash
npm run iot:docker:logs
npm run iot:docker:down
```
