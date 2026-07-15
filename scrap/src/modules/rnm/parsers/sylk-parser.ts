import { SylkRecord } from '../types';

export class SylkParser {
  /**
   * Parses a raw SYLK (.slk) string from FranceAgriMer.
   */
  public static parse(content: string): SylkRecord[] {
    const lines = content.split(/\r?\n/);
    const rawRows: Map<number, Record<number, string>> = new Map();

    let currentX = 1;
    let currentY = 1;

    for (const line of lines) {
      if (!line || (!line.startsWith('C;') && !line.startsWith('F;'))) {
        continue;
      }

      // Check for row index Y override
      const yMatch = line.match(/Y(\d+)/);
      if (yMatch) {
        currentY = parseInt(yMatch[1], 10);
      }

      // Check for column index X override
      const xMatch = line.match(/X(\d+)/);
      if (xMatch) {
        currentX = parseInt(xMatch[1], 10);
      }

      // If it's a value statement, extract the content
      if (line.startsWith('C;')) {
        // Extract value which starts after K
        // It could be a quoted string like K"TOMATE ronde" or a number like K2.50 or K""
        const kMatch = line.match(/K(".*?"|[^\s;]+)/);
        if (kMatch) {
          let value = kMatch[1];
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }

          if (!rawRows.has(currentY)) {
            rawRows.set(currentY, {});
          }

          rawRows.get(currentY)![currentX] = value;
        }
      }
    }

    const records: SylkRecord[] = [];

    // The first 4 rows are header information
    for (const [y, row] of rawRows.entries()) {
      if (y <= 4) continue;

      const dateStr = row[1];       // X1: Date
      const marketName = row[2];    // X2: Market
      const stage = row[3];         // X3: Stage
      const labelName = row[4];     // X4: Label
      const unit = row[5];          // X5: Unit
      const avgPriceStr = row[6];   // X6: Average Price
      const variationStr = row[7];  // X7: Variation
      const minPriceStr = row[8];   // X8: Mini Price
      const maxPriceStr = row[9];   // X9: Maxi Price

      if (!dateStr || !marketName || !labelName || !avgPriceStr) {
        continue;
      }

      // Parse date: format JJ-MM-AAAA
      const dateParts = dateStr.split('-');
      if (dateParts.length !== 3) continue;
      const date = new Date(
        parseInt(dateParts[2], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[0], 10)
      );

      const avgPrice = parseFloat(avgPriceStr);
      if (isNaN(avgPrice)) continue;

      // Extract market code from market name if present like "Lyon-Corbas [M0096]" or "M0096"
      let marketCode = 'M_UNKNOWN';
      const mMatch = marketName.match(/\[(M\d+)\]/) || marketName.match(/(M\d+)/);
      if (mMatch) {
        marketCode = mMatch[1];
      } else {
        // Generate a stable code from the market name if none is explicitly found
        marketCode = 'M_' + marketName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
      }

      records.push({
        date,
        marketName: marketName.replace(/\s*\[M\d+\]/, '').replace(/\s*\(non RNM\)/g, '').trim(),
        marketCode,
        stage: stage || 'Inconnu',
        labelName: labelName.trim(),
        unit: unit || 'le kg',
        avgPrice,
        minPrice: minPriceStr && minPriceStr !== '' ? parseFloat(minPriceStr) : undefined,
        maxPrice: maxPriceStr && maxPriceStr !== '' ? parseFloat(maxPriceStr) : undefined,
        variation: variationStr && variationStr !== '' ? parseFloat(variationStr) : undefined
      });
    }

    return records;
  }
}
