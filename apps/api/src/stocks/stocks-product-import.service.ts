import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma, ProductKind, Unit } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkAssignProductSitesDto,
  CommitProductImportDto,
  ProductImportOptionsDto,
} from './dto/stocks-product-import.dto';
import { parseProductWorkbook, TabularImportRow } from './stocks-product-spreadsheet';

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second', 'Magasinier'];
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const STOCK_CATALOG_PRODUCT_KINDS = [
  ProductKind.UNSPECIFIED,
  ProductKind.RAW_MATERIAL,
  ProductKind.PACKAGED,
];
const MISTRAL_MODEL = process.env.OCR_MISTRAL_AI_MODEL || 'mistral-large-latest';

type Actor = { id: string; role: string };
type Tx = Prisma.TransactionClient;
type UploadedFile = { originalname: string; mimetype?: string; size?: number; buffer?: Buffer };
type ProductImportSourceKind = 'csv' | 'xlsx' | 'supplier_purchase_history';

type ParsedProductImport = {
  headers: string[];
  rows: TabularImportRow[];
  delimiter: string;
  sourceKind: ProductImportSourceKind;
  sheetName?: string;
  headerRowNumber?: number;
  compatibilityMode?: 'minimal-openxml';
};

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

type ProductImportFields = Partial<
  Record<ProductImportField, string | number | string[] | null>
> & {
  unitId?: string | null;
  unitLabel?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  primarySupplierId?: string | null;
  supplierName?: string | null;
  existingProductId?: string | null;
};

type ProductImportPreviewRow = {
  rowNumber: number;
  source: Record<string, string>;
  fields: ProductImportFields;
  status: ProductImportStatus;
  selected: boolean;
  warnings: string[];
  errors: string[];
  duplicateOf?: {
    type: 'existing' | 'file';
    field: 'sku' | 'gtin' | 'name';
    value: string;
    label: string;
    productId?: string;
  } | null;
};

type PreparedSupplierHistoryRow = {
  rowNumber: number;
  source: Record<string, string>;
  fields: ProductImportFields;
  warnings: string[];
  ignoredReason?: string;
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
  name: [
    'nom',
    'nom produit',
    'nom du produit',
    'produit',
    'libelle',
    'libellé',
    'designation',
    'désignation',
    'article',
    'product',
    'product name',
    'tuote',
    'tuotenimi',
    'nimi',
  ],
  unit: [
    'unite',
    'unité',
    'unite stock',
    'unité stock',
    'unite de stock',
    'unité de stock',
    'unit',
    'uom',
    'yksikko',
    'yksikkö',
    'sisällön mittayksikkö',
    'sisallon mittayksikko',
    'me',
  ],
  sku: [
    'sku',
    'reference',
    'référence',
    'ref',
    'réf',
    'reference fournisseur',
    'référence fournisseur',
    'code',
    'code produit',
    'sap',
    'nimike',
  ],
  gtin: ['gtin', 'ean', 'ean code', 'barcode', 'code barre', 'code-barres', 'kupa'],
  supplier: ['fournisseur', 'supplier', 'vendor', 'toimittaja', 'markkinoija'],
  category: [
    'categorie',
    'catégorie',
    'famille',
    'sous famille',
    'sous-famille',
    'rayon',
    'category',
    'product group',
    'sub product group',
    'tuoteryhma',
    'tuoteryhmä',
  ],
  averagePrice: [
    'prix',
    'prix achat',
    'prix achat ht',
    'prix_achat_ht',
    'prix ht',
    'average price',
    'unit price',
    'á hinta',
    'a hinta',
    'hinta',
  ],
  minimumStock: [
    'seuil',
    'seuil minimum',
    'stock minimum',
    'minimum stock',
    'min stock',
    'seuil_minimum',
  ],
  description: ['description', 'notes', 'note', 'commentaire', 'tuotetiedot'],
  originCountry: [
    'origine',
    'pays origine',
    'pays d origine',
    "pays d'origine",
    'origin',
    'origin country',
    'alkuperamaa',
    'alkuperämaa',
    'valmistusmaa',
  ],
  packageLabel: [
    'conditionnement',
    'format',
    'colisage',
    'packaging',
    'package',
    'myyntierat',
    'myyntierät',
  ],
  unitsPerPackage: [
    'unites par colis',
    'unités par colis',
    'unites_par_colis',
    'pieces par colis',
    'pièces par colis',
    'units per package',
    'pakkauskoko',
  ],
  unitWeightGrams: [
    'poids unitaire g',
    'poids_unitaire_g',
    'poids unite',
    'poids unité',
    'unit weight',
    'nettopaino',
  ],
  netWeightGrams: ['poids net g', 'poids_net_g', 'poids net', 'net weight', 'kokonaispaino'],
  ingredients: ['ingredients', 'ingrédients', 'ainesosat'],
  allergensPresent: [
    'allergenes',
    'allergènes',
    'allergenes presents',
    'allergènes présents',
    'allergens',
  ],
  possibleTraces: ['traces', 'traces possibles', 'may contain', 'possible traces'],
  dietaryTags: [
    'tags',
    'tags alimentaires',
    'regimes',
    'régimes',
    'dietary tags',
    'gluteeniton',
    'laktoositon',
  ],
  energyKj: ['energie kj', 'énergie kj', 'energy kj'],
  energyKcal: ['energie kcal', 'énergie kcal', 'energy kcal', 'kcal'],
  fatGrams: [
    'matieres grasses',
    'matières grasses',
    'matieres grasses g',
    'matières grasses g',
    'fat',
    'fat g',
    'rasva',
  ],
  saturatedFatGrams: [
    'acides gras satures',
    'acides gras saturés',
    'acides gras satures g',
    'acides gras saturés g',
    'saturated fat',
    'saturated fat g',
    'tyydyttynyt',
  ],
  carbohydratesGrams: [
    'glucides',
    'glucides g',
    'carbohydrates',
    'carbohydrates g',
    'hiilihydraatit',
  ],
  sugarsGrams: ['sucres', 'sucres g', 'dont sucres', 'sugars', 'sugars g', 'sokerit'],
  fiberGrams: ['fibres', 'fibres g', 'fiber', 'fiber g', 'kuitu'],
  proteinGrams: [
    'proteines',
    'protéines',
    'proteines g',
    'protéines g',
    'protein',
    'protein g',
    'proteiini',
  ],
  saltGrams: ['sel', 'sel g', 'salt', 'salt g', 'suola'],
  storageType: ['conservation', 'type conservation', 'storage type', 'säilytys', 'sailytys'],
  shelfLifeAfterOpening: [
    'duree apres ouverture',
    'durée après ouverture',
    'shelf life after opening',
    'avattuna',
  ],
  storageInstructions: [
    'instructions conservation',
    'stockage',
    'storage instructions',
    'säilytysohje',
    'sailytysohje',
  ],
  preparationInstructions: [
    'preparation',
    'préparation',
    'utilisation',
    'preparation instructions',
    'kayttoohje',
    'käyttöohje',
  ],
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
    if (!WRITE_ROLES.includes(actor.role))
      throw new ForbiddenException('Insufficient stock permissions');
  }

  private async resolveImportSites(organizationId: string, requestedSiteIds?: string[]) {
    const activeSites = await this.prisma.site.findMany({
      where: { organizationId, isArchived: false },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!activeSites.length) {
      throw new BadRequestException('Configurez un site avant d’importer des produits.');
    }
    const requested = [...new Set((requestedSiteIds ?? []).filter(Boolean))];
    if (!requested.length) {
      if (activeSites.length === 1) return activeSites;
      throw new BadRequestException(
        'Choisissez au moins un site de destination pour cet import multi-site.',
      );
    }
    const allowed = new Set(activeSites.map((site) => site.id));
    if (requested.some((siteId) => !allowed.has(siteId))) {
      throw new BadRequestException('Un des sites sélectionnés est introuvable ou archivé.');
    }
    return activeSites.filter((site) => requested.includes(site.id));
  }

  async assignProductSites(
    organizationId: string,
    actor: Actor,
    dto: BulkAssignProductSitesDto,
  ) {
    this.assertWrite(actor);
    const sites = await this.resolveImportSites(organizationId, dto.siteIds);
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        isArchived: false,
        kind: { in: STOCK_CATALOG_PRODUCT_KINDS },
        ...(dto.productIds?.length ? { id: { in: dto.productIds } } : {}),
        ...(dto.onlyUnassigned ? { siteAssignments: { none: { isActive: true } } } : {}),
      },
      select: { id: true, minimumStock: true },
    });
    if (!products.length) {
      return { products: 0, assignmentsCreated: 0, siteIds: sites.map((site) => site.id) };
    }
    const assignmentsCreated = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productSite.createMany({
        data: products.flatMap((product) =>
          sites.map((site) => ({
            organizationId,
            productId: product.id,
            siteId: site.id,
            minimumStock: product.minimumStock,
          })),
        ),
        skipDuplicates: true,
      });
      await tx.productSite.updateMany({
        where: {
          organizationId,
          productId: { in: products.map((product) => product.id) },
          siteId: { in: sites.map((site) => site.id) },
        },
        data: { isActive: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.PRODUCT_UPDATED,
          entityType: 'ProductSiteBulkAssignment',
          entityId: sites[0].id,
          entityName: `${products.length} produit(s) affecté(s)`,
          details: {
            productCount: products.length,
            siteIds: sites.map((site) => site.id),
            onlyUnassigned: Boolean(dto.onlyUnassigned),
          } as Prisma.InputJsonValue,
        },
      });
      return created.count;
    });
    return {
      products: products.length,
      assignmentsCreated,
      siteIds: sites.map((site) => site.id),
    };
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

  /** Reuse the exact CSV import validation pipeline for manually entered or OCR catalog rows. */
  async previewProductRows(
    organizationId: string,
    actor: Actor,
    inputRows: Array<{ rowNumber?: number; fields?: Record<string, unknown>; selected?: boolean }>,
  ) {
    this.assertWrite(actor);
    if (!inputRows?.length) throw new BadRequestException('Aucune ligne produit fournie.');
    if (inputRows.length > MAX_IMPORT_ROWS)
      throw new BadRequestException(
        `Le créateur contient trop de lignes. Maximum: ${MAX_IMPORT_ROWS}.`,
      );
    const references = await this.referenceContext(organizationId);
    const seen = this.emptySeen();
    const rows = inputRows.map((input, index) => {
      const row = this.previewImportedFields(
        input.rowNumber ?? index + 2,
        input.fields ?? {},
        references,
        seen,
      );
      return input.selected === false ? { ...row, selected: false } : row;
    });
    return {
      filename: 'createur-csv-produits.csv',
      headers: TEMPLATE_HEADERS,
      delimiter: ';',
      mapping: Object.fromEntries(
        TEMPLATE_HEADERS.map((header) => [header, detectColumnMapping([header])[header]]).filter(
          ([, field]) => Boolean(field),
        ),
      ) as Record<string, ProductImportField>,
      localMapping: {},
      templateColumns: TEMPLATE_HEADERS,
      rows,
      summary: summarizeRows(rows),
      options: { createMissingCategories: true, createMissingSuppliers: true },
      ai: { status: 'catalog_creator', provider: 'mistral', warnings: [] },
    };
  }

  /** Serializes reviewed creator rows with the same header order as the official template. */
  creatorCsv(rows: Array<{ fields?: Record<string, unknown>; selected?: boolean }>) {
    const fieldsByHeader: Record<string, ProductImportField> = {
      nom: 'name',
      unite: 'unit',
      sku: 'sku',
      gtin: 'gtin',
      fournisseur: 'supplier',
      categorie: 'category',
      prix_achat_ht: 'averagePrice',
      seuil_minimum: 'minimumStock',
      description: 'description',
      origine: 'originCountry',
      conditionnement: 'packageLabel',
      unites_par_colis: 'unitsPerPackage',
      poids_unitaire_g: 'unitWeightGrams',
      poids_net_g: 'netWeightGrams',
      ingredients: 'ingredients',
      allergenes: 'allergensPresent',
      traces_possibles: 'possibleTraces',
      tags_alimentaires: 'dietaryTags',
      energie_kj: 'energyKj',
      energie_kcal: 'energyKcal',
      matieres_grasses_g: 'fatGrams',
      acides_gras_satures_g: 'saturatedFatGrams',
      glucides_g: 'carbohydratesGrams',
      sucres_g: 'sugarsGrams',
      fibres_g: 'fiberGrams',
      proteines_g: 'proteinGrams',
      sel_g: 'saltGrams',
      type_conservation: 'storageType',
      duree_apres_ouverture: 'shelfLifeAfterOpening',
      instructions_conservation: 'storageInstructions',
      instructions_preparation: 'preparationInstructions',
    };
    const data = rows
      .filter((row) => row.selected !== false)
      .map((row) =>
        TEMPLATE_HEADERS.map((header) => {
          const value = row.fields?.[fieldsByHeader[header]];
          return csvEscape(
            Array.isArray(value) ? value.join('|') : value == null ? '' : String(value),
          );
        }).join(';'),
      );
    return `\uFEFF${TEMPLATE_HEADERS.join(';')}\n${data.join('\n')}${data.length ? '\n' : ''}`;
  }

  async analyzeProductImport(organizationId: string, actor: Actor, file: UploadedFile) {
    this.assertWrite(actor);
    this.validateImportFile(file);
    const parsed = await this.parseImportFile(file);
    if (!parsed.headers.length)
      throw new BadRequestException('Le fichier ne contient pas d’en-têtes.');
    if (parsed.rows.length > MAX_IMPORT_ROWS)
      throw new BadRequestException(
        `Le fichier contient trop de lignes. Maximum: ${MAX_IMPORT_ROWS}.`,
      );

    let mapping = detectColumnMapping(parsed.headers);
    const localMapping = { ...mapping };
    const references = await this.referenceContext(organizationId);
    if (isSupplierPurchaseHistory(parsed.headers)) {
      return this.previewSupplierPurchaseHistory(file.originalname, parsed, references);
    }

    const ai = await this.maybeImproveMappingWithMistral(
      organizationId,
      parsed.headers,
      parsed.rows.slice(0, 6).map((row) => row.values),
      mapping,
    );
    if (ai.mapping) mapping = { ...mapping, ...ai.mapping };

    const seen = this.emptySeen();
    const rows = parsed.rows.map((row) => {
      const source = rowSource(parsed.headers, row.values);
      return this.previewRow(row.rowNumber, source, mapping, references, seen);
    });
    return {
      filename: file.originalname,
      headers: parsed.headers,
      delimiter: parsed.delimiter,
      sourceKind: parsed.sourceKind,
      sourceSheet: parsed.sheetName,
      headerRowNumber: parsed.headerRowNumber,
      processingNotes:
        parsed.sourceKind === 'xlsx'
          ? [
              `Feuille « ${parsed.sheetName} » lue directement, sans OCR.`,
              ...(parsed.compatibilityMode === 'minimal-openxml'
                ? ['Format Excel minimal normalisé en mémoire pour assurer sa compatibilité.']
                : []),
            ]
          : [],
      mapping,
      localMapping,
      templateColumns: TEMPLATE_HEADERS,
      rows,
      summary: summarizeRows(rows),
      options: { createMissingCategories: true, createMissingSuppliers: true },
      ai,
    };
  }

  private async parseImportFile(file: UploadedFile): Promise<ParsedProductImport> {
    const name = file.originalname?.toLowerCase() ?? '';
    if (name.endsWith('.xlsx')) {
      try {
        const workbook = await parseProductWorkbook(file.buffer!, (headers) =>
          headerCandidateScore(headers),
        );
        return {
          ...workbook,
          delimiter: 'xlsx',
          sourceKind: 'xlsx',
        };
      } catch (error: any) {
        throw new BadRequestException(
          `Classeur Excel illisible: ${error?.message || 'format invalide'}`,
        );
      }
    }
    const csv = parseCsv(file.buffer!.toString('utf8'));
    return { ...csv, delimiter: csv.delimiter, sourceKind: 'csv' };
  }

  private previewSupplierPurchaseHistory(
    filename: string,
    parsed: ParsedProductImport,
    references: ReferenceContext,
  ) {
    const prepared = prepareSupplierPurchaseHistory(parsed.headers, parsed.rows);
    if (!prepared.rows.length)
      throw new BadRequestException(
        'Aucun produit exploitable trouvé dans cet historique fournisseur.',
      );
    if (prepared.rows.length > MAX_IMPORT_ROWS)
      throw new BadRequestException(
        `Le fichier contient trop de produits consolidés. Maximum: ${MAX_IMPORT_ROWS}.`,
      );
    const unitPricedRows = prepared.rows.filter(
      (row) => typeof row.fields.averagePrice === 'number' && row.fields.averagePrice > 0,
    ).length;

    const seen = this.emptySeen();
    const rows = prepared.rows.map((preparedRow): ProductImportPreviewRow => {
      if (preparedRow.ignoredReason) {
        return {
          rowNumber: preparedRow.rowNumber,
          source: preparedRow.source,
          fields: preparedRow.fields,
          status: 'ignored',
          selected: false,
          warnings: [preparedRow.ignoredReason, ...preparedRow.warnings],
          errors: [],
        };
      }
      const row = this.previewImportedFields(
        preparedRow.rowNumber,
        preparedRow.fields,
        references,
        seen,
        preparedRow.source,
      );
      if (!preparedRow.warnings.length) return row;
      return {
        ...row,
        status: row.status === 'ready' ? 'needs_review' : row.status,
        warnings: [...preparedRow.warnings, ...row.warnings],
      };
    });

    const mapping: Record<string, ProductImportField> = {};
    for (const header of parsed.headers) {
      const normalized = normalizeLookup(header);
      if (['product', 'tuote'].includes(normalized)) mapping[header] = 'name';
      else if (
        ['sub product group', 'product group', 'alatuoteryhma', 'tuoteryhma'].includes(normalized)
      )
        mapping[header] = 'category';
      else if (['ean code', 'ean koodi'].includes(normalized)) mapping[header] = 'gtin';
      else if (normalized === 'sisallon mittayksikko') mapping[header] = 'unit';
    }

    return {
      filename,
      headers: parsed.headers,
      delimiter: parsed.delimiter,
      sourceKind: 'supplier_purchase_history' as const,
      sourceSheet: parsed.sheetName,
      headerRowNumber: parsed.headerRowNumber,
      processingNotes: [
        ...(parsed.compatibilityMode === 'minimal-openxml'
          ? ['Format Excel minimal normalisé en mémoire pour assurer sa compatibilité.']
          : []),
        `Historique fournisseur détecté: ${prepared.sourceRows} lignes produit consolidées en ${prepared.rows.length} fiches candidates.`,
        'Les doublons de périodes ou de TVA portant le même EAN ont été regroupés.',
        `Un prix unitaire HT a été calculé automatiquement pour ${unitPricedRows} fiche${unitPricedRows > 1 ? 's' : ''}: montant total HT acheté ÷ quantité nette commandée.`,
        'Ce prix unitaire calculé sera enregistré comme prix d’achat initial, puis les prochains imports de factures, bons de livraison ou commandes pourront l’actualiser.',
        'La colonne VENDOR est conservée comme fabricant ou fournisseur amont; elle ne crée pas de fournisseur principal.',
        'Vous pouvez appliquer votre fournisseur de commande principal à toutes les fiches depuis l’étape de vérification.',
        'Lecture structurée du classeur Excel: le moteur OCR des factures et réceptions n’est pas utilisé.',
      ],
      mapping,
      localMapping: mapping,
      templateColumns: TEMPLATE_HEADERS,
      rows,
      summary: summarizeRows(rows),
      options: { createMissingCategories: true, createMissingSuppliers: true },
      ai: { status: 'structured_supplier_history', provider: null, mapping: null, warnings: [] },
    };
  }

  async commitProductImport(organizationId: string, actor: Actor, dto: CommitProductImportDto) {
    this.assertWrite(actor);
    const selectedRows = (dto.rows ?? [])
      .filter((row) => row.selected !== false)
      .slice(0, MAX_IMPORT_ROWS);
    if (!selectedRows.length) throw new BadRequestException('Aucune ligne sélectionnée.');
    const options = dto.options ?? {};
    const sites = await this.resolveImportSites(organizationId, options.siteIds);

    const references = await this.referenceContext(organizationId);
    const seen = this.emptySeen();
    const previewRows = selectedRows.map((row) =>
      this.previewImportedFields(row.rowNumber, row.fields ?? {}, references, seen),
    );
    const invalid = previewRows.filter(
      (row) => row.status === 'error' || row.status === 'duplicate',
    );
    if (invalid.length) {
      throw new BadRequestException({
        message: 'Certaines lignes ne peuvent pas être importées.',
        rows: invalid.map((row) => ({
          rowNumber: row.rowNumber,
          status: row.status,
          errors: row.errors,
          duplicateOf: row.duplicateOf,
        })),
      });
    }
    const needsDefaultSupplier = previewRows.some((row) => {
      if (cleanId(row.fields.existingProductId)) return false;
      const supplierName = cleanString(row.fields.supplierName ?? row.fields.supplier);
      const supplierAlreadyExists = supplierName
        ? references.suppliersByLookup.has(normalizeLookup(supplierName))
        : false;
      return (
        row.status !== 'ignored' &&
        !cleanId(row.fields.primarySupplierId) &&
        !supplierAlreadyExists &&
        (!supplierName || !options.createMissingSuppliers)
      );
    });
    if (
      needsDefaultSupplier &&
      !cleanId(options.defaultSupplierId) &&
      !cleanString(options.defaultSupplierName)
    ) {
      throw new BadRequestException(
        'Aucun fournisseur n’est renseigné pour une ou plusieurs lignes. Choisissez un fournisseur existant ou créez un fournisseur commun avant de lancer l’import.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const categoryCache = new Map(references.categoriesByLookup);
      const supplierCache = new Map(references.suppliersByLookup);
      const unitCache = references.unitsByLookup;
      const products = [];
      const skipped: Array<{ rowNumber: number; reason: string }> = [];
      const importBatchId = randomUUID();
      let createdCount = 0;
      let assignedExisting = 0;
      let assignmentsCreated = 0;
      const defaultSupplierId = needsDefaultSupplier
        ? await this.resolveDefaultSupplier(
            tx,
            organizationId,
            actor,
            options,
            supplierCache,
            importBatchId,
          )
        : null;

      for (const row of previewRows) {
        if (row.status === 'ignored') {
          skipped.push({ rowNumber: row.rowNumber, reason: 'Ligne vide ignorée.' });
          continue;
        }
        const existingProductId = cleanId(row.fields.existingProductId);
        let product;
        if (existingProductId) {
          product = await tx.product.findFirst({
            where: { id: existingProductId, organizationId, isArchived: false },
            include: { category: true, unit: true, primarySupplier: true, stocks: true },
          });
          if (!product) {
            throw new BadRequestException(
              `Le produit existant de la ligne ${row.rowNumber} est introuvable. Relancez l'analyse du fichier.`,
            );
          }
          assignedExisting += 1;
        } else {
          const data = await this.productCreateData(
            tx,
            organizationId,
            row,
            options,
            { categoryCache, supplierCache, unitCache },
            defaultSupplierId,
          );
          product = await tx.product.create({
            data: { ...data, organizationId },
            include: { category: true, unit: true, primarySupplier: true, stocks: true },
          });
          createdCount += 1;
          await tx.auditLog.create({
            data: {
              organizationId,
              userId: actor.id,
              action: AuditAction.PRODUCT_CREATED,
              entityType: 'Product',
              entityId: product.id,
              entityName: product.name,
              details: {
                source: 'csv-import',
                importBatchId,
                rowNumber: row.rowNumber,
              } as Prisma.InputJsonValue,
            },
          });
        }

        const assignmentResult = await tx.productSite.createMany({
          data: sites.map((site) => ({
            organizationId,
            productId: product.id,
            siteId: site.id,
            minimumStock: numberOrDefault(
              row.fields.minimumStock,
              Number(product.minimumStock ?? 0),
            ),
          })),
          skipDuplicates: true,
        });
        assignmentsCreated += assignmentResult.count;
        await tx.productSite.updateMany({
          where: {
            organizationId,
            productId: product.id,
            siteId: { in: sites.map((site) => site.id) },
          },
          data: { isActive: true },
        });
        products.push(product);
      }

      return {
        created: createdCount,
        assignedExisting,
        assignmentsCreated,
        siteIds: sites.map((site) => site.id),
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
    defaultSupplierId: string | null = null,
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
        await tx.auditLog.create({
          data: {
            organizationId,
            userId: null,
            action: AuditAction.CATEGORY_CREATED,
            entityType: 'Category',
            entityId: created.id,
            entityName: created.name,
            details: { source: 'csv-import' } as Prisma.InputJsonValue,
          },
        });
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
        await tx.auditLog.create({
          data: {
            organizationId,
            userId: null,
            action: AuditAction.SUPPLIER_CREATED,
            entityType: 'Supplier',
            entityId: created.id,
            entityName: created.name,
            details: { source: 'csv-import' } as Prisma.InputJsonValue,
          },
        });
        caches.supplierCache.set(lookup, created);
        primarySupplierId = created.id;
      }
    }
    if (!primarySupplierId) primarySupplierId = defaultSupplierId;

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

  private async resolveDefaultSupplier(
    tx: Tx,
    organizationId: string,
    actor: Actor,
    options: ProductImportOptionsDto,
    supplierCache: Map<string, { id: string; name: string }>,
    importBatchId: string,
  ) {
    const requestedId = cleanId(options.defaultSupplierId);
    if (requestedId) {
      const existing = [...supplierCache.values()].find((supplier) => supplier.id === requestedId);
      if (!existing) {
        throw new BadRequestException(
          'Le fournisseur principal sélectionné est introuvable ou n’appartient pas à cet établissement.',
        );
      }
      return existing.id;
    }

    const requestedName = cleanString(options.defaultSupplierName);
    if (!requestedName) {
      throw new BadRequestException(
        'Renseignez le nom du fournisseur commun à créer pour les lignes sans fournisseur.',
      );
    }
    const lookup = normalizeLookup(requestedName);
    const existing = supplierCache.get(lookup);
    if (existing) return existing.id;

    const created = await tx.supplier.create({
      data: { organizationId, name: requestedName },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: actor.id,
        action: AuditAction.SUPPLIER_CREATED,
        entityType: 'Supplier',
        entityId: created.id,
        entityName: created.name,
        details: {
          source: 'csv-import',
          importBatchId,
          role: 'default-supplier',
        } as Prisma.InputJsonValue,
      },
    });
    supplierCache.set(lookup, created);
    return created.id;
  }

  private previewRow(
    rowNumber: number,
    source: Record<string, string>,
    mapping: Record<string, ProductImportField>,
    references: ReferenceContext,
    seen: ReturnType<StocksProductImportService['emptySeen']>,
  ): ProductImportPreviewRow {
    const fields: ProductImportFields = {};
    for (const [header, value] of Object.entries(source)) {
      const field = mapping[header];
      if (!field || value.trim() === '') continue;
      fields[field] = normalizeFieldValue(field, value);
    }
    return this.previewImportedFields(rowNumber, fields, references, seen, source);
  }

  private previewImportedFields(
    rowNumber: number,
    rawFields: Record<string, unknown>,
    references: ReferenceContext,
    seen: ReturnType<StocksProductImportService['emptySeen']>,
    source: Record<string, string> = {},
  ): ProductImportPreviewRow {
    const fields = normalizeImportedFields(rawFields);
    const errors: string[] = [];
    const warnings: string[] = [];
    let status: ProductImportStatus = 'ready';

    if (!hasUsefulFields(fields)) {
      return {
        rowNumber,
        source,
        fields,
        status: 'ignored',
        selected: false,
        warnings: ['Ligne vide.'],
        errors: [],
      };
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
      if (duplicateOf.type === 'existing' && duplicateOf.productId) {
        fields.existingProductId = duplicateOf.productId;
        status = 'needs_review';
        warnings.push(
          `Produit existant: ${duplicateOf.label}. Il sera affecté au site sans être dupliqué.`,
        );
      } else {
        status = 'duplicate';
        warnings.push(`Doublon détecté: ${duplicateOf.label}.`);
      }
    }

    if (errors.length) status = 'error';
    else if (status !== 'duplicate' && warnings.length) status = 'needs_review';

    if (status !== 'error' && status !== 'duplicate') this.markSeen(rowNumber, name, fields, seen);

    return {
      rowNumber,
      source,
      fields,
      status,
      selected: status === 'ready' || status === 'needs_review',
      warnings,
      errors,
      duplicateOf,
    };
  }

  private detectDuplicate(
    name: string,
    fields: ProductImportFields,
    references: ReferenceContext,
    seen: ReturnType<StocksProductImportService['emptySeen']>,
  ) {
    const sku = cleanString(fields.sku);
    if (sku) {
      const key = normalizeLookup(sku);
      const fileRow = seen.sku.get(key);
      if (fileRow)
        return {
          type: 'file' as const,
          field: 'sku' as const,
          value: sku,
          label: `ligne ${fileRow}`,
        };
      const existing = references.existingBySku.get(key);
      if (existing)
        return {
          type: 'existing' as const,
          field: 'sku' as const,
          value: sku,
          label: existing.name,
          productId: existing.id,
        };
    }
    const gtin = cleanString(fields.gtin);
    if (gtin) {
      const key = normalizeLookup(gtin);
      const fileRow = seen.gtin.get(key);
      if (fileRow)
        return {
          type: 'file' as const,
          field: 'gtin' as const,
          value: gtin,
          label: `ligne ${fileRow}`,
        };
      const existing = references.existingByGtin.get(key);
      if (existing)
        return {
          type: 'existing' as const,
          field: 'gtin' as const,
          value: gtin,
          label: existing.name,
          productId: existing.id,
        };
    }
    const nameKey = normalizeLookup(name);
    const fileRow = seen.name.get(nameKey);
    if (fileRow)
      return {
        type: 'file' as const,
        field: 'name' as const,
        value: name,
        label: `ligne ${fileRow}`,
      };
    const existing = references.existingByName.get(nameKey);
    if (existing)
      return {
        type: 'existing' as const,
        field: 'name' as const,
        value: name,
        label: existing.name,
        productId: existing.id,
      };
    return null;
  }

  private markSeen(
    rowNumber: number,
    name: string | null | undefined,
    fields: ProductImportFields,
    seen: ReturnType<StocksProductImportService['emptySeen']>,
  ) {
    const sku = cleanString(fields.sku);
    if (sku) seen.sku.set(normalizeLookup(sku), rowNumber);
    const gtin = cleanString(fields.gtin);
    if (gtin) seen.gtin.set(normalizeLookup(gtin), rowNumber);
    if (name) seen.name.set(normalizeLookup(name), rowNumber);
  }

  private emptySeen() {
    return {
      sku: new Map<string, number>(),
      gtin: new Map<string, number>(),
      name: new Map<string, number>(),
    };
  }

  private resolveUnit(value: string | null | undefined, unitsByLookup: Map<string, Unit>) {
    const lookup = normalizeLookup(value);
    if (!lookup) return null;
    return unitsByLookup.get(lookup) ?? unitsByLookup.get(unitAlias(lookup)) ?? null;
  }

  private async referenceContext(organizationId: string): Promise<ReferenceContext> {
    const [units, categories, suppliers, products] = await Promise.all([
      this.prisma.unit.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { name: 'asc' },
      }),
      this.prisma.category.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true },
      }),
      this.prisma.supplier.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true, sku: true, gtin: true },
      }),
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

  private validateImportFile(file: UploadedFile) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier produit fourni.');
    if ((file.size ?? file.buffer.length) > MAX_IMPORT_FILE_BYTES)
      throw new BadRequestException('Le fichier produit dépasse 5 Mo.');
    const name = file.originalname?.toLowerCase() ?? '';
    const mime = file.mimetype?.toLowerCase() ?? '';
    const isCsv =
      name.endsWith('.csv') || ['text/csv', 'application/csv', 'text/plain'].includes(mime);
    const isXlsx =
      name.endsWith('.xlsx') ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const genericBinaryWithSupportedName =
      mime === 'application/octet-stream' && (name.endsWith('.csv') || name.endsWith('.xlsx'));
    if (!isCsv && !isXlsx && !genericBinaryWithSupportedName) {
      throw new BadRequestException(
        'Format non supporté. Utilisez un fichier CSV ou Excel (.xlsx).',
      );
    }
  }

  private async maybeImproveMappingWithMistral(
    organizationId: string,
    headers: string[],
    rows: string[][],
    mapping: Record<string, ProductImportField>,
  ) {
    const missingRequired =
      !Object.values(mapping).includes('name') || !Object.values(mapping).includes('unit');
    if (!missingRequired)
      return { status: 'not_needed' as const, provider: null, mapping: null, warnings: [] };
    const apiKey = await this.resolveMistralApiKey(organizationId);
    if (!apiKey)
      return {
        status: 'fallback' as const,
        provider: null,
        mapping: null,
        warnings: ['Clé Mistral absente, mapping local utilisé.'],
      };
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
            {
              role: 'system',
              content:
                'Tu aides à associer les colonnes d’un tableau CSV ou Excel à des champs produit ToqueHub. Réponds uniquement en JSON {"mapping":{"Nom colonne":"champ"}}.',
            },
            {
              role: 'user',
              content: JSON.stringify({ allowedFields: IMPORT_FIELDS, headers, sampleRows: rows }),
            },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Mistral ${response.status}`);
      const json: any = await response.json();
      const parsed = JSON.parse(json?.choices?.[0]?.message?.content || '{}');
      const aiMapping = sanitizeAiMapping(headers, parsed?.mapping);
      return {
        status: Object.keys(aiMapping).length ? ('applied' as const) : ('fallback' as const),
        provider: 'mistral',
        model: MISTRAL_MODEL,
        mapping: aiMapping,
        warnings: [],
      };
    } catch (error: any) {
      this.logger.warn(`Mapping CSV Mistral indisponible: ${error?.message || error}`);
      return {
        status: 'fallback' as const,
        provider: 'mistral',
        model: MISTRAL_MODEL,
        mapping: null,
        warnings: ['Analyse Mistral indisponible, mapping local utilisé.'],
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveMistralApiKey(organizationId: string) {
    const envKey = process.env.MISTRAL_API_KEY || process.env.OCR_MISTRAL_API_KEY;
    if (envKey) return envKey;
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { mistralApiKey: true },
    });
    return organization?.mistralApiKey?.trim() || null;
  }
}

function parseCsv(input: string) {
  const text = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
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
  return {
    delimiter,
    headers,
    rows: records.map((values, index) => ({ rowNumber: index + 2, values })),
  };
}

function guessDelimiter(text: string) {
  const candidates = [';', ',', '\t'];
  const sample = text.split('\n').slice(0, 8).join('\n');
  const counts = candidates.map((delimiter) => ({
    delimiter,
    count: countDelimiter(sample, delimiter),
  }));
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
    if (matchedHeader && IMPORT_FIELDS.includes(field as ProductImportField))
      result[matchedHeader] = field as ProductImportField;
  }
  return result;
}

function rowSource(headers: string[], values: string[]) {
  return headers.reduce<Record<string, string>>((acc, header, index) => {
    acc[header] = values[index] ?? '';
    return acc;
  }, {});
}

function headerCandidateScore(headers: string[]) {
  const mapped = Object.keys(detectColumnMapping(headers)).length;
  return mapped * 20 + (isSupplierPurchaseHistory(headers) ? 200 : 0);
}

function isSupplierPurchaseHistory(headers: string[]) {
  const normalized = new Set(headers.map((header) => normalizeLookup(header)));
  const has = (...aliases: string[]) => aliases.some((alias) => normalized.has(alias));
  return (
    has('product', 'tuote') &&
    has('ean code', 'ean koodi') &&
    has('purchases net content', 'ostot nettosisalto') &&
    has('purchases vat 0 excl freight', 'ostot alv 0 ilman rahtia')
  );
}

function prepareSupplierPurchaseHistory(headers: string[], inputRows: TabularImportRow[]) {
  const indexes = new Map(headers.map((header, index) => [normalizeLookup(header), index]));
  const indexOf = (...aliases: string[]) =>
    aliases
      .map((alias) => indexes.get(normalizeLookup(alias)))
      .find((index) => index !== undefined) ?? -1;
  const columns = {
    group: indexOf('product group', 'tuoteryhma'),
    subgroup: indexOf('sub product group', 'alatuoteryhma'),
    name: indexOf('product', 'tuote'),
    purchasesNet: indexOf('purchases vat 0 excl freight', 'ostot alv 0 ilman rahtia'),
    contentQty: indexOf('purchases net content', 'ostot nettosisalto'),
    contentUnit: indexOf('sisallon mittayksikko'),
    salesBatchQty: indexOf('purchases mmy', 'ostot mmy'),
    salesBatchUnit: indexOf('myyntierayksikko'),
    baseSalesQty: indexOf('puchases pmy', 'purchases pmy', 'ostot pmy'),
    baseSalesUnit: indexOf('perusmyyntiyksikon mittayksikko'),
    vendor: indexOf('vendor', 'toimittaja'),
    ean: indexOf('ean code', 'ean koodi'),
    tax: indexOf('tax', 'vero'),
  };
  const value = (row: TabularImportRow, index: number) =>
    index >= 0 ? String(row.values[index] ?? '').trim() : '';
  const lines = inputRows
    .map((row) => ({
      row,
      source: rowSource(headers, row.values),
      group: value(row, columns.group),
      subgroup: value(row, columns.subgroup),
      name: value(row, columns.name),
      purchasesNet: parseHistoryNumber(value(row, columns.purchasesNet)),
      contentQty: parseHistoryNumber(value(row, columns.contentQty)),
      contentUnit: value(row, columns.contentUnit),
      salesBatchQty: parseHistoryNumber(value(row, columns.salesBatchQty)),
      salesBatchUnit: value(row, columns.salesBatchUnit),
      baseSalesQty: parseHistoryNumber(value(row, columns.baseSalesQty)),
      baseSalesUnit: value(row, columns.baseSalesUnit),
      vendor: value(row, columns.vendor),
      ean: normalizeHistoryIdentifier(value(row, columns.ean)),
      tax: value(row, columns.tax),
    }))
    .filter((line) => line.name);

  const grouped = new Map<string, typeof lines>();
  for (const line of lines) {
    const key = line.ean ? `ean:${line.ean}` : `name:${normalizeLookup(line.name)}`;
    const group = grouped.get(key) ?? [];
    group.push(line);
    grouped.set(key, group);
  }

  const rows: PreparedSupplierHistoryRow[] = [];
  for (const group of grouped.values()) {
    const first = group[0];
    const purchasesNet = sumHistory(group.map((line) => line.purchasesNet));
    const contentQty = sumHistory(group.map((line) => line.contentQty));
    const contentUnits = uniqueHistory(group.map((line) => line.contentUnit));
    const salesBatchUnits = uniqueHistory(group.map((line) => line.salesBatchUnit));
    const vendors = uniqueHistory(group.map((line) => line.vendor));
    const warnings: string[] = [];
    const unit = contentUnits.length === 1 ? historyStockUnit(contentUnits[0]) : null;
    const fields: ProductImportFields = {
      name: first.name,
      gtin: first.ean || null,
      category: first.subgroup || first.group || null,
      unit: unit || contentUnits[0] || null,
    };

    if (purchasesNet > 0 && contentQty > 0)
      fields.averagePrice = roundHistory(purchasesNet / contentQty, 4);
    const baseUnits = uniqueHistory(group.map((line) => line.baseSalesUnit));
    const baseUnitsPerPackage = stableIntegerRatio(
      group.map((line) =>
        line.baseSalesQty > 0 && line.salesBatchQty > 0
          ? line.baseSalesQty / line.salesBatchQty
          : null,
      ),
    );
    const contentPerBaseUnit = stableRatio(
      group.map((line) =>
        line.contentQty > 0 && line.baseSalesQty > 0 ? line.contentQty / line.baseSalesQty : null,
      ),
    );
    const stockUnitsPerPackage =
      baseUnitsPerPackage != null && contentPerBaseUnit != null
        ? roundHistory(baseUnitsPerPackage * contentPerBaseUnit, 3)
        : null;
    if (stockUnitsPerPackage != null) fields.unitsPerPackage = stockUnitsPerPackage;
    if (salesBatchUnits.length === 1)
      fields.packageLabel = historyPackageLabel(
        salesBatchUnits[0],
        baseUnitsPerPackage,
        baseUnits,
        stockUnitsPerPackage,
        unit,
      );

    if (
      contentUnits.length === 1 &&
      normalizeLookup(contentUnits[0]) === 'kg' &&
      contentPerBaseUnit != null
    ) {
      fields.unitWeightGrams = roundHistory(contentPerBaseUnit * 1000, 3);
    }

    const description: string[] = [];
    if (first.group && normalizeLookup(first.group) !== normalizeLookup(first.subgroup))
      description.push(`Famille fournisseur: ${first.group}`);
    if (vendors.length)
      description.push(
        `Fabricant ou fournisseur amont: ${vendors.slice(0, 3).join(', ')}${vendors.length > 3 ? ` (+${vendors.length - 3})` : ''}`,
      );
    if (description.length) fields.description = `${description.join('. ')}.`;

    if (contentUnits.length > 1)
      warnings.push(`Unités de contenu contradictoires: ${contentUnits.join(', ')}.`);
    if (salesBatchUnits.length > 1)
      warnings.push(`Conditionnements historiques différents: ${salesBatchUnits.join(', ')}.`);
    if (vendors.length > 1)
      warnings.push(`Plusieurs fabricants ou fournisseurs amont observés: ${vendors.join(', ')}.`);
    if (group.some((line) => /POISTO|DISCONTINU|LOPET/i.test(`${line.name} ${line.vendor}`)))
      warnings.push('Référence potentiellement retirée du catalogue fournisseur.');
    if (first.ean.startsWith('2'))
      warnings.push('EAN interne ou à poids variable: vérifier avant création.');
    if (normalizeLookup(contentUnits[0]) === 'pak')
      warnings.push('Unité fournisseur PAK convertie en unité comptable « pièce ».');

    let ignoredReason: string | undefined;
    if (purchasesNet < 0 || contentQty < 0)
      ignoredReason = 'Retour, consigne ou emballage négatif exclu de la création produit.';
    else if (purchasesNet === 0 || contentQty === 0)
      ignoredReason = 'Ligne sans achat ou quantité exploitable, exclue par défaut.';

    rows.push({
      rowNumber: first.row.rowNumber,
      source: { ...first.source, 'Lignes consolidées': String(group.length) },
      fields,
      warnings,
      ignoredReason,
    });
  }

  return { sourceRows: lines.length, rows };
}

function parseHistoryNumber(value: string) {
  let normalized = value.replace(/[\s\u00a0]/g, '').replace(/[€$]/g, '');
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    normalized =
      comma > dot ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = normalized.replace(',', '.');
  }
  normalized = normalized.replace(/[^0-9.+-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHistoryIdentifier(value: string) {
  const compact = value.replace(/[\s\u00a0]/g, '');
  if (/^\d+(?:\.0+)?$/.test(compact)) return compact.replace(/\.0+$/, '');
  if (/^\d+(?:[.,]\d+)?e\+?\d+$/i.test(compact)) {
    const parsed = Number(compact.replace(',', '.'));
    if (Number.isSafeInteger(parsed)) return parsed.toFixed(0);
  }
  return compact;
}

function historyStockUnit(value: string) {
  const lookup = normalizeLookup(value);
  const units: Record<string, string> = { kg: 'kg', l: 'L', kpl: 'pièce', pak: 'pièce' };
  return units[lookup] ?? value;
}

function historyPackageLabel(
  value: string,
  baseFactor: number | null,
  baseUnits: string[],
  stockUnitsPerPackage: number | null,
  stockUnit: string | null,
) {
  const lookup = normalizeLookup(value);
  const labels: Record<string, string> = {
    ltk: 'Carton',
    pss: 'Sac',
    rs: 'Barquette',
    pak: 'Pack',
    kpl: 'Pièce',
    pkt: 'Paquet',
    plo: 'Bouteille',
    prk: 'Pot',
    tlk: 'Contenant',
    sk: 'Seau',
    tb: 'Tube',
    kg: 'Kilogramme',
    nip: 'Lot',
  };
  const label = labels[lookup] ?? value;
  if (!baseFactor) return `${label} (${value})`;
  const base = baseUnits.length === 1 ? historyBaseUnitLabel(baseUnits[0], baseFactor) : 'unités';
  const content =
    stockUnitsPerPackage != null && stockUnit
      ? ` · ${formatHistoryNumber(stockUnitsPerPackage)} ${stockUnit}`
      : '';
  return `${label} de ${formatHistoryNumber(baseFactor)} ${base}${content}`;
}

function historyBaseUnitLabel(value: string, factor: number) {
  const plural = factor > 1;
  const lookup = normalizeLookup(value);
  const labels: Record<string, [string, string]> = {
    kpl: ['pièce', 'pièces'],
    pss: ['sac', 'sacs'],
    pkt: ['paquet', 'paquets'],
    rs: ['barquette', 'barquettes'],
    tlk: ['unité (TLK)', 'unités (TLK)'],
    plo: ['bouteille', 'bouteilles'],
    prk: ['pot', 'pots'],
    kg: ['kg', 'kg'],
    ltk: ['carton', 'cartons'],
    pak: ['pack', 'packs'],
    sk: ['seau', 'seaux'],
    nip: ['lot', 'lots'],
  };
  const pair = labels[lookup];
  return pair ? pair[plural ? 1 : 0] : value || (plural ? 'unités' : 'unité');
}

function stableIntegerRatio(values: Array<number | null>) {
  const stable = stableRatio(values);
  if (stable == null || stable < 1) return null;
  const rounded = Math.round(stable);
  return Math.abs(stable - rounded) <= Math.max(0.02, rounded * 0.01) ? rounded : null;
}

function stableRatio(values: Array<number | null>) {
  const numbers = values
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!numbers.length) return null;
  const median = numbers[Math.floor(numbers.length / 2)];
  const tolerance = Math.max(Math.abs(median) * 0.03, 0.001);
  return numbers.every((value) => Math.abs(value - median) <= tolerance) ? median : null;
}

function uniqueHistory(values: string[]) {
  const result = new Map<string, string>();
  for (const value of values) {
    const cleaned = value.trim();
    if (cleaned) result.set(normalizeLookup(cleaned), cleaned);
  }
  return [...result.values()];
}

function sumHistory(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function roundHistory(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

function formatHistoryNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(roundHistory(value, 3));
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
  if (
    [
      'averagePrice',
      'minimumStock',
      'unitsPerPackage',
      'unitWeightGrams',
      'netWeightGrams',
      'energyKj',
      'energyKcal',
      'fatGrams',
      'saturatedFatGrams',
      'carbohydratesGrams',
      'sugarsGrams',
      'fiberGrams',
      'proteinGrams',
      'saltGrams',
    ].includes(field)
  ) {
    return parseNullableNumber(value);
  }
  if (['allergensPresent', 'possibleTraces', 'dietaryTags'].includes(field))
    return stringArray(value);
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
  return Object.entries(fields).some(
    ([key, value]) =>
      ![
        'unitId',
        'unitLabel',
        'categoryId',
        'categoryName',
        'primarySupplierId',
        'supplierName',
      ].includes(key) && productHasValue(value),
  );
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

function mapProductsBy(
  products: Array<{ id: string; name: string; sku?: string | null; gtin?: string | null }>,
  field: 'sku' | 'gtin' | 'name',
) {
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
    pu: 'piece',
    pi: 'piece',
    un: 'piece',
    col: 'carton',
    colis: 'carton',
    paq: 'carton',
    paquet: 'carton',
    bte: 'carton',
    boite: 'carton',
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
  if (Array.isArray(value))
    return value.map((item) => cleanString(item)).filter(Boolean) as string[];
  const text = cleanString(value);
  if (!text) return [];
  return text
    .split(/[|,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function csvEscape(value: string) {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
