# Relais Telegram Kokki

Le relais est le seul composant qui contient le token Telegram. Les installations ToqueHub ne reçoivent aucun secret Telegram : elles créent automatiquement une identité locale au premier échange et synchronisent les tickets par requêtes sortantes signées.

1. Créez un supergroupe Telegram privé et activez les sujets.
2. Ajoutez le bot comme administrateur avec le droit de gérer les sujets et désactivez son mode confidentialité, afin qu’il lise les réponses des bénévoles.
3. Copiez `.env.support-relay.example` vers un fichier d’environnement privé et renseignez le token, l’identifiant numérique du groupe et les deux identifiants opérateurs.
4. Déployez `docker-compose.support-relay.yml` avec une base PostgreSQL dédiée, puis exposez publiquement le relais en HTTPS.
5. Configurez le webhook Telegram vers `https://support.toquehub.app/v1/telegram/webhook` avec `secret_token` égal à `TELEGRAM_WEBHOOK_SECRET`.

Les installations utilisent par défaut `https://support.toquehub.app`. Pour un environnement de test, définissez `TOQUEHUB_SUPPORT_RELAY_URL` côté API locale. Une installation hors ligne conserve ses messages localement, puis les envoie lors de la prochaine synchronisation.

Les conversations fermées, pièces jointes et sujets Telegram sont purgés 90 jours après fermeture. Les opérateurs autorisés utilisent « Prendre en charge » dans le sujet avant de répondre ; seule la personne assignée peut transmettre une réponse à l’utilisateur.
