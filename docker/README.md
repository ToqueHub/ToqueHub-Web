# ToqueHub Docker workspace

## Prototype ToqueHub complet

Le prototype Docker lance les briques principales de ToqueHub:

- interface web sur `http://localhost:8080`
- API NestJS derriere `/api`
- Swagger sur `http://localhost:8080/api/docs`
- PostgreSQL persistant
- Mosquitto MQTT
- Zigbee2MQTT sur `http://localhost:8081`
- updater interne pour les mises a jour admin depuis ToqueHub

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

Si les ports par defaut sont deja occupes, le script choisit automatiquement les prochains ports libres:

- `TOQUEHUB_HTTP_PORT`, par defaut `8080`
- `ZIGBEE2MQTT_HTTP_PORT`, par defaut `8081`
- `MQTT_PORT`, par defaut `1883`

Les ports retenus sont ecrits dans `.env.docker` et affiches a la fin du setup.

Les donnees PostgreSQL, fichiers uploades, sauvegardes, Mosquitto et Zigbee2MQTT sont persistants via volumes Docker ou dossier local `.toquehub-iot`.

## Versions et mises a jour

Les mises a jour utilisateur suivent le canal stable: une version devient disponible quand un tag GitHub `v*` publie une release et les images Docker multi-arch.

Dans ToqueHub:

```text
Organisation > General > Version et mise a jour
```

L'onglet admin affiche la version installee, la derniere release GitHub, les images Docker courantes et les logs de l'operation. Le bouton de mise a jour appelle le service `updater`, seul conteneur autorise a utiliser le socket Docker. Avant update, il cree un backup PostgreSQL local, tire les nouvelles images, redemarre API/Web et tente un rollback si le healthcheck echoue.

Sur Raspberry Pi, l'image SD sert aux nouvelles installations et aux changements systeme. Les mises a jour applicatives normales tirent seulement les nouvelles images Docker `arm64`.

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
- `ghcr.io/powarthy/toquehub-updater`

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

## Installation Ubuntu Server fraiche

Sur une installation Ubuntu Server neuve, une seule commande peut installer les prerequis, cloner ToqueHub, generer les secrets locaux et lancer Docker Compose:

```bash
sudo apt-get update && sudo apt-get install -y curl ca-certificates && \
curl -fsSL https://raw.githubusercontent.com/Powarthy/toquehub/main/scripts/install-toquehub-ubuntu.sh | bash
```

Le script installe:

- Git, curl, OpenSSL et certificats
- Node.js 22 + npm
- Docker Engine + Docker Compose plugin
- ToqueHub dans `/opt/toquehub`
- `.env.docker` avec secrets generes
- les conteneurs web, API, PostgreSQL, Mosquitto et Zigbee2MQTT
- ports libres selectionnes automatiquement si `8080`, `8081` ou `1883` sont occupes

Options utiles:

```bash
sudo apt-get update && sudo apt-get install -y curl ca-certificates && \
curl -fsSL https://raw.githubusercontent.com/Powarthy/toquehub/main/scripts/install-toquehub-ubuntu.sh | \
  TOQUEHUB_INSTALL_DIR=/opt/toquehub \
  TOQUEHUB_HTTP_PORT=8080 \
  ZIGBEE2MQTT_HTTP_PORT=8081 \
  MQTT_PORT=1883 \
  bash
```

Depuis un clone local:

```bash
npm run ubuntu:install
```

Apres installation:

```bash
cd /opt/toquehub
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f api web postgres mosquitto zigbee2mqtt
```

URL par defaut:

```text
http://IP_DU_SERVEUR:8080
```

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
