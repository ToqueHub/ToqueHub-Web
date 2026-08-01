import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import {
  DocumentStatus,
  OcrBusinessExtractionStatus,
  OcrExtractionType,
  OcrProcessingStatus,
  Prisma,
  StockReceptionLineMatchingStatus,
  StockReceptionStatus,
  HaccpReceptionControlStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MistralClientService } from '../mistral/mistral-client.service';
import { SaveOcrCorrectionDto } from './dto/stocks-ocr.dto';
import { StocksMarginsService } from './stocks-margins.service';
import { StocksReceptionInventoryService } from './stocks-reception-inventory.service';

const OCR_ROLES = [
  'SUPER_ADMIN',
  'Administrateur',
  'ADMIN',
  'Manager',
  'MANAGER',
  'Chef',
  'Second',
  'Magasinier',
];
const MAX_FILES = Number(process.env.OCR_MAX_FILES ?? 8);
const MAX_FILE_BYTES = Number(process.env.OCR_MAX_FILE_MB ?? 20) * 1024 * 1024;
const OCR_MODEL = process.env.OCR_MISTRAL_MODEL || 'mistral-ocr-latest';
const OCR_AI_MODEL = process.env.OCR_MISTRAL_AI_MODEL || 'mistral-large-latest';
const OCR_PROVIDER = process.env.OCR_PROVIDER || 'mistral';
const OCR_DOCUMENT_ANNOTATION_ENABLED = process.env.OCR_MISTRAL_DOCUMENT_ANNOTATION !== 'false';
const STOCKS_OCR_UPLOAD_ROOT = resolve(
  process.env.STOCKS_OCR_UPLOAD_DIR || process.env.UPLOAD_DIR || 'uploads',
  'stocks-ocr',
);
const PRODUCT_LABEL_OCR_SOURCE = 'product-label-ocr';
const PRODUCT_LABEL_OCR_REVIEWED_SOURCE = 'product-label-ocr-reviewed';
const MAX_PRODUCT_LABEL_FILES = 8;
const ACCEPTED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);
const ACCEPTED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.avif']);
const EXCLUDED_LINE_RE =
  /\b(total|tva|remise|consigne|transport|frais|port|sous-total|net a payer|net à payer|acompte)\b/i;
const LINE_HEADER_RE =
  /\b(d[eé]signation|libell[eé]|article|produit|r[eé]f|reference|quantit[eé]|qt[eé]|prix|montant|total|tva)\b/i;
const SUPPLIER_EXCLUDED_RE =
  /\b(code fournisseur|facture|invoice|bon de livraison|livraison|date|total|tva|client|adresse|siret|siren|iban|bic|tel|t[eé]l|email|mail|page|commande|numero|num[eé]ro|repr[eé]sentant|tourn[eé]e|compte|rue|avenue|av\.|zac|za\s|cs\s|cedex|moneteau|parcay|meslay|jou[eé]-les-tours|issy-les-moulineaux|capital|rcs|ape|maison retraite|ehpad|fay loges|pierre avezard|rocade)\b/i;
const STOCKS_OCR_CATEGORY_HINTS = [
  {
    categoryName: 'Viandes',
    examples: [
      'boeuf',
      'veau',
      'porc',
      'agneau',
      'poulet',
      'dinde',
      'canard',
      'jambon',
      'saucisse',
      'charcuterie',
    ],
  },
  {
    categoryName: 'Poissons',
    examples: [
      'poisson',
      'saumon',
      'thon',
      'cabillaud',
      'colin',
      'merlu',
      'crevette',
      'moule',
      'surimi',
      'marée',
    ],
  },
  {
    categoryName: 'Produits laitiers',
    examples: [
      'lait',
      'beurre',
      'crème',
      'fromage',
      'yaourt',
      'emmental',
      'mozzarella',
      'oeuf',
      'oeufs',
    ],
  },
  {
    categoryName: 'Fruits et légumes',
    examples: [
      'fruit',
      'légume',
      'salade',
      'tomate',
      'carotte',
      'oignon',
      'pomme de terre',
      'courgette',
      'banane',
    ],
  },
  { categoryName: 'Surgelés', examples: ['surgelé', 'congelé', 'glace', 'frozen'] },
  {
    categoryName: 'Boissons',
    examples: ['eau', 'jus', 'soda', 'vin', 'bière', 'café', 'thé', 'boisson'],
  },
  {
    categoryName: 'Épicerie',
    examples: [
      'riz',
      'pâtes',
      'farine',
      'sucre',
      'huile',
      'vinaigre',
      'conserve',
      'sauce',
      'épice',
      'biscuit',
      'dessert',
    ],
  },
  {
    categoryName: 'Boulangerie',
    examples: ['pain', 'baguette', 'brioche', 'croissant', 'viennoiserie', 'pâtisserie'],
  },
  {
    categoryName: 'Hygiène et entretien',
    examples: ['détergent', 'désinfectant', 'savon', 'essuie-main', 'papier toilette', 'nettoyant'],
  },
  {
    categoryName: 'Emballages',
    examples: ['barquette', 'film', 'gant', 'sac', 'gobelet', 'serviette', 'couvercle'],
  },
  {
    categoryName: 'Nutrition médicale',
    examples: [
      'clinutren',
      'thickenup',
      'resource',
      'complément nutritionnel',
      'nutrition',
      'épaississant',
    ],
  },
];

type BusinessDocumentType =
  | 'invoice'
  | 'delivery_note'
  | 'receipt'
  | 'supplier_order'
  | 'order_confirmation'
  | 'unknown';
const BUSINESS_DOCUMENT_TYPES: BusinessDocumentType[] = [
  'invoice',
  'delivery_note',
  'receipt',
  'supplier_order',
  'order_confirmation',
  'unknown',
];

type Actor = { id: string; role: string; permissions?: string[] };
type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type Tx = Prisma.TransactionClient;

interface ExtractedLine {
  ignored?: boolean;
  label: string | null;
  reference: string | null;
  supplierProductCode?: string | null;
  nameOriginal?: string | null;
  nameNormalized?: string | null;
  descriptionOriginal?: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  total: number | null;
  vatRate: number | null;
  lotNumber: string | null;
  bestBeforeDate: string | null;
  originCountry?: string | null;
  statisticalCode?: string | null;
  netWeight?: number | null;
  isFreight?: boolean;
  isStockItem?: boolean;
  packageDescription?: string | null;
  productId?: string | null;
  unitId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  lineStatus?: string | null;
  lineConfidence?: number | null;
  warnings?: string[];
  sourceText?: string | null;
}

type ProductNutritionKey =
  | 'energyKj'
  | 'energyKcal'
  | 'fatGrams'
  | 'saturatedFatGrams'
  | 'carbohydratesGrams'
  | 'sugarsGrams'
  | 'fiberGrams'
  | 'proteinGrams'
  | 'saltGrams';

type ProductLabelAiExtraction = {
  ingredients: string | null;
  nutrition: Record<ProductNutritionKey, number | null>;
  allergensPresent: string[];
  possibleTraces: string[];
  confidence: number | null;
  warnings: string[];
};

const PRODUCT_LABEL_ALLERGENS = [
  'Gluten',
  'Blé',
  'Seigle',
  'Orge',
  'Avoine',
  'Épeautre',
  'Kamut',
  'Lait',
  'Œuf',
  'Poisson',
  'Crustacés',
  'Mollusques',
  'Fruits à coque',
  'Amande',
  'Noisette',
  'Noix',
  'Noix de cajou',
  'Noix de pécan',
  'Noix du Brésil',
  'Pistache',
  'Macadamia',
  'Arachide',
  'Soja',
  'Sésame',
  'Céleri',
  'Moutarde',
  'Lupin',
  'Sulfites',
] as const;

const PRODUCT_LABEL_ALLERGEN_ALIASES: Array<[RegExp, (typeof PRODUCT_LABEL_ALLERGENS)[number][]]> =
  [
    [/\b(gluten|gluteeni|gluteen)\b/i, ['Gluten']],
    [/\b(wheat|ble|vehn[aä]|vete)\b/i, ['Gluten', 'Blé']],
    [/\b(rye|seigle|ruis|rag)\b/i, ['Gluten', 'Seigle']],
    [/\b(barley|orge|ohra|korn)\b/i, ['Gluten', 'Orge']],
    [/\b(oat|oats|avoine|kaura|havre)\b/i, ['Gluten', 'Avoine']],
    [/\b(spelt|epeautre|speltti|dinkel)\b/i, ['Gluten', 'Épeautre']],
    [/\b(kamut)\b/i, ['Gluten', 'Kamut']],
    [/\b(milk|lait|maito|mjolk|dairy)\b/i, ['Lait']],
    [/\b(egg|eggs|oeuf|mun[aä]|agg)\b/i, ['Œuf']],
    [/\b(fish|poisson|kala|fisk)\b/i, ['Poisson']],
    [/\b(crustace|crustacean|rapu|kraftdjur)\b/i, ['Crustacés']],
    [/\b(mollusc|mollusque|nilviainen|blotdjur)\b/i, ['Mollusques']],
    [/\b(tree nuts?|fruits? a coque|p[aä]hkin[aä]t?|notter)\b/i, ['Fruits à coque']],
    [/\b(almond|amande|manteli|mandel)\b/i, ['Fruits à coque', 'Amande']],
    [/\b(hazelnut|noisette|hasselp[aä]hkin[aä]|hasselnot)\b/i, ['Fruits à coque', 'Noisette']],
    [/\b(walnut|noix|saksanp[aä]hkin[aä]|valnot)\b/i, ['Fruits à coque', 'Noix']],
    [/\b(cashew|cajou|cashewp[aä]hkin[aä]|cashewnot)\b/i, ['Fruits à coque', 'Noix de cajou']],
    [/\b(pecan|pecanp[aä]hkin[aä]|pekannot)\b/i, ['Fruits à coque', 'Noix de pécan']],
    [
      /\b(brazil nut|noix du bresil|parap[aä]hkin[aä]|paranot)\b/i,
      ['Fruits à coque', 'Noix du Brésil'],
    ],
    [/\b(pistachio|pistache|pistaasi)\b/i, ['Fruits à coque', 'Pistache']],
    [/\b(macadamia)\b/i, ['Fruits à coque', 'Macadamia']],
    [/\b(peanut|arachide|maap[aä]hkin[aä]|jordnot)\b/i, ['Arachide']],
    [/\b(soy|soya|soybeans?|soja)\b/i, ['Soja']],
    [/\b(sesame|sesam|seesami)\b/i, ['Sésame']],
    [/\b(celery|celeri|selleri)\b/i, ['Céleri']],
    [/\b(mustard|moutarde|sinappi|senap)\b/i, ['Moutarde']],
    [/\b(lupin|lupiini)\b/i, ['Lupin']],
    [/\b(sulphite|sulfite|sulfiitti)\b/i, ['Sulfites']],
  ];

/** Makes invoice OCR output immediately compatible with the stock unit catalogue. */
function normalizeCatalogProduct(input: Record<string, unknown>) {
  const name = String(input.name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const rawUnit = String(input.unit ?? '').trim();
  const unit = catalogStockUnit(rawUnit, name);
  const packageLabel =
    String(input.packageLabel ?? '').trim() || catalogPackageLabel(name, rawUnit);
  const price =
    typeof input.averagePrice === 'number' &&
    Number.isFinite(input.averagePrice) &&
    input.averagePrice >= 0
      ? input.averagePrice
      : null;
  return {
    ...input,
    name,
    unit,
    averagePrice: price,
    packageLabel: packageLabel || null,
  };
}

function catalogStockUnit(value: string, name: string) {
  const raw = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
  if (/\b(kg|kilo|kilogramme)\b/.test(raw)) return 'kg';
  if (/\b(ml|millilitre)\b/.test(raw)) return 'mL';
  if (/\b(l|litre)\b/.test(raw)) return 'L';
  if (/\b(g|gr|gramme)\b/.test(raw)) return 'g';
  if (/\b(barquette|barq)\b/.test(raw)) return 'barquette';
  if (/\b(caisse|case)\b/.test(raw)) return 'caisse';
  if (/\b(bac)\b/.test(raw)) return 'bac';
  if (/\b(col|colis|carton|paq|paquet|bte|boite)\b/.test(raw)) return 'carton';
  if (/\b(pu|pi|piece|un|unite)\b/.test(raw)) return 'pièce';
  const unit = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (/\b(kg|kilo|kilogramme)\b/.test(unit)) return 'kg';
  if (/\b(ml|millilitre)\b/.test(unit)) return 'mL';
  if (/\b(litre|\d+l\b)/.test(unit)) return 'L';
  if (/\b(gr|gramme|g\b)/.test(unit)) return 'g';
  if (/\b(barquette|barq)\b/.test(unit)) return 'barquette';
  if (/\b(caisse|case)\b/.test(unit)) return 'caisse';
  if (/\b(bac)\b/.test(unit)) return 'bac';
  if (/\b(col|colis|carton|paq|paquet|bte|boite)\b/.test(unit)) return 'carton';
  return 'pièce';
}

function catalogPackageLabel(name: string, rawUnit: string) {
  const format = name.match(
    /(?:\d+(?:[,.]\d+)?\s?(?:kg|g|l|ml)\s?[x×]\s?\d+|\d+\s?[x×]\s?\d+(?:[,.]\d+)?\s?(?:kg|g|l|ml))/i,
  )?.[0];
  if (format) return `${rawUnit ? `${rawUnit} — ` : ''}${format}`;
  return rawUnit ? `Unité fournisseur: ${rawUnit}` : '';
}

interface ExtractedLineRow {
  source: string;
  labelSource?: string;
  reference?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  total?: number | null;
  lotNumber?: string | null;
  bestBeforeDate?: string | null;
}

interface BusinessExtraction {
  documentType: BusinessDocumentType;
  supplier: {
    name: string | null;
    vatNumber?: string | null;
    address?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    matchingStatus?: StockReceptionLineMatchingStatus;
    matchingScore?: number;
    candidates?: Array<{ id: string; name: string; score: number }>;
    identifiers?: Array<{ kind: string; value: string }>;
  };
  supplierId?: string | null;
  supplierName?: string | null;
  supplierMatchingStatus?: StockReceptionLineMatchingStatus;
  supplierMatchingScore?: number;
  supplierCandidates?: Array<{ id: string; name: string; score: number }>;
  supplierIdentifiers?: Array<{ kind: string; value: string }>;
  document: {
    invoiceNumber: string | null;
    deliveryNoteNumber: string | null;
    purchaseOrderNumber: string | null;
    receiptNumber: string | null;
    documentDate: string | null;
    deliveryDate: string | null;
  };
  customer?: {
    name: string | null;
    customerNumber?: string | null;
    vatNumber?: string | null;
    deliveryAddress?: string | null;
  };
  invoice?: {
    invoiceNumber: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    paymentMethod: string | null;
    orderNumber: string | null;
    currency: 'EUR';
    netTotal: number | null;
    vatTotal: number | null;
    rounding: number | null;
    grandTotal: number | null;
    iban?: string | null;
    bic?: string | null;
    deliveryTerms?: string | null;
    deliveryMethod?: string | null;
    lateInterestRate?: number | null;
    requesterName?: string | null;
  };
  order?: {
    orderNumber: string | null;
    orderDate: string | null;
    selectedDeliveryDate: string | null;
    deliveryAddress?: string | null;
    company?: string | null;
    customerNumber?: string | null;
    orderer?: string | null;
  };
  totals: {
    totalExcludingTax: number | null;
    totalTax: number | null;
    totalIncludingTax: number | null;
    rounding?: number | null;
  };
  lines: ExtractedLine[];
  items?: ExtractedLine[];
  confidence?: {
    documentType: number;
    header: number;
    items: number;
    totals: number;
  };
  aiAnalysis?: {
    provider: string;
    model: string;
    status: 'applied' | 'fallback' | 'failed';
    confidence?: number | null;
    warnings: string[];
    suggestedActions: string[];
    totalsCheck?: {
      computedTotal?: number | null;
      documentTotal?: number | null;
      delta?: number | null;
      status?: string | null;
    };
  };
  warnings?: string[];
  suggestedActions?: string[];
  documentConfidence?: number | null;
}

@Injectable()
export class StocksOcrService {
  private readonly logger = new Logger(StocksOcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marginsService: StocksMarginsService,
    private readonly mistralClient: MistralClientService,
    private readonly receptionInventory: StocksReceptionInventoryService,
  ) {}

  private assertOcr(actor: Actor) {
    if (!OCR_ROLES.includes(actor.role) && !actor.permissions?.includes('purchasing.receive')) {
      throw new ForbiddenException('Droits OCR Stocks ou réception Achats insuffisants');
    }
  }

  private async assertOcrConfigured(organizationId: string) {
    if (OCR_PROVIDER !== 'mistral') throw new BadRequestException('Provider OCR non configuré');
    const apiKey = await this.resolveMistralApiKey(organizationId);
    if (!apiKey) throw new BadRequestException('Configuration OCR absente');
  }

  async getOcrConfig(organizationId: string, actor: Actor) {
    this.assertOcr(actor);
    const apiKey = await this.resolveMistralApiKey(organizationId);
    return {
      provider: OCR_PROVIDER,
      model: OCR_MODEL,
      configured: Boolean(apiKey),
      source:
        apiKey && (process.env.MISTRAL_API_KEY || process.env.OCR_MISTRAL_API_KEY) === apiKey
          ? 'environment'
          : apiKey
            ? 'organization'
            : null,
    };
  }

  async analyzeProductLabel(
    organizationId: string,
    actor: Actor,
    productId: string,
    file: UploadedFile,
  ) {
    this.assertOcr(actor);
    await this.assertOcrConfigured(organizationId);
    if (!file) throw new BadRequestException('Ajoutez une photo lisible de l’étiquette produit.');
    this.validateFile(file);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId, isArchived: false },
      select: { id: true, name: true },
    });
    if (!product) throw new NotFoundException('Produit introuvable');

    const result = await this.mistralClient.ocrMarkdown(organizationId, {
      buffer: file.buffer,
      mimeType: this.mimeForDocument(file.mimetype, file.originalname),
      model: OCR_MODEL,
      withAnnotation: false,
    });
    const markdown = result.markdown?.trim();
    if (!markdown) {
      throw new BadRequestException(
        'Aucun texte lisible n’a été trouvé. Reprenez la photo de face, avec un bon éclairage.',
      );
    }

    const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
    const nutritionProperties = {
      energyKj: nullableNumber,
      energyKcal: nullableNumber,
      fatGrams: nullableNumber,
      saturatedFatGrams: nullableNumber,
      carbohydratesGrams: nullableNumber,
      sugarsGrams: nullableNumber,
      fiberGrams: nullableNumber,
      proteinGrams: nullableNumber,
      saltGrams: nullableNumber,
    };
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: [
        'ingredients',
        'nutrition',
        'allergensPresent',
        'possibleTraces',
        'confidence',
        'warnings',
      ],
      properties: {
        ingredients: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        nutrition: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(nutritionProperties),
          properties: nutritionProperties,
        },
        allergensPresent: { type: 'array', items: { type: 'string' } },
        possibleTraces: { type: 'array', items: { type: 'string' } },
        confidence: nullableNumber,
        warnings: { type: 'array', items: { type: 'string' } },
      },
    } as Record<string, unknown>;

    let extraction: ProductLabelAiExtraction;
    try {
      extraction = await this.mistralClient.chatJson<ProductLabelAiExtraction>(
        organizationId,
        [
          {
            role: 'system',
            content: [
              'Tu extrais la liste complète des ingrédients, les valeurs nutritionnelles POUR 100 g et les allergènes d’une étiquette alimentaire.',
              'Pour ingredients, retranscris fidèlement la liste telle qu’elle apparaît, sans la traduire, sans résumer et sans ajouter les titres voisins (importateur, origine, conservation ou nutrition).',
              'N’invente jamais de valeur. Si une donnée pour 100 g est absente ou ambiguë, retourne null.',
              'Sépare strictement les allergènes certains (Contains, Contient, Sisältää, Innehåller) des traces possibles (May contain, Peut contenir, Saattaa sisältää, Kan innehålla).',
              'Ne classe jamais une mention de traces parmi les allergènes présents.',
              `Pour les allergènes, utilise uniquement ces libellés français : ${PRODUCT_LABEL_ALLERGENS.join(', ')}.`,
              'Pour une céréale nommée, retourne aussi Gluten. Pour un fruit à coque nommé, retourne aussi Fruits à coque.',
              'Les quantités nutritionnelles sont des nombres sans unité : kJ, kcal et grammes.',
              'Place dans warnings les informations visibles mais non prises en charge ou toute ambiguïté utile à la vérification humaine.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `Produit : ${product.name}\n\nTexte OCR de l’étiquette :\n${markdown.slice(0, 80_000)}`,
          },
        ],
        'toquehub_product_label',
        schema,
        { temperature: 0, fallbackToJsonObject: true, timeoutMs: 12_000 },
      );
    } catch (error) {
      this.logger.warn(
        `Structuration IA de l’étiquette indisponible product=${product.id}: ${error instanceof Error ? error.message : error}`,
      );
      extraction = this.extractProductLabelFromOcrText(markdown);
    }

    const warnings = (extraction.warnings ?? [])
      .map((warning) => String(warning).trim())
      .filter(Boolean)
      .slice(0, 12);
    const ingredients =
      String(extraction.ingredients ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20_000) || null;
    const nutrition = this.normalizeProductLabelNutrition(extraction.nutrition, warnings);
    const allergensPresent = this.normalizeProductLabelAllergens(extraction.allergensPresent);
    const presentSet = new Set(allergensPresent);
    const possibleTraces = this.normalizeProductLabelAllergens(extraction.possibleTraces).filter(
      (allergen) => !presentSet.has(allergen),
    );
    const detectedCount =
      (ingredients ? 1 : 0) +
      Object.values(nutrition).filter((value) => value !== null).length +
      allergensPresent.length +
      possibleTraces.length;
    if (!detectedCount) {
      warnings.push(
        'Aucune valeur nutritionnelle ni aucun allergène fiable n’a été détecté sur cette photo.',
      );
    }

    this.logger.log(
      `OCR étiquette produit terminé product=${product.id} org=${organizationId} user=${actor.id} pages=${result.pageCount ?? 0} champs=${detectedCount}`,
    );
    return {
      productId: product.id,
      filename: file.originalname,
      mimeType: file.mimetype,
      pageCount: result.pageCount,
      ingredients,
      nutrition,
      allergensPresent,
      possibleTraces,
      confidence:
        typeof extraction.confidence === 'number' && Number.isFinite(extraction.confidence)
          ? Math.max(0, Math.min(1, extraction.confidence))
          : null,
      warnings: [...new Set(warnings)],
    };
  }

  async uploadProductLabelImports(
    organizationId: string,
    actor: Actor,
    productId: string,
    files: UploadedFile[],
  ) {
    this.assertOcr(actor);
    await this.assertOcrConfigured(organizationId);
    if (!files?.length) throw new BadRequestException('Ajoutez au moins une photo de l’étiquette.');
    if (files.length > MAX_PRODUCT_LABEL_FILES) {
      throw new BadRequestException(
        `Vous pouvez ajouter ${MAX_PRODUCT_LABEL_FILES} captures maximum par analyse.`,
      );
    }
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId, isArchived: false },
      select: { id: true, name: true },
    });
    if (!product) throw new NotFoundException('Produit introuvable');

    const batchId = randomUUID();
    const sourceType = `${PRODUCT_LABEL_OCR_SOURCE}:${batchId}`;
    await mkdir(join(STOCKS_OCR_UPLOAD_ROOT, organizationId), { recursive: true });
    const documents: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      status: DocumentStatus;
    }> = [];
    for (const file of files) {
      this.validateFile(file);
      const fileId = randomUUID();
      const extension = this.safeExtension(file);
      const internalFilename = `${fileId}${extension}`;
      const storagePath = join(organizationId, internalFilename);
      await writeFile(join(STOCKS_OCR_UPLOAD_ROOT, storagePath), file.buffer);
      const document = await this.prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            organizationId,
            uploadedById: actor.id,
            internalFilename,
            originalName: file.originalname,
            mimeType: file.mimetype || 'application/octet-stream',
            sizeBytes: file.size ?? file.buffer.length,
            storagePath,
            contentSha256: createHash('sha256').update(file.buffer).digest('hex'),
            sourceModule: 'stocks',
            sourceType,
            sourceId: product.id,
            status: DocumentStatus.UPLOADED,
          },
        });
        await tx.ocrDocument.create({
          data: {
            organizationId,
            documentId: created.id,
            provider: OCR_PROVIDER,
            model: OCR_MODEL,
            status: OcrProcessingStatus.PENDING,
          },
        });
        return created;
      });
      documents.push(document);
    }

    setImmediate(() => {
      void this.processProductLabelBatch(
        organizationId,
        actor,
        product.id,
        documents.map((document) => document.id),
      );
    });
    return {
      batchId,
      product,
      documents: documents.map((document) => ({
        id: document.id,
        originalName: document.originalName,
        mimeType: document.mimeType,
        status: document.status,
      })),
    };
  }

  async listProductLabelImportStatuses(organizationId: string, actor: Actor) {
    this.assertOcr(actor);
    const documents = await this.prisma.document.findMany({
      where: {
        organizationId,
        sourceModule: 'stocks',
        sourceType: { startsWith: `${PRODUCT_LABEL_OCR_SOURCE}:` },
      },
      include: {
        ocrDocuments: {
          include: { extractions: { orderBy: { updatedAt: 'desc' }, take: 1 } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });
    const productIds = [
      ...new Set(documents.map((document) => document.sourceId).filter(Boolean)),
    ] as string[];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { organizationId, id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productById = new Map(products.map((product) => [product.id, product]));
    const grouped = new Map<string, typeof documents>();
    for (const document of documents) {
      const key = document.sourceType ?? '';
      grouped.set(key, [...(grouped.get(key) ?? []), document]);
    }

    return {
      statuses: [...grouped.entries()].slice(0, 20).map(([sourceType, batchDocuments]) => {
        const batchId = sourceType.slice(`${PRODUCT_LABEL_OCR_SOURCE}:`.length);
        const product = productById.get(batchDocuments[0]?.sourceId ?? '') ?? {
          id: batchDocuments[0]?.sourceId ?? '',
          name: 'Produit archivé',
        };
        const documentStatuses = batchDocuments.map((document) => {
          const ocr = document.ocrDocuments[0] ?? null;
          const extraction = ocr?.extractions[0] ?? null;
          const failed =
            document.status === DocumentStatus.FAILED || ocr?.status === OcrProcessingStatus.FAILED;
          const ready = Boolean(extraction) && document.status === DocumentStatus.PROCESSED;
          const processing =
            document.status === DocumentStatus.PROCESSING ||
            ocr?.status === OcrProcessingStatus.PROCESSING;
          return {
            document: {
              id: document.id,
              originalName: document.originalName,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              status: document.status,
              createdAt: document.createdAt,
              updatedAt: document.updatedAt,
            },
            state: failed ? 'erreur' : ready ? 'vérifier' : processing ? 'analyse' : 'en attente',
            progress: failed || ready ? 100 : processing ? 55 : 12,
            result: ready ? extraction?.extractedJson : null,
            errorMessage: failed ? ocr?.errorMessage || 'Analyse OCR impossible.' : null,
          };
        });
        const ready = documentStatuses.some((status) => status.state === 'vérifier');
        const working = documentStatuses.some(
          (status) => status.state === 'analyse' || status.state === 'en attente',
        );
        const errors = documentStatuses.filter((status) => status.state === 'erreur').length;
        return {
          batchId,
          product,
          state:
            ready && !working ? 'vérifier' : working ? 'analyse' : errors ? 'erreur' : 'en attente',
          progress: working
            ? Math.round(
                documentStatuses.reduce((sum, status) => sum + status.progress, 0) /
                  Math.max(documentStatuses.length, 1),
              )
            : 100,
          documents: documentStatuses,
          results: documentStatuses
            .map((status) => status.result)
            .filter((result): result is NonNullable<typeof result> => Boolean(result)),
          errors,
        };
      }),
    };
  }

  async reviewProductLabelImport(
    organizationId: string,
    actor: Actor,
    productId: string,
    batchId: string,
  ) {
    this.assertOcr(actor);
    const sourceType = `${PRODUCT_LABEL_OCR_SOURCE}:${batchId}`;
    const documents = await this.prisma.document.findMany({
      where: { organizationId, sourceModule: 'stocks', sourceType, sourceId: productId },
      include: { ocrDocuments: { select: { id: true } } },
    });
    if (!documents.length) throw new NotFoundException('Analyse OCR produit introuvable.');
    const ocrDocumentIds = documents.flatMap((document) =>
      document.ocrDocuments.map((ocr) => ocr.id),
    );
    await this.prisma.$transaction([
      this.prisma.document.updateMany({
        where: { id: { in: documents.map((document) => document.id) } },
        data: { sourceType: `${PRODUCT_LABEL_OCR_REVIEWED_SOURCE}:${batchId}` },
      }),
      this.prisma.ocrBusinessExtraction.updateMany({
        where: { ocrDocumentId: { in: ocrDocumentIds } },
        data: { status: OcrBusinessExtractionStatus.REVIEWED },
      }),
    ]);
    return { reviewed: true };
  }

  private async processProductLabelBatch(
    organizationId: string,
    actor: Actor,
    productId: string,
    documentIds: string[],
  ) {
    for (const documentId of documentIds) {
      await this.processProductLabelImport(organizationId, actor, productId, documentId).catch(
        (error) => {
          this.logger.warn(
            `Analyse OCR produit échouée document=${documentId}: ${error instanceof Error ? error.message : error}`,
          );
        },
      );
    }
  }

  private async processProductLabelImport(
    organizationId: string,
    actor: Actor,
    productId: string,
    documentId: string,
  ) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        sourceModule: 'stocks',
        sourceType: { startsWith: `${PRODUCT_LABEL_OCR_SOURCE}:` },
        sourceId: productId,
      },
      include: { ocrDocuments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!document) throw new NotFoundException('Capture OCR produit introuvable.');
    const ocr =
      document.ocrDocuments[0] ??
      (await this.prisma.ocrDocument.create({
        data: {
          organizationId,
          documentId,
          provider: OCR_PROVIDER,
          model: OCR_MODEL,
          status: OcrProcessingStatus.PENDING,
        },
      }));
    const started = Date.now();
    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.PROCESSING },
      }),
      this.prisma.ocrDocument.update({
        where: { id: ocr.id },
        data: {
          status: OcrProcessingStatus.PROCESSING,
          errorCode: null,
          errorMessage: null,
        },
      }),
    ]);
    try {
      const buffer = await readFile(join(STOCKS_OCR_UPLOAD_ROOT, document.storagePath));
      const result = await this.analyzeProductLabel(organizationId, actor, productId, {
        originalname: document.originalName,
        mimetype: document.mimeType,
        size: document.sizeBytes,
        buffer,
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.ocrDocument.update({
          where: { id: ocr.id },
          data: {
            status: OcrProcessingStatus.COMPLETED,
            rawJson: result as unknown as Prisma.InputJsonValue,
            pageCount: result.pageCount,
            processingDurationMs: Date.now() - started,
          },
        });
        await tx.ocrBusinessExtraction.deleteMany({ where: { ocrDocumentId: ocr.id } });
        await tx.ocrBusinessExtraction.create({
          data: {
            organizationId,
            ocrDocumentId: ocr.id,
            type: OcrExtractionType.UNKNOWN,
            status: OcrBusinessExtractionStatus.DRAFT,
            extractedJson: result as unknown as Prisma.InputJsonValue,
            confidenceScore: this.decimalOrNull(result.confidence),
          },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { status: DocumentStatus.PROCESSED },
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analyse OCR produit impossible.';
      await this.prisma
        .$transaction([
          this.prisma.document.update({
            where: { id: document.id },
            data: { status: DocumentStatus.FAILED },
          }),
          this.prisma.ocrDocument.update({
            where: { id: ocr.id },
            data: {
              status: OcrProcessingStatus.FAILED,
              errorCode: 'PRODUCT_LABEL_OCR_FAILED',
              errorMessage: message,
              processingDurationMs: Date.now() - started,
            },
          }),
        ])
        .catch(() => undefined);
      throw error;
    }
  }

  async uploadDocuments(organizationId: string, actor: Actor, files: UploadedFile[]) {
    return this.uploadDocumentsForSource(organizationId, actor, files, 'ocr-reception');
  }

  async uploadPurchasingDocuments(organizationId: string, actor: Actor, files: UploadedFile[]) {
    return this.uploadDocumentsForSource(organizationId, actor, files, 'purchasing-delivery-note');
  }

  async uploadCatalogDocuments(organizationId: string, actor: Actor, files: UploadedFile[]) {
    const uploaded = await this.uploadDocumentsForSource(
      organizationId,
      actor,
      files,
      'product-csv-creator',
    );
    const items: Array<Record<string, unknown>> = [];
    const documents = [];
    for (const document of uploaded.documents) {
      const result = await this.processCatalogOcr(organizationId, actor, document.id);
      documents.push(result.document);
      items.push(...result.items);
    }
    return { documents, items };
  }

  private async uploadDocumentsForSource(
    organizationId: string,
    actor: Actor,
    files: UploadedFile[],
    sourceType: 'ocr-reception' | 'product-csv-creator' | 'purchasing-delivery-note',
  ) {
    this.assertOcr(actor);
    if (!files?.length) throw new BadRequestException('Aucun fichier fourni');
    if (files.length > MAX_FILES)
      throw new BadRequestException(`Vous pouvez importer ${MAX_FILES} fichiers maximum.`);
    const documents = [];
    for (const file of files) {
      this.validateFile(file);
      const id = randomUUID();
      const ext = this.safeExtension(file);
      const relativePath = join(organizationId, `${id}${ext}`);
      const absolutePath = join(STOCKS_OCR_UPLOAD_ROOT, relativePath);
      await mkdir(join(STOCKS_OCR_UPLOAD_ROOT, organizationId), { recursive: true });
      await writeFile(absolutePath, file.buffer);
      const document = await this.prisma.document.create({
        data: {
          organizationId,
          uploadedById: actor.id,
          internalFilename: `${id}${ext}`,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storagePath: relativePath,
          contentSha256: createHash('sha256').update(file.buffer).digest('hex'),
          sourceModule: sourceType === 'purchasing-delivery-note' ? 'purchasing' : 'stocks',
          sourceType,
          status: DocumentStatus.UPLOADED,
        },
      });
      documents.push(document);
    }
    return { documents };
  }

  private async processCatalogOcr(organizationId: string, actor: Actor, documentId: string) {
    await this.assertOcrConfigured(organizationId);
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        sourceModule: 'stocks',
        sourceType: 'product-csv-creator',
      },
    });
    if (!document) throw new NotFoundException('Document catalogue introuvable');
    const started = Date.now();
    const ocr = await this.prisma.ocrDocument.upsert({
      where: { documentId },
      update: { status: OcrProcessingStatus.PROCESSING, errorCode: null, errorMessage: null },
      create: {
        organizationId,
        documentId,
        provider: OCR_PROVIDER,
        model: OCR_MODEL,
        status: OcrProcessingStatus.PROCESSING,
      },
    });
    await this.prisma.document.update({
      where: { id: document.id },
      data: { status: DocumentStatus.PROCESSING },
    });
    try {
      const result = await this.callMistral(organizationId, document);
      const rawText = this.rawTextFromOcr(result.rawJson);
      const updatedOcr = await this.prisma.ocrDocument.update({
        where: { id: ocr.id },
        data: {
          status: OcrProcessingStatus.COMPLETED,
          rawText,
          rawMarkdown: result.markdown,
          rawJson: result.rawJson as Prisma.InputJsonValue,
          pageCount: result.pageCount,
          processingDurationMs: result.durationMs,
        },
      });
      const items = await this.extractCatalogProducts(organizationId, result.markdown || rawText);
      const extraction = await this.prisma.ocrBusinessExtraction.create({
        data: {
          organizationId,
          ocrDocumentId: updatedOcr.id,
          type: OcrExtractionType.UNKNOWN,
          extractedJson: { documentType: 'product_catalog', items } as Prisma.InputJsonValue,
          confidenceScore: new Prisma.Decimal(items.length ? 0.8 : 0.2),
        },
      });
      const updatedDocument = await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.PROCESSED, sourceId: extraction.id },
      });
      this.logger.log(
        `OCR catalogue terminé document=${document.id} org=${organizationId} user=${actor.id} lignes=${items.length} durée=${Date.now() - started}ms`,
      );
      return { document: updatedDocument, items };
    } catch (error: any) {
      const message = error?.message || 'Erreur OCR catalogue';
      await this.prisma.ocrDocument
        .update({
          where: { id: ocr.id },
          data: {
            status: OcrProcessingStatus.FAILED,
            errorCode: error?.code || 'OCR_CATALOG_FAILED',
            errorMessage: message,
            processingDurationMs: Date.now() - started,
          },
        })
        .catch(() => undefined);
      await this.prisma.document
        .update({ where: { id: document.id }, data: { status: DocumentStatus.FAILED } })
        .catch(() => undefined);
      throw error;
    }
  }

  private async extractCatalogProducts(
    organizationId: string,
    markdown: string,
  ): Promise<Array<Record<string, unknown>>> {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'name',
              'unit',
              'sku',
              'gtin',
              'supplier',
              'category',
              'averagePrice',
              'packageLabel',
            ],
            properties: {
              name: { type: ['string', 'null'] },
              unit: { type: ['string', 'null'] },
              sku: { type: ['string', 'null'] },
              gtin: { type: ['string', 'null'] },
              supplier: { type: ['string', 'null'] },
              category: { type: ['string', 'null'] },
              averagePrice: { type: ['number', 'null'] },
              packageLabel: { type: ['string', 'null'] },
            },
          },
        },
      },
    } as Record<string, unknown>;
    try {
      const response = await this.mistralClient.chatJson<{ items: Array<Record<string, unknown>> }>(
        organizationId,
        [
          {
            role: 'system',
            content:
              'Extrais les produits de catalogues, fiches produit, factures et bons de livraison fournisseur. Retourne une ligne par produit, jamais les totaux, frais, remises ou consignes. Ne jamais inventer une valeur. Pour l’unité de stock et le prix HT, utilise l’unité FACTURÉE : si la facture livre 1 COL mais facture 36 PU à 0,213, retourne unité « pièce », prix 0,213 et conditionnement « Colis de 36 ». Utilise seulement kg, g, L, mL, pièce, carton, barquette, caisse ou bac. Les codes COL/PAQ/BTE correspondent à « carton » seulement si le prix est aussi celui du colis/paquet ; PU/PI/UN correspondent à « pièce ». Conserve tous les formats vus (ex. 120 mL x 36) dans conditionnement. Le prix doit être le prix d’une seule unité de stock sélectionnée ; laisse-le vide si ce calcul est impossible.',
          },
          { role: 'user', content: markdown.slice(0, 120000) },
        ],
        'toquehub_product_catalog',
        schema,
      );
      return (response.items ?? [])
        .map(normalizeCatalogProduct)
        .filter((item) => String(item.name ?? '').trim());
    } catch (error) {
      this.logger.warn(
        `Analyse IA catalogue indisponible, repli OCR: ${error instanceof Error ? error.message : error}`,
      );
      const fallback = await this.extractBusinessData(organizationId, markdown);
      return fallback.lines
        .filter((line) => !line.ignored && line.label)
        .map((line) =>
          normalizeCatalogProduct({
            name: line.nameOriginal || line.label,
            unit: line.unit,
            sku: line.reference,
            gtin: null,
            supplier: fallback.supplierName || fallback.supplier?.name || null,
            category: line.categoryName || null,
            averagePrice: line.unitPrice,
            packageLabel: line.packageDescription || null,
          }),
        );
    }
  }

  async getDocumentForDownload(organizationId: string, actor: Actor, documentId: string) {
    this.assertOcr(actor);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!document) throw new NotFoundException('Document introuvable');
    return { document, absolutePath: join(STOCKS_OCR_UPLOAD_ROOT, document.storagePath) };
  }

  async analyzeDocument(organizationId: string, actor: Actor, documentId: string) {
    this.assertOcr(actor);
    await this.assertOcrConfigured(organizationId);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!document) throw new NotFoundException('Document introuvable');
    const ocr = await this.prisma.ocrDocument.upsert({
      where: { documentId },
      update: { status: OcrProcessingStatus.PENDING, errorCode: null, errorMessage: null },
      create: {
        organizationId,
        documentId,
        provider: OCR_PROVIDER,
        model: OCR_MODEL,
        status: OcrProcessingStatus.PENDING,
      },
    });
    void this.processOcr(organizationId, actor, document.id, ocr.id);
    return { documentId: document.id, ocrDocumentId: ocr.id, status: OcrProcessingStatus.PENDING };
  }

  async analyzeBatch(organizationId: string, actor: Actor, documentIds: string[]) {
    if (!documentIds?.length) throw new BadRequestException('Aucun document fourni');
    if (documentIds.length > MAX_FILES)
      throw new BadRequestException(`Vous pouvez analyser ${MAX_FILES} fichiers maximum.`);
    const jobs = [];
    for (const documentId of documentIds)
      jobs.push(await this.analyzeDocument(organizationId, actor, documentId));
    return { jobs };
  }

  async getStatus(organizationId: string, actor: Actor, documentId: string) {
    this.assertOcr(actor);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      include: {
        ocrDocuments: { include: { extractions: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!document) throw new NotFoundException('Document introuvable');
    const ocr = document.ocrDocuments[0] ?? null;
    return {
      document,
      ocr,
      extraction: ocr?.extractions[0] ?? null,
      state: this.uiState(document.status, ocr?.status, ocr?.extractions[0]?.id),
    };
  }

  async listStatuses(organizationId: string, actor: Actor) {
    this.assertOcr(actor);
    const documents = await this.prisma.document.findMany({
      where: {
        organizationId,
        sourceModule: 'stocks',
        sourceType: 'ocr-reception',
        OR: [
          {
            status: {
              in: [DocumentStatus.UPLOADED, DocumentStatus.PROCESSING, DocumentStatus.FAILED],
            },
          },
          {
            ocrDocuments: {
              some: {
                status: {
                  in: [
                    OcrProcessingStatus.PENDING,
                    OcrProcessingStatus.PROCESSING,
                    OcrProcessingStatus.FAILED,
                  ],
                },
              },
            },
          },
          {
            ocrDocuments: {
              some: {
                extractions: {
                  some: {
                    status: {
                      in: [
                        OcrBusinessExtractionStatus.DRAFT,
                        OcrBusinessExtractionStatus.REVIEWED,
                        OcrBusinessExtractionStatus.REJECTED,
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
      },
      include: {
        ocrDocuments: { include: { extractions: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    });

    return {
      statuses: documents.map((document) => {
        const ocr = document.ocrDocuments[0] ?? null;
        const extraction = ocr?.extractions[0] ?? null;
        return {
          document,
          ocr,
          extraction,
          state: this.uiState(document.status, ocr?.status, extraction?.id),
        };
      }),
    };
  }

  async getExtraction(organizationId: string, actor: Actor, extractionId: string) {
    this.assertOcr(actor);
    const extraction = await this.prisma.ocrBusinessExtraction.findFirst({
      where: { id: extractionId, organizationId },
      include: { ocrDocument: { include: { document: true } } },
    });
    if (!extraction) throw new NotFoundException('Extraction introuvable');
    return this.formatExtraction(extraction);
  }

  async reanalyzeExtractionWithAi(organizationId: string, actor: Actor, extractionId: string) {
    this.assertOcr(actor);
    await this.assertOcrConfigured(organizationId);
    const extraction = await this.prisma.ocrBusinessExtraction.findFirst({
      where: { id: extractionId, organizationId },
      include: { ocrDocument: { include: { document: true } } },
    });
    if (!extraction) throw new NotFoundException('Extraction introuvable');
    const markdown = extraction.ocrDocument.rawMarkdown || extraction.ocrDocument.rawText || '';
    if (!markdown.trim())
      throw new BadRequestException('Aucun texte OCR disponible pour relancer l’analyse IA.');
    const extracted = await this.extractBusinessData(
      organizationId,
      markdown,
      extraction.ocrDocument.rawJson,
    );
    const updated = await this.prisma.ocrBusinessExtraction.update({
      where: { id: extraction.id },
      data: {
        extractedJson: extracted as unknown as Prisma.InputJsonValue,
        correctedJson: Prisma.JsonNull,
        status: OcrBusinessExtractionStatus.DRAFT,
        confidenceScore: this.decimalOrNull(this.confidenceForExtraction(extracted)),
      },
      include: { ocrDocument: { include: { document: true } } },
    });
    return this.formatExtraction(updated);
  }

  async saveCorrections(
    organizationId: string,
    actor: Actor,
    extractionId: string,
    dto: SaveOcrCorrectionDto,
  ) {
    this.assertOcr(actor);
    const extraction = await this.prisma.ocrBusinessExtraction.findFirst({
      where: { id: extractionId, organizationId },
    });
    if (!extraction) throw new NotFoundException('Extraction introuvable');
    const corrected = this.normalizeCorrectionPayload(dto);
    const updated = await this.prisma.ocrBusinessExtraction.update({
      where: { id: extraction.id },
      data: {
        correctedJson: corrected as Prisma.InputJsonValue,
        status: OcrBusinessExtractionStatus.REVIEWED,
      },
      include: { ocrDocument: { include: { document: true } } },
    });
    return this.formatExtraction(updated);
  }

  async createReceptionFromExtraction(
    organizationId: string,
    actor: Actor,
    extractionId: string,
    dto: SaveOcrCorrectionDto,
  ) {
    this.assertOcr(actor);
    const extraction = await this.prisma.ocrBusinessExtraction.findFirst({
      where: { id: extractionId, organizationId },
      include: { ocrDocument: { include: { document: true } } },
    });
    if (!extraction) throw new NotFoundException('Extraction introuvable');
    const alreadyValidated = await this.prisma.stockReception.findFirst({
      where: { organizationId, extractionId },
    });
    if (alreadyValidated)
      throw new BadRequestException('Cette extraction OCR a déjà été validée en réception.');
    if (dto.supplierId) await this.ensureSupplier(organizationId, dto.supplierId);
    if (dto.siteId) await this.ensureSite(organizationId, dto.siteId);
    if (dto.locationId) await this.ensureLocation(organizationId, dto.locationId);
    const corrected = this.normalizeCorrectionPayload(dto);
    const lines = corrected.lines.filter((line) => !line.ignored);
    if (!lines.length) throw new BadRequestException('Aucune ligne à réceptionner');
    for (const line of lines) {
      if (!line.productId && !line.createProduct)
        throw new BadRequestException(
          'Chaque ligne validée doit être associée à un produit ou marquée à créer.',
        );
      if (line.quantity == null || line.quantity <= 0)
        throw new BadRequestException(
          'Chaque ligne validée doit avoir une quantité strictement positive.',
        );
      if (!line.unitId && !line.unit)
        throw new BadRequestException('Chaque ligne validée doit avoir une unité.');
    }
    const acceptedTotal = lines.reduce(
      (sum, line) => sum + Number(line.acceptedQuantity ?? line.quantity ?? 0),
      0,
    );
    const reception = await this.prisma.$transaction(async (tx) => {
      const duplicateReception = await tx.stockReception.findFirst({
        where: { organizationId, extractionId },
      });
      if (duplicateReception)
        throw new BadRequestException('Cette extraction OCR a déjà été validée en réception.');
      const created = await tx.stockReception.create({
        data: {
          organizationId,
          supplierId: corrected.supplierId,
          supplierName: corrected.supplierName,
          documentId: extraction.ocrDocument.documentId,
          extractionId: extraction.id,
          invoiceNumber: corrected.invoiceNumber,
          deliveryNoteNumber: corrected.deliveryNoteNumber,
          purchaseOrderNumber: corrected.purchaseOrderNumber,
          receiptNumber: corrected.receiptNumber,
          documentDate: corrected.documentDate ? new Date(corrected.documentDate) : null,
          deliveryDate: corrected.deliveryDate ? new Date(corrected.deliveryDate) : null,
          totalExcludingTax: this.decimalOrNull(corrected.totalExcludingTax),
          totalTax: this.decimalOrNull(corrected.totalTax),
          totalIncludingTax: this.decimalOrNull(corrected.totalIncludingTax),
          status:
            acceptedTotal > 0 ? StockReceptionStatus.VALIDATED : StockReceptionStatus.CANCELLED,
          createdById: actor.id,
          siteId: corrected.siteId,
          locationId: corrected.locationId,
          validatedAt: new Date(),
          deliveryTemperature: corrected.deliveryTemperature ?? null,
          controlStatus: this.controlStatus(corrected),
          controlNotes: corrected.controlNotes ?? null,
        },
      });
      await this.rememberSupplierIdentifiersTx(
        tx,
        organizationId,
        corrected.supplierId,
        corrected.supplierIdentifiers,
      );
      for (const line of lines) {
        const product = line.productId
          ? await tx.product.findFirst({
              where: { id: line.productId, organizationId, isArchived: false },
              include: { unit: true },
            })
          : await this.createProductForReceptionLineTx(
              tx,
              organizationId,
              corrected.supplierId,
              line,
            );
        if (!product)
          throw new BadRequestException('Produit introuvable sur une ligne de réception.');
        const unit = line.unitId
          ? await tx.unit.findFirst({ where: { id: line.unitId, organizationId } })
          : product.unit;
        if (!unit) throw new BadRequestException('Unité introuvable sur une ligne de réception.');
        const lot =
          line.lotNumber || line.bestBeforeDate
            ? await tx.lot.upsert({
                where: {
                  organizationId_lotNumber_productId: {
                    organizationId,
                    lotNumber: line.lotNumber || `OCR-${created.id}-${product.id}`,
                    productId: product.id,
                  },
                },
                update: {
                  supplierId: corrected.supplierId,
                  expiresAt: line.bestBeforeDate ? new Date(line.bestBeforeDate) : undefined,
                  siteId: corrected.siteId,
                  locationId: corrected.locationId,
                },
                create: {
                  organizationId,
                  productId: product.id,
                  supplierId: corrected.supplierId,
                  lotNumber: line.lotNumber || `OCR-${created.id}-${product.id}`,
                  expiresAt: line.bestBeforeDate ? new Date(line.bestBeforeDate) : undefined,
                  siteId: corrected.siteId,
                  locationId: corrected.locationId,
                },
              })
            : null;
        const acceptedRaw = line.acceptedQuantity ?? line.quantity!;
        if (acceptedRaw <= 0) {
          await tx.stockReceptionLine.create({
            data: {
              receptionId: created.id,
              productId: product.id,
              unitId: unit.id,
              ocrLabel: line.ocrLabel || product.name,
              reference: line.reference,
              quantity: 0,
              documentedQuantity: line.documentedQuantity ?? line.quantity,
              deliveredQuantity: line.quantity,
              acceptedQuantity: 0,
              unit: unit.symbol,
              unitPrice: this.decimalOrNull(line.unitPrice),
              matchingStatus: StockReceptionLineMatchingStatus.RECOGNIZED,
              userCorrection: line as Prisma.InputJsonValue,
            },
          });
          continue;
        }
        const quantity = await this.convertToProductUnitTx(
          tx,
          organizationId,
          unit.id,
          product.unitId,
          acceptedRaw,
        );
        const inputQuantity = new Prisma.Decimal(acceptedRaw);
        const lineTotal = this.decimalOrNull(line.lineTotal);
        const unitPrice = this.decimalOrNull(line.unitPrice);
        await this.receptionInventory.applyValidatedLineTx(tx, {
          organizationId,
          receptionId: created.id,
          product,
          unit,
          lotId: lot?.id,
          supplierId: corrected.supplierId,
          siteId: corrected.siteId,
          locationId: corrected.locationId,
          stockQuantity: quantity,
          inputQuantity,
          documentedQuantity: new Prisma.Decimal(line.documentedQuantity ?? line.quantity!),
          deliveredQuantity: new Prisma.Decimal(line.quantity!),
          acceptedQuantity: inputQuantity,
          baseUnitPrice: lineTotal && !quantity.isZero() ? lineTotal.div(quantity) : unitPrice,
          unitPrice,
          lineTotal,
          vatRate: this.decimalOrNull(line.vatRate),
          label: line.ocrLabel || product.name,
          reference: line.reference,
          lotNumber: line.lotNumber,
          bestBeforeDate: line.bestBeforeDate ? new Date(line.bestBeforeDate) : null,
          matchingStatus:
            line.productId || line.createProduct
              ? StockReceptionLineMatchingStatus.RECOGNIZED
              : line.matchingStatus,
          matchingScore:
            line.productId || line.createProduct
              ? new Prisma.Decimal(1)
              : this.decimalOrNull(line.matchingScore),
          userCorrection: line as Prisma.InputJsonValue,
          movementReason: `Réception OCR ${corrected.invoiceNumber || corrected.deliveryNoteNumber || corrected.receiptNumber || extraction.ocrDocument.document.originalName}`,
          movementDate: corrected.deliveryDate ? new Date(corrected.deliveryDate) : new Date(),
          actorId: actor.id,
          priceMode: 'replace',
        });
      }
      await tx.ocrBusinessExtraction.update({
        where: { id: extraction.id },
        data: {
          correctedJson: corrected as Prisma.InputJsonValue,
          status: OcrBusinessExtractionStatus.VALIDATED,
        },
      });
      await this.marginsService.analyzeReceptionForAlertsTx(tx, organizationId, created.id);
      return tx.stockReception.findUnique({
        where: { id: created.id },
        include: {
          lines: { include: { product: { include: { unit: true } }, movements: true, lot: true } },
          supplier: true,
          document: true,
          extraction: true,
        },
      });
    });
    return reception;
  }

  private controlStatus(value: {
    controlConforming?: boolean | null;
    lines: Array<{ quantity?: number | null; acceptedQuantity?: number | null }>;
  }) {
    const delivered = value.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const accepted = value.lines.reduce(
      (sum, line) => sum + Number(line.acceptedQuantity ?? line.quantity ?? 0),
      0,
    );
    if (accepted <= 0) return HaccpReceptionControlStatus.REJECTED;
    return !value.controlConforming || accepted < delivered
      ? HaccpReceptionControlStatus.PARTIAL
      : HaccpReceptionControlStatus.CONFORMING;
  }

  /** Réception libre : même écriture Stocks/HACCP que l'OCR, sans document source. */
  async createManualReception(organizationId: string, actor: Actor, dto: SaveOcrCorrectionDto) {
    this.assertOcr(actor);
    if (dto.supplierId) await this.ensureSupplier(organizationId, dto.supplierId);
    if (dto.siteId) await this.ensureSite(organizationId, dto.siteId);
    if (dto.locationId) await this.ensureLocation(organizationId, dto.locationId);
    const corrected = this.normalizeCorrectionPayload(dto);
    const lines = corrected.lines.filter((line) => !line.ignored);
    if (!lines.length) throw new BadRequestException('Ajoutez au moins un produit à réceptionner.');
    if (corrected.deliveryTemperature == null || corrected.controlConforming == null)
      throw new BadRequestException('La température et le contrôle de réception sont requis.');
    const acceptedTotal = lines.reduce(
      (sum, line) => sum + Number(line.acceptedQuantity ?? line.quantity ?? 0),
      0,
    );
    return this.prisma.$transaction(async (tx) => {
      const reception = await tx.stockReception.create({
        data: {
          organizationId,
          supplierId: corrected.supplierId,
          supplierName: corrected.supplierName,
          invoiceNumber: corrected.invoiceNumber,
          deliveryNoteNumber: corrected.deliveryNoteNumber,
          receiptNumber: corrected.receiptNumber,
          deliveryDate: corrected.deliveryDate ? new Date(corrected.deliveryDate) : new Date(),
          status:
            acceptedTotal > 0 ? StockReceptionStatus.VALIDATED : StockReceptionStatus.CANCELLED,
          createdById: actor.id,
          siteId: corrected.siteId,
          locationId: corrected.locationId,
          validatedAt: new Date(),
          deliveryTemperature: corrected.deliveryTemperature,
          controlStatus: this.controlStatus(corrected),
          controlNotes: corrected.controlNotes ?? null,
        },
      });
      await this.rememberSupplierIdentifiersTx(
        tx,
        organizationId,
        corrected.supplierId,
        corrected.supplierIdentifiers,
      );
      for (const line of lines) {
        if (!line.productId || !line.unitId || line.quantity == null)
          throw new BadRequestException(
            'Chaque ligne doit être associée à un produit et une unité.',
          );
        const product = await tx.product.findFirst({
          where: { id: line.productId, organizationId, isArchived: false },
          include: { unit: true },
        });
        const unit = await tx.unit.findFirst({
          where: { id: line.unitId, organizationId, isArchived: false },
        });
        if (!product || !unit) throw new BadRequestException('Produit ou unité introuvable.');
        const accepted = Number(line.acceptedQuantity ?? line.quantity);
        if (accepted <= 0) {
          await tx.stockReceptionLine.create({
            data: {
              receptionId: reception.id,
              productId: product.id,
              unitId: unit.id,
              unit: unit.symbol,
              ocrLabel: line.ocrLabel || product.name,
              reference: line.reference,
              quantity: 0,
              documentedQuantity: line.documentedQuantity ?? line.quantity,
              deliveredQuantity: line.quantity,
              acceptedQuantity: 0,
              unitPrice: this.decimalOrNull(line.unitPrice),
              matchingStatus: StockReceptionLineMatchingStatus.RECOGNIZED,
              userCorrection: line as Prisma.InputJsonValue,
            },
          });
          continue;
        }
        const stockQuantity = await this.convertToProductUnitTx(
          tx,
          organizationId,
          unit.id,
          product.unitId,
          accepted,
        );
        const inputQuantity = new Prisma.Decimal(accepted);
        const unitPrice = this.decimalOrNull(line.unitPrice);
        await this.receptionInventory.applyValidatedLineTx(tx, {
          organizationId,
          receptionId: reception.id,
          product,
          unit,
          supplierId: corrected.supplierId,
          siteId: corrected.siteId,
          locationId: corrected.locationId,
          stockQuantity,
          inputQuantity,
          documentedQuantity: new Prisma.Decimal(line.documentedQuantity ?? line.quantity),
          deliveredQuantity: new Prisma.Decimal(line.quantity),
          acceptedQuantity: inputQuantity,
          baseUnitPrice: unitPrice,
          unitPrice,
          lineTotal: this.decimalOrNull(line.lineTotal),
          vatRate: this.decimalOrNull(line.vatRate),
          label: line.ocrLabel || product.name,
          reference: line.reference,
          lotNumber: line.lotNumber,
          bestBeforeDate: line.bestBeforeDate ? new Date(line.bestBeforeDate) : null,
          userCorrection: line as Prisma.InputJsonValue,
          movementReason:
            `Réception libre ${corrected.deliveryNoteNumber || corrected.receiptNumber || ''}`.trim(),
          movementDate: corrected.deliveryDate ? new Date(corrected.deliveryDate) : new Date(),
          actorId: actor.id,
          priceMode: 'replace',
        });
      }
      return tx.stockReception.findUnique({
        where: { id: reception.id },
        include: {
          lines: { include: { product: { include: { unit: true } }, unitModel: true } },
          supplier: true,
          site: true,
          location: true,
        },
      });
    });
  }

  private async createProductForReceptionLineTx(
    tx: Tx,
    organizationId: string,
    supplierId: string | null,
    line: ReturnType<StocksOcrService['normalizeCorrectionPayload']>['lines'][number],
  ) {
    if (!line.createProduct) return null;
    const name = String(line.nameOriginal || line.ocrLabel || '').trim();
    if (!name) throw new BadRequestException('Le produit à créer doit avoir un nom.');
    if (!line.unitId)
      throw new BadRequestException(
        `Le produit « ${name} » doit avoir une unité ToqueHub sélectionnée.`,
      );
    const unit = await tx.unit.findFirst({
      where: { id: line.unitId, organizationId, isArchived: false },
    });
    if (!unit) throw new BadRequestException(`Unité introuvable pour le produit « ${name} ».`);
    if (line.categoryId) {
      const category = await tx.category.findFirst({
        where: { id: line.categoryId, organizationId, isArchived: false },
      });
      if (!category)
        throw new BadRequestException(`Catégorie introuvable pour le produit « ${name} ».`);
    }
    const sku = line.reference?.trim() || null;
    const existing = await tx.product.findFirst({
      where: {
        organizationId,
        isArchived: false,
        OR: [{ name: { equals: name, mode: 'insensitive' } }, ...(sku ? [{ sku }] : [])],
      },
      include: { unit: true },
    });
    if (existing) return existing;
    return tx.product.create({
      data: {
        organizationId,
        name,
        sku,
        description: line.descriptionOriginal || null,
        unitId: unit.id,
        categoryId: line.categoryId || null,
        primarySupplierId: supplierId || null,
        averagePrice: this.decimalOrNull(line.unitPrice) ?? new Prisma.Decimal(0),
      },
      include: { unit: true },
    });
  }

  private async processOcr(
    organizationId: string,
    actor: Actor,
    documentId: string,
    ocrDocumentId: string,
  ) {
    const started = Date.now();
    try {
      const document = await this.prisma.document.findFirst({
        where: { id: documentId, organizationId },
      });
      if (!document) throw new NotFoundException('Document introuvable');
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.PROCESSING },
      });
      await this.prisma.ocrDocument.update({
        where: { id: ocrDocumentId },
        data: { status: OcrProcessingStatus.PROCESSING },
      });
      const result = await this.callMistral(organizationId, document);
      const rawText = this.rawTextFromOcr(result.rawJson);
      const updatedOcr = await this.prisma.ocrDocument.update({
        where: { id: ocrDocumentId },
        data: {
          status: OcrProcessingStatus.COMPLETED,
          rawText,
          rawMarkdown: result.markdown,
          rawJson: result.rawJson as Prisma.InputJsonValue,
          pageCount: result.pageCount,
          processingDurationMs: result.durationMs,
        },
      });
      const extracted = await this.extractBusinessData(
        organizationId,
        result.markdown || rawText,
        result.rawJson,
      );
      const extraction = await this.prisma.ocrBusinessExtraction.create({
        data: {
          organizationId,
          ocrDocumentId: updatedOcr.id,
          type:
            extracted.documentType === 'invoice'
              ? OcrExtractionType.INVOICE
              : extracted.documentType === 'delivery_note'
                ? OcrExtractionType.DELIVERY_NOTE
                : OcrExtractionType.UNKNOWN,
          extractedJson: extracted as unknown as Prisma.InputJsonValue,
          confidenceScore: this.decimalOrNull(this.confidenceForExtraction(extracted)),
        },
      });
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.PROCESSED, sourceId: extraction.id },
      });
      this.logger.log(
        `OCR stocks terminé document=${document.id} org=${organizationId} user=${actor.id} pages=${result.pageCount ?? 0} durée=${Date.now() - started}ms lignes=${extracted.lines.length}`,
      );
    } catch (error: any) {
      const message = error?.message || 'Erreur OCR';
      await this.prisma.ocrDocument
        .update({
          where: { id: ocrDocumentId },
          data: {
            status: OcrProcessingStatus.FAILED,
            errorCode: error?.code || 'OCR_FAILED',
            errorMessage: message,
            processingDurationMs: Date.now() - started,
          },
        })
        .catch(() => undefined);
      await this.prisma.document
        .update({ where: { id: documentId }, data: { status: DocumentStatus.FAILED } })
        .catch(() => undefined);
      this.logger.error(
        `OCR stocks échoué document=${documentId} org=${organizationId}: ${message}`,
      );
    }
  }

  private async callMistral(
    organizationId: string,
    document: { storagePath: string; mimeType: string; sizeBytes: number; id: string },
  ) {
    if (OCR_PROVIDER !== 'mistral') throw new BadRequestException('Provider OCR non configuré');
    const apiKey = await this.resolveMistralApiKey(organizationId);
    if (!apiKey) throw new BadRequestException('Configuration OCR absente');
    const started = Date.now();
    const buffer = await readFile(join(STOCKS_OCR_UPLOAD_ROOT, document.storagePath));
    const mimeType = this.mimeForDocument(document.mimeType, document.storagePath);
    const isPdf = mimeType === 'application/pdf';
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const body = this.mistralOcrRequestBody(isPdf, dataUrl, true);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.OCR_TIMEOUT_MS ?? 60_000),
    );
    try {
      let response = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let json: any = await response.json().catch(() => ({}));
      if (!response.ok && this.canRetryBaseOcr(response.status)) {
        this.logger.warn(
          `OCR Mistral enrichi refusé document=${document.id} status=${response.status}, nouvel essai sans annotation.`,
        );
        response = await fetch('https://api.mistral.ai/v1/ocr', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(this.mistralOcrRequestBody(isPdf, dataUrl, false)),
          signal: controller.signal,
        });
        json = await response.json().catch(() => ({}));
      }
      if (!response.ok)
        throw new BadRequestException(
          'Le document n’a pas pu être analysé. Vérifiez qu’il est lisible et réessayez.',
        );
      const pages = Array.isArray((json as any).pages) ? (json as any).pages : [];
      return {
        rawJson: json,
        markdown: pages
          .map((page: any) => page.markdown)
          .filter(Boolean)
          .join('\n\n'),
        pageCount: pages.length || (json as any).usage_info?.pages_processed || null,
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private mistralOcrRequestBody(isPdf: boolean, dataUrl: string, withAnnotation: boolean) {
    const body: any = {
      model: OCR_MODEL,
      document: isPdf
        ? { type: 'document_url', document_url: dataUrl }
        : { type: 'image_url', image_url: dataUrl },
      include_image_base64: false,
    };
    if (withAnnotation) {
      body.table_format = 'markdown';
      body.confidence_scores_granularity = 'page';
    }
    if (withAnnotation && OCR_DOCUMENT_ANNOTATION_ENABLED) {
      body.document_annotation_prompt = this.invoiceUnderstandingInstructions();
      body.document_annotation_format = this.aiResponseFormat('toquehub_stock_ocr_annotation');
    }
    return body;
  }

  private canRetryBaseOcr(status: number) {
    return status === 400 || status === 422;
  }

  private async extractBusinessData(
    organizationId: string,
    markdown: string,
    rawJson?: any,
  ): Promise<BusinessExtraction> {
    const text = markdown || '';
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const specialized = this.extractKnownSupplierBusinessData(text, lines);
    const supplierName =
      specialized?.supplier.name || specialized?.supplierName || this.extractSupplier(lines);
    const supplierMatch = await this.matchSupplier(
      organizationId,
      supplierName,
      lines,
      specialized?.supplierIdentifiers,
    );
    const totals = this.extractTotals(text);
    const extraction: BusinessExtraction = specialized ?? {
      documentType: this.detectDocumentType(text),
      supplier: { name: supplierName },
      document: {
        invoiceNumber: this.extractInvoiceNumber(text),
        deliveryNoteNumber: this.extractDeliveryNoteNumber(text),
        purchaseOrderNumber: this.extractPurchaseOrderNumber(text),
        receiptNumber: this.extractReceiptNumber(text),
        documentDate: this.extractDocumentDate(text),
        deliveryDate: this.extractDeliveryDate(text),
      },
      totals,
      lines: this.extractLines(lines),
    };
    const matchedSupplierExtraction: BusinessExtraction = {
      ...extraction,
      supplier: {
        ...extraction.supplier,
        name: extraction.supplier.name || supplierName,
        supplierId: supplierMatch.supplierId,
        supplierName: supplierMatch.supplierName,
        matchingStatus: supplierMatch.matchingStatus,
        matchingScore: supplierMatch.matchingScore,
        candidates: supplierMatch.candidates,
      },
      supplierId: supplierMatch.supplierId,
      supplierName: supplierMatch.supplierName || extraction.supplierName || supplierName,
      supplierMatchingStatus: supplierMatch.matchingStatus,
      supplierMatchingScore: supplierMatch.matchingScore,
      supplierCandidates: supplierMatch.candidates,
    };
    if (specialized) {
      const matched = await this.matchLines(
        organizationId,
        matchedSupplierExtraction.lines,
        matchedSupplierExtraction.supplierId,
      );
      return { ...matchedSupplierExtraction, lines: matched, items: matched };
    }
    const ocrAnnotation = this.extractMistralOcrDocumentAnnotation(
      rawJson,
      matchedSupplierExtraction,
    );
    if (ocrAnnotation?.lines?.length) {
      const merged = this.mergeAiAnalysis(matchedSupplierExtraction, ocrAnnotation);
      const matched = await this.matchLines(organizationId, merged.lines, merged.supplierId);
      return { ...merged, lines: matched };
    }
    const aiExtraction = await this.analyzeOcrWithMistralAi(
      organizationId,
      markdown,
      rawJson,
      matchedSupplierExtraction,
    ).catch((error) => {
      this.logger.warn(
        `Analyse IA OCR indisponible org=${organizationId}: ${error?.message || error}`,
      );
      return this.aiFallback(
        matchedSupplierExtraction,
        error?.message || 'Analyse IA indisponible',
      );
    });
    const merged = this.mergeAiAnalysis(matchedSupplierExtraction, aiExtraction);
    const matched = await this.matchLines(organizationId, merged.lines, merged.supplierId);
    return { ...merged, lines: matched };
  }

  private async analyzeOcrWithMistralAi(
    organizationId: string,
    markdown: string,
    rawJson: any,
    fallback: BusinessExtraction,
  ): Promise<Partial<BusinessExtraction>> {
    const references = await this.ocrReferenceContext(organizationId);
    const prompt = this.invoiceUnderstandingInstructions();
    try {
      const parsed = await this.mistralClient.chatJson<any>(
        organizationId,
        [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: JSON.stringify({
              fallbackExtraction: this.compactExtractionForAi(fallback),
              references,
              ocrMarkdown: markdown.slice(0, 45_000),
              ocrPages: Array.isArray(rawJson?.pages)
                ? rawJson.pages
                    .slice(0, 6)
                    .map((page: any) => ({ markdown: page.markdown, text: page.text }))
                    .filter(Boolean)
                : [],
            }),
          },
        ],
        'toquehub_stock_ocr_analysis',
        this.aiAnalysisSchema(),
      );
      return this.normalizeAiExtraction(parsed, fallback);
    } catch (error: any) {
      return this.aiFallback(fallback, error?.message || 'Analyse IA indisponible');
    }
  }

  private extractMistralOcrDocumentAnnotation(
    rawJson: any,
    fallback: BusinessExtraction,
  ): Partial<BusinessExtraction> | null {
    const annotation = rawJson?.document_annotation;
    if (annotation == null) return null;
    try {
      const parsed =
        typeof annotation === 'string' ? this.parseAiJsonContent(annotation) : annotation;
      const normalized = this.normalizeAiExtraction(parsed, fallback);
      return {
        ...normalized,
        aiAnalysis: {
          ...(normalized.aiAnalysis ||
            this.aiFallback(fallback, 'Annotation Mistral OCR vide.').aiAnalysis!),
          provider: 'mistral-ocr',
          model: OCR_MODEL,
          status: normalized.lines?.length ? 'applied' : 'fallback',
        },
      };
    } catch (error: any) {
      this.logger.warn(`Annotation document OCR Mistral ignorée: ${error?.message || error}`);
      return null;
    }
  }

  private invoiceUnderstandingInstructions() {
    return [
      'Tu analyses un bon de livraison, une facture fournisseur, une commande ou un ticket de caisse pour un module de stock restauration.',
      'Retourne uniquement le JSON conforme au schema.',
      'Objectifs: extraire le fournisseur, ses identifiants stables, les numéros documentaires, dates, totaux et les lignes utiles pour réception fournisseur.',
      'Types possibles: invoice, delivery_note, receipt, supplier_order, order_confirmation, unknown.',
      'Un ticket de caisse (receipt) contient souvent une enseigne ou un magasin, une adresse, une date et heure, un total payé, un bloc TVA et des produits suivis de leur quantité et prix au KG/KPL/L. En finnois, YHTEENSÄ=total, ALV=TVA, VEROTON=hors taxe, VERO=taxe, VEROLLINEN=TTC, KPL=pièce, KG=kilogramme et Y-tunnus=identifiant entreprise.',
      'Pour un produit vendu au poids ou à la pièce sur un ticket, extrais la quantité et l’unité depuis la ligne de détail, le prix après €/KG, €/KPL ou €/L comme unitPrice, et le montant à droite de la ligne produit comme total.',
      'Les remises (alennus) ne sont pas des produits stockables. Ignore-les comme lignes tout en conservant le total réellement payé dans totalIncludingTax.',
      'Dans supplier.identifiers, conserve seulement les identifiants stables du commerce (Y-tunnus/business_id, numéro de magasin/store_number, téléphone), jamais le numéro de caisse, de transaction, de client ou d’employé.',
      'Tu dois reconnaître les factures finlandaises: Lasku=facture, Lasku päiväys=date facture, Eräpäivä=échéance, Asiakasnumero=numero client, Toimitusasiakas=adresse de livraison, Nimike=code article, Nimi=nom, Määrä=quantité, Yksikkö=unité, á hinta=prix unitaire, Yhteensä=total ligne, Alkuperämaa=pays origine, Nettopaino=poids net, Loppusumma=total final.',
      'Tu dois reconnaître les historiques/confirmations de commande Kespro: Order information, Order date, Selected delivery date, Order number, Delivery address, Confirmed quantity / ME.',
      'Pour Kespro, Order number est toujours le numéro de commande fournisseur et doit être renseigné dans document.purchaseOrderNumber.',
      'Ignore les lignes adresse, SIRET, téléphone, fax, RCS, conditions, totaux, mentions légales, pieds de page et en-têtes.',
      'Regroupe les lignes produit éclatées. Conserve les lots et DLC/DDM si présents.',
      'Conserve le texte original du produit dans nameOriginal ou label. Ne traduis pas les noms produits.',
      'Les quantités collées aux unités comme 1,00ltk doivent devenir quantity=1.00 et unit=ltk.',
      'Les lignes RAHTI/transport doivent être conservées mais classées non_product_line, isFreight=true, isStockItem=false, ignored=true.',
      'Classe chaque ligne avec lineStatus parmi ready, needs_review, missing_product, price_mismatch, quantity_suspicious, non_product_line, duplicate_line.',
      'Utilise les référentiels ToqueHub pour proposer supplierId, productId, unitId, categoryId quand fiable.',
      'Si aucun produit fiable, propose un libellé propre, une unité, une catégorie et un SKU/référence si présent.',
      'La catégorie est obligatoire en sortie: choisis categoryId parmi les catégories existantes dès qu’une catégorie est plausible.',
      'Si aucune catégorie existante ne convient, renseigne categoryName avec une catégorie métier française précise, jamais "Non classé", "À classer" ou "Divers".',
      'Les nombres doivent être des nombres JSON, pas des chaînes. Les dates doivent être YYYY-MM-DD.',
      'Tous les messages humains dans warnings, suggestedActions et line.warnings doivent être rédigés en français, jamais en anglais.',
    ].join('\n');
  }

  private aiResponseFormat(name: string) {
    return {
      type: 'json_schema',
      json_schema: {
        name,
        strict: true,
        schema: this.aiAnalysisSchema(),
      },
    };
  }

  private aiAnalysisSchema() {
    const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
    const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'documentType',
        'supplier',
        'document',
        'totals',
        'lines',
        'warnings',
        'suggestedActions',
        'documentConfidence',
        'totalsCheck',
      ],
      properties: {
        documentType: { type: 'string', enum: BUSINESS_DOCUMENT_TYPES },
        documentConfidence: nullableNumber,
        warnings: { type: 'array', items: { type: 'string' } },
        suggestedActions: { type: 'array', items: { type: 'string' } },
        supplier: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'supplierId', 'confidence', 'identifiers'],
          properties: {
            name: nullableString,
            supplierId: nullableString,
            confidence: nullableNumber,
            identifiers: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['kind', 'value'],
                properties: { kind: { type: 'string' }, value: { type: 'string' } },
              },
            },
          },
        },
        document: {
          type: 'object',
          additionalProperties: false,
          required: [
            'invoiceNumber',
            'deliveryNoteNumber',
            'purchaseOrderNumber',
            'receiptNumber',
            'documentDate',
            'deliveryDate',
          ],
          properties: {
            invoiceNumber: nullableString,
            deliveryNoteNumber: nullableString,
            purchaseOrderNumber: nullableString,
            receiptNumber: nullableString,
            documentDate: nullableString,
            deliveryDate: nullableString,
          },
        },
        totals: {
          type: 'object',
          additionalProperties: false,
          required: ['totalExcludingTax', 'totalTax', 'totalIncludingTax'],
          properties: {
            totalExcludingTax: nullableNumber,
            totalTax: nullableNumber,
            totalIncludingTax: nullableNumber,
          },
        },
        totalsCheck: {
          type: 'object',
          additionalProperties: false,
          required: ['computedTotal', 'documentTotal', 'delta', 'status'],
          properties: {
            computedTotal: nullableNumber,
            documentTotal: nullableNumber,
            delta: nullableNumber,
            status: nullableString,
          },
        },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'label',
              'reference',
              'quantity',
              'unit',
              'unitPrice',
              'total',
              'vatRate',
              'lotNumber',
              'bestBeforeDate',
              'productId',
              'unitId',
              'categoryId',
              'categoryName',
              'lineStatus',
              'confidence',
              'warnings',
              'sourceText',
            ],
            properties: {
              label: nullableString,
              reference: nullableString,
              supplierProductCode: nullableString,
              nameOriginal: nullableString,
              descriptionOriginal: nullableString,
              quantity: nullableNumber,
              unit: nullableString,
              unitPrice: nullableNumber,
              total: nullableNumber,
              vatRate: nullableNumber,
              lotNumber: nullableString,
              bestBeforeDate: nullableString,
              originCountry: nullableString,
              statisticalCode: nullableString,
              netWeight: nullableNumber,
              isFreight: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
              isStockItem: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
              packageDescription: nullableString,
              ignored: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
              productId: nullableString,
              unitId: nullableString,
              categoryId: nullableString,
              categoryName: nullableString,
              lineStatus: {
                type: 'string',
                enum: [
                  'ready',
                  'needs_review',
                  'missing_product',
                  'price_mismatch',
                  'quantity_suspicious',
                  'non_product_line',
                  'duplicate_line',
                ],
              },
              confidence: nullableNumber,
              warnings: { type: 'array', items: { type: 'string' } },
              sourceText: nullableString,
            },
          },
        },
      },
    };
  }

  private parseAiJsonContent(content: any) {
    const raw = Array.isArray(content)
      ? content.map((part) => part?.text || part?.content || '').join('')
      : String(content || '');
    const cleaned = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    if (!cleaned) throw new BadRequestException('Analyse IA vide.');
    return JSON.parse(cleaned);
  }

  private normalizeAiExtraction(
    ai: any,
    fallback: BusinessExtraction,
  ): Partial<BusinessExtraction> {
    const warnings = this.cleanOcrMessages(ai?.warnings, 12);
    const lines = Array.isArray(ai?.lines)
      ? ai.lines
          .filter((line: any) => line?.lineStatus !== 'duplicate_line')
          .map((line: any) => ({
            label: this.cleanString(line.label) || null,
            reference: this.cleanString(line.reference) || null,
            supplierProductCode:
              this.cleanString(line.supplierProductCode) ||
              this.cleanString(line.reference) ||
              null,
            nameOriginal:
              this.cleanString(line.nameOriginal) || this.cleanString(line.label) || null,
            nameNormalized: this.normalizeProductText(
              this.cleanString(line.nameOriginal) || this.cleanString(line.label) || '',
            ),
            descriptionOriginal: this.cleanString(line.descriptionOriginal) || null,
            quantity: this.numberOrNull(line.quantity),
            unit: this.cleanString(line.unit) || null,
            unitPrice: this.numberOrNull(line.unitPrice),
            total: this.numberOrNull(line.total),
            vatRate: this.numberOrNull(line.vatRate),
            lotNumber: this.cleanString(line.lotNumber) || null,
            bestBeforeDate: this.cleanDate(line.bestBeforeDate),
            originCountry: this.cleanString(line.originCountry) || null,
            statisticalCode: this.cleanString(line.statisticalCode) || null,
            netWeight: this.numberOrNull(line.netWeight),
            isFreight:
              typeof line.isFreight === 'boolean'
                ? line.isFreight
                : /\bRAHTI\b/i.test(String(line.label || '')),
            isStockItem:
              typeof line.isStockItem === 'boolean'
                ? line.isStockItem
                : line.lineStatus !== 'non_product_line',
            packageDescription:
              this.cleanString(line.packageDescription) ||
              this.packageDescriptionFromName(
                this.cleanString(line.nameOriginal) || this.cleanString(line.label) || '',
              ) ||
              null,
            ignored: Boolean(line.ignored) || line.lineStatus === 'non_product_line',
            productId: this.uuidOrNull(line.productId),
            unitId: this.uuidOrNull(line.unitId),
            categoryId: this.uuidOrNull(line.categoryId),
            categoryName: this.cleanString(line.categoryName) || null,
            lineStatus: this.cleanString(line.lineStatus) || 'needs_review',
            lineConfidence: this.numberOrNull(line.confidence),
            warnings: this.cleanOcrMessages(line.warnings, 6),
            sourceText: this.cleanString(line.sourceText) || null,
          }))
          .filter((line: ExtractedLine) => line.label && line.quantity != null)
          .slice(0, 120)
      : [];
    const documentConfidence = this.numberOrNull(ai?.documentConfidence);
    return {
      documentType: BUSINESS_DOCUMENT_TYPES.includes(ai?.documentType)
        ? ai.documentType
        : fallback.documentType,
      supplier: {
        name: this.cleanString(ai?.supplier?.name) || fallback.supplier.name,
        identifiers: this.cleanSupplierIdentifiers(
          ai?.supplier?.identifiers,
          fallback.supplierIdentifiers,
        ),
      },
      supplierId: this.uuidOrNull(ai?.supplier?.supplierId) || fallback.supplierId,
      supplierName: this.cleanString(ai?.supplier?.name) || fallback.supplierName,
      supplierIdentifiers: this.cleanSupplierIdentifiers(
        ai?.supplier?.identifiers,
        fallback.supplierIdentifiers,
      ),
      document: {
        invoiceNumber:
          this.cleanString(ai?.document?.invoiceNumber) || fallback.document.invoiceNumber,
        deliveryNoteNumber:
          this.cleanString(ai?.document?.deliveryNoteNumber) ||
          fallback.document.deliveryNoteNumber,
        purchaseOrderNumber:
          this.cleanString(ai?.document?.purchaseOrderNumber) ||
          fallback.document.purchaseOrderNumber,
        receiptNumber:
          this.cleanString(ai?.document?.receiptNumber) || fallback.document.receiptNumber,
        documentDate: this.cleanDate(ai?.document?.documentDate) || fallback.document.documentDate,
        deliveryDate: this.cleanDate(ai?.document?.deliveryDate) || fallback.document.deliveryDate,
      },
      totals: {
        totalExcludingTax:
          this.numberOrNull(ai?.totals?.totalExcludingTax) ?? fallback.totals.totalExcludingTax,
        totalTax: this.numberOrNull(ai?.totals?.totalTax) ?? fallback.totals.totalTax,
        totalIncludingTax:
          this.numberOrNull(ai?.totals?.totalIncludingTax) ?? fallback.totals.totalIncludingTax,
      },
      lines: lines.length ? lines : fallback.lines,
      documentConfidence,
      warnings,
      suggestedActions: this.cleanOcrMessages(ai?.suggestedActions, 10),
      aiAnalysis: {
        provider: OCR_PROVIDER,
        model: OCR_AI_MODEL,
        status: lines.length ? 'applied' : 'fallback',
        confidence: documentConfidence,
        warnings,
        suggestedActions: this.cleanOcrMessages(ai?.suggestedActions, 10),
        totalsCheck: {
          computedTotal: this.numberOrNull(ai?.totalsCheck?.computedTotal),
          documentTotal: this.numberOrNull(ai?.totalsCheck?.documentTotal),
          delta: this.numberOrNull(ai?.totalsCheck?.delta),
          status: this.cleanString(ai?.totalsCheck?.status),
        },
      },
    };
  }

  private mergeAiAnalysis(
    fallback: BusinessExtraction,
    ai: Partial<BusinessExtraction>,
  ): BusinessExtraction {
    const supplierName =
      ai.supplierName || ai.supplier?.name || fallback.supplierName || fallback.supplier.name;
    return {
      ...fallback,
      documentType: ai.documentType ?? fallback.documentType,
      supplier: { ...fallback.supplier, ...ai.supplier, name: supplierName ?? null },
      supplierId: ai.supplierId ?? fallback.supplierId,
      supplierName: supplierName ?? null,
      supplierIdentifiers: ai.supplierIdentifiers ?? fallback.supplierIdentifiers ?? [],
      document: { ...fallback.document, ...(ai.document || {}) },
      totals: { ...fallback.totals, ...(ai.totals || {}) },
      lines: ai.lines?.length ? ai.lines : fallback.lines,
      aiAnalysis: ai.aiAnalysis ?? fallback.aiAnalysis,
      warnings: ai.warnings ?? fallback.warnings ?? [],
      suggestedActions: ai.suggestedActions ?? fallback.suggestedActions ?? [],
      documentConfidence: ai.documentConfidence ?? fallback.documentConfidence ?? null,
    };
  }

  private aiFallback(fallback: BusinessExtraction, reason: string): Partial<BusinessExtraction> {
    return {
      lines: fallback.lines,
      aiAnalysis: {
        provider: OCR_PROVIDER,
        model: OCR_AI_MODEL,
        status: 'failed',
        confidence: null,
        warnings: [reason],
        suggestedActions: ['Vérifier manuellement les lignes OCR.'],
      },
      warnings: [reason],
      suggestedActions: ['Vérifier manuellement les lignes OCR.'],
      documentConfidence: null,
    };
  }

  private async ocrReferenceContext(organizationId: string) {
    const [suppliers, products, categories, units] = await Promise.all([
      this.prisma.supplier.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      this.prisma.product.findMany({
        where: { organizationId, isArchived: false },
        select: {
          id: true,
          name: true,
          sku: true,
          categoryId: true,
          unitId: true,
          primarySupplierId: true,
        },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.prisma.category.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true, description: true },
        orderBy: { name: 'asc' },
        take: 120,
      }),
      this.prisma.unit.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true, symbol: true, type: true },
        orderBy: { name: 'asc' },
        take: 120,
      }),
    ]);
    return { suppliers, products, categories, units, categoryHints: STOCKS_OCR_CATEGORY_HINTS };
  }

  private compactExtractionForAi(extraction: BusinessExtraction) {
    return {
      supplierName: extraction.supplierName,
      supplierIdentifiers: extraction.supplierIdentifiers,
      document: extraction.document,
      totals: extraction.totals,
      lines: extraction.lines.slice(0, 100),
    };
  }

  private cleanString(value: any) {
    const str = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
    return str || null;
  }

  private cleanSupplierIdentifiers(
    value: any,
    fallback: Array<{ kind: string; value: string }> = [],
  ) {
    const items = Array.isArray(value) ? value : fallback;
    const seen = new Set<string>();
    return items
      .map((item: any) => ({
        kind: this.cleanString(item?.kind)?.toLowerCase() || '',
        value: this.cleanString(item?.value) || '',
      }))
      .filter((item) => {
        if (!item.kind || !item.value) return false;
        const normalized = this.normalizeSupplierIdentifier(item.value);
        const key = `${item.kind}:${normalized}`;
        if (!normalized || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  }

  private cleanOcrMessages(value: any, limit: number) {
    const messages = Array.isArray(value) ? value : value ? [value] : [];
    const seen = new Set<string>();
    return messages
      .map((message) => this.cleanOcrMessage(message))
      .filter((message): message is string => {
        if (!message) return false;
        const key = this.normalize(message);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  private cleanOcrMessage(value: any) {
    const str = this.cleanString(value);
    if (!str) return null;
    return str
      .replace(/\bConfirmeration\b/gi, 'confirmation')
      .replace(/\bConfirmer(ée|ées|é|és)\b/gi, 'confirm$1')
      .replace(/(^|[^A-Za-zÀ-ÿ])Confirm(?![A-Za-zÀ-ÿ])/gi, '$1Confirmer')
      .trim();
  }

  private uuidOrNull(value: any) {
    const str = this.cleanString(value);
    return str &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
      ? str
      : null;
  }

  private numberOrNull(value: any) {
    if (value == null || value === '') return null;
    const parsed = typeof value === 'number' ? value : this.parseFrenchNumber(String(value));
    return parsed != null && Number.isFinite(parsed) ? parsed : null;
  }

  private cleanDate(value: any) {
    const str = this.cleanString(value);
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(str)) return this.normalizeDate(str);
    return null;
  }

  private detectDocumentType(text: string): BusinessDocumentType {
    if (this.isTingstadFinnishInvoice(text)) return 'invoice';
    if (this.isKesproOrder(text))
      return /confirmed quantity/i.test(text) ? 'order_confirmation' : 'supplier_order';
    if (this.isFinnishRetailReceipt(text)) return 'receipt';
    if (/\bfacture\b|\binvoice\b/i.test(text)) return 'invoice';
    if (/\b(bon de livraison|bl\b|livraison|delivery note)\b/i.test(text)) return 'delivery_note';
    return 'unknown';
  }

  private extractKnownSupplierBusinessData(
    text: string,
    lines: string[],
  ): BusinessExtraction | null {
    if (this.isTingstadFinnishInvoice(text)) return this.extractTingstadFinnishInvoice(text, lines);
    if (this.isKesproOrder(text)) return this.extractKesproOrder(text, lines);
    if (this.isFinnishRetailReceipt(text)) return this.extractFinnishRetailReceipt(text, lines);
    return null;
  }

  private isTingstadFinnishInvoice(text: string) {
    return (
      /AB Tingstad papper/i.test(text) &&
      /Lasku päiväys/i.test(text) &&
      /Nimike/i.test(text) &&
      /Yhteensä/i.test(text)
    );
  }

  private isKesproOrder(text: string) {
    return (
      /Order information/i.test(text) &&
      /Order number/i.test(text) &&
      /(kespro\.fi|Tilauksen tiedot|Tilaushistoria|Selected delivery date|Confirmed quantity\s*\/\s*ME)/i.test(
        text,
      )
    );
  }

  private isFinnishRetailReceipt(text: string) {
    const hasRetailHeader =
      /\b(?:K-?Market|S-?Market|Prisma|Alepa|Sale|Lidl)\b/i.test(text) ||
      /\bmyym[aä]l[aä]\b/i.test(text);
    const hasReceiptTotals = /(?:^|\s)YHTEENS[ÄA](?:\s|$)/i.test(text) && /\bALV\b/i.test(text);
    const hasReceiptLine =
      /€\s*\/\s*(?:KG|KPL|L|G|ML)\b/i.test(text) || /\bLASKUTUSMYYNTI\b/i.test(text);
    return hasRetailHeader && hasReceiptTotals && hasReceiptLine;
  }

  private extractFinnishRetailReceipt(text: string, lines: string[]): BusinessExtraction {
    const supplierName =
      lines
        .slice(0, 12)
        .map((line) =>
          line
            .replace(/^[#*\s]+/, '')
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .find((line) => /\b(?:K-?Market|S-?Market|Prisma|Alepa|Sale|Lidl)\b/i.test(line)) ||
      this.extractSupplier(lines) ||
      'Commerce de détail';
    const supplierIdentifiers = this.extractFinnishReceiptSupplierIdentifiers(text);
    const items = this.extractFinnishReceiptLines(lines);
    const vatTotals = this.extractFinnishReceiptVatTotals(lines);
    const paidTotal = this.extractFinnishReceiptPaidTotal(lines);
    const grossTotal = this.roundMoney(items.reduce((sum, item) => sum + (item.total ?? 0), 0));
    const discount = this.extractMoney(
      text,
      /(?:ASIAKASRYHM[AÄ]ALENNUS|ALENNUS|DISCOUNT)\s*([0-9]+(?:[.,][0-9]+)?)\s*-?/i,
    );
    const documentTotal = paidTotal ?? vatTotals.totalIncludingTax ?? grossTotal;
    const delta = this.roundMoney(grossTotal - documentTotal);
    const discountApplied =
      discount != null && Math.abs(delta - discount) <= Math.max(0.02, discount * 0.02);
    const receiptNumber = this.extractReceiptNumber(text);
    const documentDate = this.extractFinnishReceiptDate(lines, text);
    const warnings =
      !discountApplied && Math.abs(delta) > 0.05
        ? [
            `La somme des articles (${grossTotal.toFixed(2)} EUR) diffère du total payé (${documentTotal.toFixed(2)} EUR). Vérifiez les remises du ticket.`,
          ]
        : [];
    const suggestedActions = discountApplied
      ? [
          `Remise de ${discount!.toFixed(2)} EUR détectée : les quantités et prix unitaires du ticket sont conservés, le total payé reste ${documentTotal.toFixed(2)} EUR.`,
        ]
      : [];

    return {
      documentType: 'receipt',
      supplier: { name: supplierName, identifiers: supplierIdentifiers },
      supplierName,
      supplierIdentifiers,
      document: {
        invoiceNumber: null,
        deliveryNoteNumber: null,
        purchaseOrderNumber: null,
        receiptNumber,
        documentDate,
        deliveryDate: documentDate,
      },
      totals: {
        totalExcludingTax: vatTotals.totalExcludingTax,
        totalTax: vatTotals.totalTax,
        totalIncludingTax: documentTotal,
      },
      lines: items,
      items,
      confidence: {
        documentType: 0.99,
        header: supplierName && documentDate ? 0.98 : 0.75,
        items: items.length ? 0.98 : 0.2,
        totals: documentTotal != null ? 0.98 : 0.4,
      },
      aiAnalysis: {
        provider: 'internal',
        model: 'finnish-retail-receipt-parser',
        status: 'applied',
        confidence: items.length ? 0.98 : 0.55,
        warnings,
        suggestedActions,
        totalsCheck: {
          computedTotal: grossTotal,
          documentTotal,
          delta,
          status: discountApplied
            ? 'receipt_discount_applied'
            : Math.abs(delta) <= 0.05
              ? 'ok'
              : 'mismatch',
        },
      },
      warnings,
      suggestedActions,
      documentConfidence: items.length ? 0.98 : 0.55,
    };
  }

  private extractFinnishReceiptSupplierIdentifiers(text: string) {
    const identifiers: Array<{ kind: string; value: string }> = [];
    const add = (kind: string, value?: string | null) => {
      if (value?.trim()) identifiers.push({ kind, value: value.replace(/\s+/g, ' ').trim() });
    };
    add('store_number', text.match(/\b([+0-9][0-9\s-]{6,})\s+myym[aä]l[aä](?:\s|$)/i)?.[1]);
    add('phone', text.match(/\b([+0-9][0-9\s-]{6,})\s+posti\b/i)?.[1]);
    add('business_id', text.match(/\bY-?tunnus\s*[:#-]?\s*([0-9]{6,7}-[0-9])\b/i)?.[1]);
    return this.cleanSupplierIdentifiers(identifiers);
  }

  private extractFinnishReceiptLines(lines: string[]) {
    const items: ExtractedLine[] = [];
    const productLineRe = /^(.+?[A-Za-zÀ-ÿÄÖÅäöå][^|]*?)\s+([0-9]+[,.][0-9]{2})\s*€?\s*$/;
    const detailRe =
      /^([0-9]+(?:[,.][0-9]+)?)\s*(KG|KPL|L|G|ML|CL|DL|PKT|PSS|PRK|TLK|RS|PAK)\s+([0-9]+(?:[,.][0-9]+)?)\s*€?\s*\/\s*(KG|KPL|L|G|ML|CL|DL|PKT|PSS|PRK|TLK|RS|PAK)\b/i;
    const start = lines.findIndex(
      (line) =>
        /\b\d{1,2}[.:]\d{2}\b/.test(line) && /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(line),
    );
    for (let i = Math.max(0, start + 1); i < lines.length; i += 1) {
      const line = this.cleanFinnishReceiptLine(lines[i]);
      if (/^YHTEENS[ÄA](?:\s|$)/i.test(line)) break;
      if (!line || /\b(?:ALENNUS|PANTTI|KUPONKI)\b/i.test(line)) continue;
      const product = line.match(productLineRe);
      if (!product) continue;
      const nameOriginal = product[1].replace(/[\s/]+$/g, '').trim();
      if (!nameOriginal || /^(ALV|VEROTON|VERO|VEROLLINEN)$/i.test(nameOriginal)) continue;
      const detailSource = this.cleanFinnishReceiptLine(lines[i + 1] || '');
      const detail = detailSource.match(detailRe);
      const quantity = detail ? this.parseFrenchNumber(detail[1]) : 1;
      const unit = detail?.[2]?.toUpperCase() || 'KPL';
      const unitPrice = detail
        ? this.parseFrenchNumber(detail[3])
        : this.parseFrenchNumber(product[2]);
      const total = this.parseFrenchNumber(product[2]);
      const warnings =
        detail && detail[2].toUpperCase() !== detail[4].toUpperCase()
          ? [`L’unité achetée (${detail[2]}) diffère de l’unité de prix (${detail[4]}).`]
          : [];
      const categoryName = this.finnishReceiptCategory(nameOriginal);
      items.push({
        ignored: false,
        label: nameOriginal,
        reference: null,
        supplierProductCode: null,
        nameOriginal,
        nameNormalized: this.normalizeProductText(nameOriginal),
        descriptionOriginal: null,
        quantity,
        unit,
        unitPrice,
        total,
        vatRate: this.extractFinnishReceiptVatRate(lines),
        lotNumber: null,
        bestBeforeDate: null,
        isFreight: false,
        isStockItem: true,
        categoryName,
        lineConfidence: detail ? 0.99 : 0.86,
        warnings,
        sourceText: detail ? `${lines[i]}\n${lines[i + 1]}` : lines[i],
      });
      if (detail) i += 1;
    }
    return items.slice(0, 120);
  }

  private cleanFinnishReceiptLine(value: string) {
    return value
      .replace(/[|#*_`]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private finnishReceiptCategory(value: string) {
    const normalized = this.normalize(value);
    if (
      /\b(appelsiini|banaani|omena|sitruuna|lime|tomaatti|basilika|salaatti|kurkku|peruna|sipuli|vihannes|marja|hedelma)\b/.test(
        normalized,
      )
    )
      return 'Fruits et légumes';
    if (/\b(maito|voi|juusto|kerma|jogurtti|kananmuna)\b/.test(normalized))
      return 'Produits laitiers';
    if (/\b(liha|kana|nauta|sika|makkara|kinkku)\b/.test(normalized)) return 'Viandes';
    if (/\b(kala|lohi|tonnikala|katkarapu)\b/.test(normalized)) return 'Poissons';
    if (/\b(leipa|sampyla|pull|croissant)\b/.test(normalized)) return 'Boulangerie';
    if (/\b(vesi|mehu|limonadi|kahvi|tee|olut|viini)\b/.test(normalized)) return 'Boissons';
    return 'Épicerie';
  }

  private extractFinnishReceiptPaidTotal(lines: string[]) {
    const values = lines
      .map((line) => line.replace(/[|\s]+/g, ' ').trim())
      .map((line) => line.match(/^YHTEENS[ÄA]\s+([0-9]+[,.][0-9]{2})\s*€?$/i)?.[1])
      .filter((value): value is string => Boolean(value))
      .map((value) => this.parseFrenchNumber(value))
      .filter((value): value is number => value != null);
    return values.at(-1) ?? null;
  }

  private extractFinnishReceiptVatTotals(lines: string[]) {
    const start = lines.findIndex(
      (line) => /\bALV\b/i.test(line) && /\bVEROTON\b/i.test(line) && /\bVERO\b/i.test(line),
    );
    if (start < 0) return { totalExcludingTax: null, totalTax: null, totalIncludingTax: null };
    for (const line of lines.slice(start + 1, start + 6).reverse()) {
      const numbers = [...line.matchAll(/[0-9]+[,.][0-9]{2}/g)]
        .map((match) => this.parseFrenchNumber(match[0]))
        .filter((value): value is number => value != null);
      if (numbers.length >= 3) {
        const [totalExcludingTax, totalTax, totalIncludingTax] = numbers.slice(-3);
        return { totalExcludingTax, totalTax, totalIncludingTax };
      }
    }
    return { totalExcludingTax: null, totalTax: null, totalIncludingTax: null };
  }

  private extractFinnishReceiptVatRate(lines: string[]) {
    for (const line of lines) {
      const match = line.match(/\b([0-9]+[,.][0-9]{1,2})\s*%/);
      if (match) return this.parseFrenchNumber(match[1]);
    }
    return null;
  }

  private extractFinnishReceiptDate(lines: string[], text: string) {
    const header = lines.find(
      (line) =>
        /\b\d{1,2}[.:]\d{2}\b/.test(line) && /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(line),
    );
    const value = header?.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/)?.[1];
    return value ? this.normalizeDate(value) : this.extractDocumentDate(text);
  }

  private extractTingstadFinnishInvoice(text: string, lines: string[]): BusinessExtraction {
    const items = this.extractTingstadLines(lines);
    const invoiceDate = this.extractDate(
      text,
      /Lasku päiväys[\s\S]{0,120}?([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{4})/i,
    );
    const invoiceNumber =
      this.extractAfter(text, /Lasku päiväys[\s\S]{0,160}?\bLasku\s+([0-9]{5,})/i, 1) ||
      this.extractAfter(text, /\bLasku\s*\n\s*([0-9]{5,})/i, 1);
    const dueDate = this.extractDate(
      text,
      /Maksutapa\s+Eräpäivä[\s\S]{0,80}?\bLasku\s+([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{4})/i,
    );
    const orderRequester = text.match(/tingstad\.se\s+(.+?)\s+([0-9]{6,})\s+([^\n]+)/i);
    const customer = this.extractTingstadCustomer(lines, text);
    const delivery = this.extractTingstadDeliveryTerms(lines);
    const totals = this.extractTingstadTotals(text, items);
    const computedTotal = this.roundMoney(items.reduce((sum, item) => sum + (item.total ?? 0), 0));
    const delta =
      totals.totalIncludingTax == null
        ? null
        : this.roundMoney(computedTotal - totals.totalIncludingTax);
    const warnings =
      delta != null && Math.abs(delta) > 0.05
        ? [
            `La somme des lignes (${computedTotal.toFixed(2)} EUR) ne correspond pas au total facture (${totals.totalIncludingTax.toFixed(2)} EUR).`,
          ]
        : [];

    const extraction: BusinessExtraction = {
      documentType: 'invoice',
      supplier: {
        name: 'AB Tingstad papper',
        vatNumber: this.extractAfter(text, /\bALV\s+(SE[0-9]+)/i, 1),
        address: 'BOX 13013, 402 51 GÖTEBORG',
      },
      supplierName: 'AB Tingstad papper',
      customer,
      document: {
        invoiceNumber,
        deliveryNoteNumber: null,
        purchaseOrderNumber: orderRequester?.[2]?.trim() || null,
        receiptNumber: null,
        documentDate: invoiceDate,
        deliveryDate: null,
      },
      invoice: {
        invoiceNumber,
        invoiceDate,
        dueDate,
        paymentMethod: this.extractAfter(
          text,
          /Maksutapa\s+Eräpäivä[\s\S]{0,60}?\n\s*([^\s\n]+)/i,
          1,
        ),
        orderNumber: orderRequester?.[2]?.trim() || null,
        currency: 'EUR',
        netTotal: totals.totalExcludingTax,
        vatTotal: totals.totalTax,
        rounding: totals.rounding ?? null,
        grandTotal: totals.totalIncludingTax,
        iban:
          this.extractAfter(text, /\bIBAN:\s*([A-Z]{2}[A-Z0-9\s]+)/i, 1)?.replace(/\s+/g, ' ') ||
          null,
        bic: this.extractAfter(text, /\bBIC:\s*([A-Z0-9]+)/i, 1),
        deliveryTerms: delivery.deliveryTerms,
        deliveryMethod: delivery.deliveryMethod,
        lateInterestRate: this.extractMoney(text, /Viivästyskorko\s*([0-9]+(?:[.,][0-9]+)?)\s*%/i),
        requesterName: orderRequester?.[3]?.replace(/\s+/g, ' ').trim() || null,
      },
      totals,
      lines: items,
      items,
      confidence: {
        documentType: 1,
        header: invoiceNumber && invoiceDate && dueDate ? 0.99 : 0.82,
        items: items.length ? 1 : 0.2,
        totals:
          totals.totalIncludingTax != null && (delta == null || Math.abs(delta) <= 0.05) ? 1 : 0.65,
      },
      aiAnalysis: {
        provider: 'internal',
        model: 'finnish-tingstad-parser',
        status: 'applied',
        confidence: 0.99,
        warnings,
        suggestedActions: items.some((item) => item.isFreight)
          ? ['La ligne RAHTI est classée en frais de livraison et ignorée pour le stock.']
          : [],
        totalsCheck: {
          computedTotal,
          documentTotal: totals.totalIncludingTax,
          delta,
          status:
            delta == null ? 'missing_document_total' : Math.abs(delta) <= 0.05 ? 'ok' : 'mismatch',
        },
      },
      warnings,
      suggestedActions: items.some((item) => item.isFreight)
        ? ['Vérifier que les frais de livraison restent exclus de la réception stock.']
        : [],
      documentConfidence: 0.99,
    };
    return extraction;
  }

  private extractTingstadCustomer(lines: string[], text: string) {
    const customerLine = lines.find(
      (line) => /THE FRENCH CAF/i.test(line) && /\b[0-9]{4,}\b/.test(line),
    );
    const match = customerLine?.match(/^(THE FRENCH CAF[ÉE] OY)\s+([0-9]{4,})\s+(.+)$/i);
    return {
      name: match?.[3]?.trim() || 'The French Café Oy',
      customerNumber:
        match?.[2]?.trim() || this.extractAfter(text, /Asiakasnumero[\s\S]{0,100}?([0-9]{4,})/i, 1),
      vatNumber: this.extractAfter(text, /\b(FI[0-9]{8})\b/i, 1),
      deliveryAddress: this.extractTingstadDeliveryAddress(lines),
    };
  }

  private extractTingstadDeliveryAddress(lines: string[]) {
    const start = lines.findIndex((line) => /^THE FRENCH CAF/i.test(line));
    if (start < 0) return null;
    const addressLines: string[] = [];
    for (const line of lines.slice(start, start + 8)) {
      if (/^Toimitusehdot\b/i.test(line) || /\bFI[0-9]{8}\b/i.test(line)) break;
      const clean = line
        .replace(/\s+[0-9]{4,}\s+The French Caf.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (clean) addressLines.push(clean);
      if (/^[0-9]{5}\s+/.test(clean)) break;
    }
    return addressLines.join(', ') || null;
  }

  private extractTingstadDeliveryTerms(lines: string[]) {
    const idx = lines.findIndex((line) => /^Toimitusehdot\b/i.test(line));
    const valueLine =
      idx >= 0
        ? lines.slice(idx + 1).find((line) => line.trim() && !/^Maksutapa\b/i.test(line))
        : null;
    const parts =
      valueLine
        ?.split(/\s{2,}/)
        .map((part) => part.trim())
        .filter(Boolean) ?? [];
    return {
      deliveryTerms: parts[0] || null,
      deliveryMethod: parts[1] || null,
    };
  }

  private extractTingstadTotals(text: string, items: ExtractedLine[]) {
    const block = text.match(/Yhteensä netto[\s\S]*?(?=IBAN:|AB Tingstad|$)/i)?.[0] || '';
    const grandTotal =
      this.parseFrenchNumber(
        block.match(/Loppusumma[\s\S]{0,140}?([0-9]+,[0-9]{2})\s*\n\s*hintaan/i)?.[1] || '',
      ) ??
      this.parseFrenchNumber(block.match(/Loppusumma[\s\S]{0,80}?([0-9]+,[0-9]{2})/i)?.[1] || '');
    const afterHintaan = block.match(/hintaan\s*\n\s*([^\n]+)/i)?.[1] || '';
    const values = [...afterHintaan.matchAll(/[0-9]+,[0-9]{2}/g)]
      .map((match) => this.parseFrenchNumber(match[0]))
      .filter((value): value is number => value != null);
    const computedTotal = this.roundMoney(items.reduce((sum, item) => sum + (item.total ?? 0), 0));
    return {
      totalExcludingTax: values[0] ?? grandTotal ?? computedTotal,
      totalTax: values.length >= 2 ? values[values.length - 2] : 0,
      totalIncludingTax: grandTotal ?? computedTotal,
      rounding: values.length >= 1 ? values[values.length - 1] : null,
    };
  }

  private extractTingstadLines(lines: string[]) {
    const items: ExtractedLine[] = [];
    const productLineRe =
      /^\s*([0-9]{4,})\s+(.+?)\s+([0-9]+[,.][0-9]{2})\s*([A-Za-zÅÄÖåäö]{2,6})\s+([0-9]+[,.][0-9]{2})\s+([0-9]+[,.][0-9]{2})\s*$/;
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(productLineRe);
      if (!match) continue;
      const [, code, rawName, quantityRaw, unitRaw, unitPriceRaw, totalRaw] = match;
      const description: string[] = [];
      let originCountry: string | null = null;
      let statisticalCode: string | null = null;
      let netWeight: number | null = null;
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const next = lines[j];
        if (
          productLineRe.test(next) ||
          /^(Pakkaukset|Yhteensä netto|AB Tingstad papper)\b/i.test(next)
        )
          break;
        if (/Alkuperämaa/i.test(next)) {
          const originLine = lines[j + 1]?.trim() || '';
          const originMatch = originLine.match(
            /^([A-Z]{2})(?:\s+\[?([A-Z0-9]+)\]?)?\s+([0-9]+(?:[,.][0-9]+)?)$/,
          );
          if (originMatch) {
            originCountry = originMatch[1];
            statisticalCode = originMatch[2] || null;
            netWeight = this.parseFrenchNumber(originMatch[3]);
            j += 1;
          }
          continue;
        }
        const clean = next.replace(/\s+/g, ' ').trim();
        if (clean && !/^(Määrä|Nimike|Nimi)\b/i.test(clean)) description.push(clean);
      }
      const nameOriginal = rawName.replace(/\s+/g, ' ').trim();
      const isFreight = code === '5555' || /\bRAHTI\b/i.test(nameOriginal);
      items.push({
        ignored: isFreight,
        label: nameOriginal,
        reference: code,
        supplierProductCode: code,
        nameOriginal,
        nameNormalized: this.normalizeProductText(nameOriginal),
        descriptionOriginal: description.join(' ') || null,
        quantity: this.parseFrenchNumber(quantityRaw),
        unit: unitRaw.toLowerCase(),
        unitPrice: this.parseFrenchNumber(unitPriceRaw),
        total: this.parseFrenchNumber(totalRaw),
        vatRate: 0,
        lotNumber: null,
        bestBeforeDate: null,
        originCountry,
        statisticalCode,
        netWeight,
        isFreight,
        isStockItem: !isFreight,
        categoryName: isFreight ? 'Frais de livraison' : 'Emballages',
        lineStatus: isFreight ? 'non_product_line' : undefined,
        lineConfidence: 1,
        warnings: isFreight ? ['Ligne RAHTI classée en frais de livraison, non stockable.'] : [],
        sourceText: [lines[i], ...description].join('\n'),
      });
      i = Math.max(i, j - 1);
    }
    return items;
  }

  private extractKesproOrder(text: string, lines: string[]): BusinessExtraction {
    const orderNumber = this.extractAfter(text, /Order number\s+([0-9]+)/i, 1);
    const orderDate = this.extractDate(
      text,
      /Order date:\s+[A-Za-z]+\s+([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{4})/i,
    );
    const deliveryDate =
      this.extractDate(
        text,
        /Selected delivery date\s+[A-Za-z]+\s+([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{4})/i,
      ) || this.extractDate(text, /Delivery date\s+([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{4})/i);
    const deliveryAddress = this.extractAfter(text, /Delivery address\s+(.+)/i, 1);
    const company = this.extractAfter(text, /Company\s+(.+?)\s+Order type/i, 1);
    const customerNumber = this.extractAfter(text, /Customer number\s+([0-9]+)/i, 1);
    const orderer = this.extractAfter(text, /Orderer\s+(.+?)\s+Your reference/i, 1);
    const items = this.extractKesproLines(lines);
    const totals = {
      totalExcludingTax: this.extractMoney(text, /Without tax\s*([0-9]+,[0-9]{2})\s*€/i),
      totalTax: this.extractMoney(text, /Total VAT\s*([0-9]+,[0-9]{2})\s*€/i),
      totalIncludingTax: this.extractMoney(text, /Total\s*([0-9]+,[0-9]{2})\s*€/i),
    };
    const computedTotal = this.roundMoney(items.reduce((sum, item) => sum + (item.total ?? 0), 0));
    const documentTotal = totals.totalIncludingTax;
    const delta = documentTotal == null ? null : this.roundMoney(computedTotal - documentTotal);
    const warnings =
      delta != null && Math.abs(delta) > 0.05
        ? [
            `La somme des lignes commande (${computedTotal.toFixed(2)} EUR) ne correspond pas au total (${documentTotal!.toFixed(2)} EUR), probablement à cause de la TVA incluse dans le total final.`,
          ]
        : [];

    return {
      documentType: /confirmed quantity/i.test(text) ? 'order_confirmation' : 'supplier_order',
      supplier: { name: 'Kespro' },
      supplierName: 'Kespro',
      customer: {
        name: company || null,
        customerNumber,
        deliveryAddress,
      },
      document: {
        invoiceNumber: null,
        deliveryNoteNumber: null,
        purchaseOrderNumber: orderNumber,
        receiptNumber: null,
        documentDate: orderDate,
        deliveryDate,
      },
      order: {
        orderNumber,
        orderDate,
        selectedDeliveryDate: deliveryDate,
        deliveryAddress,
        company,
        customerNumber,
        orderer,
      },
      totals,
      lines: items,
      items,
      confidence: {
        documentType: 1,
        header: orderNumber && orderDate && deliveryDate ? 0.99 : 0.82,
        items: items.length ? 0.99 : 0.2,
        totals: totals.totalIncludingTax != null ? 0.95 : 0.5,
      },
      aiAnalysis: {
        provider: 'internal',
        model: 'kespro-order-history-parser',
        status: 'applied',
        confidence: 0.98,
        warnings,
        suggestedActions: [
          'Document classé comme commande/confirmation fournisseur, pas comme facture.',
        ],
        totalsCheck: {
          computedTotal,
          documentTotal: totals.totalIncludingTax,
          delta,
          status:
            documentTotal == null || delta == null
              ? 'missing_document_total'
              : Math.abs(delta) <= Math.max(0.05, documentTotal * 0.3)
                ? 'order_total_includes_vat'
                : 'mismatch',
        },
      },
      warnings,
      suggestedActions: [
        'Valider les lignes confirmées avant réception stock si la commande sert de base de réception.',
      ],
      documentConfidence: 0.98,
    };
  }

  private extractKesproLines(lines: string[]) {
    const items: ExtractedLine[] = [];
    const confirmedRe =
      /^\s*(.+?)\s+([0-9]+,[0-9]{2})\s*€\s*\/\s*([A-Z]{2,5})\s+([0-9]+(?:[,.][0-9]+)?)\s+Confirmed quantity\s*\/\s*ME\s+([0-9]+,[0-9]{2})\s*€/i;
    const pendingPriceRe =
      /^\s*([0-9]+,[0-9]{2})\s*€\s*\/\s*([A-Z]{2,5})\s+([0-9]+(?:[,.][0-9]+)?)\s+Confirmed quantity\s*\/\s*ME\s+([0-9]+,[0-9]{2})\s*€/i;
    let categoryName: string | null = null;
    let pendingPrice: {
      unitPrice: number | null;
      unit: string;
      quantity: number | null;
      total: number | null;
      source: string;
    } | null = null;

    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      const clean = this.cleanKesproText(raw);
      const nextCategory = this.kesproCategoryName(clean);
      if (nextCategory) {
        categoryName = nextCategory;
        continue;
      }
      if (this.isKesproFooterLine(clean) || /Replaced quantity/i.test(clean)) continue;
      const pendingMatch = raw.match(pendingPriceRe);
      if (pendingMatch && !confirmedRe.test(raw)) {
        pendingPrice = {
          unitPrice: this.parseFrenchNumber(pendingMatch[1]),
          unit: pendingMatch[2],
          quantity: this.parseFrenchNumber(pendingMatch[3]),
          total: this.parseFrenchNumber(pendingMatch[4]),
          source: raw,
        };
        continue;
      }

      const confirmedMatch = raw.match(confirmedRe);
      if (confirmedMatch) {
        const continuation = this.collectKesproContinuation(
          lines,
          i + 1,
          confirmedRe,
          pendingPriceRe,
        );
        const nameOriginal = [
          this.cleanKesproProductName(confirmedMatch[1]),
          continuation.nameContinuation,
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        items.push(
          this.kesproLine({
            nameOriginal,
            categoryName,
            quantity: this.parseFrenchNumber(confirmedMatch[4]),
            unit: confirmedMatch[3],
            unitPrice: this.parseFrenchNumber(confirmedMatch[2]),
            total: this.parseFrenchNumber(confirmedMatch[5]),
            packageDescription: continuation.packageDescription,
            sourceText: [raw, ...continuation.sourceLines].join('\n'),
          }),
        );
        i = continuation.nextIndex - 1;
        continue;
      }

      if (pendingPrice && clean && /[A-Za-zÀ-ÿ]/.test(clean) && !this.isKesproHeaderLine(clean)) {
        const continuation = this.collectKesproContinuation(
          lines,
          i + 1,
          confirmedRe,
          pendingPriceRe,
        );
        const nameOriginal = [this.cleanKesproProductName(clean), continuation.nameContinuation]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (nameOriginal) {
          items.push(
            this.kesproLine({
              nameOriginal,
              categoryName,
              quantity: pendingPrice.quantity,
              unit: pendingPrice.unit,
              unitPrice: pendingPrice.unitPrice,
              total: pendingPrice.total,
              packageDescription: continuation.packageDescription,
              sourceText: [pendingPrice.source, raw, ...continuation.sourceLines].join('\n'),
            }),
          );
          pendingPrice = null;
          i = continuation.nextIndex - 1;
        }
      }
    }
    return items;
  }

  private collectKesproContinuation(
    lines: string[],
    start: number,
    confirmedRe: RegExp,
    pendingPriceRe: RegExp,
  ) {
    const sourceLines: string[] = [];
    const nameParts: string[] = [];
    let packageDescription: string | null = null;
    let i = start;
    for (; i < lines.length && i < start + 8; i += 1) {
      const raw = lines[i];
      const clean = this.cleanKesproText(raw);
      if (!clean) continue;
      if (
        confirmedRe.test(raw) ||
        pendingPriceRe.test(raw) ||
        this.kesproCategoryName(clean) ||
        this.isKesproFooterLine(clean)
      )
        break;
      sourceLines.push(raw);
      const packageMatch = clean.match(
        /^([0-9]+(?:[,.][0-9]+)?)\s+([A-Z]{2,5})(?:\s+\(([^)]+)\))?$/,
      );
      if (packageMatch) {
        packageDescription = clean;
        i += 1;
        break;
      }
      const beforeVat = clean.split(/VAT\s*0\s*%/i)[0]?.trim() || '';
      const namePart = this.cleanKesproProductName(beforeVat);
      if (namePart && /[A-Za-zÀ-ÿ]/.test(namePart) && !/^units$/i.test(namePart))
        nameParts.push(namePart);
    }
    return {
      nameContinuation: nameParts.join(' '),
      packageDescription,
      sourceLines,
      nextIndex: i,
    };
  }

  private kesproLine(input: {
    nameOriginal: string;
    categoryName: string | null;
    quantity: number | null;
    unit: string;
    unitPrice: number | null;
    total: number | null;
    packageDescription: string | null;
    sourceText: string;
  }) {
    const packageDescription = this.combinePackageDescriptions(
      this.packageDescriptionFromName(input.nameOriginal),
      input.packageDescription ? `Colis fournisseur: ${input.packageDescription}` : null,
    );
    return {
      ignored: false,
      label: input.nameOriginal,
      reference: null,
      supplierProductCode: null,
      nameOriginal: input.nameOriginal,
      nameNormalized: this.normalizeProductText(input.nameOriginal),
      descriptionOriginal: packageDescription,
      quantity: input.quantity,
      unit: input.unit,
      unitPrice: input.unitPrice,
      total: input.total,
      vatRate: 0,
      lotNumber: null,
      bestBeforeDate: null,
      originCountry: null,
      statisticalCode: null,
      netWeight: null,
      isFreight: false,
      isStockItem: true,
      packageDescription,
      categoryName: input.categoryName,
      lineConfidence: 0.98,
      warnings: [],
      sourceText: input.sourceText,
    } satisfies ExtractedLine;
  }

  private cleanKesproText(value: string) {
    return value
      .replace(/[\uE000-\uF8FF]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanKesproProductName(value: string) {
    return this.cleanKesproText(value)
      .replace(/\bProduct replaced\b/gi, ' ')
      .replace(/\bVAT\s*0\s*%\b.*$/i, ' ')
      .replace(/\bunits\b.*$/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private packageDescriptionFromName(value: string) {
    const clean = this.cleanKesproText(value);
    const matches = [
      ...clean.matchAll(/(?:^|[\s/(-])([0-9]+(?:[,.][0-9]+)?)\s*(kg|g|l|ml|cl|dl)\b/gi),
    ]
      .map((match) => {
        const quantity = this.parseFrenchNumber(match[1]);
        const unit = match[2];
        return quantity && quantity > 0
          ? `${this.formatCompactNumber(quantity)} ${this.normalizePackageUnit(unit)}`
          : null;
      })
      .filter((match): match is string => Boolean(match));
    const first = matches.find((match) => !/^1\s*(g|ml)$/i.test(match));
    return first ? `Conditionnement produit: ${first} par unité` : null;
  }

  private combinePackageDescriptions(...parts: Array<string | null | undefined>) {
    return parts.filter(Boolean).join('; ') || null;
  }

  private formatCompactNumber(value: number) {
    return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  }

  private normalizePackageUnit(unit: string) {
    const normalized = unit.toLowerCase();
    if (normalized === 'l') return 'L';
    return normalized;
  }

  private kesproCategoryName(cleanLine: string) {
    const categories = [
      'Bread & pastry',
      'Seasoning & baking',
      'Dairy products & eggs',
      'Fruits & vegetables',
      'Cleaning & tissue paper',
      'Frozen food',
      'Drinks',
      'Dry foods & canned food',
      'Kertakäyttöastiat & kattaus',
      'Sweets & snacks',
      'Meat, fresh, frozen and plant-based proteins',
    ];
    return (
      categories.find((category) => cleanLine === category || cleanLine.endsWith(` ${category}`)) ||
      null
    );
  }

  private isKesproHeaderLine(cleanLine: string) {
    return /^(Order information|Delivery information|Order number|Company|Customer number|Orderer|Delivery date|Product|Quantity|Unit price|date|products?)\b/i.test(
      cleanLine,
    );
  }

  private isKesproFooterLine(cleanLine: string) {
    return (
      !cleanLine ||
      /^(Tax breakdown|Tax base|VAT %|Price excluding tax|Descriptions for product labelling|Without tax|Total VAT|Total |The price and availability|Direct delivery|Stock product|24h|On-demand|Frozen product|https:\/\/|Page [0-9])/i.test(
        cleanLine,
      ) ||
      /^[0-9]+,[0-9]{2}\s*€\s+[0-9.]+\s*%/i.test(cleanLine)
    );
  }

  private extractLines(lines: string[]) {
    const tableRows = this.extractTableRows(lines);
    const productTableRows = tableRows.filter(
      (row) => row.labelSource && row.quantity != null && /[a-zA-ZÀ-ÿ]/.test(row.labelSource),
    );
    const plainRows: ExtractedLineRow[] = productTableRows.length
      ? []
      : lines.filter((line) => !line.includes('|')).map((source) => ({ source }));
    const candidates = [...productTableRows, ...plainRows].filter(
      (row) => !EXCLUDED_LINE_RE.test(row.source) && /\d/.test(row.source) && row.source.length > 4,
    );
    const seen = new Set<string>();
    return candidates
      .map((row) => {
        const line = row.source;
        const cells = line
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean);
        const source = cells.length >= 3 ? cells.join(' ') : line;
        const labelSource = row.labelSource || this.bestLabelSource(cells, source);
        const numbers = [...source.matchAll(/(?:^|\s)([0-9]+(?:[.,][0-9]{1,4})?)(?:\s|€|$)/g)]
          .map((match) => this.parseFrenchNumber(match[1]))
          .filter((value): value is number => value != null);
        const quantityMatch = source.match(
          /([0-9]+(?:[.,][0-9]{1,3})?)\s*(kg|g|l|ml|pi[eè]ce?s?|pcs?|cartons?|caisse?s?|barquettes?|colis|u)\b/i,
        );
        const dateMatch = source.match(/([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/);
        const unitPrice = row.labelSource
          ? (row.unitPrice ?? null)
          : (row.unitPrice ?? (numbers.length >= 2 ? numbers[numbers.length - 2] : null));
        const total = row.labelSource
          ? (row.total ?? null)
          : (row.total ?? (numbers.length >= 1 ? numbers[numbers.length - 1] : null));
        const quantity =
          row.quantity ??
          (quantityMatch ? this.parseFrenchNumber(quantityMatch[1]) : (numbers[0] ?? null));
        const unit = row.unit ?? quantityMatch?.[2] ?? null;
        const label = (
          row.labelSource
            ? labelSource.replace(/[#|]/g, ' ')
            : labelSource
                .replace(/[#|]/g, ' ')
                .replace(
                  /[0-9]+(?:[.,][0-9]+)?\s*(kg|g|l|ml|pi[eè]ce?s?|pcs?|cartons?|caisse?s?|barquettes?|colis|u)\b/gi,
                  ' ',
                )
                .replace(/[0-9\s.,]+€?/g, ' ')
                .replace(/\b(ref|r[eé]f|reference|lot)\s*[:#-]?\s*[A-Z0-9-_/]+\b/gi, ' ')
        )
          .replace(/\s+/g, ' ')
          .trim();
        if (!label || label.length < 3) return null;
        const dedupeKey = this.normalize(`${label} ${quantity ?? ''} ${total ?? ''}`);
        if (seen.has(dedupeKey)) return null;
        seen.add(dedupeKey);
        return {
          label: label || null,
          reference:
            row.reference ??
            this.extractAfter(source, /(ref|réf|reference)\s*[:#-]?\s*([A-Z0-9-_/]+)/i, 2),
          quantity,
          unit,
          unitPrice,
          total,
          vatRate: this.extractMoney(source, /([0-9]+(?:[.,][0-9]+)?)\s*%/i),
          lotNumber:
            row.lotNumber ?? this.extractAfter(source, /(lot)\s*[:#-]?\s*([A-Z0-9-_/]+)/i, 2),
          bestBeforeDate:
            row.bestBeforeDate ?? (dateMatch ? this.normalizeDate(dateMatch[1]) : null),
        };
      })
      .filter((line): line is ExtractedLine => Boolean(line?.label))
      .slice(0, 80);
  }

  private extractTableRows(lines: string[]) {
    const rows: ExtractedLineRow[] = [];
    let headers: string[] = [];
    for (const line of lines) {
      if (!line.includes('|')) continue;
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (cells.length < 3 || cells.every((cell) => /^[-: ]+$/.test(cell))) continue;
      if (
        cells.some((cell) => LINE_HEADER_RE.test(cell)) &&
        cells.filter((cell) => /\d/.test(cell)).length <= 1
      ) {
        headers = cells.map((cell) => this.normalize(cell));
        continue;
      }
      const source = cells.join(' ');
      if (
        /^\d+\/?$/.test(cells[0]) &&
        /^[A-Z0-9-_/]{3,}$/.test(cells[1] || '') &&
        /[a-zA-ZÀ-ÿ]/.test(cells[2] || '')
      ) {
        const delivered = this.parseQuantityAndUnit(cells[3]);
        const billed = this.parseQuantityAndUnit(cells[4]);
        const priceIndex = billed.unit ? 5 : 6;
        rows.push({
          source,
          labelSource: cells[2],
          reference: cells[1],
          quantity: billed.quantity ?? delivered.quantity,
          unit: billed.unit || (/^[A-Za-zÀ-ÿ]+$/.test(cells[5] || '') ? cells[5] : delivered.unit),
          unitPrice: this.parseFrenchNumber(cells[priceIndex] || ''),
          total: this.parseFrenchNumber(cells[cells.length - 1] || ''),
        });
        continue;
      }
      const byHeader = (patterns: RegExp[]) => {
        const idx = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
        return idx >= 0 ? cells[idx] : undefined;
      };
      const labelSource =
        byHeader([/designation|libelle|article|produit/]) || this.bestLabelSource(cells, source);
      const quantityCell = byHeader([/quantite|qte|qt/]);
      const priceCell = byHeader([/prix|pu|p u/]);
      const totalCell = byHeader([/montant|total|net/]);
      const quantityMatch = quantityCell?.match(/([0-9]+(?:[.,][0-9]{1,3})?)\s*([a-zA-Zéè]+)?/);
      if (
        /article item|article/.test(headers[0] || '') &&
        /designation|description/.test(headers.join(' ')) &&
        /^\d{4,}$/.test(cells[0] || '')
      ) {
        const shippedCell = cells[cells.length - 1] || '';
        const shipped = shippedCell.match(/([0-9]+(?:[.,][0-9]{1,3})?)/);
        const lotParts = (cells[3] || '').match(
          /^([A-Z0-9-_/]+)?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})?/i,
        );
        rows.push({
          source,
          labelSource: cells[2],
          reference: cells[0],
          quantity: shipped ? this.parseFrenchNumber(shipped[1]) : null,
          unit: 'PU',
          lotNumber: lotParts?.[1] || null,
          bestBeforeDate: lotParts?.[2] ? this.normalizeDate(lotParts[2]) : null,
        });
        continue;
      }
      rows.push({
        source,
        labelSource,
        reference: byHeader([/code art|code|reference|ref/]),
        quantity: quantityMatch ? this.parseFrenchNumber(quantityMatch[1]) : null,
        unit: quantityMatch?.[2] || byHeader([/unit|unite|uv|uc/]) || null,
        unitPrice: priceCell ? this.parseFrenchNumber(priceCell) : null,
        total: totalCell ? this.parseFrenchNumber(totalCell) : null,
      });
    }
    return rows;
  }

  private parseQuantityAndUnit(value?: string) {
    const match = value?.match(/([0-9]+(?:[.,][0-9]{1,3})?)\s*([a-zA-ZÀ-ÿ]+)?/);
    return { quantity: match ? this.parseFrenchNumber(match[1]) : null, unit: match?.[2] || null };
  }

  private bestLabelSource(cells: string[], fallback: string) {
    const usefulCells = cells.filter((cell) => {
      const normalized = this.normalize(cell);
      if (!normalized || LINE_HEADER_RE.test(cell) || EXCLUDED_LINE_RE.test(cell)) return false;
      if (/^[0-9\s.,€%/-]+$/.test(cell)) return false;
      return /[a-zA-ZÀ-ÿ]/.test(cell);
    });
    return usefulCells.sort((a, b) => b.length - a.length)[0] || fallback;
  }

  private async matchLines(
    organizationId: string,
    lines: ExtractedLine[],
    supplierId?: string | null,
  ) {
    const products = await this.prisma.product.findMany({
      where: { organizationId, isArchived: false },
      include: { unit: true, category: true, primarySupplier: true },
    });
    return lines.map((line) => {
      if (
        (line as any).ignored ||
        (line as any).isFreight ||
        (line as any).isStockItem === false ||
        (line as any).lineStatus === 'non_product_line'
      ) {
        return {
          ...line,
          ignored: true,
          productId: null,
          productName: null,
          unitId: null,
          matchedUnitSymbol: null,
          matchingScore: 0,
          matchingStatus: StockReceptionLineMatchingStatus.NOT_FOUND,
          lineStatus: 'non_product_line',
          lineConfidence: (line as any).lineConfidence ?? 1,
          warnings: (line as any).warnings ?? ['Ligne non stockable ignorée pour la réception.'],
          sourceText: (line as any).sourceText ?? null,
          productCandidates: [],
        };
      }
      const ranked = products
        .map((product) => {
          const aiProductId = (line as any).productId;
          const score =
            aiProductId && product.id === aiProductId
              ? Math.max(0.9, this.numberOrNull((line as any).lineConfidence) ?? 0)
              : this.productMatchScore(line, product, supplierId);
          return { product, score };
        })
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const status =
        !best || best.score < 0.58
          ? StockReceptionLineMatchingStatus.NOT_FOUND
          : best.score >= 0.84
            ? StockReceptionLineMatchingStatus.RECOGNIZED
            : StockReceptionLineMatchingStatus.NEEDS_REVIEW;
      return {
        ...line,
        productId: status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.product.id,
        productName:
          status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.product.name,
        unitId: status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.product.unitId,
        matchedUnitSymbol:
          status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.product.unit.symbol,
        matchingScore: best?.score ?? 0,
        matchingStatus: status,
        lineStatus:
          (line as any).lineStatus ??
          (status === StockReceptionLineMatchingStatus.RECOGNIZED
            ? 'ready'
            : status === StockReceptionLineMatchingStatus.NOT_FOUND
              ? 'missing_product'
              : 'needs_review'),
        lineConfidence: (line as any).lineConfidence ?? best?.score ?? 0,
        warnings: (line as any).warnings ?? [],
        sourceText: (line as any).sourceText ?? null,
        productCandidates: ranked
          .slice(0, 8)
          .filter((candidate) => candidate.score >= 0.38)
          .map((candidate) => ({
            id: candidate.product.id,
            name: candidate.product.name,
            sku: candidate.product.sku,
            categoryId: candidate.product.categoryId,
            categoryName: candidate.product.category?.name,
            unitId: candidate.product.unitId,
            unitSymbol: candidate.product.unit.symbol,
            supplierId: candidate.product.primarySupplierId,
            supplierName: candidate.product.primarySupplier?.name,
            score: candidate.score,
          })),
      };
    });
  }

  private productMatchScore(
    line: ExtractedLine,
    product: { name: string; sku?: string | null; primarySupplierId?: string | null },
    supplierId?: string | null,
  ) {
    const label = line.label || '';
    const cleanedLabel = this.normalizeProductText(label);
    const cleanedProduct = this.normalizeProductText(product.name);
    const base = this.matchScore(
      cleanedLabel || label,
      cleanedProduct || product.name,
      product.sku || undefined,
    );
    const tokenScore = this.tokenSimilarity(cleanedLabel, cleanedProduct);
    const sku = product.sku ? this.normalize(product.sku) : '';
    const reference = line.reference ? this.normalize(line.reference) : '';
    let score = Math.max(base, tokenScore);
    if (sku && reference && sku === reference) score = Math.max(score, 0.99);
    else if (sku && reference && (sku.includes(reference) || reference.includes(sku)))
      score = Math.max(score, 0.94);
    else if (sku && this.normalize(label).includes(sku)) score = Math.max(score, 0.94);
    if (supplierId && product.primarySupplierId === supplierId) score += 0.04;
    if (line.unit && cleanedProduct.includes(this.normalizeProductUnit(line.unit))) score += 0.02;
    return Math.min(1, score);
  }

  private async matchSupplier(
    organizationId: string,
    extractedName: string | null,
    lines: string[],
    identifiers: Array<{ kind: string; value: string }> = [],
  ) {
    const cleanIdentifiers = this.cleanSupplierIdentifiers(identifiers);
    const [suppliers, knownIdentifiers] = await Promise.all([
      this.prisma.supplier.findMany({
        where: { organizationId, isArchived: false },
      }),
      cleanIdentifiers.length
        ? this.prisma.supplierOcrIdentifier.findMany({
            where: {
              organizationId,
              supplier: { isArchived: false },
              OR: cleanIdentifiers.map((identifier) => ({
                kind: identifier.kind,
                normalizedValue: this.normalizeSupplierIdentifier(identifier.value),
              })),
            },
          })
        : Promise.resolve([]),
    ]);
    const identifierSupplierIds = new Set(
      knownIdentifiers.map((identifier) => identifier.supplierId),
    );
    const supplierCandidates = this.supplierCandidates(extractedName, lines);
    const ranked = suppliers
      .map((supplier) => {
        const score = identifierSupplierIds.has(supplier.id)
          ? 1
          : Math.max(
              ...supplierCandidates.map((candidate) => this.matchScore(candidate, supplier.name)),
              0,
            );
        return { supplier, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const status =
      !best || best.score < 0.68
        ? StockReceptionLineMatchingStatus.NOT_FOUND
        : best.score >= 0.86
          ? StockReceptionLineMatchingStatus.RECOGNIZED
          : StockReceptionLineMatchingStatus.NEEDS_REVIEW;
    return {
      supplierId: status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.supplier.id,
      supplierName:
        status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.supplier.name,
      matchingStatus: status,
      matchingScore: best?.score ?? 0,
      candidates: ranked
        .slice(0, 3)
        .filter((candidate) => candidate.score >= 0.45)
        .map((candidate) => ({
          id: candidate.supplier.id,
          name: candidate.supplier.name,
          score: candidate.score,
        })),
    };
  }

  private matchScore(label: string, productName: string, sku?: string) {
    const a = this.normalize(label);
    const b = this.normalize(productName);
    if (!a || !b) return 0;
    if (sku && a.includes(this.normalize(sku))) return 0.95;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    const ta = new Set(a.split(' ').filter((token) => token.length > 2));
    const tb = new Set(b.split(' ').filter((token) => token.length > 2));
    const common = [...ta].filter((token) => tb.has(token)).length;
    const dice = common ? (2 * common) / (ta.size + tb.size) : 0;
    return Math.max(dice, 1 - this.levenshtein(a, b) / Math.max(a.length, b.length, 1));
  }

  private tokenSimilarity(a: string, b: string) {
    const ta = new Set(this.productTokens(a));
    const tb = new Set(this.productTokens(b));
    if (!ta.size || !tb.size) return 0;
    const common = [...ta].filter((token) => tb.has(token)).length;
    const coverage = common / Math.min(ta.size, tb.size);
    const dice = (2 * common) / (ta.size + tb.size);
    return Math.max(dice, coverage * 0.92);
  }

  private normalizeProductText(value: string) {
    return this.normalize(value)
      .replace(/\bappelsiini\b/g, 'orange')
      .replace(/\bbanaani\b/g, 'banane')
      .replace(/\bbasilika\b/g, 'basilic')
      .replace(/\btomaatti\b/g, 'tomate')
      .replace(/\bkurkku\b/g, 'concombre')
      .replace(/\bperuna\b/g, 'pomme de terre')
      .replace(/\bsipuli\b/g, 'oignon')
      .replace(/\bomena\b/g, 'pomme')
      .replace(/\bsitruuna\b/g, 'citron')
      .replace(/\bmaito\b/g, 'lait')
      .replace(/\bvoi\b/g, 'beurre')
      .replace(/\bjuusto\b/g, 'fromage')
      .replace(
        /\b(?:lot|dlc|ddm|prix|total|montant|tva|ht|ttc|net|brut|colis|carton|cartons|pieces|piece|unite|unites|kg|kgs|g|gr|l|litre|litres|ml|cl|x|ltk|kpl|pkt|pak|pss|rs|tlk|prk|plo|yksikko|maara|hinta|yhteensa)\b/g,
        ' ',
      )
      .replace(
        /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|l|ml|cl|pc|pcs|u|x|ltk|kpl|pkt|pak|pss|rs|tlk|prk|plo)\b/g,
        ' ',
      )
      .replace(/\b\d{4,}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeProductUnit(value: string) {
    const unit = this.normalize(value);
    if (['pu', 'u', 'unite', 'unites', 'piece', 'pieces', 'pc', 'pcs'].includes(unit))
      return 'piece';
    if (['col', 'colis', 'carton', 'cartons', 'caisse', 'ltk'].includes(unit)) return 'carton';
    return unit;
  }

  private productTokens(value: string) {
    return this.normalizeProductText(value)
      .split(' ')
      .filter((token) => token.length > 2 && !/^\d+$/.test(token));
  }

  private supplierCandidates(extractedName: string | null, lines: string[]) {
    const candidates = new Set<string>();
    if (extractedName) candidates.add(extractedName);
    for (const line of lines.slice(0, 24)) {
      const clean = line.replace(/[|#]/g, ' ').replace(/\s+/g, ' ').trim();
      if (/^!\[.*\]\(.*\)$/.test(line) || /^#+\s*/.test(line)) continue;
      if (clean.length < 4 || clean.length > 90) continue;
      if (SUPPLIER_EXCLUDED_RE.test(clean)) continue;
      if (/^[0-9\s.,€%/-]+$/.test(clean)) continue;
      if (!/[a-zA-ZÀ-ÿ]/.test(clean)) continue;
      candidates.add(clean);
    }
    return [...candidates].slice(0, 20);
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private normalizeSupplierIdentifier(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private async rememberSupplierIdentifiersTx(
    tx: Tx,
    organizationId: string,
    supplierId: string | null,
    identifiers: Array<{ kind: string; value: string }>,
  ) {
    if (!supplierId) return;
    const cleanIdentifiers = this.cleanSupplierIdentifiers(identifiers);
    if (!cleanIdentifiers.length) return;
    await tx.supplierOcrIdentifier.createMany({
      data: cleanIdentifiers.map((identifier) => ({
        organizationId,
        supplierId,
        kind: identifier.kind,
        value: identifier.value,
        normalizedValue: this.normalizeSupplierIdentifier(identifier.value),
      })),
      skipDuplicates: true,
    });
  }

  private levenshtein(a: string, b: string) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return dp[a.length][b.length];
  }

  private normalizeProductLabelNutrition(
    input: Partial<Record<ProductNutritionKey, number | null>> | null | undefined,
    warnings: string[],
  ): Record<ProductNutritionKey, number | null> {
    const limits: Record<ProductNutritionKey, number> = {
      energyKj: 10_000,
      energyKcal: 2_500,
      fatGrams: 100,
      saturatedFatGrams: 100,
      carbohydratesGrams: 100,
      sugarsGrams: 100,
      fiberGrams: 100,
      proteinGrams: 100,
      saltGrams: 100,
    };
    const labels: Record<ProductNutritionKey, string> = {
      energyKj: 'énergie (kJ)',
      energyKcal: 'énergie (kcal)',
      fatGrams: 'matières grasses',
      saturatedFatGrams: 'acides gras saturés',
      carbohydratesGrams: 'glucides',
      sugarsGrams: 'sucres',
      fiberGrams: 'fibres',
      proteinGrams: 'protéines',
      saltGrams: 'sel',
    };
    const keys = Object.keys(limits) as ProductNutritionKey[];
    return keys.reduce(
      (normalized, key) => {
        const value = input?.[key];
        if (value === null || value === undefined) {
          normalized[key] = null;
          return normalized;
        }
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > limits[key]
        ) {
          normalized[key] = null;
          warnings.push(
            `La valeur détectée pour ${labels[key]} paraît incohérente et doit être vérifiée.`,
          );
          return normalized;
        }
        normalized[key] = Math.round(value * 1_000) / 1_000;
        return normalized;
      },
      {} as Record<ProductNutritionKey, number | null>,
    );
  }

  private extractProductLabelFromOcrText(markdown: string): ProductLabelAiExtraction {
    const nutrition: Record<ProductNutritionKey, number | null> = {
      energyKj: null,
      energyKcal: null,
      fatGrams: null,
      saturatedFatGrams: null,
      carbohydratesGrams: null,
      sugarsGrams: null,
      fiberGrams: null,
      proteinGrams: null,
      saltGrams: null,
    };
    const lines = markdown
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
          .replace(/[*_`#|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean);
    const perHundredIndex = lines.findIndex((line) => /\b100\s*g\b/i.test(line));
    const nutritionLines =
      perHundredIndex >= 0 ? lines.slice(perHundredIndex, perHundredIndex + 35) : lines;
    const nutritionText = nutritionLines.join('\n');
    const ingredientHeading =
      /^(ingredients?|ingredient list|liste des ingredients|ainesosat|ingredienser)\b/i;
    const ingredientStopHeading =
      /^(additives?|allergens?|allerge?nes?|nutrition|nutritional information|valeurs nutritionnelles|ravintoarvot|naringsvarden|importer|importateur|country|pays|origin|origine|storage|conservation|preparation)\b/i;
    let ingredients: string | null = null;
    const ingredientStart = lines.findIndex((line) => ingredientHeading.test(this.normalize(line)));
    if (ingredientStart >= 0) {
      const collected: string[] = [];
      const firstLine = lines[ingredientStart]
        .replace(
          /^\s*(?:ingredients?|ingredient list|liste des ingrédients|ainesosat|ingredienser)\s*[:\-]?\s*/i,
          '',
        )
        .trim();
      if (firstLine) collected.push(firstLine);
      for (const line of lines.slice(ingredientStart + 1)) {
        if (ingredientStopHeading.test(this.normalize(line))) break;
        collected.push(line);
      }
      ingredients = collected.join(' ').replace(/\s+/g, ' ').trim().slice(0, 20_000) || null;
    }
    const decimal = (value: string | undefined) => {
      if (!value?.trim()) return null;
      const parsed = Number(value.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };
    nutrition.energyKj = decimal(nutritionText.match(/(\d+(?:[.,]\d+)?)\s*k\s*j\b/i)?.[1]);
    nutrition.energyKcal = decimal(nutritionText.match(/(\d+(?:[.,]\d+)?)\s*kcal\b/i)?.[1]);

    const gramFields: Array<{
      key: ProductNutritionKey;
      include: RegExp;
      exclude?: RegExp;
    }> = [
      {
        key: 'saturatedFatGrams',
        include: /\b(saturat\w*|sature\w*|tyydytty\w*|mattat\w*)\b/i,
      },
      {
        key: 'sugarsGrams',
        include: /\b(sugars?|sucres?|soker|socker)\b/i,
      },
      {
        key: 'fiberGrams',
        include: /\b(fibers?|fibres?|kuitu)\b/i,
      },
      {
        key: 'carbohydratesGrams',
        include: /\b(carbohydrates?|glucides?|hiilihydra\w*|kolhydrat\w*)\b/i,
        exclude: /\b(sugars?|sucres?|soker|socker)\b/i,
      },
      {
        key: 'fatGrams',
        include: /\b(fat|fats|grasses?|rasva|fett)\b/i,
        exclude: /\b(saturat\w*|sature\w*|tyydytty\w*|mattat\w*)\b/i,
      },
      {
        key: 'proteinGrams',
        include: /\b(proteins?|proteines?|proteiini)\b/i,
      },
      {
        key: 'saltGrams',
        include: /\b(salt|sel|suola)\b/i,
      },
    ];
    for (const { key, include, exclude } of gramFields) {
      const line = nutritionLines.find(
        (candidate) =>
          include.test(this.normalize(candidate)) && !exclude?.test(this.normalize(candidate)),
      );
      const value = decimal(line?.match(/(\d+(?:[.,]\d+)?)\s*g\b/i)?.[1]);
      if (value !== null) nutrition[key] = value;
    }

    const allergensPresent: string[] = [];
    const possibleTraces: string[] = [];
    let allergenMode: 'present' | 'trace' | null = null;
    const containsMarkers = ['contains', 'contient', 'contient des', 'sisaltaa', 'innehaller'];
    const traceMarkers = ['may contain', 'peut contenir', 'saattaa sisaltaa', 'kan innehalla'];
    const stopMarkers = [
      'we recommend',
      'nous recommandons',
      'nutritional claims',
      'allegations nutritionnelles',
      'frozen product',
      'produit surgele',
    ];
    const afterMarker = (line: string, markers: string[]) => {
      const normalizedLine = this.normalize(line);
      const marker = markers.find((candidate) => normalizedLine.includes(candidate));
      if (!marker) return '';
      const markerWords = marker.split(' ').length;
      return normalizedLine
        .split(' ')
        .slice(normalizedLine.split(' ').indexOf(marker.split(' ')[0]) + markerWords)
        .join(' ');
    };
    for (const line of lines) {
      const normalizedLine = this.normalize(line);
      if (stopMarkers.some((marker) => normalizedLine.includes(marker))) {
        allergenMode = null;
        continue;
      }
      if (traceMarkers.some((marker) => normalizedLine.includes(marker))) {
        allergenMode = 'trace';
        const remainder = afterMarker(line, traceMarkers);
        if (remainder) possibleTraces.push(remainder);
        continue;
      }
      if (containsMarkers.some((marker) => normalizedLine.includes(marker))) {
        allergenMode = 'present';
        const remainder = afterMarker(line, containsMarkers);
        if (remainder) allergensPresent.push(remainder);
        continue;
      }
      if (
        allergenMode &&
        normalizedLine !== 'hide' &&
        !/\b(nutrition|energy|energie|fat|grasses|carbohydrate|glucide|protein|proteine|salt|sel)\b/i.test(
          normalizedLine,
        )
      ) {
        (allergenMode === 'present' ? allergensPresent : possibleTraces).push(line);
      }
    }

    const detectedCount =
      (ingredients ? 1 : 0) +
      Object.values(nutrition).filter((value) => value !== null).length +
      allergensPresent.length +
      possibleTraces.length;
    return {
      ingredients,
      nutrition,
      allergensPresent,
      possibleTraces,
      confidence: detectedCount ? 0.55 : 0.25,
      warnings: [
        'La structuration Mistral était indisponible : les champs ont été récupérés directement depuis le texte OCR. Vérifiez-les avant l’enregistrement.',
      ],
    };
  }

  private normalizeProductLabelAllergens(values: string[] | null | undefined) {
    const detected = new Set<(typeof PRODUCT_LABEL_ALLERGENS)[number]>();
    for (const value of values ?? []) {
      const normalizedValue = this.normalize(String(value));
      if (!normalizedValue) continue;
      const exact = PRODUCT_LABEL_ALLERGENS.find(
        (allergen) => this.normalize(allergen) === normalizedValue,
      );
      if (exact) {
        detected.add(exact);
        if (['Blé', 'Seigle', 'Orge', 'Avoine', 'Épeautre', 'Kamut'].includes(exact)) {
          detected.add('Gluten');
        }
        if (
          [
            'Amande',
            'Noisette',
            'Noix',
            'Noix de cajou',
            'Noix de pécan',
            'Noix du Brésil',
            'Pistache',
            'Macadamia',
          ].includes(exact)
        ) {
          detected.add('Fruits à coque');
        }
        continue;
      }
      for (const [pattern, allergens] of PRODUCT_LABEL_ALLERGEN_ALIASES) {
        if (pattern.test(normalizedValue)) allergens.forEach((allergen) => detected.add(allergen));
      }
    }
    return PRODUCT_LABEL_ALLERGENS.filter((allergen) => detected.has(allergen));
  }

  private validateFile(file: UploadedFile) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    if (file.size > MAX_FILE_BYTES)
      throw new BadRequestException('Le fichier dépasse la taille maximale autorisée.');
    const ext = extname(file.originalname).toLowerCase();
    const mimeAccepted =
      ACCEPTED_MIME.has(file.mimetype) ||
      (!file.mimetype && ACCEPTED_EXT.has(ext)) ||
      (file.mimetype === 'application/octet-stream' && ACCEPTED_EXT.has(ext));
    if (!mimeAccepted || !ACCEPTED_EXT.has(ext))
      throw new BadRequestException(
        'Format non supporté. Utilisez PDF, PNG, JPEG, WEBP, HEIC, HEIF ou AVIF.',
      );
  }

  private safeExtension(file: UploadedFile) {
    const ext = extname(file.originalname).toLowerCase();
    if (ext === '.jpeg') return '.jpg';
    return ext;
  }

  private mimeForDocument(mimeType: string, storagePath: string) {
    if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
    const ext = extname(storagePath).toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.heic') return 'image/heic';
    if (ext === '.heif') return 'image/heif';
    if (ext === '.avif') return 'image/avif';
    return mimeType || 'application/octet-stream';
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

  private uiState(
    documentStatus: DocumentStatus,
    ocrStatus?: OcrProcessingStatus,
    extractionId?: string,
  ) {
    if (documentStatus === DocumentStatus.FAILED || ocrStatus === OcrProcessingStatus.FAILED)
      return 'erreur';
    if (extractionId) return 'prêt à vérifier';
    if (ocrStatus === OcrProcessingStatus.COMPLETED) return 'matching produits';
    if (ocrStatus === OcrProcessingStatus.PROCESSING) return 'OCR en cours';
    if (ocrStatus === OcrProcessingStatus.PENDING) return 'en attente';
    return 'upload';
  }

  private rawTextFromOcr(raw: any) {
    const pages = Array.isArray(raw?.pages) ? raw.pages : [];
    return pages
      .map((page: any) => page.markdown || page.text)
      .filter(Boolean)
      .join('\n\n');
  }

  private extractSupplier(lines: string[]) {
    const explicit = lines
      .map((line) =>
        line.match(/^(?:fournisseur|vendeur|supplier)\s*[:#-]\s*([^\n|]{3,90})$/i)?.[1]?.trim(),
      )
      .find((value): value is string => Boolean(value));
    if (explicit && !SUPPLIER_EXCLUDED_RE.test(explicit)) return explicit;
    const candidates = this.supplierCandidates(null, lines);
    return (
      candidates
        .map((candidate, index) => ({
          candidate,
          score: this.supplierLineScore(candidate) - index * 0.08,
        }))
        .sort((a, b) => b.score - a.score)[0]?.candidate || null
    );
  }

  private supplierLineScore(line: string) {
    let score = 0;
    if (/passion\s*froid|passionfroid/i.test(line)) score += 4;
    if (/^groupe\b/i.test(line)) score -= 1;
    if (/^[A-Z0-9 &.'-]{4,80}$/.test(line)) score += 2;
    if (
      /\b(sas|sarl|sa|eurl|ets|groupe|distribution|grossiste|primeur|viande|boucherie|mar[eé]e|frais)\b/i.test(
        line,
      )
    )
      score += 2;
    if (/[a-zA-ZÀ-ÿ]{4,}/.test(line)) score += 1;
    score -= Math.max(0, line.length - 60) / 30;
    return score;
  }

  private extractAfter(text: string, regex: RegExp, index = 3) {
    const match = text.match(regex);
    return match?.[index]?.replace(/\s+/g, ' ').trim() || null;
  }

  private extractInvoiceNumber(text: string) {
    if (!/\bfacture\b|\binvoice\b/i.test(text)) return null;
    return this.extractAfter(
      text,
      /(?:facture|invoice)[\s\S]{0,120}?(?:num[eé]ro|n[°.])\s*[:#-]?\s*([A-Z0-9-_/]+)/i,
      1,
    );
  }

  private extractReceiptNumber(text: string) {
    return (
      this.extractAfter(
        text,
        /\b([A-Z]{1,3}[O0][0-9]{1,4}\s+M[0-9]{3,}(?:\/[0-9]+)?)\s+\d{1,2}[.:]\d{2}\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/i,
        1,
      ) ||
      this.extractAfter(
        text,
        /(?:receipt|kuitti|ticket)\s*(?:number|numero|n[°.])?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-_/]{3,})/i,
        1,
      )
    );
  }

  private extractDeliveryNoteNumber(text: string) {
    return (
      this.extractAfter(
        text,
        /(?:bordereau de livraison|bon de livraison|\bbl\b)[^\n]{0,80}?(?:num[eé]ro|n[°.])\s*[:#-]?\s*([A-Z0-9-_/]+)/i,
        1,
      ) ||
      this.extractAfter(
        text,
        /(?:bon de livraison\s*\/\s*delivery note|delivery note|bon de livraison)\s*[\r\n]+([0-9][A-Z0-9-_/]+)/i,
        1,
      )
    );
  }

  private extractPurchaseOrderNumber(text: string) {
    const values = [
      ...this.extractAll(
        text,
        /\border\s*(?:number|no\.?|#)\s*[:#-]?\s*([0-9][0-9\s-]{4,}[0-9])/gi,
        1,
      ),
      ...this.extractAll(text, /\b([0-9]{6,})\s*-\s*(?:tilauksen tiedot|tilaushistoria)\b/gi, 1),
      ...this.extractAll(
        text,
        /ref\.?\s*cde\.?\s*(?:cii)?\s*[:#-]?\s*[0-9]*\s*commande\s*n[°.]?\s*([A-Z0-9-_/]+)/gi,
        1,
      ),
      ...this.extractAll(
        text,
        /(?:bon de commande|commande|purchase order)\s*n[°.]?\s*[:#-]?\s*([A-Z0-9-_/]+)/gi,
        1,
      ),
      ...this.extractAll(
        text,
        /n[°.]?\s*commande(?:\(s\))?\s*(?:[A-Za-z]+)?\s*([0-9][0-9\s-]+)/gi,
        1,
      ),
      ...this.extractAll(
        text,
        /r[eé]f[eé]rence client\s*[:#-]?\s*(?:France\s*)?([A-Z0-9-_/]+)/gi,
        1,
      ),
    ]
      .map((value) => {
        const cleaned = value
          .replace(/\s+/g, ' ')
          .replace(/\s+-\s+/g, ' - ')
          .trim();
        return /^[0-9][0-9\s-]+[0-9]$/.test(cleaned) ? cleaned.replace(/[\s-]+/g, '') : cleaned;
      })
      .filter((value) => /[0-9]/.test(value) || /^[A-Z]{2,}[A-Z0-9-_/]*$/.test(value));
    return [...new Set(values)].slice(0, 4).join(' / ') || null;
  }

  private extractDocumentDate(text: string) {
    return (
      this.extractDate(
        text,
        /date\s*(facture|document)\s*[:#-]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i,
      ) ||
      this.extractDate(
        text,
        /(bordereau de livraison|bon de livraison|\bbl\b)[^\n]{0,120}\bdu\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i,
      )
    );
  }

  private extractDeliveryDate(text: string) {
    return this.extractDate(
      text,
      /date\s*(?:de\s*)?(livraison|réception|reception|exp[eé]dition)\s*[:#-]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i,
    );
  }

  private extractAll(text: string, regex: RegExp, index: number) {
    return [...text.matchAll(regex)]
      .map((match) => match[index]?.trim())
      .filter((value): value is string => Boolean(value));
  }

  private extractMoney(text: string, regex: RegExp) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const global = new RegExp(regex.source, flags);
    const values = [...text.matchAll(global)]
      .map((match) => this.parseFrenchNumber(match[match.length - 1] || ''))
      .filter((value): value is number => value != null);
    return [...values].reverse().find((value) => value > 0) ?? values.at(-1) ?? null;
  }

  private extractTotals(text: string) {
    const totalTable = this.extractTotalsFromTable(text);
    return {
      totalExcludingTax:
        totalTable.totalExcludingTax ??
        this.extractMoney(text, /(total\s*(ht|hors taxe))\s*[:#-]?\s*([0-9\s.,]+)/i),
      totalTax:
        totalTable.totalTax ??
        this.extractMoney(text, /(total\s*tva|tva)\s*[:#-]?\s*([0-9\s.,]+)/i),
      totalIncludingTax: this.extractMoney(
        text,
        /(total\s*(ttc|a payer|à payer)|net\s*a payer|net\s*à payer)\s*[:#-]?\s*([0-9\s.,]+)/i,
      ),
    };
  }

  private extractTotalsFromTable(text: string) {
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    for (let i = 0; i < lines.length; i += 1) {
      if (!/TOTAL\s*HT/i.test(lines[i]) || !/TOTAL\s*TVA/i.test(lines[i])) continue;
      const next = lines.slice(i + 1, i + 5).find((line) => line.includes('|') && /\d/.test(line));
      const values =
        next
          ?.split('|')
          .map((cell) => this.parseFrenchNumber(cell))
          .filter((value): value is number => value != null) ?? [];
      if (values.length >= 2)
        return { totalExcludingTax: values[0], totalTax: values[values.length - 1] };
    }
    return { totalExcludingTax: null, totalTax: null };
  }

  private extractDate(text: string, regex: RegExp) {
    const match = text.match(regex);
    return match?.[match.length - 1] ? this.normalizeDate(match[match.length - 1]) : null;
  }

  private parseFrenchNumber(value: string) {
    const normalized = value
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    if (!normalized || normalized === '-' || normalized === '.') return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private normalizeDate(value: string) {
    const parts = value.split(/[./-]/).map(Number);
    if (parts.length !== 3) return null;
    const [day, month, rawYear] = parts;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (!day || !month || !year) return null;
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  private confidenceForExtraction(extraction: BusinessExtraction) {
    if (extraction.documentConfidence != null) return extraction.documentConfidence;
    if (!extraction.lines.length) return 0.2;
    const recognized = extraction.lines.filter(
      (line: any) => line.matchingStatus === StockReceptionLineMatchingStatus.RECOGNIZED,
    ).length;
    return Math.min(0.99, Math.max(0.3, recognized / extraction.lines.length));
  }

  private normalizeCorrectionPayload(dto: SaveOcrCorrectionDto) {
    return {
      supplierId: dto.supplierId || null,
      supplierName: dto.supplierName || null,
      supplierIdentifiers: this.cleanSupplierIdentifiers(dto.supplierIdentifiers),
      invoiceNumber: dto.invoiceNumber || null,
      deliveryNoteNumber: dto.deliveryNoteNumber || null,
      purchaseOrderNumber: dto.purchaseOrderNumber || null,
      receiptNumber: dto.receiptNumber || null,
      documentDate: dto.documentDate || null,
      deliveryDate: dto.deliveryDate || null,
      totalExcludingTax: dto.totalExcludingTax ?? null,
      totalTax: dto.totalTax ?? null,
      totalIncludingTax: dto.totalIncludingTax ?? null,
      siteId: dto.siteId || null,
      locationId: dto.locationId || null,
      deliveryTemperature: dto.deliveryTemperature ?? null,
      controlConforming: dto.controlConforming ?? null,
      controlNotes: dto.controlNotes || null,
      documentConfidence: dto.documentConfidence ?? null,
      warnings: dto.warnings ?? [],
      suggestedActions: dto.suggestedActions ?? [],
      aiAnalysis: dto.aiAnalysis ?? null,
      lines: (dto.lines || []).map((line) => ({
        ...line,
        productId: line.productId || null,
        createProduct: Boolean(line.createProduct && !line.productId),
        unitId: line.unitId || null,
        // quantity stays the legacy physical-delivery field.  The document value
        // is retained separately so the mobile UI can show Commandé / Livré.
        documentedQuantity: line.documentedQuantity ?? line.quantity ?? null,
        deliveredQuantity: line.deliveredQuantity ?? line.quantity ?? null,
        quantity: line.deliveredQuantity ?? line.quantity ?? null,
        acceptedQuantity: line.acceptedQuantity ?? null,
        unitPrice: line.unitPrice ?? null,
        lineTotal: line.lineTotal ?? null,
        vatRate: line.vatRate ?? null,
        bestBeforeDate: line.bestBeforeDate || null,
        matchingStatus: line.productId
          ? StockReceptionLineMatchingStatus.RECOGNIZED
          : StockReceptionLineMatchingStatus.NOT_FOUND,
        matchingScore: line.productId ? 1 : 0,
        lineStatus: line.lineStatus || null,
        lineConfidence: line.lineConfidence ?? null,
        warnings: line.warnings ?? [],
        sourceText: line.sourceText || null,
      })),
    };
  }

  private formatExtraction(extraction: any) {
    const source = (extraction.correctedJson || extraction.extractedJson) as any;
    return {
      id: extraction.id,
      status: extraction.status,
      type: extraction.type,
      confidenceScore: extraction.confidenceScore,
      extractedJson: extraction.extractedJson,
      correctedJson: extraction.correctedJson,
      data: source,
      document: extraction.ocrDocument?.document,
      ocrDocument: extraction.ocrDocument,
    };
  }

  private decimalOrNull(value: number | null | undefined) {
    return value == null ? null : new Prisma.Decimal(value);
  }

  private async ensureSupplier(organizationId: string, id: string) {
    const item = await this.prisma.supplier.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Fournisseur introuvable');
    return item;
  }

  private async ensureSite(organizationId: string, id: string) {
    const item = await this.prisma.site.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Site introuvable');
    return item;
  }

  private async ensureLocation(organizationId: string, id: string) {
    const item = await this.prisma.location.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Emplacement introuvable');
    return item;
  }

  private async convertToProductUnitTx(
    tx: Tx,
    organizationId: string,
    fromUnitId: string,
    toUnitId: string,
    quantity: number,
  ) {
    if (fromUnitId === toUnitId) return new Prisma.Decimal(quantity);
    const conversion = await tx.unitConversion.findFirst({
      where: { organizationId, fromUnitId, toUnitId },
    });
    if (!conversion)
      throw new BadRequestException('Conversion d’unité incompatible sur une ligne de réception.');
    return new Prisma.Decimal(quantity).mul(conversion.factor);
  }
}
