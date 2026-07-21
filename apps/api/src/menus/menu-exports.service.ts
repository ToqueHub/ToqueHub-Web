// @ts-nocheck
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
const MENU_FILES_ROOT = resolve(process.env.MENU_FILES_DIR || process.env.UPLOAD_DIR || 'uploads', 'menus');
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

@Injectable()
export class MenuExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralClientService,
  ) {}

  async list(organizationId: string, query: { menuId?: string } = {}) {
    await this.assertInstalled(organizationId);
    return this.prisma.menuExport.findMany({
      where: { organizationId, menuId: query.menuId },
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

  async uploadTemplate(organizationId: string, actor: Actor, name: string | undefined, file: UploadedTemplate) {
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
      await this.prisma.menuDisplayTemplate.update({ where: { id: fallback.id }, data: { isDefault: true } });
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
    if (!menu.items.length) throw new BadRequestException('Ce menu ne contient aucun article à exporter.');

    let template = null;
    if (dto.audience === MenuExportAudience.PUBLIC_DISPLAY) {
      template = dto.templateId
        ? await this.template(organizationId, dto.templateId)
        : await this.prisma.menuDisplayTemplate.findFirst({
            where: { organizationId, isArchived: false, isDefault: true },
          });
    }

    const buffer = dto.audience === MenuExportAudience.KITCHEN
      ? await this.kitchenPdf(menu, organization)
      : dto.audience === MenuExportAudience.DINING_ROOM
        ? await this.diningRoomPdf(menu, organization)
        : template
          ? await this.publicPdfFromTemplate(menu, template)
          : await this.publicToqueHubPdf(menu, organization);

    const id = randomUUID();
    const filename = `${this.slug(menu.name)}-${this.audienceSlug(dto.audience)}.pdf`;
    const storagePath = join(organizationId, `${id}.pdf`);
    await mkdir(join(EXPORT_ROOT, organizationId), { recursive: true });
    await writeFile(join(EXPORT_ROOT, storagePath), buffer);
    const snapshot = {
      generatedAt: new Date().toISOString(),
      storagePath,
      audience: dto.audience,
      menu: this.menuSnapshot(menu),
      template: template ? { id: template.id, name: template.name, originalName: template.originalName } : null,
    };
    const created = await this.prisma.menuExport.create({
      data: {
        id,
        organizationId,
        menuId: menu.id,
        requestedById: actor.id,
        templateId: template?.id ?? null,
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
        summary: `Export ${this.audienceLabel(dto.audience)} généré`,
        details: { exportId: created.id, templateId: template?.id ?? null },
      },
    });
    return created;
  }

  async download(organizationId: string, id: string) {
    const item = await this.prisma.menuExport.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Export introuvable.');
    const snapshot = item.snapshot as Record<string, unknown>;
    const storagePath = String(snapshot?.storagePath ?? '');
    if (!storagePath) throw new NotFoundException('Le fichier de cet ancien export n’est pas disponible.');
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
    if (template.mimeType === 'application/pdf' || template.originalName.toLowerCase().endsWith('.pdf')) {
      try {
        pdf = await EditablePdfDocument.load(source);
      } catch {
        throw new BadRequestException('Le PDF du modèle ne peut pas être ouvert. Réimportez un document non protégé.');
      }
      while (pdf.getPageCount() > 1) pdf.removePage(1);
    } else {
      pdf = await EditablePdfDocument.create();
      const image = template.mimeType === 'image/png'
        ? await pdf.embedPng(source)
        : await pdf.embedJpg(source);
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
    const titleBackground = this.pdfColor(layout.style.titleBackgroundColor, layout.style.backgroundColor);
    const contentBackground = this.pdfColor(layout.style.contentBackgroundColor, layout.style.backgroundColor);
    const textColor = this.pdfColor(layout.style.textColor, '#0f172a');
    const accent = this.pdfColor(layout.style.accentColor, '#0f766e');
    const titleZone = this.pageZone(page, layout.titleZone);
    const contentZone = this.pageZone(page, layout.contentZone);
    page.drawRectangle({ ...this.paddedPageZone(page, titleZone, 14, 8), color: titleBackground });
    page.drawRectangle({ ...this.paddedPageZone(page, contentZone, 14, 18), color: contentBackground });
    this.drawEditableText(page, menu.name, titleZone, bold, Math.min(30, titleZone.height * 0.48), textColor, layout.style.titleAlignment);

    const groups = this.publicGroups(menu);
    const units = groups.reduce((total, group) => total + 1.35 + group.items.length, 0) || 1;
    const rowHeight = Math.max(9, Math.min(24, contentZone.height / units));
    const categorySize = Math.max(8, Math.min(18, rowHeight * 0.72));
    const itemSize = Math.max(7, Math.min(14, rowHeight * 0.58));
    let top = contentZone.y + contentZone.height;
    for (const group of groups) {
      top -= rowHeight * 1.15;
      this.drawEditableText(page, group.name.toUpperCase(), {
        x: contentZone.x,
        y: top,
        width: contentZone.width,
        height: rowHeight,
      }, bold, categorySize, accent, layout.style.itemAlignment);
      for (const item of group.items) {
        top -= rowHeight;
        if (top < contentZone.y) break;
        this.drawEditableText(page, item.name, {
          x: contentZone.x,
          y: top,
          width: contentZone.width,
          height: rowHeight,
        }, font, itemSize, textColor, layout.style.itemAlignment);
      }
    }
    return Buffer.from(await pdf.save());
  }

  private async publicToqueHubPdf(menu: any, organization: any) {
    return this.pdfKitBuffer((doc) => {
      this.drawBrandPage(doc, organization, menu.name, 'CARTE PUBLIQUE');
      let y = 145;
      for (const group of this.publicGroups(menu)) {
        y = this.ensureSpace(doc, organization, menu.name, 'CARTE PUBLIQUE', y, 54);
        doc.fillColor('#10b981').font('Helvetica-Bold').fontSize(13).text(group.name.toUpperCase(), 52, y);
        y += 27;
        for (const item of group.items) {
          y = this.ensureSpace(doc, organization, menu.name, 'CARTE PUBLIQUE', y, 42);
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text(item.name, 62, y, { width: 470 });
          if (item.description) {
            doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(item.description, 62, y + 17, { width: 470, height: 24 });
            y += 43;
          } else y += 29;
        }
        y += 10;
      }
    }, `Carte - ${menu.name}`);
  }

  private async kitchenPdf(menu: any, organization: any) {
    return this.pdfKitBuffer((doc) => {
      this.drawBrandPage(doc, organization, menu.name, 'FICHE CUISINE');
      let y = 140;
      doc.fillColor('#334155').font('Helvetica').fontSize(10).text(
        `${this.menuDateLabel(menu)} - ${menu.site?.name ?? organization?.mainSiteName ?? 'Tous sites'}`,
        48,
        y,
      );
      y += 28;
      for (const group of this.publicGroups(menu)) {
        doc.fillColor('#10b981').font('Helvetica-Bold').fontSize(12).text(group.name.toUpperCase(), 48, y);
        y += 22;
        for (const item of group.items) {
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(`- ${item.name}`, 58, y, { width: 470 });
          y += 21;
        }
        y += 8;
      }

      for (const menuItem of menu.items.filter((item: any) => item.technicalSheet)) {
        doc.addPage({ size: 'A4', margin: 0 });
        const sheet = menuItem.technicalSheet;
        const portions = this.targetPortions(menu, menuItem);
        const factor = portions / Math.max(Number(sheet.referencePortions ?? 1), 0.001);
        this.drawBrandPage(doc, organization, sheet.name, 'FICHE CUISINE - FICHE TECHNIQUE');
        y = 137;
        this.drawMetric(doc, 48, y, 150, 'À PRODUIRE', `${this.number(portions)} portions`);
        this.drawMetric(doc, 208, y, 150, 'TEMPS TOTAL', `${Number(sheet.totalTimeMinutes ?? 0)} min`);
        this.drawMetric(doc, 368, y, 179, 'RENDEMENT DE RÉFÉRENCE', `${this.number(sheet.referencePortions)} portions`);
        y += 84;
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text('Ingrédients', 48, y);
        y += 25;
        for (const ingredient of sheet.ingredients ?? []) {
          y = this.ensureSpace(doc, organization, sheet.name, 'FICHE CUISINE - SUITE', y, 30);
          const name = ingredient.sourceTechnicalSheet?.name ?? ingredient.product?.name ?? ingredient.productNameSnapshot ?? 'Ingrédient';
          const quantity = Number(ingredient.quantity ?? 0) * factor;
          const unit = ingredient.unit?.symbol ?? ingredient.unitSymbolSnapshot ?? '';
          doc.fillColor('#0f172a').font('Helvetica').fontSize(9.5).text(name, 56, y, { width: 300 });
          doc.font('Helvetica-Bold').text(`${this.number(quantity)} ${unit}`, 380, y, { width: 150, align: 'right' });
          doc.moveTo(48, y + 19).lineTo(547, y + 19).strokeColor('#e2e8f0').stroke();
          y += 27;
        }
        y += 14;
        y = this.ensureSpace(doc, organization, sheet.name, 'FICHE CUISINE - SUITE', y, 44);
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text('Étapes de préparation', 48, y);
        y += 27;
        for (const step of sheet.steps ?? []) {
          const description = String(step.description ?? '');
          const height = Math.max(42, doc.heightOfString(description, { width: 430 }) + 30);
          y = this.ensureSpace(doc, organization, sheet.name, 'FICHE CUISINE - SUITE', y, height);
          doc.roundedRect(48, y, 499, height - 6, 8).fill('#f8fafc');
          doc.fillColor('#10b981').font('Helvetica-Bold').fontSize(10).text(`${step.order}. ${step.title}`, 60, y + 10, { width: 360 });
          doc.fillColor('#475569').font('Helvetica').fontSize(9).text(description, 60, y + 27, { width: 430 });
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(`${Number(step.estimatedMinutes ?? 0)} min`, 455, y + 10, { width: 75, align: 'right' });
          y += height;
        }
      }
    }, `Fiche cuisine - ${menu.name}`);
  }

  private async diningRoomPdf(menu: any, organization: any) {
    return this.pdfKitBuffer((doc) => {
      this.drawBrandPage(doc, organization, menu.name, 'FICHE SALLE');
      let y = 140;
      doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(
        'Support de briefing: composition, allergènes, origine et arguments utiles pour présenter chaque article.',
        48,
        y,
        { width: 499 },
      );
      y += 38;
      for (const group of this.publicGroups(menu)) {
        y = this.ensureSpace(doc, organization, menu.name, 'FICHE SALLE', y, 55);
        doc.fillColor('#10b981').font('Helvetica-Bold').fontSize(13).text(group.name.toUpperCase(), 48, y);
        y += 28;
        for (const item of group.items) {
          const allergens = this.itemAllergens(item.raw);
          const suppliers = this.itemSuppliers(item.raw);
          const description = item.description || 'Présentation commerciale à compléter dans la fiche technique.';
          const meta = [allergens.length ? `Allergènes: ${allergens.join(', ')}` : 'Allergènes: aucun renseigné', suppliers.length ? `Fournisseurs: ${suppliers.join(', ')}` : ''].filter(Boolean).join('  |  ');
          const cardHeight = Math.max(82, doc.heightOfString(description, { width: 455 }) + doc.heightOfString(meta, { width: 455 }) + 47);
          y = this.ensureSpace(doc, organization, menu.name, 'FICHE SALLE', y, cardHeight + 10);
          doc.roundedRect(48, y, 499, cardHeight, 10).fillAndStroke('#f8fafc', '#dbe4ee');
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(item.name, 62, y + 13, { width: 455 });
          doc.fillColor('#475569').font('Helvetica').fontSize(9).text(description, 62, y + 33, { width: 455 });
          doc.fillColor(allergens.length ? '#b45309' : '#64748b').font('Helvetica-Bold').fontSize(8).text(meta, 62, y + cardHeight - 24, { width: 455 });
          y += cardHeight + 12;
        }
      }
    }, `Fiche salle - ${menu.name}`);
  }

  private pdfKitBuffer(draw: (doc: PDFKit.PDFDocument) => void, title: string) {
    return new Promise<Buffer>((resolveBuffer, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: title, Author: 'ToqueHub' } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on('end', () => resolveBuffer(Buffer.concat(chunks)));
      doc.on('error', reject);
      draw(doc);
      const range = doc.bufferedPageRange();
      for (let index = range.start; index < range.start + range.count; index += 1) {
        doc.switchToPage(index);
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5).text(
          `Généré par ToqueHub - ${new Date().toLocaleDateString('fr-FR')} - Page ${index + 1}/${range.count}`,
          48,
          doc.page.height - 32,
          { width: doc.page.width - 96, align: 'center' },
        );
      }
      doc.end();
    });
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
    doc.fillColor('#6ee7b7').font('Helvetica-Bold').fontSize(8).text(kicker, left, 25, { characterSpacing: 1.1 });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(21).text(title, left, 43, { width: doc.page.width - left - 48, height: 34 });
    doc.fillColor('#cbd5e1').font('Helvetica').fontSize(8.5).text(organization?.name ?? 'ToqueHub', left, 79, { width: doc.page.width - left - 48 });
  }

  private ensureSpace(doc: PDFKit.PDFDocument, organization: any, title: string, kicker: string, y: number, required: number) {
    if (y + required <= doc.page.height - 48) return y;
    doc.addPage({ size: 'A4', margin: 0 });
    this.drawBrandPage(doc, organization, title, kicker);
    return 135;
  }

  private drawMetric(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string) {
    doc.roundedRect(x, y, width, 60, 9).fillAndStroke('#ecfdf5', '#a7f3d0');
    doc.fillColor('#047857').font('Helvetica-Bold').fontSize(7.5).text(label, x + 11, y + 11, { width: width - 22 });
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text(value, x + 11, y + 31, { width: width - 22 });
  }

  private publicGroups(menu: any) {
    const groups = new Map<string, any[]>();
    for (const item of menu.items ?? []) {
      const name = item.menuCategory?.name ?? SECTION_LABELS[item.section] ?? 'Autres';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push({
        name: item.technicalSheet?.name ?? item.product?.name ?? 'Article',
        description: item.notes ?? item.technicalSheet?.description ?? null,
        raw: item,
      });
    }
    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  }

  private itemAllergens(item: any) {
    return [...new Set((item.technicalSheet?.ingredients ?? []).flatMap((ingredient: any) =>
      (ingredient.allergens ?? []).map((entry: any) => entry.allergen?.name).filter(Boolean),
    ))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  }

  private itemSuppliers(item: any) {
    const values = item.product?.primarySupplier?.name
      ? [item.product.primarySupplier.name]
      : (item.technicalSheet?.ingredients ?? []).map((ingredient: any) => ingredient.product?.primarySupplier?.name).filter(Boolean);
    return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  }

  private targetPortions(menu: any, item: any) {
    return Number(item.portionsOverride ?? item.targetReadyQuantity ?? menu.expectedGuests ?? item.technicalSheet?.referencePortions ?? 1) || 1;
  }

  private menuSnapshot(menu: any) {
    return {
      id: menu.id,
      name: menu.name,
      date: menu.date,
      site: menu.site ? { id: menu.site.id, name: menu.site.name } : null,
      items: this.publicGroups(menu).map((group) => ({
        name: group.name,
        items: group.items.map((item) => ({ name: item.name, description: item.description })),
      })),
    };
  }

  private drawEditableText(page: any, text: string, zone: any, font: any, size: number, color: any, alignment: string) {
    const lines = this.wrapEditableText(this.editableText(text), font, size, zone.width);
    const lineHeight = size * 1.18;
    let y = zone.y + zone.height - size;
    for (const line of lines.slice(0, Math.max(1, Math.floor(zone.height / lineHeight)))) {
      const width = font.widthOfTextAtSize(line, size);
      const x = alignment === 'center' ? zone.x + (zone.width - width) / 2 : alignment === 'right' ? zone.x + zone.width - width : zone.x;
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
        titleBackgroundColor: this.hex(
          layout.style?.titleBackgroundColor,
          backgroundColor,
        ),
        contentBackgroundColor: this.hex(
          layout.style?.contentBackgroundColor,
          backgroundColor,
        ),
        textColor: this.hex(layout.style?.textColor, fallback.style.textColor),
        accentColor: this.hex(layout.style?.accentColor, fallback.style.accentColor),
        titleAlignment: this.alignment(layout.style?.titleAlignment),
        itemAlignment: this.alignment(layout.style?.itemAlignment),
      },
      detectedTitle: layout.detectedTitle ? String(layout.detectedTitle).slice(0, 200) : null,
      confidence: Number.isFinite(Number(layout.confidence)) ? Math.max(0, Math.min(1, Number(layout.confidence))) : null,
    };
  }

  private layoutFromOcr(rawJson: any) {
    const annotation = rawJson?.document_annotation;
    if (!annotation) return this.fallbackLayout();
    try {
      const parsed = typeof annotation === 'string'
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
              required: ['backgroundColor', 'titleBackgroundColor', 'contentBackgroundColor', 'textColor', 'accentColor', 'titleAlignment', 'itemAlignment'],
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
    return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  }

  private hex(value: unknown, fallback: string) {
    const text = String(value ?? '').trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
  }

  private validateTemplateFile(file: UploadedTemplate) {
    if (!file?.buffer?.length) throw new BadRequestException('Choisissez un modèle de menu à importer.');
    if ((file.size ?? file.buffer.length) > MAX_TEMPLATE_BYTES) throw new BadRequestException('Le modèle ne doit pas dépasser 20 Mo.');
    const extension = extname(file.originalname ?? '').toLowerCase();
    if (!TEMPLATE_EXTENSIONS.has(extension) || !TEMPLATE_MIMES.has(this.templateMime(file))) {
      throw new BadRequestException('Format non supporté. Utilisez un PDF, PNG ou JPEG.');
    }
  }

  private templateMime(file: UploadedTemplate) {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) return 'application/pdf';
    if (file.mimetype === 'image/png' || file.originalname.toLowerCase().endsWith('.png')) return 'image/png';
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
    if (!organization?.menusInstalledAt) throw new BadRequestException('Le module Menus n’est pas installé.');
  }

  private assertManager(actor: Actor) {
    if (!MANAGER_ROLES.includes(actor.role)) throw new ForbiddenException('Action réservée aux managers Menus.');
  }

  private cleanName(value?: string) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  private nameFromFilename(value: string) {
    return this.cleanName(value.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')) || 'Modèle de carte';
  }

  private slug(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'menu';
  }

  private audienceSlug(value: MenuExportAudience) {
    if (value === MenuExportAudience.KITCHEN) return 'fiche-cuisine';
    if (value === MenuExportAudience.DINING_ROOM) return 'fiche-salle';
    return 'carte-publique';
  }

  private audienceLabel(value: MenuExportAudience) {
    if (value === MenuExportAudience.KITCHEN) return 'Fiche cuisine';
    if (value === MenuExportAudience.DINING_ROOM) return 'Fiche salle';
    return 'Affichage public';
  }

  private menuDateLabel(menu: any) {
    if (!menu.date) return 'Carte permanente';
    return new Date(menu.date).toLocaleDateString('fr-FR');
  }

  private number(value: unknown) {
    return Number(value ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
  }

  private logoBuffer(dataUrl?: string | null) {
    const match = String(dataUrl ?? '').match(/^data:image\/(?:png|jpe?g);base64,(.+)$/i);
    return match ? Buffer.from(match[1], 'base64') : null;
  }
}
