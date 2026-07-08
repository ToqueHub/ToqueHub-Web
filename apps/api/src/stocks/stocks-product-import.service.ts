import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma, Unit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommitProductImportDto, ProductImportOptionsDto } from './dto/stocks-product-import.dto';

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second', 'Magasinier'];
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const MISTRAL_MODEL = process.env.OCR_MISTRAL_AI_MODEL || 'mistral-large-latest';

type Actor = { id: string; role: string };
type Tx = Prisma.TransactionClient;
type UploadedFile = { originalname: string; mimetype?: string; size?: number; buffer?: Buffer };

type ProductImportField =
  | 'name'
  | 'unit'
  | 'sku'
  | 'gtin'
  | 'supplier'
  | 'category'
  | 'averagePrice'
  | 'minimumStock'
  | 'description'
  | 'originCountry'
  | 'packageLabel'
  | 'unitsPerPackage'
  | 'unitWeightGrams'
  | 'netWeightGrams'
  | 'ingredients'
  | 'allergensPresent'
  | 'possibleTraces'
  | 'dietaryTags'
  | 'energyKj'
  | 'energyKcal'
  | 'fatGrams'
  | 'saturatedFatGrams'
  | 'carbohydratesGrams'
  | 'sugarsGrams'
  | 'fiberGrams'
  | 'proteinGrams'
  | 'saltGrams'
  | 'storageType'
  | 'shelfLifeAfterOpening'
  | 'storageInstructions'
  | 'preparationInstructions';

type ProductImportStatus = 'ready' | 'needs_review' | 'duplicate' | 'ignored' | 'error';

type ProductImportFields = Partial<Record<ProductImportField, string | number | string[] | null>> & {
  unitId?: string | null;
  unitLabel?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  primarySupplierId?: string | null;
  supplierName?: string | null;
};

type ProductImportPreviewRow = {
  rowNumber: number;
  source: Record<string, string>;
  fields: ProductImportFields;
  status: ProductImportStatus;
  selected: boolean;
  warnings: string[];
  errors: string[];
  duplicateOf?: { type: 'existing' | 'file'; field: 'sku' | 'gtin' | 'name'; value: string; label: string } | null;
};

type ReferenceContext = {
  units: Unit[];
  unitsByLookup: Map<string, Unit>;
  categoriesByLookup: Map<string, { id: string; name: string }>;
  suppliersByLookup: Map<string, { id: string; name: string }>;
  existingBySku: Map<string, { id: string; name: string }>;
  existingByGtin: Map<string, { id: string; name: string }>;
  existingByName: Map<string, { id: string; name: string }>;
};

const IMPORT_FIELDS: ProductImportField[] = [
  'name',
  'unit',
  'sku',
  'gtin',
  'supplier',
  'category',
  'averagePrice',
  'minimumStock',
  'description',
  'originCountry',
  'packageLabel',
  'unitsPerPackage',
  'unitWeightGrams',
  'netWeightGrams',
  'ingredients',
  'allergensPresent',
  'possibleTraces',
  'dietaryTags',
  'energyKj',
  'energyKcal',
  'fatGrams',
  'saturatedFatGrams',
  'carbohydratesGrams',
  'sugarsGrams',
  'fiberGrams',
  'proteinGrams',
  'saltGrams',
  'storageType',
  'shelfLifeAfterOpening',
  'storageInstructions',
  'preparationInstructions',
];

const FIELD_ALIASES: Record<ProductImportField, string[]> = {
  name: ['nom', 'nom produit', 'nom du produit', 'produit', 'libelle', 'libellé', 'designation', 'désignation', 'article', 'product', 'product name', 'tuote', 'tuotenimi', 'nimi'],
  unit: ['unite', 'unité', 'unite stock', 'unité stock', 'unite de stock', 'unité de stock', 'unit', 'uom', 'yksikko', 'yksikkö', 'me'],
  sku: ['sku', 'reference', 'référence', 'ref', 'réf', 'reference fournisseur', 'référence fournisseur', 'code', 'code produit', 'sap', 'nimike'],
  gtin: ['gtin', 'ean', 'barcode', 'code barre', 'code-barres', 'kupa'],
  supplier: ['fournisseur', 'supplier', 'vendor', 'toimittaja', 'markkinoija'],
  category: ['categorie', 'catégorie', 'famille', 'rayon', 'category', 'tuoteryhma', 'tuoteryhmä'],
  averagePrice: ['prix', 'prix achat', 'prix achat ht', 'prix_achat_ht', 'prix ht', 'average price', 'unit price', 'á hinta', 'a hinta', 'hinta'],
  minimumStock: ['seuil', 'seuil minimum', 'stock minimum', 'minimum stock', 'min stock', 'seuil_minimum'],
  description: ['description', 'notes', 'note', 'commentaire', 'tuotetiedot'],
  originCountry: ['origine', 'pays origine', 'pays d origine', "pays d'origine", 'origin', 'origin country', 'alkuperamaa', 'alkuperämaa', 'valmistusmaa'],
  packageLabel: ['conditionnement', 'format', 'colisage', 'packaging', 'package', 'myyntierat', 'myyntierät'],
  unitsPerPackage: ['unites par colis', 'unités par colis', 'unites_par_colis', 'pieces par colis', 'pièces par colis', 'units per package', 'pakkauskoko'],
  unitWeightGrams: ['poids unitaire g', 'poids_unitaire_g', 'poids unite', 'poids unité', 'unit weight', 'nettopaino'],
  netWeightGrams: ['poids net g', 'poids_net_g', 'poids net', 'net weight', 'kokonaispaino'],
  ingredients: ['ingredients', 'ingrédients', 'ainesosat'],
  allergensPresent: ['allergenes', 'allergènes', 'allergenes presents', 'allergènes présents', 'allergens'],
  possibleTraces: ['traces', 'traces possibles', 'may contain', 'possible traces'],
  dietaryTags: ['tags', 'tags alimentaires', 'regimes', 'régimes', 'dietary tags', 'gluteeniton', 'laktoositon'],
  energyKj: ['energie kj', 'énergie kj', 'energy kj'],
  energyKcal: ['energie kcal', 'énergie kcal', 'energy kcal', 'kcal'],
  fatGrams: ['matieres grasses', 'matières grasses', 'matieres grasses g', 'matières grasses g', 'fat', 'fat g', 'rasva'],
  saturatedFatGrams: ['acides gras satures', 'acides gras saturés', 'acides gras satures g', 'acides gras saturés g', 'saturated fat', 'saturated fat g', 'tyydyttynyt'],
  carbohydratesGrams: ['glucides', 'glucides g', 'carbohydrates', 'carbohydrates g', 'hiilihydraatit'],
  sugarsGrams: ['sucres', 'sucres g', 'dont sucres', 'sugars', 'sugars g', 'sokerit'],
  fiberGrams: ['fibres', 'fibres g', 'fiber', 'fiber g', 'kuitu'],
  proteinGrams: ['proteines', 'protéines', 'proteines g', 'protéines g', 'protein', 'protein g', 'proteiini'],
  saltGrams: ['sel', 'sel g', 'salt', 'salt g', 'suola'],
  storageType: ['conservation', 'type conservation', 'storage type', 'säilytys', 'sailytys'],
  shelfLifeAfterOpening: ['duree apres ouverture', 'durée après ouverture', 'shelf life after opening', 'avattuna'],
  storageInstructions: ['instructions conservation', 'stockage', 'storage instructions', 'säilytysohje', 'sailytysohje'],
  preparationInstructions: ['preparation', 'préparation', 'utilisation', 'preparation instructions', 'kayttoohje', 'käyttöohje'],
};

const TEMPLATE_HEADERS = [
  'nom',
  'unite',
  'sku',
  'gtin',
  'fournisseur',
  'categorie',
  'prix_achat_ht',
  'seuil_minimum',
  'description',
  'origine',
  'conditionnement',
  'unites_par_colis',
  'poids_unitaire_g',
  'poids_net_g',
  'ingredients',
  'allergenes',
  'traces_possibles',
  'tags_alimentaires',
  'energie_kj',
  'energie_kcal',
  'matieres_grasses_g',
  'acides_gras_satures_g',
  'glucides_g',
  'sucres_g',
  'fibres_g',
  'proteines_g',
  'sel_g',
  'type_conservation',
  'duree_apres_ouverture',
  'instructions_conservation',
  'instructions_preparation',
];

@Injectable()
export class StocksProductImportService {
  private readonly logger = new Logger(StocksProductImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Insufficient stock permissions');
  }

  templateCsv() {
    const sample = [
      'Fazer Aito Vispi 1L',
      'L',
      '22027142',
      '6410222011298',
      'Kespro',
      'Produits laitiers',
      '2.45',
      '6',
      'Préparation végétale à fouetter',
      'Suède',
      'Carton 6 x 1 L',
      '6',
      '1000',
      '6000',
      'Eau, huiles végétales, sucre',
      'Soja',
      'Fruits à coque',
      'Vegan|Sans gluten',
      '1200',
      '287',
      '28',
      '25',
      '8',
      '4',
      '0.5',
      '1',
      '0.2',
      'Frais',
      '5 jours',
      '+2°C à +8°C',
      'À fouetter avant utilisation',
    ];
    return `${TEMPLATE_HEADERS.join(';')}\n${sample.map(csvEscape).join(';')}\n`;
  }

  async analyzeProductImport(organizationId: string, actor: Actor, file: UploadedFile) {
    this.assertWrite(actor);
    this.validateCsvFile(file);
    const parsed = parseCsv(file.buffer!.toString('utf8'));
    if (!parsed.headers.length) throw new BadRequestException('Le CSV ne contient pas d’en-têtes.');
    if (parsed.rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Le CSV contient trop de lignes. Maximum: ${MAX_IMPORT_ROWS}.`);

    let mapping = detectColumnMapping(parsed.headers);
    const localMapping = { ...mapping };
    const references = await this.referenceContext(organizationId);
    const ai = await this.maybeImproveMappingWithMistral(organizationId, parsed.headers, parsed.rows.slice(0, 6), mapping);
    if (ai.mapping) mapping = { ...mapping, ...ai.mapping };

    const seen = this.emptySeen();
    const rows = parsed.rows.map((values, index) => {
      const source = rowSource(parsed.headers, values);
      return this.previewRow(index + 2, source, mapping, references, seen);
    });
    return {
      filename: file.originalname,
      headers: parsed.headers,
      delimiter: parsed.delimiter,
      mapping,
      localMapping,
      templateColumns: TEMPLATE_HEADERS,
      rows,
      summary: summarizeRows(rows),
      options: { createMissingCategories: false, createMissingSuppliers: false },
      ai,
    };
  }

  async commitProductImport(organizationId: string, actor: Actor, dto: CommitProductImportDto) {
    this.assertWrite(actor);
    const selectedRows = (dto.rows ?? []).filter((row) => row.selected !== false).slice(0, MAX_IMPORT_ROWS);
    if (!selectedRows.length) throw new BadRequestException('Aucune ligne sélectionnée.');
    const options = dto.options ?? {};

    const references = await this.referenceContext(organizationId);
    const seen = this.emptySeen();
    const previewRows = selectedRows.map((row) => this.previewImportedFields(row.rowNumber, row.fields ?? {}, references, seen));
    const invalid = previewRows.filter((row) => row.status === 'error' || row.status === 'duplicate');
    if (invalid.length) {
      throw new BadRequestException({
        message: 'Certaines lignes ne peuvent pas être importées.',
        rows: invalid.map((row) => ({ rowNumber: row.rowNumber, status: row.status, errors: row.errors, duplicateOf: row.duplicateOf })),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const categoryCache = new Map(references.categoriesByLookup);
      const supplierCache = new Map(references.suppliersByLookup);
      const unitCache = references.unitsByLookup;
      const products = [];
      const skipped: Array<{ rowNumber: number; reason: string }> = [];

      for (const row of previewRows) {
        if (row.status === 'ignored') {
          skipped.push({ rowNumber: row.rowNumber, reason: 'Ligne vide ignorée.' });
          continue;
        }
        const data = await this.productCreateData(tx, organizationId, row, options, { categoryCache, supplierCache, unitCache });
        const product = await tx.product.create({
          data: { ...data, organizationId },
          include: { category: true, unit: true, primarySupplier: true, stocks: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            userId: actor.id,
            action: AuditAction.PRODUCT_CREATED,
            entityType: 'Product',
            entityId: product.id,
            entityName: product.name,
            details: { source: 'csv-import', rowNumber: row.rowNumber } as Prisma.InputJsonValue,
          },
        });
        products.push(product);
      }

      return {
        created: products.length,
        skipped: skipped.length,
        skippedRows: skipped,
        products,
      };
    });
  }

  private async productCreateData(
    tx: Tx,
    organizationId: string,
    row: ProductImportPreviewRow,
    options: ProductImportOptionsDto,
    caches: {
      categoryCache: Map<string, { id: string; name: string }>;
      supplierCache: Map<string, { id: string; name: string }>;
      unitCache: Map<string, Unit>;
    },
  ) {
    const fields = row.fields;
    const unit = this.resolveUnit(String(fields.unit ?? fields.unitLabel ?? ''), caches.unitCache);
    if (!unit) throw new BadRequestException(`Unité introuvable ligne ${row.rowNumber}.`);

    let categoryId = cleanId(fields.categoryId);
    const categoryName = cleanString(fields.categoryName ?? fields.category);
    if (!categoryId && categoryName) {
      const lookup = normalizeLookup(categoryName);
      const existing = caches.categoryCache.get(lookup);
      if (existing) categoryId = existing.id;
      else if (options.createMissingCategories) {
        const created = await tx.category.create({ data: { organizationId, name: categoryName } });
        await tx.auditLog.create({ data: { organizationId, userId: null, action: AuditAction.CATEGORY_CREATED, entityType: 'Category', entityId: created.id, entityName: created.name, details: { source: 'csv-import' } as Prisma.InputJsonValue } });
        caches.categoryCache.set(lookup, created);
        categoryId = created.id;
      }
    }

    let primarySupplierId = cleanId(fields.primarySupplierId);
    const supplierName = cleanString(fields.supplierName ?? fields.supplier);
    if (!primarySupplierId && supplierName) {
      const lookup = normalizeLookup(supplierName);
      const existing = caches.supplierCache.get(lookup);
      if (existing) primarySupplierId = existing.id;
      else if (options.createMissingSuppliers) {
        const created = await tx.supplier.create({ data: { organizationId, name: supplierName } });
        await tx.auditLog.create({ data: { organizationId, userId: null, action: AuditAction.SUPPLIER_CREATED, entityType: 'Supplier', entityId: created.id, entityName: created.name, details: { source: 'csv-import' } as Prisma.InputJsonValue } });
        caches.supplierCache.set(lookup, created);
        primarySupplierId = created.id;
      }
    }

    return {
      name: cleanString(fields.name)!,
      unitId: unit.id,
      sku: nullableText(fields.sku),
      gtin: nullableText(fields.gtin),
      description: nullableText(fields.description),
      categoryId: categoryId || null,
      primarySupplierId: primarySupplierId || null,
      averagePrice: numberOrDefault(fields.averagePrice, 0),
      minimumStock: numberOrDefault(fields.minimumStock, 0),
      originCountry: nullableText(fields.originCountry),
      packageLabel: nullableText(fields.packageLabel),
      unitsPerPackage: nullableNumber(fields.unitsPerPackage),
      unitWeightGrams: nullableNumber(fields.unitWeightGrams),
      netWeightGrams: nullableNumber(fields.netWeightGrams),
      ingredients: nullableText(fields.ingredients),
      allergensPresent: stringArray(fields.allergensPresent),
      possibleTraces: stringArray(fields.possibleTraces),
      dietaryTags: stringArray(fields.dietaryTags),
      energyKj: nullableNumber(fields.energyKj),
      energyKcal: nullableNumber(fields.energyKcal),
      fatGrams: nullableNumber(fields.fatGrams),
      saturatedFatGrams: nullableNumber(fields.saturatedFatGrams),
      carbohydratesGrams: nullableNumber(fields.carbohydratesGrams),
      sugarsGrams: nullableNumber(fields.sugarsGrams),
      fiberGrams: nullableNumber(fields.fiberGrams),
      proteinGrams: nullableNumber(fields.proteinGrams),
      saltGrams: nullableNumber(fields.saltGrams),
      storageType: nullableText(fields.storageType),
      shelfLifeAfterOpening: nullableText(fields.shelfLifeAfterOpening),
      storageInstructions: nullableText(fields.storageInstructions),
      preparationInstructions: nullableText(fields.preparationInstructions),
    };
  }

  private previewRow(rowNumber: number, source: Record<string, string>, mapping: Record<string, ProductImportField>, references: ReferenceContext, seen: ReturnType<StocksProductImportService['emptySeen']>): ProductImportPreviewRow {
    const fields: ProductImportFields = {};
    for (const [header, value] of Object.entries(source)) {
      const field = mapping[header];
      if (!field || value.trim() === '') continue;
      fields[field] = normalizeFieldValue(field, value);
    }
    return this.previewImportedFields(rowNumber, fields, references, seen, source);
  }

  private previewImportedFields(rowNumber: number, rawFields: Record<string, unknown>, references: ReferenceContext, seen: ReturnType<StocksProductImportService['emptySeen']>, source: Record<string, string> = {}): ProductImportPreviewRow {
    const fields = normalizeImportedFields(rawFields);
    const errors: string[] = [];
    const warnings: string[] = [];
    let status: ProductImportStatus = 'ready';

    if (!hasUsefulFields(fields)) {
      return { rowNumber, source, fields, status: 'ignored', selected: false, warnings: ['Ligne vide.'], errors: [] };
    }

    const name = cleanString(fields.name);
    if (!name) errors.push('Nom du produit requis.');
    const unitLabel = cleanString(fields.unit ?? fields.unitLabel);
    const unit = this.resolveUnit(unitLabel, references.unitsByLookup);
    if (!unitLabel) errors.push('Unité requise.');
    if (unitLabel && !unit) errors.push(`Unité inconnue: ${unitLabel}.`);
    if (unit) {
      fields.unitId = unit.id;
      fields.unitLabel = `${unit.name} (${unit.symbol})`;
    }

    const categoryName = cleanString(fields.category);
    if (categoryName) {
      const category = references.categoriesByLookup.get(normalizeLookup(categoryName));
      if (category) {
        fields.categoryId = category.id;
        fields.categoryName = category.name;
      } else {
        fields.categoryName = categoryName;
        warnings.push(`Catégorie à créer ou ignorer: ${categoryName}.`);
      }
    }

    const supplierName = cleanString(fields.supplier);
    if (supplierName) {
      const supplier = references.suppliersByLookup.get(normalizeLookup(supplierName));
      if (supplier) {
        fields.primarySupplierId = supplier.id;
        fields.supplierName = supplier.name;
      } else {
        fields.supplierName = supplierName;
        warnings.push(`Fournisseur à créer ou ignorer: ${supplierName}.`);
      }
    }

    const duplicateOf = name ? this.detectDuplicate(name, fields, references, seen) : null;
    if (duplicateOf) {
      status = 'duplicate';
      warnings.push(`Doublon détecté: ${duplicateOf.label}.`);
    }

    if (errors.length) status = 'error';
    else if (status !== 'duplicate' && warnings.length) status = 'needs_review';

    if (status !== 'error' && status !== 'duplicate') this.markSeen(rowNumber, name, fields, seen);

    return { rowNumber, source, fields, status, selected: status === 'ready' || status === 'needs_review', warnings, errors, duplicateOf };
  }

  private detectDuplicate(name: string, fields: ProductImportFields, references: ReferenceContext, seen: ReturnType<StocksProductImportService['emptySeen']>) {
    const sku = cleanString(fields.sku);
    if (sku) {
      const key = normalizeLookup(sku);
      const existing = references.existingBySku.get(key);
      if (existing) return { type: 'existing' as const, field: 'sku' as const, value: sku, label: existing.name };
      const fileRow = seen.sku.get(key);
      if (fileRow) return { type: 'file' as const, field: 'sku' as const, value: sku, label: `ligne ${fileRow}` };
    }
    const gtin = cleanString(fields.gtin);
    if (gtin) {
      const key = normalizeLookup(gtin);
      const existing = references.existingByGtin.get(key);
      if (existing) return { type: 'existing' as const, field: 'gtin' as const, value: gtin, label: existing.name };
      const fileRow = seen.gtin.get(key);
      if (fileRow) return { type: 'file' as const, field: 'gtin' as const, value: gtin, label: `ligne ${fileRow}` };
    }
    const nameKey = normalizeLookup(name);
    const existing = references.existingByName.get(nameKey);
    if (existing) return { type: 'existing' as const, field: 'name' as const, value: name, label: existing.name };
    const fileRow = seen.name.get(nameKey);
    if (fileRow) return { type: 'file' as const, field: 'name' as const, value: name, label: `ligne ${fileRow}` };
    return null;
  }

  private markSeen(rowNumber: number, name: string | null | undefined, fields: ProductImportFields, seen: ReturnType<StocksProductImportService['emptySeen']>) {
    const sku = cleanString(fields.sku);
    if (sku) seen.sku.set(normalizeLookup(sku), rowNumber);
    const gtin = cleanString(fields.gtin);
    if (gtin) seen.gtin.set(normalizeLookup(gtin), rowNumber);
    if (name) seen.name.set(normalizeLookup(name), rowNumber);
  }

  private emptySeen() {
    return { sku: new Map<string, number>(), gtin: new Map<string, number>(), name: new Map<string, number>() };
  }

  private resolveUnit(value: string | null | undefined, unitsByLookup: Map<string, Unit>) {
    const lookup = normalizeLookup(value);
    if (!lookup) return null;
    return unitsByLookup.get(lookup) ?? unitsByLookup.get(unitAlias(lookup)) ?? null;
  }

  private async referenceContext(organizationId: string): Promise<ReferenceContext> {
    const [units, categories, suppliers, products] = await Promise.all([
      this.prisma.unit.findMany({ where: { organizationId, isArchived: false }, orderBy: { name: 'asc' } }),
      this.prisma.category.findMany({ where: { organizationId, isArchived: false }, select: { id: true, name: true } }),
      this.prisma.supplier.findMany({ where: { organizationId, isArchived: false }, select: { id: true, name: true } }),
      this.prisma.product.findMany({ where: { organizationId, isArchived: false }, select: { id: true, name: true, sku: true, gtin: true } }),
    ]);
    const unitsByLookup = new Map<string, Unit>();
    for (const unit of units) {
      unitsByLookup.set(normalizeLookup(unit.name), unit);
      unitsByLookup.set(normalizeLookup(unit.symbol), unit);
      unitsByLookup.set(unitAlias(normalizeLookup(unit.symbol)), unit);
      unitsByLookup.set(unitAlias(normalizeLookup(unit.name)), unit);
    }
    return {
      units,
      unitsByLookup,
      categoriesByLookup: mapByLookup(categories),
      suppliersByLookup: mapByLookup(suppliers),
      existingBySku: mapProductsBy(products, 'sku'),
      existingByGtin: mapProductsBy(products, 'gtin'),
      existingByName: mapProductsBy(products, 'name'),
    };
  }

  private validateCsvFile(file: UploadedFile) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier CSV fourni.');
    if ((file.size ?? file.buffer.length) > MAX_CSV_BYTES) throw new BadRequestException('Le fichier CSV dépasse 5 Mo.');
    const name = file.originalname?.toLowerCase() ?? '';
    const mime = file.mimetype?.toLowerCase() ?? '';
    if (!name.endsWith('.csv') && !['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'].includes(mime)) {
      throw new BadRequestException('Format non supporté. Exportez votre document au format CSV.');
    }
  }

  private async maybeImproveMappingWithMistral(organizationId: string, headers: string[], rows: string[][], mapping: Record<string, ProductImportField>) {
    const missingRequired = !Object.values(mapping).includes('name') || !Object.values(mapping).includes('unit');
    if (!missingRequired) return { status: 'not_needed' as const, provider: null, mapping: null, warnings: [] };
    const apiKey = await this.resolveMistralApiKey(organizationId);
    if (!apiKey) return { status: 'fallback' as const, provider: null, mapping: null, warnings: ['Clé Mistral absente, mapping local utilisé.'] };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: MISTRAL_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Tu aides à associer des colonnes CSV à des champs produit ToqueHub. Réponds uniquement en JSON {"mapping":{"Nom colonne":"champ"}}.' },
            { role: 'user', content: JSON.stringify({ allowedFields: IMPORT_FIELDS, headers, sampleRows: rows }) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Mistral ${response.status}`);
      const json: any = await response.json();
      const parsed = JSON.parse(json?.choices?.[0]?.message?.content || '{}');
      const aiMapping = sanitizeAiMapping(headers, parsed?.mapping);
      return { status: Object.keys(aiMapping).length ? 'applied' as const : 'fallback' as const, provider: 'mistral', model: MISTRAL_MODEL, mapping: aiMapping, warnings: [] };
    } catch (error: any) {
      this.logger.warn(`Mapping CSV Mistral indisponible: ${error?.message || error}`);
      return { status: 'fallback' as const, provider: 'mistral', model: MISTRAL_MODEL, mapping: null, warnings: ['Analyse Mistral indisponible, mapping local utilisé.'] };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveMistralApiKey(organizationId: string) {
    const envKey = process.env.MISTRAL_API_KEY || process.env.OCR_MISTRAL_API_KEY;
    if (envKey) return envKey;
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { mistralApiKey: true } });
    return organization?.mistralApiKey?.trim() || null;
  }
}

function parseCsv(input: string) {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = guessDelimiter(text);
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n' && !inQuotes) {
      row.push(cell.trim());
      if (row.some((value) => value.trim() !== '')) records.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some((value) => value.trim() !== '')) records.push(row);
  }
  const headers = (records.shift() ?? []).map((header) => header.trim()).filter(Boolean);
  return { delimiter, headers, rows: records };
}

function guessDelimiter(text: string) {
  const candidates = [';', ',', '\t'];
  const sample = text.split('\n').slice(0, 8).join('\n');
  const counts = candidates.map((delimiter) => ({ delimiter, count: countDelimiter(sample, delimiter) }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0]?.count ? counts[0].delimiter : ';';
}

function countDelimiter(text: string, delimiter: string) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === delimiter && !inQuotes) count += 1;
  }
  return count;
}

function detectColumnMapping(headers: string[]) {
  const mapping: Record<string, ProductImportField> = {};
  for (const header of headers) {
    const normalized = normalizeLookup(header);
    for (const field of IMPORT_FIELDS) {
      if (FIELD_ALIASES[field].some((alias) => normalizeLookup(alias) === normalized)) {
        mapping[header] = field;
        break;
      }
    }
  }
  return mapping;
}

function sanitizeAiMapping(headers: string[], mapping: unknown) {
  const result: Record<string, ProductImportField> = {};
  if (!mapping || typeof mapping !== 'object') return result;
  for (const [header, field] of Object.entries(mapping as Record<string, string>)) {
    const matchedHeader = headers.find((item) => normalizeLookup(item) === normalizeLookup(header));
    if (matchedHeader && IMPORT_FIELDS.includes(field as ProductImportField)) result[matchedHeader] = field as ProductImportField;
  }
  return result;
}

function rowSource(headers: string[], values: string[]) {
  return headers.reduce<Record<string, string>>((acc, header, index) => {
    acc[header] = values[index] ?? '';
    return acc;
  }, {});
}

function normalizeImportedFields(raw: Record<string, unknown>): ProductImportFields {
  const fields: ProductImportFields = {};
  for (const field of IMPORT_FIELDS) {
    const value = raw[field];
    if (value === undefined || value === null || value === '') continue;
    fields[field] = normalizeFieldValue(field, value);
  }
  fields.unitId = cleanId(raw.unitId);
  fields.unitLabel = cleanString(raw.unitLabel);
  fields.categoryId = cleanId(raw.categoryId);
  fields.categoryName = cleanString(raw.categoryName);
  fields.primarySupplierId = cleanId(raw.primarySupplierId);
  fields.supplierName = cleanString(raw.supplierName);
  return fields;
}

function normalizeFieldValue(field: ProductImportField, value: unknown) {
  if (['averagePrice', 'minimumStock', 'unitsPerPackage', 'unitWeightGrams', 'netWeightGrams', 'energyKj', 'energyKcal', 'fatGrams', 'saturatedFatGrams', 'carbohydratesGrams', 'sugarsGrams', 'fiberGrams', 'proteinGrams', 'saltGrams'].includes(field)) {
    return parseNullableNumber(value);
  }
  if (['allergensPresent', 'possibleTraces', 'dietaryTags'].includes(field)) return stringArray(value);
  return cleanString(value);
}

function summarizeRows(rows: ProductImportPreviewRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.status] += 1;
      if (row.selected) acc.selected += 1;
      return acc;
    },
    { total: 0, selected: 0, ready: 0, needs_review: 0, duplicate: 0, ignored: 0, error: 0 },
  );
}

function hasUsefulFields(fields: ProductImportFields) {
  return Object.entries(fields).some(([key, value]) => !['unitId', 'unitLabel', 'categoryId', 'categoryName', 'primarySupplierId', 'supplierName'].includes(key) && productHasValue(value));
}

function productHasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function mapByLookup<T extends { id: string; name: string }>(items: T[]) {
  return new Map(items.map((item) => [normalizeLookup(item.name), item]));
}

function mapProductsBy(products: Array<{ id: string; name: string; sku?: string | null; gtin?: string | null }>, field: 'sku' | 'gtin' | 'name') {
  const map = new Map<string, { id: string; name: string }>();
  for (const product of products) {
    const value = product[field];
    if (value) map.set(normalizeLookup(value), { id: product.id, name: product.name });
  }
  return map;
}

function normalizeLookup(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function unitAlias(lookup: string) {
  const aliases: Record<string, string> = {
    kilogramme: 'kg',
    kilogrammes: 'kg',
    kilo: 'kg',
    kilos: 'kg',
    gramme: 'g',
    grammes: 'g',
    litre: 'l',
    litres: 'l',
    millilitre: 'ml',
    millilitres: 'ml',
    piece: 'piece',
    pieces: 'piece',
    pcs: 'piece',
    pc: 'piece',
    unite: 'piece',
    unit: 'piece',
    units: 'piece',
  };
  return aliases[lookup] ?? lookup;
}

function cleanString(value: unknown) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function cleanId(value: unknown) {
  const text = cleanString(value);
  return text && /^[0-9a-fA-F-]{32,36}$/.test(text) ? text : null;
}

function nullableText(value: unknown) {
  return cleanString(value);
}

function parseNullableNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text
    .replace(/\s|\u00a0/g, '')
    .replace(/[€$]/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.+-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableNumber(value: unknown) {
  const parsed = parseNullableNumber(value);
  return parsed == null ? null : parsed;
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = parseNullableNumber(value);
  return parsed == null ? fallback : parsed;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean) as string[];
  const text = cleanString(value);
  if (!text) return [];
  return text.split(/[|,;]+/).map((item) => item.trim()).filter(Boolean);
}

function csvEscape(value: string) {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
