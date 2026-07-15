import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { SylkParser } from '../parsers/sylk-parser';
import { Normalizer } from '../utils/normalization';
import { SyncStats, SylkRecord } from '../types';

const prisma = new PrismaClient();

export class RnmSyncService {
  private rnmUrl = 'https://rnm.franceagrimer.fr/prix';

  /**
   * Crawls the 4 main food sectors to discover all available product names and URL slugs.
   */
  public async crawlAndDiscoverAllProducts(): Promise<{ name: string; slug: string }[]> {
    const sectors = [
      'FRUITS-ET-LEGUMES',
      'PECHE-ET-AQUACULTURE',
      'BEURRE-OEUF-FROMAGE',
      'VIANDE'
    ];
    
    const discoveredProducts: { name: string; slug: string }[] = [];
    const seenSlugs = new Set<string>();

    console.log(`[RNM-SYNC] Début du crawl des 4 secteurs d'alimentation principaux...`);

    for (const sector of sectors) {
      try {
        console.log(`[RNM-SYNC] Crawling du secteur : ${sector}`);
        const response = await axios.get(`${this.rnmUrl}?${sector}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ToqueHub/1.0'
          }
        });
        
        const html = response.data as string;
        
        // Extract product links from the HTML
        // Format: <div class="listunproduit"> <a href="/prix?AGNEAU" ...>Agneau</a> </div>
        // Using a regex to capture the href query parameter (slug) and the link text (product name)
        const productRegex = /<div class="listunproduit">[^<]*<a href="\/prix\?([^"]+)"[^>]*>([^<]+)<\/a>/g;
        let match;
        while ((match = productRegex.exec(html)) !== null) {
          const slug = match[1].trim();
          const name = match[2].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
          
          if (!seenSlugs.has(slug)) {
            seenSlugs.add(slug);
            discoveredProducts.push({ name, slug });
          }
        }
      } catch (error: any) {
        console.error(`[RNM-SYNC] Erreur lors du crawl du secteur ${sector} :`, error.message);
      }
      
      // Delay to avoid spamming the server
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`[RNM-SYNC] Crawl terminé. ${discoveredProducts.length} produits uniques découverts.`);
    return discoveredProducts;
  }

  /**
   * Discovers a product's ESPECE ID and Category structure by simulating a search.
   */
  public async discoverProductMeta(productName: string): Promise<{
    especeId: number;
    sectorName: string;
    categoryPath: string[];
    labelMap: Map<string, number>;
  }> {
    console.log(`[RNM-SYNC] Découverte des métadonnées pour le produit : "${productName}"`);
    
    // 1. Submit POST request with product name to get product page HTML
    const response = await axios.post(
      this.rnmUrl,
      `PRODUIT_LIB=${encodeURIComponent(productName)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ToqueHub/1.0'
        }
      }
    );

    const html = response.data as string;

    // 2. Extract ESPECE ID
    const especeMatch = html.match(/name="ESPECE"\s+value="(\d+)"/i);
    if (!especeMatch) {
      throw new Error(`Impossible de trouver l'ESPECE ID pour le produit "${productName}" dans le HTML.`);
    }
    const especeId = parseInt(especeMatch[1], 10);
    console.log(`[RNM-SYNC] Produit "${productName}" associé à ESPECE ID : ${especeId}`);

    // 3. Parse categories from breadcrumbs
    let sectorName = 'MARCHE ALIMENTAIRE';
    const categoryPath: string[] = [];
    const signetMatch = html.match(/<div class="signet">([\s\S]*?)<\/div>/i);
    if (signetMatch) {
      const links = signetMatch[1].match(/<a[^>]*>([\s\S]*?)<\/a>/g) || [];
      const cleanLinks = links.map(link => {
        return link.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
      });
      
      if (cleanLinks.length > 2) {
        sectorName = cleanLinks[2];
        for (let i = 3; i < cleanLinks.length; i++) {
          categoryPath.push(cleanLinks[i]);
        }
      }
    }

    // 4. Map active label names to their internal libcod series ids
    const labelMap = new Map<string, number>();
    const labelRegex = /histo_lib\((\d+),\s*''\)[^>]*>\s*([^<]+)/g;
    let match;
    while ((match = labelRegex.exec(html)) !== null) {
      const libcod = parseInt(match[1], 10);
      const rawLabel = match[2].trim();
      labelMap.set(rawLabel, libcod);
    }

    console.log(`[RNM-SYNC] Métadonnées extraites. Secteur : "${sectorName}", Catégories : ${categoryPath.join(' > ')}, Libellés mappés : ${labelMap.size}`);
    
    return {
      especeId,
      sectorName,
      categoryPath,
      labelMap
    };
  }

  /**
   * Downloads the SYLK file for a product on a specific date.
   */
  public async downloadSylkFile(especeId: number, dateStr: string): Promise<string> {
    const payload = `ESPECE=${especeId}&LASTDATE=${encodeURIComponent(dateStr)}`;
    
    const response = await axios.post(this.rnmUrl, payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ToqueHub/1.0'
      },
      responseType: 'text'
    });

    return response.data as string;
  }

  /**
   * Synchronizes a single product by name and quotation date.
   */
  public async syncProduct(productName: string, date: Date = new Date()): Promise<SyncStats> {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const yearShort = String(date.getFullYear()).slice(-2);
    const dateStr = `${day}-${month}-${yearShort}`;

    const stats: SyncStats = {
      especeId: 0,
      productName,
      downloadedBytes: 0,
      parsedRecordsCount: 0,
      insertedRecordsCount: 0
    };

    try {
      // 1. Discover product metadata
      const meta = await this.discoverProductMeta(productName);
      stats.especeId = meta.especeId;

      // 2. Download spreadsheet
      const sylkContent = await this.downloadSylkFile(meta.especeId, dateStr);
      stats.downloadedBytes = Buffer.byteLength(sylkContent, 'utf-8');

      // 3. Parse records
      const records = SylkParser.parse(sylkContent);
      stats.parsedRecordsCount = records.length;

      if (records.length === 0) {
        console.log(`[RNM-SYNC] Aucune cotation trouvée pour "${productName}" à la date du ${dateStr}.`);
        return stats;
      }

      // 4. Set up database categories & products
      const sectorSlug = Normalizer.slugify(meta.sectorName);
      const dbSector = await prisma.marketSector.upsert({
        where: { name: sectorSlug },
        update: { label: meta.sectorName },
        create: { name: sectorSlug, label: meta.sectorName }
      });

      let currentParentId: string | null = null;
      for (const catName of meta.categoryPath) {
        const catSlug = Normalizer.slugify(catName);
        const dbCategory: any = await prisma.marketCategory.upsert({
          where: { id: catSlug },
          update: { label: catName },
          create: {
            id: catSlug,
            name: catSlug,
            label: catName,
            parentId: currentParentId,
            sectorId: dbSector.id
          }
        });
        currentParentId = dbCategory.id;
      }

      if (!currentParentId) {
        const fallbackSlug = Normalizer.slugify(productName);
        const dbCategory: any = await prisma.marketCategory.upsert({
          where: { id: fallbackSlug },
          update: { label: productName },
          create: {
            id: fallbackSlug,
            name: fallbackSlug,
            label: productName,
            sectorId: dbSector.id
          }
        });
        currentParentId = dbCategory.id;
      }

      const productSlug = Normalizer.slugify(productName);
      const dbProduct = await prisma.marketProduct.upsert({
        where: { name: productSlug },
        update: { label: productName, especeId: meta.especeId, categoryId: currentParentId as string },
        create: {
          name: productSlug,
          label: productName,
          especeId: meta.especeId,
          categoryId: currentParentId as string
        }
      });

      // 5. Write prices to db
      let successCount = 0;
      for (const rec of records) {
        const dbMarket = await prisma.market.upsert({
          where: { code: rec.marketCode },
          update: { name: rec.marketName },
          create: { code: rec.marketCode, name: rec.marketName }
        });

        const info = Normalizer.extractInfo(rec.labelName, rec.unit);
        
        let libcod = meta.labelMap.get(rec.labelName);
        if (!libcod) {
          let hash = 0;
          for (let i = 0; i < rec.labelName.length; i++) {
            hash = (hash << 5) - hash + rec.labelName.charCodeAt(i);
            hash |= 0;
          }
          libcod = Math.abs(hash);
        }

        const dbLabel = await prisma.marketLabel.upsert({
          where: { libcod },
          update: { name: info.normalizedLabel, productId: dbProduct.id },
          create: {
            libcod,
            name: info.normalizedLabel,
            productId: dbProduct.id
          }
        });

        await prisma.marketPrice.upsert({
          where: {
            labelId_marketId_date_stage: {
              labelId: dbLabel.id,
              marketId: dbMarket.id,
              date: rec.date,
              stage: rec.stage
            }
          },
          update: {
            unit: info.cleanUnit,
            avgPrice: rec.avgPrice,
            minPrice: rec.minPrice,
            maxPrice: rec.maxPrice,
            variation: rec.variation
          },
          create: {
            labelId: dbLabel.id,
            marketId: dbMarket.id,
            date: rec.date,
            stage: rec.stage,
            unit: info.cleanUnit,
            avgPrice: rec.avgPrice,
            minPrice: rec.minPrice,
            maxPrice: rec.maxPrice,
            variation: rec.variation
          }
        });

        successCount++;
      }

      stats.insertedRecordsCount = successCount;
      console.log(`[RNM-SYNC] Synchronisation réussie pour "${productName}" : ${successCount} cotations enregistrées.`);
    } catch (e: any) {
      stats.error = e.message;
      console.error(`[RNM-SYNC] Échec de la synchronisation pour "${productName}" :`, e);
    }

    return stats;
  }

  /**
   * Synchronises all products in the database.
   * If database is empty, it runs an initial crawl of the 4 food sectors to discover all products first.
   */
  public async syncAllActiveProducts(date: Date = new Date()): Promise<SyncStats[]> {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const yearShort = String(date.getFullYear()).slice(-2);
    const dateStr = `${day}-${month}-${yearShort}`;

    const results: SyncStats[] = [];

    // 1. Fetch existing products from database
    let dbProducts = await prisma.marketProduct.findMany();

    // 2. Discover new products if any
    try {
      console.log(`[RNM-SYNC] Crawling des 4 secteurs pour vérifier s'il y a de nouveaux produits...`);
      const discovered = await this.crawlAndDiscoverAllProducts();
      const existingSlugs = new Set(dbProducts.map(p => p.name));

      const newProducts = discovered.filter(p => !existingSlugs.has(Normalizer.slugify(p.name)));
      if (newProducts.length > 0) {
        console.log(`[RNM-SYNC] Découverte de ${newProducts.length} nouveaux produits sur le RNM. Lancement de leur synchronisation...`);
        for (const p of newProducts) {
          console.log(`[RNM-SYNC] Synchronisation du nouveau produit : "${p.name}"`);
          const stats = await this.syncProduct(p.name, date);
          results.push(stats);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        // Re-fetch dbProducts to include the newly added ones
        dbProducts = await prisma.marketProduct.findMany();
      } else {
        console.log(`[RNM-SYNC] Aucun nouveau produit détecté sur le RNM.`);
      }
    } catch (crawlError: any) {
      console.error(`[RNM-SYNC] Impossible de crawler les nouveaux produits :`, crawlError.message);
      console.log(`[RNM-SYNC] Poursuite de la synchronisation avec les produits existants.`);
    }

    if (dbProducts.length === 0) {
      console.log(`[RNM-SYNC] Aucun produit en base et impossible d'en crawler.`);
      return results;
    }

    console.log(`[RNM-SYNC] ${dbProducts.length} produits actifs en base. Lancement du téléchargement direct des tableurs SYLK...`);
    
    for (const p of dbProducts) {
        const stats: SyncStats = {
          especeId: p.especeId,
          productName: p.label,
          downloadedBytes: 0,
          parsedRecordsCount: 0,
          insertedRecordsCount: 0
        };

        try {
          // Download directly using especeId (Saves HTML requests)
          const sylkContent = await this.downloadSylkFile(p.especeId, dateStr);
          stats.downloadedBytes = Buffer.byteLength(sylkContent, 'utf-8');

          const records = SylkParser.parse(sylkContent);
          stats.parsedRecordsCount = records.length;

          if (records.length === 0) {
            console.log(`[RNM-SYNC] Pas de cotation pour "${p.label}" à la date du ${dateStr}.`);
            results.push(stats);
            continue;
          }

          let successCount = 0;
          for (const rec of records) {
            const dbMarket = await prisma.market.upsert({
              where: { code: rec.marketCode },
              update: { name: rec.marketName },
              create: { code: rec.marketCode, name: rec.marketName }
            });

            const info = Normalizer.extractInfo(rec.labelName, rec.unit);
            
            // Deterministic unique integer hash of labelName (since we don't query the product HTML page on daily runs)
            let hash = 0;
            for (let i = 0; i < rec.labelName.length; i++) {
              hash = (hash << 5) - hash + rec.labelName.charCodeAt(i);
              hash |= 0;
            }
            const libcod = Math.abs(hash);

            const dbLabel = await prisma.marketLabel.upsert({
              where: { libcod },
              update: { name: info.normalizedLabel, productId: p.id },
              create: {
                libcod,
                name: info.normalizedLabel,
                productId: p.id
              }
            });

            await prisma.marketPrice.upsert({
              where: {
                labelId_marketId_date_stage: {
                  labelId: dbLabel.id,
                  marketId: dbMarket.id,
                  date: rec.date,
                  stage: rec.stage
                }
              },
              update: {
                unit: info.cleanUnit,
                avgPrice: rec.avgPrice,
                minPrice: rec.minPrice,
                maxPrice: rec.maxPrice,
                variation: rec.variation
              },
              create: {
                labelId: dbLabel.id,
                marketId: dbMarket.id,
                date: rec.date,
                stage: rec.stage,
                unit: info.cleanUnit,
                avgPrice: rec.avgPrice,
                minPrice: rec.minPrice,
                maxPrice: rec.maxPrice,
                variation: rec.variation
              }
            });

            successCount++;
          }

          stats.insertedRecordsCount = successCount;
          console.log(`[RNM-SYNC] Import direct réussi pour "${p.label}" : ${successCount} cotations.`);
        } catch (e: any) {
          stats.error = e.message;
          console.error(`[RNM-SYNC] Échec de l'import direct pour "${p.label}" :`, e.message);
        }

        results.push(stats);
        
        // Delay to avoid spamming the server (300ms)
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      return results;
  }
}
