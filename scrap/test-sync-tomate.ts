import { RnmSyncService } from './src/modules/rnm/services/rnm-sync.service';
import { MarketAnalyticsService } from './src/modules/rnm/services/market-analytics.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTest() {
  console.log('=== DEBUT DU TEST DE SYNCHRONISATION : TOMATE ===');
  
  const syncService = new RnmSyncService();
  const analyticsService = new MarketAnalyticsService();
  
  // Set date to a recent working day (e.g. June 11, 2026 or today)
  // Let's use today's date
  const targetDate = new Date();
  
  console.log(`\n1. Lancement de la synchronisation pour "Tomate" (Date cible : ${targetDate.toLocaleDateString()})...`);
  
  try {
    const stats = await syncService.syncProduct('Tomate', targetDate);
    
    console.log('\n2. Statistiques d\'importation retournées :');
    console.log(`- Produit recherché : ${stats.productName}`);
    console.log(`- Espece ID résolu  : ${stats.especeId}`);
    console.log(`- Taille téléchargée: ${(stats.downloadedBytes / 1024).toFixed(2)} KB`);
    console.log(`- Lignes lues       : ${stats.parsedRecordsCount}`);
    console.log(`- Lignes insérées   : ${stats.insertedRecordsCount}`);
    
    if (stats.error) {
      console.error(`- Erreur rencontrée : ${stats.error}`);
      return;
    }

    console.log('\n3. Vérification des données enregistrées en base :');
    
    // Check sectors
    const sectors = await prisma.marketSector.findMany();
    console.log(`- Secteurs en base (${sectors.length}) :`, JSON.stringify(sectors));
    
    // Check categories
    const categories = await prisma.marketCategory.findMany();
    console.log(`- Catégories en base (${categories.length}) :`, categories.map(c => `${c.label} (Parent: ${c.parentId})`).join(', '));
    
    // Check products
    const products = await prisma.marketProduct.findMany();
    console.log(`- Produits en base (${products.length}) :`, products.map(p => `${p.label} (EspeceId: ${p.especeId})`).join(', '));
    
    // Check labels
    const labels = await prisma.marketLabel.findMany({ take: 5 });
    console.log(`- Libellés en base (Top 5) :`);
    labels.forEach(l => console.log(`  * [Libcod: ${l.libcod}] ${l.name}`));
    
    // Check markets
    const markets = await prisma.market.findMany();
    console.log(`- Marchés découverts (${markets.length}) :`, markets.map(m => m.name).join(', '));
    
    // Check prices count
    const pricesCount = await prisma.marketPrice.count();
    console.log(`- Nombre de cotations de prix insérées : ${pricesCount}`);
    
    if (pricesCount > 0) {
      // Get some sample prices
      const samplePrices = await prisma.marketPrice.findMany({
        take: 3,
        include: {
          label: true,
          market: true
        }
      });
      console.log('\n4. Exemples de cotations enregistrées :');
      samplePrices.forEach(p => {
        console.log(`  * ${p.label.name} sur "${p.market.name}" (${p.stage}) : ${p.avgPrice} ${p.unit} (Mini: ${p.minPrice || 'N/A'}, Maxi: ${p.maxPrice || 'N/A'}, Date: ${p.date.toLocaleDateString()})`);
      });
      
      console.log('\n5. Test du calcul des variations via SQL optimisé :');
      const firstPrice = samplePrices[0];
      
      const dailyVar = await analyticsService.getDailyVariation(firstPrice.labelId, firstPrice.marketId, firstPrice.stage, firstPrice.date);
      const weeklyVar = await analyticsService.getWeeklyVariation(firstPrice.labelId, firstPrice.marketId, firstPrice.stage, firstPrice.date);
      const monthlyVar = await analyticsService.getMonthlyVariation(firstPrice.labelId, firstPrice.marketId, firstPrice.stage, firstPrice.date);
      
      console.log(`- Analyse pour "${firstPrice.label.name}" sur "${firstPrice.market.name}" :`);
      console.log(`  * Variation J+1   : ${dailyVar}%`);
      console.log(`  * Variation J-7   : ${weeklyVar}%`);
      console.log(`  * Variation J-30  : ${monthlyVar}%`);
    } else {
      console.log('\nAucune cotation insérée en base pour tester les calculs.');
    }
  } catch (error) {
    console.error('\nErreur rencontrée lors du test de validation :', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n=== FIN DU TEST ===');
  }
}

runTest();
