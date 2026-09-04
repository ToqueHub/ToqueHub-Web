// @ts-nocheck
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuExportAudience, MenuExportFormat, MenuHistoryAction } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import PDFDocument from 'pdfkit';
import { PDFDocument as EditablePdfDocument, StandardFonts, rgb } from 'pdf-lib';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PrepareMenuExportDto } from './dto/menus.dto';

type Actor = { id: string; role: string };
type ExportLanguage = 'fr' | 'en';
type UploadedTemplate = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type Zone = { x: number; y: number; width: number; height: number };
type PublicLayout = {
  version: 1;
  titleZone: Zone;
  contentZone: Zone;
  style: {
    backgroundColor: string;
    titleBackgroundColor: string;
    contentBackgroundColor: string;
    textColor: string;
    accentColor: string;
    titleAlignment: 'left' | 'center' | 'right';
    itemAlignment: 'left' | 'center' | 'right';
  };
  detectedTitle?: string | null;
  confidence?: number | null;
};

const MANAGER_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef'];
const ALLOWED_AUDIENCES = new Set<MenuExportAudience>([
  MenuExportAudience.KITCHEN,
  MenuExportAudience.DINING_ROOM,
  MenuExportAudience.PUBLIC_DISPLAY,
]);
const MENU_FILES_ROOT = resolve(
  process.env.MENU_FILES_DIR || process.env.UPLOAD_DIR || 'uploads',
  'menus',
);
const TEMPLATE_ROOT = join(MENU_FILES_ROOT, 'display-templates');
const EXPORT_ROOT = join(MENU_FILES_ROOT, 'exports');
const TEMPLATE_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const TEMPLATE_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;
const SECTION_LABELS: Record<string, string> = {
  STARTER: 'Entrées',
  MAIN: 'Plats',
  SIDE: 'Accompagnements',
  CHEESE: 'Fromages',
  DESSERT: 'Desserts',
  DRINK: 'Boissons',
  OTHER: 'Autres',
};
const SECTION_LABELS_EN: Record<string, string> = {
  STARTER: 'Starters',
  MAIN: 'Main courses',
  SIDE: 'Side dishes',
  CHEESE: 'Cheeses',
  DESSERT: 'Desserts',
  DRINK: 'Drinks',
  OTHER: 'Other',
};

@Injectable()
export class MenuExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralClientService,
  ) {}

  async list(organizationId: string, query: { menuId?: string; activity?: string } = {}) {
    await this.assertInstalled(organizationId);
    return this.prisma.menuExport.findMany({
      where: {
        organizationId,
        menuId: query.menuId,
        menu: query.activity ? { activity: query.activity as any } : undefined,
      },
      include: {
        requestedBy: { select: { email: true, firstName: true, lastName: true } },
        menu: true,
        template: { select: { id: true, name: true, originalName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async templates(organizationId: string) {
    await this.assertInstalled(organizationId);
    return this.prisma.menuDisplayTemplate.findMany({
      where: { organizationId, isArchived: false },
      select: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        pageCount: true,
        layout: true,
        status: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async uploadTemplate(
    organizationId: string,
    actor: Actor,
    name: string | undefined,
    file: UploadedTemplate,
  ) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    this.validateTemplateFile(file);

    const analyzed = await this.mistral.ocrMarkdown(organizationId, {
      buffer: file.buffer,
      mimeType: this.templateMime(file),
      withAnnotation: true,
      documentAnnotationPrompt: this.layoutPrompt(),
      documentAnnotationFormat: this.layoutResponseFormat(),
    });
    const layout = this.layoutFromOcr(analyzed.rawJson);
    const id = randomUUID();
    const extension = this.templateExtension(file);
    const storagePath = join(organizationId, `${id}${extension}`);
    await mkdir(join(TEMPLATE_ROOT, organizationId), { recursive: true });
    await writeFile(join(TEMPLATE_ROOT, storagePath), file.buffer);
    const existingCount = await this.prisma.menuDisplayTemplate.count({
      where: { organizationId, isArchived: false },
    });
    return this.prisma.menuDisplayTemplate.create({
      data: {
        id,
        organizationId,
        createdById: actor.id,
        name: this.cleanName(name) || this.nameFromFilename(file.originalname),
        originalName: file.originalname,
        mimeType: this.templateMime(file),
        sizeBytes: file.size ?? file.buffer.length,
        storagePath,
        pageCount: analyzed.pageCount,
        ocrText: analyzed.markdown.slice(0, 100_000),
        layout,
        status: 'READY',
        isDefault: existingCount === 0,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        pageCount: true,
        layout: true,
        status: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async setDefaultTemplate(organizationId: string, actor: Actor, id: string) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    const template = await this.template(organizationId, id);
    await this.prisma.$transaction([
      this.prisma.menuDisplayTemplate.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.menuDisplayTemplate.update({
        where: { id: template.id },
        data: { isDefault: true },
      }),
    ]);
    return { id: template.id, isDefault: true };
  }

  async archiveTemplate(organizationId: string, actor: Actor, id: string) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    const template = await this.template(organizationId, id);
    await this.prisma.menuDisplayTemplate.update({
      where: { id: template.id },
      data: { isArchived: true, archivedAt: new Date(), isDefault: false },
    });
    const fallback = await this.prisma.menuDisplayTemplate.findFirst({
      where: { organizationId, isArchived: false },
      orderBy: { createdAt: 'desc' },
    });
    if (fallback) {
      await this.prisma.menuDisplayTemplate.update({
        where: { id: fallback.id },
        data: { isDefault: true },
      });
    }
    return { archived: true };
  }

  async templateSource(organizationId: string, id: string) {
    const template = await this.template(organizationId, id);
    return {
      buffer: await readFile(this.safeStoredPath(TEMPLATE_ROOT, template.storagePath)),
      filename: template.originalName,
      mimeType: template.mimeType,
    };
  }

  async prepare(organizationId: string, actor: Actor, dto: PrepareMenuExportDto) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    if (!dto.menuId) throw new BadRequestException('Choisissez le menu à exporter.');
    if (dto.format !== MenuExportFormat.PDF) {
      throw new BadRequestException('Les exports Menus V1 sont générés en PDF.');
    }
    if (!ALLOWED_AUDIENCES.has(dto.audience)) {
      throw new BadRequestException('Ce type d’export n’est plus proposé.');
    }

    const [menu, organization] = await Promise.all([
      this.exportMenu(organizationId, dto.menuId),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, logoDataUrl: true, mainSiteName: true },
      }),
    ]);
    if (!menu) throw new NotFoundException('Menu introuvable.');
    if (!menu.items.length)
      throw new BadRequestException('Ce menu ne contient aucun article à exporter.');

    const language: ExportLanguage = dto.language === 'en' ? 'en' : 'fr';
    const buffer =
      dto.audience === MenuExportAudience.KITCHEN
        ? await this.kitchenPdf(menu, organization, language)
        : dto.audience === MenuExportAudience.DINING_ROOM
          ? await this.diningRoomPdf(menu, organization, language)
          : await this.publicToqueHubPdf(menu, organization, language);

    const id = randomUUID();
    const filename = `${this.slug(menu.name)}-${this.audienceSlug(dto.audience, language)}.pdf`;
    const storagePath = join(organizationId, `${id}.pdf`);
    await mkdir(join(EXPORT_ROOT, organizationId), { recursive: true });
    await writeFile(join(EXPORT_ROOT, storagePath), buffer);
    const snapshot = {
      generatedAt: new Date().toISOString(),
      storagePath,
      audience: dto.audience,
      language,
      menu: this.menuSnapshot(menu, language),
      template: null,
    };
    const created = await this.prisma.menuExport.create({
      data: {
        id,
        organizationId,
        menuId: menu.id,
        requestedById: actor.id,
        templateId: null,
        format: MenuExportFormat.PDF,
        audience: dto.audience,
        filename,
        filters: dto.filters,
        snapshot,
        fileUrl: `/api/menus/exports/${id}/download`,
      },
      include: { menu: true, template: { select: { id: true, name: true, originalName: true } } },
    });
    await this.prisma.menuHistory.create({
      data: {
        organizationId,
        menuId: menu.id,
        actorUserId: actor.id,
        action: MenuHistoryAction.EXPORT_GENERATED,
        summary:
          language === 'en'
            ? `${this.audienceLabel(dto.audience, language)} export generated`
            : `Export ${this.audienceLabel(dto.audience, language)} généré`,
        details: { exportId: created.id, templateId: null },
      },
    });
    return created;
  }

  async download(organizationId: string, id: string) {
    const item = await this.prisma.menuExport.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Export introuvable.');
    const snapshot = item.snapshot as Record<string, unknown>;
    const storagePath = String(snapshot?.storagePath ?? '');
    if (!storagePath)
      throw new NotFoundException('Le fichier de cet ancien export n’est pas disponible.');
    return {
      buffer: await readFile(this.safeStoredPath(EXPORT_ROOT, storagePath)),
      filename: item.filename,
      mimeType: 'application/pdf',
    };
  }

  private async exportMenu(organizationId: string, id: string) {
    return this.prisma.menu.findFirst({
      where: { id, organizationId },
      include: {
        site: true,
        items: {
          orderBy: [{ position: 'asc' }],
          include: {
            menuCategory: true,
            product: { include: { unit: true, primarySupplier: true } },
            technicalSheet: {
              include: {
                category: true,
                yieldUnit: true,
                ingredients: {
                  orderBy: [{ order: 'asc' }],
                  include: {
                    product: { include: { unit: true, primarySupplier: true } },
                    unit: true,
                    sourceTechnicalSheet: true,
                    allergens: { include: { allergen: true } },
                  },
                },
                steps: { orderBy: [{ order: 'asc' }] },
              },
            },
          },
        },
      },
    });
  }

  private async publicPdfFromTemplate(menu: any, template: any) {
    const source = await readFile(this.safeStoredPath(TEMPLATE_ROOT, template.storagePath));
    let pdf: EditablePdfDocument;
    if (
      template.mimeType === 'application/pdf' ||
      template.originalName.toLowerCase().endsWith('.pdf')
    ) {
      try {
        pdf = await EditablePdfDocument.load(source);
      } catch {
        throw new BadRequestException(
          'Le PDF du modèle ne peut pas être ouvert. Réimportez un document non protégé.',
        );
      }
      while (pdf.getPageCount() > 1) pdf.removePage(1);
    } else {
      pdf = await EditablePdfDocument.create();
      const image =
        template.mimeType === 'image/png' ? await pdf.embedPng(source) : await pdf.embedJpg(source);
      const dimensions = image.scale(1);
      const maxWidth = 842;
      const scale = Math.min(1, maxWidth / dimensions.width);
      const page = pdf.addPage([dimensions.width * scale, dimensions.height * scale]);
      page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    }
    const page = pdf.getPage(0);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const layout = this.normalizeLayout(template.layout);
    const titleBackground = this.pdfColor(
      layout.style.titleBackgroundColor,
      layout.style.backgroundColor,
    );
    const contentBackground = this.pdfColor(
      layout.style.contentBackgroundColor,
      layout.style.backgroundColor,
    );
    const textColor = this.pdfColor(layout.style.textColor, '#0f172a');
    const accent = this.pdfColor(layout.style.accentColor, '#0f766e');
    const titleZone = this.pageZone(page, layout.titleZone);
    const contentZone = this.pageZone(page, layout.contentZone);
    page.drawRectangle({ ...this.paddedPageZone(page, titleZone, 14, 8), color: titleBackground });
    page.drawRectangle({
      ...this.paddedPageZone(page, contentZone, 14, 18),
      color: contentBackground,
    });
    this.drawEditableText(
      page,
      menu.name,
      titleZone,
      bold,
      Math.min(30, titleZone.height * 0.48),
      textColor,
      layout.style.titleAlignment,
    );

    const groups = this.publicGroups(menu);
    const units = groups.reduce((total, group) => total + 1.35 + group.items.length, 0) || 1;
    const rowHeight = Math.max(9, Math.min(24, contentZone.height / units));
    const categorySize = Math.max(8, Math.min(18, rowHeight * 0.72));
    const itemSize = Math.max(7, Math.min(14, rowHeight * 0.58));
    let top = contentZone.y + contentZone.height;
    for (const group of groups) {
      top -= rowHeight * 1.15;
      this.drawEditableText(
        page,
        group.name.toUpperCase(),
        {
          x: contentZone.x,
          y: top,
          width: contentZone.width,
          height: rowHeight,
        },
        bold,
        categorySize,
        accent,
        layout.style.itemAlignment,
      );
      for (const item of group.items) {
        top -= rowHeight;
        if (top < contentZone.y) break;
        this.drawEditableText(
          page,
          item.name,
          {
            x: contentZone.x,
            y: top,
            width: contentZone.width,
            height: rowHeight,
          },
          font,
          itemSize,
          textColor,
          layout.style.itemAlignment,
        );
      }
    }
    return Buffer.from(await pdf.save());
  }

  private async publicToqueHubPdf(
    menu: any,
    organization: any,
    language: ExportLanguage = 'fr',
  ) {
    const reference = this.menuReference(menu, language);
    const documentTitle = this.text(language, 'NOTRE MENU', 'OUR MENU');
    return this.pdfKitBuffer(
      (doc) => {
        let y = this.drawRestaurantDocumentHeader(
          doc,
          organization,
          documentTitle,
          reference,
          true,
        );
        const menuName = String(menu.name ?? 'Menu');
        doc
          .fillColor('#0f172a')
          .font('Helvetica-Bold')
          .fontSize(26)
          .text(menuName, 58, y, { width: 479, align: 'center' });
        y += doc.heightOfString(menuName, { width: 479 }) + 13;
        doc
          .fillColor('#0f766e')
          .font('Helvetica-Bold')
          .fontSize(11)
          .text(this.menuLongDateLabel(menu, language), 58, y, {
            width: 479,
            align: 'center',
          });
        y += 27;

        const location = [menu.site?.name ?? organization?.mainSiteName, menu.site?.address]
          .filter(Boolean)
          .join(' · ');
        if (location) {
          doc
            .fillColor('#64748b')
            .font('Helvetica')
            .fontSize(9.5)
            .text(location, 72, y, { width: 451, align: 'center' });
          y += doc.heightOfString(location, { width: 451 }) + 21;
        }
        doc.moveTo(180, y).lineTo(415, y).strokeColor('#d6d3d1').lineWidth(1).stroke();
        y += 23;

        doc
          .fillColor('#0f766e')
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(this.menuServiceLabel(menu.service, language).toUpperCase(), 58, y, {
            width: 479,
            align: 'center',
            characterSpacing: 1.2,
          });
        y += 20;
        if (menu.description) {
          doc
            .fillColor('#78716c')
            .font('Helvetica-Oblique')
            .fontSize(9)
            .text(String(menu.description), 86, y, { width: 423, align: 'center' });
          y += doc.heightOfString(String(menu.description), { width: 423 }) + 18;
        }

        for (const group of this.publicGroups(menu, language)) {
          y = this.ensureRestaurantDocumentSpace(
            doc,
            y,
            38 + group.items.length * 35,
            organization,
            documentTitle,
            reference,
            true,
          );
          doc
            .fillColor('#a16207')
            .font('Helvetica-Bold')
            .fontSize(8)
            .text(group.name.toUpperCase(), 82, y, {
              width: 431,
              align: 'center',
              characterSpacing: 1.4,
            });
          y += 17;
          for (const item of group.items) {
            y = this.ensureRestaurantDocumentSpace(
              doc,
              y,
              item.description ? 48 : 30,
              organization,
              documentTitle,
              reference,
              true,
            );
            doc
              .fillColor('#1c1917')
              .font('Helvetica-Bold')
              .fontSize(11)
              .text(item.name, 82, y, { width: 431, align: 'center' });
            y += doc.heightOfString(item.name, { width: 431 }) + 3;
            if (item.description) {
              doc
                .fillColor('#78716c')
                .font('Helvetica-Oblique')
                .fontSize(8.5)
                .text(item.description, 100, y, { width: 395, align: 'center', height: 25 });
              y += Math.min(doc.heightOfString(item.description, { width: 395 }), 25) + 8;
            } else {
              y += 9;
            }
          }
          y += 7;
        }

        y = this.ensureRestaurantDocumentSpace(
          doc,
          y + 7,
          76,
          organization,
          documentTitle,
          reference,
          true,
        );
        doc.moveTo(220, y).lineTo(375, y).strokeColor('#e7e5e4').stroke();
        y += 22;
        doc.roundedRect(58, y, 479, 54, 8).fill('#f0fdfa');
        doc
          .fillColor('#0f766e')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(this.text(language, 'BON APPÉTIT', 'ENJOY YOUR MEAL'), 72, y + 12, {
            width: 451,
            align: 'center',
          });
        doc
          .fillColor('#475569')
          .font('Helvetica')
          .fontSize(8.5)
          .text(
            language === 'en'
              ? `${organization?.name ?? 'Our team'} wishes you a wonderful experience.`
              : `${organization?.name ?? 'Notre équipe'} vous souhaite un agréable moment.`,
            72,
            y + 29,
            {
              width: 451,
              align: 'center',
            },
          );
      },
      `${this.text(language, 'Menu client', 'Customer menu')} — ${menu.name}`,
      {
        author: organization?.name ?? 'ToqueHub',
        footer: (page, count) =>
          `${organization?.name ?? 'Restaurant'} · ${reference} · ${page}/${count}`,
      },
    );
  }

  private async kitchenPdf(menu: any, organization: any, language: ExportLanguage = 'fr') {
    const reference = this.menuReference(menu, language);
    const documentTitle = this.text(language, 'DOSSIER CUISINE', 'KITCHEN FILE');
    return this.pdfKitBuffer(
      (doc) => {
        let y = this.drawRestaurantDocumentHeader(doc, organization, documentTitle, reference);
        const menuName = String(menu.name ?? 'Menu');
        doc
          .fillColor('#0f172a')
          .font('Helvetica-Bold')
          .fontSize(19)
          .text(menuName, 42, y, { width: 511 });
        y += doc.heightOfString(menuName, { width: 511 }) + 13;

        const volume = Number(menu.expectedGuests ?? 0);
        const metrics = [
          ['DATE', this.menuDateLabel(menu, language)],
          [
            this.text(language, 'SITE', 'LOCATION'),
            menu.site?.name ??
              organization?.mainSiteName ??
              this.text(language, 'Tous sites', 'All locations'),
          ],
          [
            this.text(language, 'SERVICE', 'MEAL SERVICE'),
            this.menuServiceLabel(menu.service, language),
          ],
          [
            this.text(language, 'VOLUME', 'VOLUME'),
            volume > 0
              ? `${this.number(volume, language)} ${this.text(language, 'couverts', 'covers')}`
              : `${menu.items?.length ?? 0} ${this.text(
                  language,
                  `composition${menu.items?.length === 1 ? '' : 's'}`,
                  `item${menu.items?.length === 1 ? '' : 's'}`,
                )}`,
          ],
        ];
        metrics.forEach(([label, value], index) =>
          this.drawRestaurantInfoCard(doc, 42 + index * 130, y, 121, label, value),
        );
        y += 68;

        y = this.ensureRestaurantDocumentSpace(
          doc,
          y,
          124,
          organization,
          documentTitle,
          reference,
        );
        this.drawRestaurantSectionTitle(
          doc,
          this.text(language, 'ORGANISATION DU SERVICE', 'SERVICE ORGANIZATION'),
          y,
        );
        y += 23;
        y = this.drawRestaurantDefinitionBlock(
          doc,
          [
            [this.text(language, 'Menu', 'Menu'), menuName],
            [
              this.text(language, 'Type de service', 'Service type'),
              this.menuServiceLabel(menu.service, language),
            ],
            [
              this.text(language, 'Lieu', 'Location'),
              menu.site?.address ??
                menu.site?.name ??
                organization?.mainSiteName ??
                this.text(language, 'À renseigner', 'To be completed'),
            ],
            [
              this.text(language, 'Consignes', 'Instructions'),
              menu.description ??
                this.text(language, 'Aucune consigne particulière', 'No special instructions'),
            ],
          ],
          y,
        );

        y = this.ensureRestaurantDocumentSpace(
          doc,
          y + 14,
          Math.min(166 + (menu.items?.length ?? 0) * 38, 330),
          organization,
          documentTitle,
          reference,
        );
        doc.roundedRect(42, y, 511, 38, 7).fill('#0f766e');
        doc
          .fillColor('#ccfbf1')
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(this.text(language, 'MENU À PRODUIRE', 'MENU TO PRODUCE'), 54, y + 8);
        doc
          .fillColor('#ffffff')
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(menuName, 54, y + 19, {
            width: 310,
          });
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(
            volume > 0
              ? `${this.number(volume, language)} ${this.text(language, 'couverts', 'covers')}`
              : `${menu.items?.length ?? 0} ${this.text(language, 'éléments', 'items')}`,
            426,
            y + 14,
            {
              width: 112,
              align: 'right',
            },
          );
        y += 48;

        const serviceFacts = [
          [
            this.text(language, 'SERVICE', 'MEAL SERVICE'),
            this.menuServiceLabel(menu.service, language),
          ],
          [
            this.text(language, 'DATE DE PRODUCTION', 'PRODUCTION DATE'),
            this.menuDateLabel(menu, language),
          ],
          [
            this.text(language, 'SITE DE PRODUCTION', 'PRODUCTION LOCATION'),
            menu.site?.name ??
              organization?.mainSiteName ??
              this.text(language, 'À renseigner', 'To be completed'),
          ],
        ];
        serviceFacts.forEach(([label, value], index) => {
          const x = 42 + index * 170;
          doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7).text(label, x, y);
          doc
            .fillColor('#0f172a')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(value, x, y + 11, {
              width: 158,
              height: 18,
            });
        });
        y += 34;

        doc.rect(42, y, 511, 22).fill('#e2e8f0');
        doc
          .fillColor('#334155')
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(this.text(language, 'COMPOSITION À PRODUIRE', 'ITEMS TO PRODUCE'), 54, y + 7);
        doc.text(this.text(language, 'QUANTITÉ', 'QUANTITY'), 413, y + 7, {
          width: 72,
          align: 'right',
        });
        doc.text('OK', 508, y + 7, { width: 28, align: 'center' });
        y += 22;

        for (const [index, item] of (menu.items ?? []).entries()) {
          const allergens = this.itemAllergens(item);
          const rowHeight = allergens.length ? 38 : 29;
          y = this.ensureRestaurantDocumentSpace(
            doc,
            y,
            rowHeight + 2,
            organization,
            documentTitle,
            reference,
          );
          const name =
            item.technicalSheet?.name ??
            item.product?.name ??
            this.text(language, 'Article', 'Item');
          const category =
            item.menuCategory?.name ??
            (language === 'en' ? SECTION_LABELS_EN[item.section] : SECTION_LABELS[item.section]) ??
            this.text(language, 'Autres', 'Other');
          const quantity = this.targetPortions(menu, item);
          const unit = item.technicalSheet
            ? 'portions'
            : (item.product?.unit?.symbol ?? this.text(language, 'unités', 'units'));
          doc
            .rect(42, y, 511, rowHeight)
            .fillAndStroke(index % 2 ? '#ffffff' : '#f8fafc', '#e2e8f0');
          doc
            .fillColor('#0f172a')
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .text(name, 54, y + 6, { width: 330 });
          if (allergens.length) {
            doc
              .fillColor('#b45309')
              .font('Helvetica')
              .fontSize(7.5)
              .text(
                `${category} · ${this.text(language, 'Allergènes', 'Allergens')}: ${allergens.join(', ')}`,
                54,
                y + 21,
                {
                width: 330,
                height: 12,
                },
              );
          } else {
            doc
              .fillColor('#64748b')
              .font('Helvetica')
              .fontSize(7.5)
              .text(category, 54, y + 19, { width: 330, height: 10 });
          }
          doc
            .fillColor('#0f172a')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(`${this.number(quantity, language)} ${unit}`, 400, y + 8, {
              width: 85,
              align: 'right',
            });
          doc.rect(514, y + 8, 12, 12).stroke('#64748b');
          y += rowHeight;
        }

        y = this.ensureRestaurantDocumentSpace(
          doc,
          y + 16,
          96,
          organization,
          documentTitle,
          reference,
        );
        this.drawRestaurantSectionTitle(
          doc,
          this.text(language, 'CONTRÔLES AVANT SERVICE', 'PRE-SERVICE CHECKS'),
          y,
        );
        y += 24;
        (language === 'en'
          ? [
              'Quantities and packaging checked',
              'Labels and allergens checked',
              'Temperatures recorded',
              'Station and equipment prepared',
            ]
          : [
              'Quantités et conditionnement contrôlés',
              'Étiquetage et allergènes contrôlés',
              'Températures relevées',
              'Mise en place et matériel préparés',
            ]
        ).forEach((label, index) =>
          this.drawRestaurantChecklistLine(
            doc,
            label,
            42 + (index % 2) * 255,
            y + Math.floor(index / 2) * 25,
            245,
          ),
        );
      },
      `${this.text(language, 'Dossier cuisine', 'Kitchen file')} — ${menu.name}`,
      {
        author: organization?.name ?? 'ToqueHub',
        footer: (page, count) =>
          `${reference} · ${this.text(language, 'Document opérationnel', 'Operational document')} · ${this.text(language, 'Généré le', 'Generated on')} ${new Date().toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR')} · ${page}/${count}`,
      },
    );
  }

  private async diningRoomPdf(menu: any, organization: any, language: ExportLanguage = 'fr') {
    const documentTitle = this.text(language, 'FICHE SALLE', 'DINING ROOM BRIEF');
    return this.pdfKitBuffer((doc) => {
      this.drawBrandPage(doc, organization, menu.name, documentTitle);
      let y = 140;
      doc
        .fillColor('#475569')
        .font('Helvetica')
        .fontSize(9.5)
        .text(
          this.text(
            language,
            'Support de briefing: composition, allergènes, origine et arguments utiles pour présenter chaque article.',
            'Briefing guide: composition, allergens, origin and key points for presenting each item.',
          ),
          48,
          y,
          { width: 499 },
        );
      y += 38;
      for (const group of this.publicGroups(menu, language)) {
        y = this.ensureSpace(doc, organization, menu.name, documentTitle, y, 55);
        doc
          .fillColor('#10b981')
          .font('Helvetica-Bold')
          .fontSize(13)
          .text(group.name.toUpperCase(), 48, y);
        y += 28;
        for (const item of group.items) {
          const allergens = this.itemAllergens(item.raw);
          const suppliers = this.itemSuppliers(item.raw);
          const description =
            item.description ||
            this.text(
              language,
              'Présentation commerciale à compléter dans la fiche technique.',
              'Commercial description to be completed in the technical sheet.',
            );
          const meta = [
            allergens.length
              ? `${this.text(language, 'Allergènes', 'Allergens')}: ${allergens.join(', ')}`
              : this.text(language, 'Allergènes: aucun renseigné', 'Allergens: none provided'),
            suppliers.length
              ? `${this.text(language, 'Fournisseurs', 'Suppliers')}: ${suppliers.join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('  |  ');
          const cardHeight = Math.max(
            82,
            doc.heightOfString(description, { width: 455 }) +
              doc.heightOfString(meta, { width: 455 }) +
              47,
          );
          y = this.ensureSpace(doc, organization, menu.name, documentTitle, y, cardHeight + 10);
          doc.roundedRect(48, y, 499, cardHeight, 10).fillAndStroke('#f8fafc', '#dbe4ee');
          doc
            .fillColor('#0f172a')
            .font('Helvetica-Bold')
            .fontSize(11)
            .text(item.name, 62, y + 13, { width: 455 });
          doc
            .fillColor('#475569')
            .font('Helvetica')
            .fontSize(9)
            .text(description, 62, y + 33, { width: 455 });
          doc
            .fillColor(allergens.length ? '#b45309' : '#64748b')
            .font('Helvetica-Bold')
            .fontSize(8)
            .text(meta, 62, y + cardHeight - 24, { width: 455 });
          y += cardHeight + 12;
        }
      }
    }, `${this.text(language, 'Fiche salle', 'Dining room brief')} - ${menu.name}`);
  }

  private pdfKitBuffer(
    draw: (doc: PDFKit.PDFDocument) => void,
    title: string,
    options: { author?: string; footer?: (page: number, pageCount: number) => string } = {},
  ) {
    return new Promise<Buffer>((resolveBuffer, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true,
        info: { Title: title, Author: options.author ?? 'ToqueHub' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on('end', () => resolveBuffer(Buffer.concat(chunks)));
      doc.on('error', reject);
      draw(doc);
      const range = doc.bufferedPageRange();
      for (let index = range.start; index < range.start + range.count; index += 1) {
        doc.switchToPage(index);
        doc
          .fillColor('#94a3b8')
          .font('Helvetica')
          .fontSize(7.5)
          .text(
            options.footer?.(index + 1, range.count) ??
              `Généré par ToqueHub - ${new Date().toLocaleDateString('fr-FR')} - Page ${index + 1}/${range.count}`,
            48,
            doc.page.height - 32,
            { width: doc.page.width - 96, align: 'center' },
          );
      }
      doc.end();
    });
  }

  private drawRestaurantDocumentHeader(
    doc: PDFKit.PDFDocument,
    organization: any,
    title: string,
    reference: string,
    client = false,
  ) {
    doc.rect(0, 0, 595, client ? 105 : 92).fill(client ? '#fafaf9' : '#0f172a');
    doc.rect(0, client ? 101 : 88, 595, 4).fill(client ? '#d6b36a' : '#14b8a6');
    const logo = this.logoBuffer(organization?.logoDataUrl);
    let textX = 42;
    if (logo) {
      try {
        doc.image(logo, 42, 22, { fit: [48, 48], align: 'center', valign: 'center' });
        textX = 104;
      } catch {
        textX = 42;
      }
    }
    doc
      .fillColor(client ? '#1c1917' : '#ffffff')
      .font('Helvetica-Bold')
      .fontSize(client ? 15 : 13)
      .text(organization?.name ?? 'ToqueHub', textX, 26, { width: 300 });
    doc
      .fillColor(client ? '#a16207' : '#5eead4')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(title, textX, 49, { characterSpacing: 1.2 });
    doc
      .fillColor(client ? '#78716c' : '#cbd5e1')
      .font('Helvetica')
      .fontSize(8)
      .text(reference, 420, 37, { width: 133, align: 'right' });
    return client ? 132 : 116;
  }

  private drawRestaurantInfoCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
  ) {
    doc.roundedRect(x, y, width, 54, 6).fillAndStroke('#f8fafc', '#e2e8f0');
    doc
      .fillColor('#0f766e')
      .font('Helvetica-Bold')
      .fontSize(6.8)
      .text(label, x + 9, y + 9, { width: width - 18 });
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(value, x + 9, y + 24, { width: width - 18, height: 23 });
  }

  private drawRestaurantSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number) {
    doc
      .fillColor('#0f766e')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(title, 42, y, { characterSpacing: 1.2 });
    doc
      .moveTo(178, y + 5)
      .lineTo(553, y + 5)
      .strokeColor('#cbd5e1')
      .lineWidth(0.7)
      .stroke();
  }

  private drawRestaurantDefinitionBlock(
    doc: PDFKit.PDFDocument,
    rows: string[][],
    initialY: number,
  ) {
    let y = initialY;
    for (const [label, value] of rows) {
      const height = Math.max(25, doc.heightOfString(value, { width: 382 }) + 12);
      doc.rect(42, y, 511, height).fillAndStroke('#ffffff', '#e2e8f0');
      doc
        .fillColor('#64748b')
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(label.toUpperCase(), 53, y + 8, { width: 100 });
      doc
        .fillColor('#0f172a')
        .font('Helvetica')
        .fontSize(8.5)
        .text(value, 160, y + 7, { width: 382 });
      y += height;
    }
    return y;
  }

  private drawRestaurantChecklistLine(
    doc: PDFKit.PDFDocument,
    label: string,
    x: number,
    y: number,
    width: number,
  ) {
    doc.rect(x, y, 12, 12).stroke('#64748b');
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(8)
      .text(label, x + 20, y + 1, { width: width - 20 });
  }

  private ensureRestaurantDocumentSpace(
    doc: PDFKit.PDFDocument,
    y: number,
    required: number,
    organization: any,
    title: string,
    reference: string,
    client = false,
  ) {
    if (y + required < 795) return y;
    doc.addPage({ size: 'A4', margin: 0 });
    return this.drawRestaurantDocumentHeader(doc, organization, title, reference, client);
  }

  private drawBrandPage(doc: PDFKit.PDFDocument, organization: any, title: string, kicker: string) {
    doc.rect(0, 0, doc.page.width, 112).fill('#081a2d');
    doc.rect(0, 106, doc.page.width, 6).fill('#10b981');
    const logo = this.logoBuffer(organization?.logoDataUrl);
    let left = 48;
    if (logo) {
      try {
        doc.image(logo, 48, 26, { fit: [52, 52], align: 'center', valign: 'center' });
        left = 116;
      } catch {
        left = 48;
      }
    }
    doc
      .fillColor('#6ee7b7')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(kicker, left, 25, { characterSpacing: 1.1 });
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(21)
      .text(title, left, 43, { width: doc.page.width - left - 48, height: 34 });
    doc
      .fillColor('#cbd5e1')
      .font('Helvetica')
      .fontSize(8.5)
      .text(organization?.name ?? 'ToqueHub', left, 79, { width: doc.page.width - left - 48 });
  }

  private ensureSpace(
    doc: PDFKit.PDFDocument,
    organization: any,
    title: string,
    kicker: string,
    y: number,
    required: number,
  ) {
    if (y + required <= doc.page.height - 48) return y;
    doc.addPage({ size: 'A4', margin: 0 });
    this.drawBrandPage(doc, organization, title, kicker);
    return 135;
  }

  private drawMetric(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
  ) {
    doc.roundedRect(x, y, width, 60, 9).fillAndStroke('#ecfdf5', '#a7f3d0');
    doc
      .fillColor('#047857')
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(label, x + 11, y + 11, { width: width - 22 });
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(value, x + 11, y + 31, { width: width - 22 });
  }

  private publicGroups(menu: any, language: ExportLanguage = 'fr') {
    const groups = new Map<string, any[]>();
    for (const item of menu.items ?? []) {
      const name =
        item.menuCategory?.name ??
        (language === 'en' ? SECTION_LABELS_EN[item.section] : SECTION_LABELS[item.section]) ??
        this.text(language, 'Autres', 'Other');
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push({
        name:
          item.technicalSheet?.name ??
          item.product?.name ??
          this.text(language, 'Article', 'Item'),
        description: item.notes ?? item.technicalSheet?.description ?? null,
        raw: item,
      });
    }
    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  }

  private itemAllergens(item: any) {
    return [
      ...new Set(
        (item.technicalSheet?.ingredients ?? []).flatMap((ingredient: any) =>
          (ingredient.allergens ?? []).map((entry: any) => entry.allergen?.name).filter(Boolean),
        ),
      ),
    ].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  }

  private itemSuppliers(item: any) {
    const values = item.product?.primarySupplier?.name
      ? [item.product.primarySupplier.name]
      : (item.technicalSheet?.ingredients ?? [])
          .map((ingredient: any) => ingredient.product?.primarySupplier?.name)
          .filter(Boolean);
    return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  }

  private targetPortions(menu: any, item: any) {
    return (
      Number(
        item.portionsOverride ??
          item.targetReadyQuantity ??
          menu.expectedGuests ??
          item.technicalSheet?.referencePortions ??
          1,
      ) || 1
    );
  }

  private menuSnapshot(menu: any, language: ExportLanguage = 'fr') {
    return {
      id: menu.id,
      name: menu.name,
      date: menu.date,
      site: menu.site ? { id: menu.site.id, name: menu.site.name } : null,
      items: this.publicGroups(menu, language).map((group) => ({
        name: group.name,
        items: group.items.map((item) => ({ name: item.name, description: item.description })),
      })),
    };
  }

  private drawEditableText(
    page: any,
    text: string,
    zone: any,
    font: any,
    size: number,
    color: any,
    alignment: string,
  ) {
    const lines = this.wrapEditableText(this.editableText(text), font, size, zone.width);
    const lineHeight = size * 1.18;
    let y = zone.y + zone.height - size;
    for (const line of lines.slice(0, Math.max(1, Math.floor(zone.height / lineHeight)))) {
      const width = font.widthOfTextAtSize(line, size);
      const x =
        alignment === 'center'
          ? zone.x + (zone.width - width) / 2
          : alignment === 'right'
            ? zone.x + zone.width - width
            : zone.x;
      page.drawText(line, { x: Math.max(zone.x, x), y, size, font, color });
      y -= lineHeight;
    }
  }

  private editableText(value: unknown) {
    return String(value ?? '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private wrapEditableText(text: string, font: any, size: number, width: number) {
    const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  private pageZone(page: any, zone: Zone) {
    const width = page.getWidth();
    const height = page.getHeight();
    return {
      x: zone.x * width,
      y: height - (zone.y + zone.height) * height,
      width: zone.width * width,
      height: zone.height * height,
    };
  }

  private normalizeLayout(value: any): PublicLayout {
    const fallback = this.fallbackLayout();
    const layout = value && typeof value === 'object' ? value : fallback;
    const backgroundColor = this.hex(layout.style?.backgroundColor, fallback.style.backgroundColor);
    return {
      version: 1,
      titleZone: this.normalizeZone(layout.titleZone, fallback.titleZone),
      contentZone: this.normalizeZone(layout.contentZone, fallback.contentZone),
      style: {
        backgroundColor,
        titleBackgroundColor: this.hex(layout.style?.titleBackgroundColor, backgroundColor),
        contentBackgroundColor: this.hex(layout.style?.contentBackgroundColor, backgroundColor),
        textColor: this.hex(layout.style?.textColor, fallback.style.textColor),
        accentColor: this.hex(layout.style?.accentColor, fallback.style.accentColor),
        titleAlignment: this.alignment(layout.style?.titleAlignment),
        itemAlignment: this.alignment(layout.style?.itemAlignment),
      },
      detectedTitle: layout.detectedTitle ? String(layout.detectedTitle).slice(0, 200) : null,
      confidence: Number.isFinite(Number(layout.confidence))
        ? Math.max(0, Math.min(1, Number(layout.confidence)))
        : null,
    };
  }

  private layoutFromOcr(rawJson: any) {
    const annotation = rawJson?.document_annotation;
    if (!annotation) return this.fallbackLayout();
    try {
      const parsed =
        typeof annotation === 'string'
          ? JSON.parse(annotation.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
          : annotation;
      return this.normalizeLayout(parsed);
    } catch {
      return this.fallbackLayout();
    }
  }

  private fallbackLayout(): PublicLayout {
    return {
      version: 1,
      titleZone: { x: 0.12, y: 0.08, width: 0.76, height: 0.1 },
      contentZone: { x: 0.12, y: 0.22, width: 0.76, height: 0.64 },
      style: {
        backgroundColor: '#ffffff',
        titleBackgroundColor: '#ffffff',
        contentBackgroundColor: '#ffffff',
        textColor: '#0f172a',
        accentColor: '#0f766e',
        titleAlignment: 'center',
        itemAlignment: 'center',
      },
      detectedTitle: null,
      confidence: null,
    };
  }

  private layoutPrompt() {
    return [
      'Analyse ce modèle graphique de carte de restaurant ou de boissons.',
      'Retourne uniquement le JSON conforme au schéma.',
      'Repère la zone du titre du menu et la grande zone contenant les catégories et articles qui devront être remplacés.',
      'Les coordonnées x, y, width et height sont normalisées entre 0 et 1, origine en haut à gauche.',
      'Ne recouvre jamais le logo, les bordures, illustrations, coordonnées, pied de page ou éléments décoratifs de la marque.',
      'Déduis séparément la couleur du fond derrière le titre et celle du fond derrière les articles, ainsi que la couleur du texte, la couleur d’accent et les alignements.',
      'titleBackgroundColor doit être la couleur exacte du bandeau directement derrière les lettres du titre: si le titre est blanc sur un bandeau bleu ou noir, retourne le bleu ou le noir, jamais le blanc.',
      'contentBackgroundColor doit être la couleur exacte directement derrière les anciennes catégories et les anciens plats, en ignorant la couleur des lettres.',
      'backgroundColor est une valeur de compatibilité et doit être identique à contentBackgroundColor.',
      'La contentZone doit être assez grande pour recevoir le nouveau menu mais rester dans la zone de texte existante.',
    ].join('\n');
  }

  private layoutResponseFormat() {
    const zone = {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y', 'width', 'height'],
      properties: {
        x: { type: 'number', minimum: 0, maximum: 1 },
        y: { type: 'number', minimum: 0, maximum: 1 },
        width: { type: 'number', minimum: 0.05, maximum: 1 },
        height: { type: 'number', minimum: 0.03, maximum: 1 },
      },
    };
    return {
      type: 'json_schema',
      json_schema: {
        name: 'toquehub_menu_display_layout',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['titleZone', 'contentZone', 'style', 'detectedTitle', 'confidence'],
          properties: {
            titleZone: zone,
            contentZone: zone,
            style: {
              type: 'object',
              additionalProperties: false,
              required: [
                'backgroundColor',
                'titleBackgroundColor',
                'contentBackgroundColor',
                'textColor',
                'accentColor',
                'titleAlignment',
                'itemAlignment',
              ],
              properties: {
                backgroundColor: { type: 'string' },
                titleBackgroundColor: { type: 'string' },
                contentBackgroundColor: { type: 'string' },
                textColor: { type: 'string' },
                accentColor: { type: 'string' },
                titleAlignment: { type: 'string', enum: ['left', 'center', 'right'] },
                itemAlignment: { type: 'string', enum: ['left', 'center', 'right'] },
              },
            },
            detectedTitle: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            confidence: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          },
        },
      },
    };
  }

  private normalizeZone(value: any, fallback: Zone): Zone {
    const zone = {
      x: this.clamp(value?.x, fallback.x),
      y: this.clamp(value?.y, fallback.y),
      width: this.clamp(value?.width, fallback.width, 0.05),
      height: this.clamp(value?.height, fallback.height, 0.03),
    };
    zone.width = Math.min(zone.width, 1 - zone.x);
    zone.height = Math.min(zone.height, 1 - zone.y);
    return zone;
  }

  private paddedPageZone(page: any, zone: Zone, horizontal: number, vertical: number) {
    const x = Math.max(0, zone.x - horizontal);
    const y = Math.max(0, zone.y - vertical);
    return {
      x,
      y,
      width: Math.min(page.getWidth() - x, zone.width + horizontal * 2),
      height: Math.min(page.getHeight() - y, zone.height + vertical * 2),
    };
  }

  private clamp(value: unknown, fallback: number, minimum = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(minimum, Math.min(1, parsed)) : fallback;
  }

  private alignment(value: unknown): 'left' | 'center' | 'right' {
    return value === 'left' || value === 'right' ? value : 'center';
  }

  private pdfColor(value: string, fallback: string) {
    const hex = this.hex(value, fallback).slice(1);
    return rgb(
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    );
  }

  private hex(value: unknown, fallback: string) {
    const text = String(value ?? '').trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
  }

  private validateTemplateFile(file: UploadedTemplate) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choisissez un modèle de menu à importer.');
    if ((file.size ?? file.buffer.length) > MAX_TEMPLATE_BYTES)
      throw new BadRequestException('Le modèle ne doit pas dépasser 20 Mo.');
    const extension = extname(file.originalname ?? '').toLowerCase();
    if (!TEMPLATE_EXTENSIONS.has(extension) || !TEMPLATE_MIMES.has(this.templateMime(file))) {
      throw new BadRequestException('Format non supporté. Utilisez un PDF, PNG ou JPEG.');
    }
  }

  private templateMime(file: UploadedTemplate) {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf'))
      return 'application/pdf';
    if (file.mimetype === 'image/png' || file.originalname.toLowerCase().endsWith('.png'))
      return 'image/png';
    return 'image/jpeg';
  }

  private templateExtension(file: UploadedTemplate) {
    const extension = extname(file.originalname).toLowerCase();
    return extension === '.jpeg' ? '.jpg' : extension;
  }

  private async template(organizationId: string, id: string) {
    const template = await this.prisma.menuDisplayTemplate.findFirst({
      where: { id, organizationId, isArchived: false },
    });
    if (!template) throw new NotFoundException('Modèle d’affichage introuvable.');
    return template;
  }

  private safeStoredPath(root: string, storagePath: string) {
    const full = resolve(root, storagePath);
    const safeRoot = `${resolve(root)}/`;
    if (!full.startsWith(safeRoot)) throw new BadRequestException('Chemin de fichier invalide.');
    return full;
  }

  private async assertInstalled(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { menusInstalledAt: true },
    });
    if (!organization?.menusInstalledAt)
      throw new BadRequestException('Le module Menus n’est pas installé.');
  }

  private assertManager(actor: Actor) {
    if (!MANAGER_ROLES.includes(actor.role))
      throw new ForbiddenException('Action réservée aux managers Menus.');
  }

  private cleanName(value?: string) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private nameFromFilename(value: string) {
    return (
      this.cleanName(value.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')) || 'Modèle de carte'
    );
  }

  private slug(value: string) {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'menu'
    );
  }

  private audienceSlug(value: MenuExportAudience, language: ExportLanguage = 'fr') {
    if (value === MenuExportAudience.KITCHEN)
      return language === 'en' ? 'kitchen-file' : 'dossier-cuisine';
    if (value === MenuExportAudience.DINING_ROOM)
      return language === 'en' ? 'dining-room-brief' : 'fiche-salle';
    return language === 'en' ? 'customer-menu' : 'menu-client';
  }

  private audienceLabel(value: MenuExportAudience, language: ExportLanguage = 'fr') {
    if (value === MenuExportAudience.KITCHEN)
      return this.text(language, 'Dossier cuisine', 'Kitchen file');
    if (value === MenuExportAudience.DINING_ROOM)
      return this.text(language, 'Fiche salle', 'Dining room brief');
    return this.text(language, 'Menu client', 'Customer menu');
  }

  private menuDateLabel(menu: any, language: ExportLanguage = 'fr') {
    if (!menu.date) return this.text(language, 'Carte permanente', 'Permanent menu');
    return new Date(menu.date).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR');
  }

  private menuLongDateLabel(menu: any, language: ExportLanguage = 'fr') {
    const value = menu.date ?? menu.activeFrom;
    if (!value) return this.text(language, 'Carte permanente', 'Permanent menu');
    return new Date(value).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Paris',
    });
  }

  private menuReference(menu: any, language: ExportLanguage = 'fr') {
    const date = menu.date
      ? new Date(menu.date).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'Europe/Paris',
        })
      : this.text(language, 'CARTE PERMANENTE', 'PERMANENT MENU');
    return `${this.menuServiceLabel(menu.service, language).toUpperCase()} · ${date}`;
  }

  private menuServiceLabel(value?: string, language: ExportLanguage = 'fr') {
    const labelsFr: Record<string, string> = {
      BREAKFAST: 'Petit-déjeuner',
      LUNCH: 'Déjeuner',
      DINNER: 'Dîner',
      SNACK: 'Collation',
      EVENT: 'Événement',
      BUFFET: 'Buffet',
    };
    const labelsEn: Record<string, string> = {
      BREAKFAST: 'Breakfast',
      LUNCH: 'Lunch',
      DINNER: 'Dinner',
      SNACK: 'Snack',
      EVENT: 'Event',
      BUFFET: 'Buffet',
    };
    return (language === 'en' ? labelsEn : labelsFr)[value ?? ''] ?? 'Service';
  }

  private number(value: unknown, language: ExportLanguage = 'fr') {
    return Number(value ?? 0).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR', {
      maximumFractionDigits: 3,
    });
  }

  private text(language: ExportLanguage, french: string, english: string) {
    return language === 'en' ? english : french;
  }

  private logoBuffer(dataUrl?: string | null) {
    const match = String(dataUrl ?? '').match(/^data:image\/(?:png|jpe?g);base64,(.+)$/i);
    return match ? Buffer.from(match[1], 'base64') : null;
  }
}
