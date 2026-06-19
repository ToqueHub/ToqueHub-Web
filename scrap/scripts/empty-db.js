const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('=== VIDAGE DE LA BASE DE DONNÉES (PRODUCTION) ===\n');

  try {
    console.log('Suppression des cotations (market_prices)...');
    const pricesCount = await prisma.marketPrice.deleteMany();
    console.log(`-> ${pricesCount.count} cotations supprimées.`);

    console.log('Suppression des libellés de produits (market_labels)...');
    const labelsCount = await prisma.marketLabel.deleteMany();
    console.log(`-> ${labelsCount.count} libellés supprimés.`);

    console.log('Suppression des produits (market_products)...');
    const productsCount = await prisma.marketProduct.deleteMany();
    console.log(`-> ${productsCount.count} produits supprimés.`);

    console.log('Suppression des catégories (market_categories)...');
    const categoriesCount = await prisma.marketCategory.deleteMany();
    console.log(`-> ${categoriesCount.count} catégories supprimées.`);

    console.log('Suppression des secteurs d\'activité (market_sectors)...');
    const sectorsCount = await prisma.marketSector.deleteMany();
    console.log(`-> ${sectorsCount.count} secteurs supprimés.`);

    console.log('Suppression des marchés (markets)...');
    const marketsCount = await prisma.market.deleteMany();
    console.log(`-> ${marketsCount.count} marchés supprimés.`);

    console.log('\nBase de données vidée avec succès !');
  } catch (error) {
    console.error('Erreur lors du vidage de la base de données :', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
