import { RnmSyncService } from '../src/modules/rnm/services/rnm-sync.service';

async function main() {
  const syncService = new RnmSyncService();
  console.log('Crawling des 4 secteurs...');
  const discovered = await syncService.crawlAndDiscoverAllProducts();
  console.log(`\nNombre de produits trouvés : ${discovered.length}`);
  console.log('Liste des produits :');
  console.log(discovered.map((p: any) => p.name));
}

main().catch(console.error);
