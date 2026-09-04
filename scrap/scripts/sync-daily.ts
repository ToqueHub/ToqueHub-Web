import { RnmSyncService } from '../src/modules/rnm/services/rnm-sync.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`[DAILY-SYNC] Début de la synchronisation quotidienne : ${new Date().toLocaleString()}`);
  
  const syncService = new RnmSyncService();
  const targetDate = new Date(); // Date d'aujourd'hui
  
  try {
    const statsList = await syncService.syncAllActiveProducts(targetDate);
    
    console.log('\n================================================================');
    console.log('=== RAPPORT DE SYNCHRONISATION QUOTIDIENNE ===');
    console.log('================================================================');
    console.table(statsList.map(s => ({
      'Produit': s.productName,
      'Espece ID': s.especeId,
      'Lignes Lu': s.parsedRecordsCount,
      'Lignes Écrit': s.insertedRecordsCount,
      'Statut/Erreur': s.error ? `Erreur: ${s.error}` : 'Succès'
    })));
    
    const totalPrices = await prisma.marketPrice.count();
    const totalProducts = await prisma.marketProduct.count();
    console.log(`\nBilan de la base de données :`);
    console.log(`- Nombre de produits actifs en base : ${totalProducts}`);
    console.log(`- Nombre total de cotations stockées : ${totalPrices}`);
    console.log('================================================================');
    
  } catch (error) {
    console.error('[DAILY-SYNC] Erreur critique lors de la synchronisation :', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log(`[DAILY-SYNC] Fin de la synchronisation : ${new Date().toLocaleString()}`);
  }
}

main();
