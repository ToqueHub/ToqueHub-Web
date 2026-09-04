import cron from 'node-cron';
import { RnmSyncService } from '../services/rnm-sync.service';

/**
 * Initializes and schedules the RNM FranceAgriMer daily synchronization.
 * Runs every day at 05:00 AM.
 */
export function initRnmCron(): cron.ScheduledTask {
  console.log('[RNM-CRON] Enregistrement de la tâche de synchronisation quotidienne...');

  // Pattern: minute hour day-of-month month day-of-week
  // "0 5 * * *" = every day at 5:00 AM
  const task = cron.schedule('0 5 * * *', async () => {
    const todayStr = new Date().toLocaleDateString('fr-FR');
    console.log(`[RNM-CRON][${todayStr}] Début de l'import automatique des cotations...`);
    
    try {
      const syncService = new RnmSyncService();
      
      // Perform synchronization for default products
      const statsList = await syncService.syncAllActiveProducts();
      
      console.log(`[RNM-CRON][${todayStr}] Synchronisation terminée.`);
      console.table(statsList.map(s => ({
        Produit: s.productName,
        Espece: s.especeId,
        TailleKo: (s.downloadedBytes / 1024).toFixed(2),
        LignesLues: s.parsedRecordsCount,
        LignesEnregistrees: s.insertedRecordsCount,
        Erreur: s.error || 'Aucune'
      })));
    } catch (error) {
      console.error(`[RNM-CRON][${todayStr}] Erreur critique lors de la tâche automatique :`, error);
    }
  });

  return task;
}
