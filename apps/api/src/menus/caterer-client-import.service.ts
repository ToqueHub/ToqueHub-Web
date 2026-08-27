import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseProductWorkbook } from '../stocks/stocks-product-spreadsheet';
import { CommitCatererClientImportDto } from './dto/menus.dto';

type Actor = { id: string; role: string };
type UploadedFile = { originalname: string; mimetype?: string; size?: number; buffer?: Buffer };
type ImportField = 'firstName' | 'lastName' | 'email' | 'phone' | 'allergies';
type SourceRow = { rowNumber: number; values: string[] };

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

const FIELD_ALIASES: Record<ImportField, string[]> = {
  firstName: ['prénom', 'prenom', 'first name', 'firstname', 'given name', 'forename', 'etunimi'],
  lastName: [
    'nom',
    'nom de famille',
    'last name',
    'lastname',
    'surname',
    'family name',
    'sukunimi',
  ],
  email: ['e-mail', 'email', 'mail', 'courriel', 'sähköposti', 'sahkoposti'],
  phone: [
    'téléphone',
    'telephone',
    'tél',
    'tel',
    'phone',
    'phone number',
    'mobile',
    'puhelin',
    'puhelinnumero',
    'matkapuhelin',
  ],
  allergies: [
    'allergies',
    'allergie',
    'allergènes',
    'allergenes',
    'allergène',
    'allergene',
    'allergens',
    'allergen',
    'allergy',
    'dietary information',
    'dietary info',
    'info',
    'informations',
    'notes',
    'allergiat',
    'allergia',
    'allergeenit',
    'erityisruokavalio',
    'lisätiedot',
    'lisatiedot',
  ],
};

@Injectable()
export class CatererClientImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralClientService,
  ) {}

  async analyze(organizationId: string, actor: Actor, file?: UploadedFile) {
    await this.assertClientsInstalled(organizationId);
    this.assertWrite(actor);
    this.assertFile(file);

    const kind = this.fileKind(file!);
    const parsed =
      kind === 'xlsx'
        ? await this.parseXlsx(file!.buffer!)
        : kind === 'csv'
          ? this.parseCsv(file!.buffer!)
          : await this.parseOcr(organizationId, file!);
    if (!parsed.rows.length) throw new BadRequestException('Aucun client exploitable trouvé.');
    if (parsed.rows.length > MAX_IMPORT_ROWS)
      throw new BadRequestException(`Le document dépasse ${MAX_IMPORT_ROWS} clients.`);

    const mapping = this.mapHeaders(parsed.headers);
    if (!mapping.firstName && !mapping.lastName)
      throw new BadRequestException(
        'Colonnes prénom/nom introuvables. Utilisez des en-têtes français, anglais ou finnois.',
      );
    const existing = await this.prisma.catererClient.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true, phone: true },
    });
    const existingIndex = this.existingIndex(existing);
    const seen = new Map<string, { rowNumber: number; name: string }>();
    const rows = parsed.rows.map((row) => {
      const source = Object.fromEntries(
        parsed.headers.map((header, index) => [header, row.values[index] ?? '']),
      );
      const fields = {
        firstName: this.valueFor(row, parsed.headers, mapping.firstName),
        lastName: this.valueFor(row, parsed.headers, mapping.lastName),
        email: this.valueFor(row, parsed.headers, mapping.email).toLowerCase(),
        phone: this.valueFor(row, parsed.headers, mapping.phone),
        allergies: this.valueFor(row, parsed.headers, mapping.allergies),
      };
      const name = this.displayName(fields.firstName, fields.lastName);
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!name) errors.push('Prénom ou nom obligatoire.');
      if (fields.email && !this.validEmail(fields.email)) errors.push('Adresse e-mail invalide.');
      if (!fields.email && !fields.phone)
        warnings.push('Ajoutez un e-mail ou un téléphone pour pouvoir contacter ce client.');

      const duplicate = this.findDuplicate(existingIndex, fields, name);
      const fileKey = this.rowIdentity(fields, name);
      const earlier = fileKey ? seen.get(fileKey) : undefined;
      if (fileKey && !earlier) seen.set(fileKey, { rowNumber: row.rowNumber, name });
      const duplicateOf = duplicate
        ? { type: 'existing' as const, id: duplicate.id, name: duplicate.name }
        : earlier
          ? { type: 'file' as const, rowNumber: earlier.rowNumber, name: earlier.name }
          : null;
      if (duplicateOf)
        warnings.push(
          duplicateOf.type === 'existing'
            ? `Client déjà présent : ${duplicateOf.name}.`
            : `Doublon de la ligne ${duplicateOf.rowNumber}.`,
        );
      const status = errors.length
        ? 'error'
        : duplicateOf
          ? 'duplicate'
          : warnings.length
            ? 'needs_review'
            : 'ready';
      return {
        id: randomUUID(),
        rowNumber: row.rowNumber,
        source,
        fields,
        name,
        status,
        selected: status === 'ready' || status === 'needs_review',
        warnings,
        errors,
        duplicateOf,
      };
    });

    return {
      filename: file!.originalname,
      sourceKind: kind,
      sourceLanguage: parsed.sourceLanguage ?? this.detectLanguage(parsed.headers),
      sheetName: 'sheetName' in parsed ? parsed.sheetName : undefined,
      headers: parsed.headers,
      rows,
      summary: {
        total: rows.length,
        ready: rows.filter((row) => row.status === 'ready').length,
        needsReview: rows.filter((row) => row.status === 'needs_review').length,
        duplicates: rows.filter((row) => row.status === 'duplicate').length,
        errors: rows.filter((row) => row.status === 'error').length,
      },
      privacy:
        kind === 'pdf' || kind === 'image'
          ? 'Le PDF ou l’image a été transmis à Mistral pour lecture OCR. Vérifiez les champs avant import.'
          : 'Le tableur a été lu localement par ToqueHub et n’a pas été transmis à Mistral.',
    };
  }

  async commit(organizationId: string, actor: Actor, dto: CommitCatererClientImportDto) {
    await this.assertClientsInstalled(organizationId);
    this.assertWrite(actor);
    const selected = (dto.rows ?? []).filter((row) => row.selected !== false);
    if (!selected.length) throw new BadRequestException('Sélectionnez au moins un client.');
    if (selected.length > MAX_IMPORT_ROWS)
      throw new BadRequestException(`Un import est limité à ${MAX_IMPORT_ROWS} clients.`);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.catererClient.findMany({
        where: { organizationId },
        select: { id: true, name: true, email: true, phone: true },
      });
      const index = this.existingIndex(existing);
      const created: Array<{ id: string; name: string }> = [];
      const skipped: Array<{ rowNumber: number; name: string; reason: string }> = [];

      for (const row of selected) {
        const firstName = this.clean(row.firstName, 160);
        const lastName = this.clean(row.lastName, 160);
        const email = this.clean(row.email, 200).toLowerCase();
        const phone = this.clean(row.phone, 60);
        const allergies = this.clean(row.allergies, 4000);
        const name = this.displayName(firstName, lastName);
        if (!name) {
          skipped.push({ rowNumber: row.rowNumber, name: 'Sans nom', reason: 'Nom manquant' });
          continue;
        }
        if (email && !this.validEmail(email)) {
          skipped.push({ rowNumber: row.rowNumber, name, reason: 'E-mail invalide' });
          continue;
        }
        const duplicate = this.findDuplicate(index, { email, phone }, name);
        if (duplicate) {
          skipped.push({ rowNumber: row.rowNumber, name, reason: 'Client déjà présent' });
          continue;
        }
        const client = await tx.catererClient.create({
          data: {
            organizationId,
            name,
            firstName: firstName || null,
            lastName: lastName || null,
            contactName: name,
            email: email || null,
            phone: phone || null,
            allergies: allergies || null,
            accountTypeId: 2,
            source: 'CLIENT_IMPORT',
          },
          select: { id: true, name: true, email: true, phone: true },
        });
        existing.push(client);
        this.addToIndex(index, client);
        created.push({ id: client.id, name: client.name });
      }
      return {
        created: created.length,
        skipped: skipped.length,
        clients: created,
        skippedRows: skipped,
      };
    });
  }

  private async parseXlsx(buffer: Buffer) {
    try {
      const parsed = await parseProductWorkbook(buffer, (headers) => this.scoreHeaders(headers));
      return { ...parsed, sourceLanguage: this.detectLanguage(parsed.headers) };
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Classeur Excel illisible.');
    }
  }

  private parseCsv(buffer: Buffer) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const delimiter = this.detectDelimiter(text);
    const matrix = this.csvMatrix(text, delimiter).filter((row) =>
      row.some((value) => value.trim()),
    );
    if (matrix.length < 2)
      throw new BadRequestException('Le fichier CSV ne contient aucune donnée.');
    const headerIndex = matrix
      .slice(0, 20)
      .map((row) => this.scoreHeaders(row))
      .reduce((best, score, index, scores) => (score > scores[best] ? index : best), 0);
    const headers = this.uniqueHeaders(matrix[headerIndex]);
    return {
      headers,
      rows: matrix.slice(headerIndex + 1).map((values, index) => ({
        rowNumber: headerIndex + index + 2,
        values: headers.map((_, column) => String(values[column] ?? '').trim()),
      })),
      sourceLanguage: this.detectLanguage(headers),
    };
  }

  private async parseOcr(organizationId: string, file: UploadedFile) {
    const ocr = await this.mistral.ocrMarkdown(organizationId, {
      buffer: file.buffer!,
      mimeType:
        file.mimetype ||
        (file.originalname.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
      withAnnotation: true,
    });
    const table = this.parseMarkdownTable(ocr.markdown);
    if (table && this.scoreHeaders(table.headers) >= 2) return table;

    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['sourceLanguage', 'clients'],
      properties: {
        sourceLanguage: { type: 'string', enum: ['fr', 'en', 'fi', 'other'] },
        clients: {
          type: 'array',
          maxItems: MAX_IMPORT_ROWS,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['firstName', 'lastName', 'email', 'phone', 'allergies'],
            properties: {
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              allergies: { type: 'string' },
            },
          },
        },
      },
    };
    const structured = await this.mistral.chatJson<{
      sourceLanguage: 'fr' | 'en' | 'fi' | 'other';
      clients: Array<Record<ImportField, string>>;
    }>(
      organizationId,
      [
        {
          role: 'system',
          content:
            'Extrait une base clients rédigée en français, anglais ou finnois. N’invente aucune valeur absente. Conserve les téléphones tels qu’ils sont écrits et place toute information d’allergie ou de régime dans allergies.',
        },
        { role: 'user', content: String(ocr.markdown || '').slice(0, 80_000) },
      ],
      'caterer_client_import',
      schema,
      { fallbackToJsonObject: true, timeoutMs: 90_000 },
    );
    const headers: ImportField[] = ['firstName', 'lastName', 'email', 'phone', 'allergies'];
    return {
      headers,
      rows: (structured.clients ?? []).map((client, index) => ({
        rowNumber: index + 1,
        values: headers.map((field) => String(client[field] ?? '').trim()),
      })),
      sourceLanguage: structured.sourceLanguage,
    };
  }

  private parseMarkdownTable(markdown: string) {
    const tables = String(markdown || '')
      .split(/\n\s*\n/)
      .map((block) => block.split('\n').filter((line) => line.trim().startsWith('|')))
      .filter((lines) => lines.length >= 3)
      .map((lines) => {
        const matrix = lines.map((line) =>
          line
            .trim()
            .replace(/^\||\|$/g, '')
            .split(/(?<!\\)\|/)
            .map((value) => value.replace(/\\\|/g, '|').trim()),
        );
        const headers = this.uniqueHeaders(matrix[0]);
        const rows = matrix
          .slice(1)
          .filter((row) => !row.every((value) => /^:?-{2,}:?$/.test(value)))
          .map((values, index) => ({ rowNumber: index + 1, values }));
        return { headers, rows, sourceLanguage: this.detectLanguage(headers) };
      })
      .sort((a, b) => this.scoreHeaders(b.headers) - this.scoreHeaders(a.headers));
    return tables[0] ?? null;
  }

  private scoreHeaders(headers: string[]) {
    const mapped = this.mapHeaders(headers);
    return Object.values(mapped).filter(Boolean).length;
  }

  private mapHeaders(headers: string[]) {
    const result: Partial<Record<ImportField, string>> = {};
    for (const header of headers) {
      const normalized = this.normalize(header);
      for (const field of Object.keys(FIELD_ALIASES) as ImportField[]) {
        if (result[field]) continue;
        const aliases = FIELD_ALIASES[field].map((alias) => this.normalize(alias));
        if (
          aliases.some(
            (alias) =>
              normalized === alias ||
              normalized.split(/\s+\/\s+|\s+or\s+|\s+ou\s+/).includes(alias),
          )
        ) {
          result[field] = header;
          break;
        }
      }
    }
    return result;
  }

  private valueFor(row: SourceRow, headers: string[], header?: string) {
    if (!header) return '';
    const index = headers.indexOf(header);
    return index < 0 ? '' : String(row.values[index] ?? '').trim();
  }

  private detectLanguage(headers: string[]): 'fr' | 'en' | 'fi' | 'other' {
    const text = headers.map((header) => this.normalize(header)).join(' ');
    const scores = {
      fr: ['prenom', 'nom', 'telephone', 'allergies', 'courriel'].filter((word) =>
        text.includes(word),
      ).length,
      en: ['first name', 'last name', 'surname', 'phone', 'allergy'].filter((word) =>
        text.includes(word),
      ).length,
      fi: ['etunimi', 'sukunimi', 'puhelin', 'sahkoposti', 'allergia'].filter((word) =>
        text.includes(word),
      ).length,
    };
    const [language, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] as [
      'fr' | 'en' | 'fi',
      number,
    ];
    return score ? language : 'other';
  }

  private displayName(firstName: string, lastName: string) {
    return [firstName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  private validEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private existingIndex(
    clients: Array<{ id: string; name: string; email: string | null; phone: string | null }>,
  ) {
    const index = {
      email: new Map<string, (typeof clients)[number]>(),
      phone: new Map<string, (typeof clients)[number]>(),
      name: new Map<string, (typeof clients)[number]>(),
    };
    clients.forEach((client) => this.addToIndex(index, client));
    return index;
  }

  private addToIndex(
    index: ReturnType<CatererClientImportService['existingIndex']>,
    client: { id: string; name: string; email: string | null; phone: string | null },
  ) {
    if (client.email) index.email.set(client.email.trim().toLowerCase(), client);
    const phone = this.normalizePhone(client.phone);
    if (phone) index.phone.set(phone, client);
    index.name.set(this.normalize(client.name), client);
  }

  private findDuplicate(
    index: ReturnType<CatererClientImportService['existingIndex']>,
    fields: { email?: string; phone?: string },
    name: string,
  ) {
    return (
      (fields.email ? index.email.get(fields.email.trim().toLowerCase()) : undefined) ??
      (fields.phone ? index.phone.get(this.normalizePhone(fields.phone)) : undefined) ??
      index.name.get(this.normalize(name))
    );
  }

  private rowIdentity(fields: { email?: string; phone?: string }, name: string) {
    if (fields.email) return `email:${fields.email.trim().toLowerCase()}`;
    const phone = this.normalizePhone(fields.phone);
    if (phone) return `phone:${phone}`;
    return name ? `name:${this.normalize(name)}` : '';
  }

  private normalizePhone(value?: string | null) {
    return String(value ?? '')
      .replace(/[^\d+]/g, '')
      .replace(/(?!^)\+/g, '');
  }

  private normalize(value: string) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/[^a-z0-9@+\s/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private clean(value: unknown, max: number) {
    return String(value ?? '')
      .trim()
      .slice(0, max);
  }

  private uniqueHeaders(values: string[]) {
    const counts = new Map<string, number>();
    return values.map((value, index) => {
      const base = String(value || `Colonne ${index + 1}`).trim();
      const count = (counts.get(base) ?? 0) + 1;
      counts.set(base, count);
      return count === 1 ? base : `${base} (${count})`;
    });
  }

  private detectDelimiter(text: string) {
    const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
    return [',', ';', '\t'].sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  }

  private csvMatrix(text: string, delimiter: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        row.push(value.trim());
        value = '';
      } else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        row.push(value.trim());
        rows.push(row);
        row = [];
        value = '';
      } else value += character;
    }
    if (value || row.length) {
      row.push(value.trim());
      rows.push(row);
    }
    return rows;
  }

  private fileKind(file: UploadedFile): 'xlsx' | 'csv' | 'pdf' | 'image' {
    const name = file.originalname.toLowerCase();
    const mime = String(file.mimetype ?? '').toLowerCase();
    if (name.endsWith('.xlsx') || mime.includes('spreadsheetml')) return 'xlsx';
    if (name.endsWith('.csv') || ['text/csv', 'application/csv', 'text/plain'].includes(mime))
      return 'csv';
    if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
    if (/\.(png|jpe?g|webp)$/i.test(name) || mime.startsWith('image/')) return 'image';
    throw new BadRequestException(
      'Format non supporté. Utilisez CSV, XLSX, PDF, PNG, JPG ou WEBP.',
    );
  }

  private assertFile(file?: UploadedFile) {
    if (!file?.buffer?.length) throw new BadRequestException('Ajoutez un document client.');
    if ((file.size ?? file.buffer.length) > MAX_FILE_BYTES)
      throw new BadRequestException('Le document client dépasse 20 Mo.');
    this.fileKind(file);
  }

  private async assertClientsInstalled(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { clientsInstalledAt: true, menusInstalledAt: true },
    });
    if (!organization?.clientsInstalledAt && !organization?.menusInstalledAt)
      throw new BadRequestException('Le module Clients n’est pas installé.');
  }

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role))
      throw new ForbiddenException('Droits Clients insuffisants.');
  }
}
