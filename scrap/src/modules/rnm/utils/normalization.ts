import { NormalizedProductInfo } from '../types';

export class Normalizer {
  /**
   * Remove diacritics / accents from string.
   */
  public static removeAccents(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Normalizes a product label (e.g., Tomate ronde Rhône-Alpes cat.I)
   * to ensure consistency and deduplication.
   */
  public static normalizeLabel(label: string): string {
    if (!label) return '';

    // 1. Remove accents and convert to uppercase
    let normalized = this.removeAccents(label).toUpperCase();

    // 2. Replace hyphens and underscores with spaces to unify names
    normalized = normalized.replace(/[-_]/g, ' ');

    // 3. Unify regions/origins (e.g. RHONE ALPES, SUD OUEST)
    normalized = normalized.replace(/\bRHONE\s+ALPES\b/g, 'RHONE ALPES');
    normalized = normalized.replace(/\bSUD\s+OUEST\b/g, 'SUD OUEST');
    normalized = normalized.replace(/\bVAL\s+DE\s+LOIRE\b/g, 'VAL DE LOIRE');

    // 4. Unify Categories (CAT.I, CAT I, CAT.1, CAT 1 -> CAT I)
    normalized = normalized.replace(/\bCAT\b\.?\s*(I|1)\b/g, 'CAT I');
    normalized = normalized.replace(/\bCAT\b\.?\s*(II|2)\b/g, 'CAT II');

    // 5. Unify spacing (multiple spaces -> single space)
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
  }

  /**
   * Normalizes a unit string (e.g. "le kg *", "le kg", "le KG", "la pièce")
   */
  public static normalizeUnit(unit: string): string {
    if (!unit) return 'le kg';
    
    let clean = this.removeAccents(unit).toLowerCase();
    
    // Strip stars or trailing symbols
    clean = clean.replace(/[*#]/g, '').trim();
    
    // Standardize "le kg"
    if (clean.includes('kg') || clean.includes('kilo')) {
      return 'le kg';
    }
    
    // Standardize "la piece" or "l'unite"
    if (clean.includes('piece') || clean.includes('unite')) {
      return 'la piece';
    }

    if (clean.includes('colis')) {
      return 'le colis';
    }

    if (clean.includes('plateau')) {
      return 'le plateau';
    }

    return clean;
  }

  /**
   * Standard slugification.
   */
  public static slugify(str: string): string {
    return this.removeAccents(str)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  /**
   * Extracts clean info for database storage.
   */
  public static extractInfo(originalLabel: string, rawUnit: string): NormalizedProductInfo {
    const normalizedLabel = this.normalizeLabel(originalLabel);
    const cleanUnit = this.normalizeUnit(rawUnit);
    
    // Determine a slug for the generic product name
    // e.g. "TOMATE ronde Rhône-Alpes cat.I" -> product slug is "tomate"
    // We split by space and take the first word or words as generic product name
    const firstWord = originalLabel.split(' ')[0] || 'produit';
    const productSlug = this.slugify(firstWord);

    return {
      originalLabel,
      normalizedLabel,
      productSlug,
      cleanUnit
    };
  }
}
