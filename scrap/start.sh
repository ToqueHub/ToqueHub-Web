#!/bin/sh

echo "=== DEMARRAGE DU CONTAINER TOQUEHUB RNM ==="

# 1. Attente ou application directe des migrations de base de données
echo "Application des schémas Prisma sur la base de données..."
npx prisma db push --accept-data-loss

# 2. Vérification s'il faut démarrer le cron daemon en arrière-plan
if [ "$RUN_CRON_DAEMON" = "true" ]; then
  echo "Démarrage du cron daemon en arrière-plan (programmé à 2h00 du matin)..."
  npx ts-node scripts/cron-daemon.ts &
else
  echo "Le cron daemon en arrière-plan n'est pas activé (RUN_CRON_DAEMON n'est pas à true)."
  echo "Conseillé : configurez une tâche planifiée (Cron Job) directement dans l'interface de Coolify."
fi

# 3. Démarrage de l'application Next.js en premier plan
echo "Démarrage du serveur Next.js..."
npm run start
