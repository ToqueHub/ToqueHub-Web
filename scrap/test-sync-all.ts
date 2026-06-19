import { RnmSyncService } from './src/modules/rnm/services/rnm-sync.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runAllSync() {
  console.log('=== DEBUT DU TEST DE CRAWL GLOBAL ET DE SYNCHRONISATION RNM ===\n');

  const syncService = new RnmSyncService();
  const targetDate = new Date();

  try {
    // 1. Crawl all 4 main sectors to find all available products
    console.log('Étape 1 : Crawling des 4 secteurs d\'alimentation...');
    const discovered = await syncService.crawlAndDiscoverAllProducts();
    
    console.log(`\nNombre total de produits découverts : ${discovered.length}`);
    console.log('Liste des produits découverts :');
    
    // Group discovered products for clean display
    const discoveredList = discovered.map(p => p.name).join(', ');
    console.log(discoveredList.length > 500 ? discoveredList.slice(0, 500) + '... (voir la suite en base)' : discoveredList);

    // 2. Select products to synchronize
    // By default, for this verification, we sync a representative list to ensure speed.
    // If you want to sync ALL of them, set syncAll = true.
    const syncAll = true; // Mettre à true pour importer les 200+ produits !
    const productsToSync = syncAll 
      ? discovered.map(p => p.name)
      : ['Tomate', 'Cabillaud', 'Beurre', 'Agneau', 'Boeuf', 'Carotte', 'Abricot', 'Oeuf']; // Liste de validation rapide

    console.log(`\nÉtape 2 : Lancement de la synchronisation pour ${productsToSync.length} produits (${syncAll ? 'Catalogue entier' : 'Échantillon de validation'})...`);

    const statsList = [];
    let counter = 1;

    for (const prodName of productsToSync) {
      console.log(`\n[${counter}/${productsToSync.length}] Synchronisation de : "${prodName}"...`);
      const stats = await syncService.syncProduct(prodName, targetDate);
      statsList.push(stats);
      counter++;

      // Delay to be gentle on FranceAgriMer servers (500ms)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 3. Print final report
    console.log('\n================================================================');
    console.log('=== RAPPORT GLOBAL DE SYNCHRONISATION ===');
    console.log('================================================================');
    console.table(statsList.map(s => ({
      'Produit': s.productName,
      'Espece ID': s.especeId,
      'Taille (KB)': (s.downloadedBytes / 1024).toFixed(2),
      'Lignes Lu': s.parsedRecordsCount,
      'Lignes Écrit': s.insertedRecordsCount,
      'Statut/Erreur': s.error ? `Erreur: ${s.error}` : 'Succès'
    })));

    const totalPrices = await prisma.marketPrice.count();
    const totalProducts = await prisma.marketProduct.count();
    console.log(`\nBilan de la base de données :`);
    console.log(`- Nombre de produits créés en base : ${totalProducts}`);
    console.log(`- Nombre total de cotations stockées : ${totalPrices}`);
    console.log('================================================================');

  } catch (error) {
    console.error('Erreur critique pendant la synchronisation globale :', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n=== FIN DU TEST GLOBAL ===');
  }
}

runAllSync();
