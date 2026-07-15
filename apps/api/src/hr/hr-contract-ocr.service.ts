import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'path';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';

type UploadedHrDocument = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type HrSourceDocumentType = 'CONTRACT' | 'CV' | 'OTHER';

type DocumentExtraction = {
  documentType: HrSourceDocumentType | string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  birthDate: string | null;
  personalIdentityNumber: string | null;
  primaryLanguage: string | null;
  secondaryLanguage: string | null;
  hireDate: string | null;
  employeeNumber: string | null;
  contractType: string | null;
  contractEndDate: string | null;
  trialEndDate: string | null;
  weeklyHours: number | null;
  hourlyRate: number | null;
  currency: string | null;
  rateEffectiveDate: string | null;
  departmentName: string | null;
  positionName: string | null;
  siteName: string | null;
  trainingNames: string[];
  professionalSummary: string | null;
  additionalTerms: string | null;
  confidence: number;
  uncertainFields: string[];
  warnings: string[];
};

type ReferenceItem = { id: string; name: string };
type PositionItem = ReferenceItem & { departmentId: string | null };

type AnalyzedDocument = {
  file: UploadedHrDocument;
  mimeType: string;
  documentType: HrSourceDocumentType;
  extraction: DocumentExtraction;
  pageCount?: number | null;
  durationMs: number;
};

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENTS = 6;
const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.avif']);
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);
const CONTRACT_TYPES = new Set(['CDI', 'CDD', 'INTERIM', 'APPRENTICESHIP', 'INTERNSHIP', 'OTHER']);
const PROFILE_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'address', 'postalCode', 'city', 'country', 'birthDate',
  'primaryLanguage', 'secondaryLanguage',
] as const;

@Injectable()
export class HrContractOcrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralClient: MistralClientService,
  ) {}

  async analyze(organizationId: string, files: UploadedHrDocument[] | UploadedHrDocument) {
    const documents = Array.isArray(files) ? files : files ? [files] : [];
    if (!documents.length) throw new BadRequestException('Aucun document RH fourni.');
    if (documents.length > MAX_DOCUMENTS) throw new BadRequestException(`Vous pouvez analyser jusqu’à ${MAX_DOCUMENTS} documents à la fois.`);
    const mimeTypes = documents.map((file) => this.validateFile(file));

    const [organization, departments, positions, sites] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { regulatoryCountryCode: true, hrCountryCode: true },
      }),
      this.prisma.hrDepartment.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.hrPosition.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true, departmentId: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.site.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const analyzed: AnalyzedDocument[] = [];
    for (let index = 0; index < documents.length; index += 1) {
      analyzed.push(await this.analyzeDocument(
        organizationId,
        documents[index],
        mimeTypes[index],
        departments,
        positions,
        sites,
        String(organization?.regulatoryCountryCode ?? organization?.hrCountryCode ?? ''),
      ));
    }

    return this.mergeDocuments(analyzed, departments, positions, sites);
  }

  private async analyzeDocument(
    organizationId: string,
    file: UploadedHrDocument,
    mimeType: string,
    departments: ReferenceItem[],
    positions: PositionItem[],
    sites: ReferenceItem[],
    regulatoryCountryCode: string,
  ): Promise<AnalyzedDocument> {
    const ocr = await this.mistralClient.ocrMarkdown(organizationId, {
      buffer: file.buffer,
      mimeType,
      withAnnotation: true,
    });
    if (!ocr.markdown.trim()) {
      throw new BadRequestException(`Le document « ${file.originalname} » ne contient pas de texte exploitable après OCR.`);
    }

    const extraction = await this.mistralClient.chatJson<DocumentExtraction>(
      organizationId,
      [
        {
          role: 'system',
          content: [
            'Tu analyses un document RH pour préparer un brouillon de fiche collaborateur ToqueHub.',
            'Classe documentType en CONTRACT uniquement si le document est explicitement un contrat de travail entre un employeur et un salarié. Un CV, résumé ou ansioluettelo reste CV même s’il contient des dates et noms d’anciens employeurs.',
            'N’invente aucune valeur. Si une information est ambiguë, retourne null et ajoute le champ à uncertainFields.',
            'Extrais uniquement les informations de la personne candidate ou salariée. Ignore les coordonnées des références, anciens employeurs et recruteurs.',
            'country est le pays de l’adresse actuelle, jamais la nationalité ni le pays d’un ancien emploi.',
            'Ignore les coordonnées bancaires, pièces d’identité et signatures.',
            'personalIdentityNumber est le numéro de sécurité sociale français ou le Henkilötunnus finlandais du salarié. Ne le reprends que depuis un contrat explicite, sous un libellé non ambigu, sans jamais le calculer depuis la date de naissance.',
            'Une date d’emploi passée, une date de diplôme, la date du CV ou une disponibilité ne sont jamais hireDate, contractEndDate, trialEndDate ou rateEffectiveDate.',
            'Pour un CV, laisse toujours vides personalIdentityNumber, hireDate, employeeNumber, contractType, contractEndDate, trialEndDate, weeklyHours, hourlyRate, currency, rateEffectiveDate, departmentName, positionName, siteName et additionalTerms.',
            'Pour un contrat, extrais les champs contractuels uniquement lorsqu’ils sont explicitement indiqués dans ce contrat.',
            'Toutes les dates doivent être au format YYYY-MM-DD.',
            'Traduis le type de contrat vers CDI, CDD, INTERIM, APPRENTICESHIP, INTERNSHIP ou OTHER.',
            'weeklyHours est le nombre d’heures de travail par semaine. hourlyRate est le taux horaire brut; ne convertis jamais un salaire mensuel.',
            'departmentName, positionName et siteName reprennent exactement un nom disponible uniquement si le contrat établit clairement l’affectation; sinon null.',
            'trainingNames contient seulement les diplômes, cartes et certifications clairement attribués à la personne.',
            'professionalSummary résume en français le parcours et les compétences d’un CV, sans coordonnées ni donnée sensible.',
            'additionalTerms résume en français les clauses contractuelles utiles non mappées, sans donnée sensible.',
            'Retourne uniquement un JSON conforme au schéma.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            filename: file.originalname,
            regulatoryCountryCode,
            availableDepartments: departments.map((item) => item.name),
            availablePositions: positions.map((item) => item.name),
            availableSites: sites.map((item) => item.name),
            ocrMarkdown: ocr.markdown.slice(0, 45_000),
          }),
        },
      ],
      'toquehub_hr_document_import',
      this.extractionSchema(),
      { temperature: 0 },
    );

    return {
      file,
      mimeType,
      documentType: this.classifyDocument(file.originalname, ocr.markdown, extraction.documentType),
      extraction,
      pageCount: ocr.pageCount,
      durationMs: ocr.durationMs,
    };
  }

  private mergeDocuments(
    documents: AnalyzedDocument[],
    departments: ReferenceItem[],
    positions: PositionItem[],
    sites: ReferenceItem[],
  ) {
    const warnings: string[] = [];
    const uncertainFields: string[] = [];
    const ordered = [...documents].sort((left, right) => this.documentPriority(left.documentType) - this.documentPriority(right.documentType));
    const draft: Record<string, unknown> = {};

    for (const field of PROFILE_FIELDS) {
      const candidates = ordered
        .map((document) => ({ document, value: this.profileValue(field, document.extraction[field]) }))
        .filter((candidate) => candidate.value !== undefined);
      if (candidates.length) draft[field] = candidates[0].value;
      const distinct = [...new Set(candidates.map((candidate) => this.normalizeComparison(candidate.value)))];
      if (distinct.length > 1) {
        warnings.push(`Conflit entre documents pour « ${field} » : la valeur du document prioritaire a été conservée.`);
      }
    }

    const contractDocuments = ordered.filter((document) => document.documentType === 'CONTRACT');
    const contract = contractDocuments[0];
    if (contract) {
      Object.assign(draft, this.contractDraft(contract.extraction));
    } else {
      warnings.push('Aucun contrat de travail détecté : les dates, le type de contrat, le temps de travail et le salaire sont volontairement restés vides.');
    }

    const trainingNames = [...new Map(
      ordered.flatMap((document) => this.stringList(document.extraction.trainingNames))
        .map((name) => [this.normalize(name), name] as const),
    ).values()].slice(0, 30);
    if (trainingNames.length) draft.trainingNames = trainingNames;

    const notes = ordered.flatMap((document) => {
      const summary = document.documentType === 'CONTRACT'
        ? this.cleanText(document.extraction.additionalTerms, 2_000)
        : this.cleanText(document.extraction.professionalSummary, 2_000);
      return summary ? [summary] : [];
    });
    if (notes.length) draft.notes = [...new Set(notes)].join('\n\n').slice(0, 4_000);

    const referenceExtraction = contract?.extraction;
    const department = this.matchByName(referenceExtraction?.departmentName, departments);
    const position = this.matchByName(referenceExtraction?.positionName, positions);
    const site = this.matchByName(referenceExtraction?.siteName, sites);
    let departmentId = department?.id;
    if (position?.departmentId) {
      if (departmentId && departmentId !== position.departmentId) {
        warnings.push('Le service proposé ne correspond pas au poste reconnu; le service du poste a été retenu.');
      }
      departmentId = position.departmentId;
    }
    if (referenceExtraction?.departmentName && !departmentId) warnings.push(`Service « ${referenceExtraction.departmentName} » non associé automatiquement.`);
    if (referenceExtraction?.positionName && !position) warnings.push(`Poste « ${referenceExtraction.positionName} » non associé automatiquement.`);
    if (referenceExtraction?.siteName && !site) warnings.push(`Établissement « ${referenceExtraction.siteName} » non associé automatiquement.`);
    if (departmentId) draft.departmentId = departmentId;
    if (position?.id) draft.positionId = position.id;
    if (site?.id) draft.siteId = site.id;

    for (const document of documents) {
      const prefix = documents.length > 1 ? `${document.file.originalname} : ` : '';
      uncertainFields.push(...this.stringList(document.extraction.uncertainFields).map((field) => `${prefix}${field}`));
      warnings.push(...this.stringList(document.extraction.warnings).map((warning) => `${prefix}${warning}`));
      if (document.documentType === 'CV') {
        warnings.push(`${prefix || 'Le '}CV utilisé uniquement pour le profil, les langues, les formations et le parcours; aucune donnée contractuelle n’en a été reprise.`);
      }
      if (document.documentType === 'OTHER') {
        warnings.push(`${prefix || 'Le '}document non reconnu comme contrat : aucune donnée contractuelle n’en a été reprise.`);
      }
    }

    const cleanDraft = this.cleanDraft(draft);
    const confidences = documents.map((document) => this.clamp(Number(document.extraction.confidence) || 0, 0, 1));
    const sources = documents.map((document) => ({
      originalName: document.file.originalname,
      mimeType: document.mimeType,
      pageCount: document.pageCount,
      durationMs: document.durationMs,
      documentType: document.documentType,
      category: this.documentCategory(document.documentType),
      confidence: this.clamp(Number(document.extraction.confidence) || 0, 0, 1),
      uncertainFields: this.stringList(document.extraction.uncertainFields),
      warnings: this.stringList(document.extraction.warnings),
    }));

    return {
      draft: cleanDraft,
      suggestions: {
        departmentName: this.cleanText(referenceExtraction?.departmentName),
        positionName: this.cleanText(referenceExtraction?.positionName),
        siteName: this.cleanText(referenceExtraction?.siteName),
      },
      hasContractSource: Boolean(contract),
      confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0,
      uncertainFields: [...new Set(uncertainFields)],
      warnings: [...new Set(warnings)],
      fieldCount: Object.values(cleanDraft).filter((value) => value !== undefined && value !== null && value !== '').length,
      documents: sources,
      source: sources[0],
    };
  }

  private contractDraft(extraction: DocumentExtraction) {
    const contractType = String(extraction.contractType || '').toUpperCase();
    const hireDate = this.isoDate(extraction.hireDate);
    return this.cleanDraft({
      hireDate,
      personalIdentityNumber: this.cleanText(extraction.personalIdentityNumber, 80),
      employeeNumber: this.cleanText(extraction.employeeNumber, 80),
      contractType: CONTRACT_TYPES.has(contractType) ? contractType : undefined,
      contractEndDate: this.isoDate(extraction.contractEndDate),
      trialEndDate: this.isoDate(extraction.trialEndDate),
      contractWeeklyMinutes: this.weeklyMinutes(extraction.weeklyHours),
      hourlyRate: this.nonNegativeNumber(extraction.hourlyRate, 1_000),
      currency: this.cleanText(extraction.currency)?.toUpperCase(),
      rateEffectiveDate: this.isoDate(extraction.rateEffectiveDate) || (extraction.hourlyRate != null ? hireDate : undefined),
    });
  }

  private profileValue(field: typeof PROFILE_FIELDS[number], value: string | null) {
    if (field === 'birthDate') return this.isoDate(value);
    const lengths: Partial<Record<typeof PROFILE_FIELDS[number], number>> = {
      firstName: 120,
      lastName: 120,
      email: 180,
      phone: 60,
      address: 1_000,
      postalCode: 40,
      city: 120,
      country: 120,
      primaryLanguage: 120,
      secondaryLanguage: 120,
    };
    return this.cleanText(value, lengths[field]);
  }

  private classifyDocument(originalName: string, markdown: string, suggestedType: string): HrSourceDocumentType {
    const filename = this.normalize(originalName);
    const text = this.normalize(markdown.slice(0, 12_000));
    const cvFilename = /(^|[^a-z])cv([^a-z]|$)|curriculum/.test(filename);
    const cvContent = /curriculum vitae|ansioluettelo|resume|work experience|tyokokemus|professional experience/.test(text);
    const contractContent = /tyosopimus|employment contract|contract of employment|contrat de travail|arbeitsvertrag/.test(text);
    if (cvFilename || (cvContent && !contractContent)) return 'CV';
    if (contractContent) return 'CONTRACT';
    if (String(suggestedType).toUpperCase() === 'CV') return 'CV';
    return 'OTHER';
  }

  private documentPriority(type: HrSourceDocumentType) {
    return type === 'CONTRACT' ? 0 : type === 'CV' ? 1 : 2;
  }

  private documentCategory(type: HrSourceDocumentType) {
    return type === 'CONTRACT' ? 'CONTRACT' : type === 'CV' ? 'ADMINISTRATIVE' : 'OTHER';
  }

  private validateFile(file: UploadedHrDocument) {
    if (!file?.buffer?.length) throw new BadRequestException('Un des documents fournis est vide.');
    const size = file.size ?? file.buffer.length;
    if (size > MAX_DOCUMENT_BYTES) throw new BadRequestException(`Le document « ${file.originalname} » ne doit pas dépasser 10 Mo.`);
    const extension = extname(file.originalname || '').toLowerCase();
    const mimeType = (file.mimetype || '').toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(extension) && !ACCEPTED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Format non pris en charge pour « ${file.originalname} ». Utilisez un PDF ou une image lisible.`);
    }
    const byExtension: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.avif': 'image/avif',
    };
    return byExtension[extension] ?? mimeType;
  }

  private matchByName<T extends { name: string }>(value: string | null | undefined, items: T[]) {
    const normalized = this.normalize(value);
    return normalized ? items.find((item) => this.normalize(item.name) === normalized) : undefined;
  }

  private cleanDraft(values: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  }

  private cleanText(value?: string | null, maxLength = 1_000) {
    const cleaned = String(value ?? '').trim();
    return cleaned ? cleaned.slice(0, maxLength) : undefined;
  }

  private stringList(value: unknown) {
    return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 30) : [];
  }

  private isoDate(value?: string | null) {
    const candidate = String(value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return undefined;
    const date = new Date(`${candidate}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate ? undefined : candidate;
  }

  private weeklyMinutes(value?: number | null) {
    const hours = this.nonNegativeNumber(value, 168);
    return hours == null ? undefined : Math.round(hours * 60);
  }

  private nonNegativeNumber(value: unknown, maximum: number) {
    if (value === null || value === undefined || value === '') return undefined;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= maximum ? number : undefined;
  }

  private normalize(value?: unknown) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  private normalizeComparison(value: unknown) {
    return this.normalize(value).replace(/[^a-z0-9@]+/g, '');
  }

  private clamp(value: number, minimum: number, maximum: number) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  private extractionSchema() {
    const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
    const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
    const fields = [
      'firstName', 'lastName', 'email', 'phone', 'address', 'postalCode', 'city', 'country', 'birthDate',
      'personalIdentityNumber', 'primaryLanguage', 'secondaryLanguage', 'hireDate', 'employeeNumber', 'contractType', 'contractEndDate',
      'trialEndDate', 'currency', 'rateEffectiveDate', 'departmentName', 'positionName', 'siteName',
      'professionalSummary', 'additionalTerms',
    ];
    return {
      type: 'object',
      additionalProperties: false,
      required: ['documentType', ...fields, 'weeklyHours', 'hourlyRate', 'trainingNames', 'confidence', 'uncertainFields', 'warnings'],
      properties: {
        documentType: { type: 'string', enum: ['CONTRACT', 'CV', 'OTHER'] },
        ...Object.fromEntries(fields.map((field) => [field, nullableString])),
        weeklyHours: nullableNumber,
        hourlyRate: nullableNumber,
        trainingNames: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        uncertainFields: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    };
  }
}
