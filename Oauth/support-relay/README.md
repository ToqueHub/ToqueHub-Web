# ToqueHub Support Relay — Fly.io

Ce service central gère le bot Telegram pour Kokki. Il est séparé de chaque installation client : le token Telegram et les identifiants des bénévoles ne quittent jamais Fly.

## Premier déploiement

```sh
cd Oauth/support-relay
fly apps create toquehub-support-relay
openssl rand -hex 32
fly secrets set \
  DATABASE_URL='postgresql://…' \
  TELEGRAM_BOT_TOKEN='…' \
  TELEGRAM_SUPPORT_CHAT_ID='-100…' \
  TELEGRAM_OPERATOR_IDS='12345,67890' \
  TELEGRAM_WEBHOOK_SECRET='COLLE_LA_CLE' \
  SUPPORT_RELAY_ADMIN_TOKEN='UNE_AUTRE_CLE_LONGUE' \
  -a toquehub-support-relay
./deploy.sh
```

Le service nécessite une base PostgreSQL dédiée. Appliquez les migrations du monorepo ToqueHub-Web sur cette base avant le premier déploiement : `DATABASE_URL='…' npm run prisma:deploy -w apps/api`.

Le webhook du bot est configuré automatiquement au démarrage vers :

```text
https://toquehub-support-relay.fly.dev/v1/telegram/webhook
```

avec `TELEGRAM_WEBHOOK_SECRET` comme secret token. Le test de santé est disponible sur `/v1/health`.

L’adresse active est `https://toquehub-support-relay.fly.dev`. Un domaine personnalisé peut être ajouté ultérieurement.

## Bloquer une installation

Conservez `SUPPORT_RELAY_ADMIN_TOKEN` uniquement dans Fly. Il permet de lister puis de bloquer une installation abusive, sans toucher aux autres clients :

```sh
curl -H "X-Support-Admin-Token: $SUPPORT_RELAY_ADMIN_TOKEN" https://support.toquehub.app/v1/admin/installations
curl -X POST -H "X-Support-Admin-Token: $SUPPORT_RELAY_ADMIN_TOKEN" https://support.toquehub.app/v1/admin/installations/INSTANCE_ID/block
```
