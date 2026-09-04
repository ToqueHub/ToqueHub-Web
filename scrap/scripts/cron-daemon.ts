import cron from 'node-cron';
import { RnmSyncService } from '../src/modules/rnm/services/rnm-sync.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

console.log('[CRON-DAEMON] Démarrage du planificateur de tâche RNM...');
console.log('[CRON-DAEMON] Tâche programmée pour s\'exécuter tous les jours à 02:00 du matin (0 2 * * *).');

// Programmation de la tâche à 2h00 du matin : '0 2 * * *'
cron.schedule('0 2 * * *', async () => {
  const now = new Date();
  console.log(`[CRON-DAEMON] [${now.toLocaleString()}] Début de la synchronisation automatique...`);
  
  const syncService = new RnmSyncService();
  
  try {
    const statsList = await syncService.syncAllActiveProducts(now);
    const successCount = statsList.filter(s => !s.error).length;
    const errorCount = statsList.filter(s => s.error).length;
    
    console.log(`[CRON-DAEMON] Fin de la synchronisation.`);
    console.log(`[CRON-DAEMON] Bilan - Réussis: ${successCount}, Échecs: ${errorCount}`);
  } catch (error) {
    console.error('[CRON-DAEMON] Erreur critique lors de la tâche planifiée :', error);
  }
});

// Rester actif indéfiniment
setInterval(() => {
  // Petit heartbeat toutes les heures pour montrer que le daemon tourne
  console.log(`[CRON-DAEMON] Heartbeat : Le scheduler est actif et attend 02:00. Heure actuelle : ${new Date().toLocaleString()}`);
}, 1000 * 60 * 60);
