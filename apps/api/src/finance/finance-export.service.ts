import { BadRequestException, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type { FinanceExportQueryDto } from './dto/finance.dto';
import { FinanceSalesInsightsService } from './finance-sales-insights.service';
import { FinanceService } from './finance.service';

type BootstrapData = Awaited<ReturnType<FinanceService['bootstrap']>>;
type SalesInsightsData = Awaited<ReturnType<FinanceSalesInsightsService['build']>>;
type DashboardPeriod =
  | BootstrapData['dashboard']['annual']
  | BootstrapData['dashboard']['monthly']
  | BootstrapData['dashboard']['daily'];
type DashboardMetric = DashboardPeriod['core'][number];
type OrganizationIdentity = {
  name: string;
  logoDataUrl: string | null;
  mainSiteName: string | null;
};

type ExportResult = { buffer: Buffer; filename: string };
type SalesPeriod = 'daily' | 'monthly' | 'annual' | 'custom';

const COLORS = {
  navy: '#071426',
  navySoft: '#10233f',
  emerald: '#10b981',
  emeraldDark: '#0f766e',
  emeraldPale: '#ecfdf5',
  blue: '#3b82f6',
  bluePale: '#eff6ff',
  amber: '#f59e0b',
  amberPale: '#fffbeb',
  red: '#ef4444',
  redPale: '#fef2f2',
  ink: '#0f172a',
  slate: '#64748b',
  line: '#dbe4ee',
  panel: '#f8fafc',
  white: '#ffffff',
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 38;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 48;

function parseDate(value: string | undefined, fallback = new Date()) {
  if (!value) return new Date(fallback);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new BadRequestException('Date d’export invalide.');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Date d’export invalide.');
  return date;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
}

function startOfYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 12));
}

function endOfYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 12));
}

function dayCount(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[•·]/g, '-')
    .trim();
}

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 70);
}

function formatDate(value: string | Date | null | undefined, withTime = false) {
  if (!value) return 'Non disponible';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Europe/Helsinki',
  }).format(date);
}

function formatCalendarDate(value: string | Date | null | undefined) {
  if (!value) return 'Non disponible';
  const key = value instanceof Date ? dateKey(value) : String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return formatDate(value);
  const date = new Date(`${key}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatMoney(value: number | null | undefined, currency = 'EUR') {
  if (value == null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined, signed = false) {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${signed && value > 0 ? '+' : ''}${formatNumber(value, 1)} %`;
}

function metricValue(metric: DashboardMetric, currency: string) {
  if (metric.value == null) return '-';
  if (metric.unit === 'currency') return formatMoney(metric.value, currency);
  if (metric.unit === 'percentage') return formatPercent(metric.value);
  return formatNumber(metric.value, metric.id === 'transactions' ? 0 : 1);
}

function rangeLabel(from: string | Date, to: string | Date) {
  return `Du ${formatCalendarDate(from)} au ${formatCalendarDate(to)}`;
}

function dataUrlBuffer(value: string | null | undefined) {
  if (!value?.startsWith('data:image/')) return null;
  const comma = value.indexOf(',');
  if (comma < 0) return null;
  try {
    return Buffer.from(value.slice(comma + 1), 'base64');
  } catch {
    return null;
  }
}

class FinancePdf {
  private readonly doc: PDFKit.PDFDocument;
  private readonly chunks: Buffer[] = [];
  private y = 0;
  private pageTitle = '';
  private pageSubtitle = '';
  private readonly logo: Buffer | null;

  constructor(
    private readonly organization: OrganizationIdentity,
    private readonly siteLabel: string,
    private readonly currency: string,
  ) {
    this.logo = dataUrlBuffer(organization.logoDataUrl);
    this.doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      size: 'A4',
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      info: {
        Title: `ToqueHub Finance - ${organization.name}`,
        Author: 'ToqueHub',
        Subject: 'Rapport financier et opérationnel',
      },
    });
    this.doc.on('data', (chunk: Buffer) => this.chunks.push(chunk));
  }

  start(title: string, subtitle: string, meta: string) {
    this.pageTitle = title;
    this.pageSubtitle = subtitle;
    this.addPage(title, subtitle, meta, true);
  }

  private addPage(title = this.pageTitle, subtitle = this.pageSubtitle, meta = '', cover = false) {
    this.doc.addPage();
    this.doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLORS.white);
    this.doc.rect(0, 0, PAGE_WIDTH, cover ? 154 : 86).fill(COLORS.navy);
    this.doc.rect(0, 0, 10, cover ? 154 : 86).fill(COLORS.emerald);
    this.doc
      .circle(PAGE_WIDTH - 36, 32, 76)
      .fillOpacity(0.08)
      .fill(COLORS.blue)
      .fillOpacity(1);
    this.doc
      .circle(PAGE_WIDTH - 62, 45, 46)
      .fillOpacity(0.08)
      .fill(COLORS.emerald)
      .fillOpacity(1);
    if (this.logo) {
      try {
        this.doc.image(this.logo, MARGIN, cover ? 28 : 20, { fit: [46, 34] });
      } catch {
        this.drawToqueHubMark(cover ? 34 : 26);
      }
    } else this.drawToqueHubMark(cover ? 34 : 26);
    const textX = this.logo ? MARGIN + 56 : MARGIN + 30;
    this.doc
      .fillColor(COLORS.emerald)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('TOQUEHUB - PILOTAGE FINANCIER', textX, cover ? 31 : 22, {
        characterSpacing: 1,
      });
    if (cover) {
      this.doc
        .fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(25)
        .text(cleanText(title), MARGIN, 68, { width: CONTENT_WIDTH - 10 });
      this.doc
        .fillColor('#a9b8ce')
        .font('Helvetica')
        .fontSize(10)
        .text(cleanText(subtitle), MARGIN, 106, { width: CONTENT_WIDTH - 10 });
      this.y = 178;
    } else {
      this.doc
        .fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(cleanText(title), textX, 38, { width: 330 });
      this.doc
        .fillColor('#a9b8ce')
        .font('Helvetica')
        .fontSize(7.5)
        .text(cleanText(subtitle), textX, 57, { width: 350 });
      this.y = 108;
    }
    this.doc
      .fillColor('#dbe7f5')
      .font('Helvetica')
      .fontSize(7.5)
      .text(cleanText(this.organization.name), PAGE_WIDTH - 205, cover ? 32 : 21, {
        width: 165,
        align: 'right',
      });
    this.doc
      .fillColor('#91a5c0')
      .text(cleanText(this.siteLabel), PAGE_WIDTH - 205, cover ? 45 : 34, {
        width: 165,
        align: 'right',
      });
    if (meta) {
      this.doc
        .fillColor(COLORS.slate)
        .font('Helvetica')
        .fontSize(8)
        .text(cleanText(meta), MARGIN, this.y - 12, { width: CONTENT_WIDTH });
      this.y += 6;
    }
  }

  private drawToqueHubMark(y: number) {
    this.doc.roundedRect(MARGIN, y, 21, 21, 6).fill(COLORS.emerald);
    this.doc
      .fillColor(COLORS.white)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('TH', MARGIN, y + 6, { width: 21, align: 'center' });
  }

  ensure(height: number, title?: string) {
    if (this.y + height <= CONTENT_BOTTOM) return;
    this.addPage();
    if (title) this.section(title);
  }

  section(title: string, subtitle?: string) {
    this.ensure(subtitle ? 48 : 34);
    this.doc.roundedRect(MARGIN, this.y + 1, 24, 24, 7).fill(COLORS.emeraldPale);
    this.doc.circle(MARGIN + 12, this.y + 13, 4).fill(COLORS.emeraldDark);
    this.doc
      .fillColor(COLORS.ink)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(cleanText(title), MARGIN + 34, this.y + 2, { width: CONTENT_WIDTH - 34 });
    this.y += 23;
    if (subtitle) {
      this.doc
        .fillColor(COLORS.slate)
        .font('Helvetica')
        .fontSize(8)
        .text(cleanText(subtitle), MARGIN + 34, this.y, { width: CONTENT_WIDTH - 34 });
      this.y += 20;
    } else this.y += 10;
  }

  summaryBanner(level: string, title: string, body: string) {
    const palette =
      level === 'good'
        ? [COLORS.emeraldPale, COLORS.emeraldDark]
        : level === 'critical'
          ? [COLORS.redPale, COLORS.red]
          : level === 'attention'
            ? [COLORS.amberPale, '#b45309']
            : [COLORS.panel, COLORS.slate];
    this.ensure(82);
    this.doc.roundedRect(MARGIN, this.y, CONTENT_WIDTH, 66, 12).fill(palette[0]);
    this.doc.roundedRect(MARGIN, this.y, 7, 66, 4).fill(palette[1]);
    this.doc
      .fillColor(palette[1])
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(cleanText(title), MARGIN + 22, this.y + 13, { width: CONTENT_WIDTH - 38 });
    this.doc
      .fillColor(COLORS.ink)
      .font('Helvetica')
      .fontSize(8.5)
      .text(cleanText(body), MARGIN + 22, this.y + 31, {
        width: CONTENT_WIDTH - 38,
        lineGap: 2,
      });
    this.y += 80;
  }

  cards(
    items: Array<{
      label: string;
      value: string;
      detail?: string;
      tone?: 'default' | 'good' | 'attention' | 'critical';
    }>,
    columns = 2,
  ) {
    if (!items.length) return;
    const gap = 10;
    const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
    const height = 82;
    for (let start = 0; start < items.length; start += columns) {
      this.ensure(height + 12);
      items.slice(start, start + columns).forEach((item, index) => {
        const x = MARGIN + index * (width + gap);
        const tone = item.tone ?? 'default';
        const accent =
          tone === 'good'
            ? COLORS.emerald
            : tone === 'attention'
              ? COLORS.amber
              : tone === 'critical'
                ? COLORS.red
                : COLORS.blue;
        this.doc.roundedRect(x, this.y, width, height, 12).fillAndStroke(COLORS.white, COLORS.line);
        this.doc.roundedRect(x, this.y, width, 4, 3).fill(accent);
        this.doc
          .fillColor(COLORS.slate)
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(cleanText(item.label).toUpperCase(), x + 13, this.y + 15, {
            width: width - 26,
            characterSpacing: 0.45,
          });
        this.doc
          .fillColor(COLORS.ink)
          .font('Helvetica-Bold')
          .fontSize(16)
          .text(cleanText(item.value), x + 13, this.y + 32, { width: width - 26 });
        if (item.detail) {
          this.doc
            .fillColor(COLORS.slate)
            .font('Helvetica')
            .fontSize(7.2)
            .text(cleanText(item.detail), x + 13, this.y + 58, {
              width: width - 26,
              ellipsis: true,
            });
        }
      });
      this.y += height + 12;
    }
  }

  bullets(items: string[], tone: 'default' | 'warning' = 'default') {
    if (!items.length) return;
    const lineHeight = 26;
    this.ensure(items.length * lineHeight + 8);
    items.forEach((item) => {
      const color = tone === 'warning' ? COLORS.amber : COLORS.emerald;
      this.doc.circle(MARGIN + 5, this.y + 6, 3).fill(color);
      this.doc
        .fillColor(COLORS.ink)
        .font('Helvetica')
        .fontSize(8.5)
        .text(cleanText(item), MARGIN + 16, this.y, { width: CONTENT_WIDTH - 16, lineGap: 1 });
      const height = Math.max(
        lineHeight,
        this.doc.heightOfString(cleanText(item), { width: CONTENT_WIDTH - 16 }) + 8,
      );
      this.y += height;
    });
    this.y += 4;
  }

  chart(
    title: string,
    labels: string[],
    series: Array<{ label: string; values: number[]; color: string }>,
  ) {
    if (!labels.length || !series.length) return;
    const height = 235;
    this.ensure(height + 12, title);
    this.doc
      .roundedRect(MARGIN, this.y, CONTENT_WIDTH, height, 12)
      .fillAndStroke(COLORS.white, COLORS.line);
    this.doc
      .fillColor(COLORS.ink)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(cleanText(title), MARGIN + 14, this.y + 12, { width: CONTENT_WIDTH - 28 });
    series.forEach((item, index) => {
      const lx = MARGIN + 14 + index * 125;
      this.doc.rect(lx, this.y + 31, 9, 4).fill(item.color);
      this.doc
        .fillColor(COLORS.slate)
        .font('Helvetica')
        .fontSize(7)
        .text(cleanText(item.label), lx + 14, this.y + 28, { width: 105 });
    });
    const chartX = MARGIN + 48;
    const chartY = this.y + 53;
    const chartWidth = CONTENT_WIDTH - 66;
    const chartHeight = 145;
    const all = series.flatMap(({ values }) => values.filter(Number.isFinite));
    const min = Math.min(0, ...all);
    const max = Math.max(1, ...all);
    const span = max - min || 1;
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = min + (span * (4 - tick)) / 4;
      const yy = chartY + (chartHeight * tick) / 4;
      this.doc
        .moveTo(chartX, yy)
        .lineTo(chartX + chartWidth, yy)
        .lineWidth(0.5)
        .strokeColor('#e7edf4')
        .stroke();
      this.doc
        .fillColor(COLORS.slate)
        .font('Helvetica')
        .fontSize(6.3)
        .text(this.compactMoney(value), MARGIN + 5, yy - 3, { width: 38, align: 'right' });
    }
    const groupWidth = chartWidth / labels.length;
    const barGap = 2;
    const barWidth = Math.max(2, Math.min(13, (groupWidth - 5) / series.length - barGap));
    const zeroY = chartY + chartHeight * (max / span);
    labels.forEach((label, labelIndex) => {
      series.forEach((item, seriesIndex) => {
        const value = item.values[labelIndex] ?? 0;
        const valueY = chartY + chartHeight * ((max - value) / span);
        const x =
          chartX +
          labelIndex * groupWidth +
          (groupWidth - series.length * (barWidth + barGap)) / 2 +
          seriesIndex * (barWidth + barGap);
        const top = Math.min(valueY, zeroY);
        const barHeight = Math.max(1, Math.abs(zeroY - valueY));
        this.doc
          .roundedRect(x, top, barWidth, barHeight, Math.min(2, barWidth / 2))
          .fill(item.color);
      });
      const every = Math.max(1, Math.ceil(labels.length / 12));
      if (labelIndex % every === 0 || labelIndex === labels.length - 1) {
        this.doc
          .fillColor(COLORS.slate)
          .font('Helvetica')
          .fontSize(6)
          .text(cleanText(label), chartX + labelIndex * groupWidth, chartY + chartHeight + 7, {
            width: groupWidth,
            align: 'center',
          });
      }
    });
    this.y += height + 14;
  }

  private compactMoney(value: number) {
    const absolute = Math.abs(value);
    if (absolute >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} M`;
    if (absolute >= 1_000) return `${formatNumber(value / 1_000, 0)} k`;
    return formatNumber(value, 0);
  }

  table(title: string, headers: string[], rows: string[][], fractions?: number[]) {
    if (!rows.length) return;
    this.section(title);
    const widths = this.tableWidths(headers.length, fractions);
    const drawHeader = () => {
      this.ensure(34);
      let x = MARGIN;
      this.doc.roundedRect(MARGIN, this.y, CONTENT_WIDTH, 28, 7).fill(COLORS.navySoft);
      headers.forEach((header, index) => {
        this.doc
          .fillColor(COLORS.white)
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .text(cleanText(header).toUpperCase(), x + 6, this.y + 9, {
            width: widths[index] - 12,
            align: index === 0 ? 'left' : 'right',
          });
        x += widths[index];
      });
      this.y += 30;
    };
    drawHeader();
    rows.forEach((row, rowIndex) => {
      this.doc.font('Helvetica').fontSize(7.2);
      const heights = row.map((cell, index) =>
        this.doc.heightOfString(cleanText(cell), { width: widths[index] - 12, lineGap: 1 }),
      );
      const rowHeight = Math.max(28, Math.min(50, Math.max(...heights) + 13));
      if (this.y + rowHeight > CONTENT_BOTTOM) {
        this.addPage();
        drawHeader();
      }
      if (rowIndex % 2 === 0)
        this.doc.rect(MARGIN, this.y, CONTENT_WIDTH, rowHeight).fill(COLORS.panel);
      let x = MARGIN;
      row.forEach((cell, index) => {
        this.doc
          .fillColor(index === 0 ? COLORS.ink : '#334155')
          .font(index === 0 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.2)
          .text(cleanText(cell), x + 6, this.y + 9, {
            width: widths[index] - 12,
            align: index === 0 ? 'left' : 'right',
            lineGap: 1,
            ellipsis: true,
          });
        x += widths[index];
      });
      this.doc
        .moveTo(MARGIN, this.y + rowHeight)
        .lineTo(MARGIN + CONTENT_WIDTH, this.y + rowHeight)
        .lineWidth(0.4)
        .strokeColor(COLORS.line)
        .stroke();
      this.y += rowHeight;
    });
    this.y += 14;
  }

  private tableWidths(count: number, fractions?: number[]) {
    if (!fractions?.length || fractions.length !== count)
      return Array(count).fill(CONTENT_WIDTH / count);
    const total = fractions.reduce((sum, value) => sum + value, 0) || 1;
    return fractions.map((value) => (CONTENT_WIDTH * value) / total);
  }

  note(text: string, tone: 'info' | 'warning' = 'info') {
    const height = Math.max(
      42,
      this.doc
        .font('Helvetica')
        .fontSize(8)
        .heightOfString(cleanText(text), { width: CONTENT_WIDTH - 36 }) + 22,
    );
    this.ensure(height + 8);
    const background = tone === 'warning' ? COLORS.amberPale : COLORS.bluePale;
    const accent = tone === 'warning' ? '#b45309' : '#1d4ed8';
    this.doc.roundedRect(MARGIN, this.y, CONTENT_WIDTH, height, 9).fill(background);
    this.doc.circle(MARGIN + 14, this.y + 16, 4).fill(accent);
    this.doc
      .fillColor(COLORS.ink)
      .font('Helvetica')
      .fontSize(8)
      .text(cleanText(text), MARGIN + 28, this.y + 11, { width: CONTENT_WIDTH - 42, lineGap: 2 });
    this.y += height + 10;
  }

  finish() {
    const range = this.doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      this.doc.switchToPage(index);
      this.doc
        .moveTo(MARGIN, PAGE_HEIGHT - 34)
        .lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 34)
        .lineWidth(0.4)
        .strokeColor(COLORS.line)
        .stroke();
      this.doc
        .fillColor(COLORS.slate)
        .font('Helvetica')
        .fontSize(6.5)
        .text(
          `Généré par ToqueHub le ${formatDate(new Date(), true)} - Données à contrôler avec les pièces sources.`,
          MARGIN,
          PAGE_HEIGHT - 26,
          { width: 410 },
        );
      this.doc.text(`Page ${index + 1} / ${range.count}`, PAGE_WIDTH - 100, PAGE_HEIGHT - 26, {
        width: 62,
        align: 'right',
      });
    }
    return new Promise<Buffer>((resolve, reject) => {
      this.doc.on('end', () => resolve(Buffer.concat(this.chunks)));
      this.doc.on('error', reject);
      this.doc.end();
    });
  }
}

@Injectable()
export class FinanceExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly salesInsights: FinanceSalesInsightsService,
  ) {}

  async generate(
    organizationId: string,
    actor: AuthenticatedUser,
    query: FinanceExportQueryDto,
  ): Promise<ExportResult> {
    await this.finance.assertReadable(organizationId, actor);
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logoDataUrl: true, mainSiteName: true },
    });
    if (!organization) throw new BadRequestException('Organisation introuvable.');

    if (query.report === 'sales') {
      return this.salesExport(organizationId, organization, query);
    }

    const asOf = dateKey(parseDate(query.asOf));
    const data = await this.finance.bootstrap(organizationId, actor, {
      preset: 'fiscal_year',
      to: asOf,
      siteId: query.siteId,
    });
    const selected =
      query.report === 'monthly'
        ? data.dashboard.monthly
        : query.report === 'daily'
          ? data.dashboard.daily
          : data.dashboard.annual;
    const title =
      query.report === 'executive_annual'
        ? 'Analyse annuelle exécutive'
        : query.report === 'annual'
          ? 'Rapport financier annuel'
          : query.report === 'monthly'
            ? 'Rapport financier mensuel'
            : 'Rapport financier journalier';
    const siteLabel = data.scope.site?.name ?? 'Consolidation de tous les établissements';
    const pdf = new FinancePdf(organization, siteLabel, data.settings.defaultCurrency);
    pdf.start(
      title,
      selected.label,
      `${rangeLabel(selected.from, selected.to)} - Situation au ${formatCalendarDate(data.dashboard.context.asOf)}`,
    );
    this.renderFinancial(pdf, data, selected, query.report === 'executive_annual');
    const buffer = await pdf.finish();
    return {
      buffer,
      filename: `${slug(title)}-${slug(siteLabel)}-${asOf}.pdf`,
    };
  }

  private async salesExport(
    organizationId: string,
    organization: OrganizationIdentity,
    query: FinanceExportQueryDto,
  ): Promise<ExportResult> {
    const period = (query.period ?? 'monthly') as SalesPeriod;
    const asOf = parseDate(query.asOf ?? query.to);
    let from: Date;
    let to: Date;
    if (period === 'daily') {
      from = asOf;
      to = asOf;
    } else if (period === 'annual') {
      from = startOfYear(asOf);
      to = endOfYear(asOf);
    } else if (period === 'custom') {
      if (!query.from || !query.to) {
        throw new BadRequestException('Indiquez une date de début et une date de fin.');
      }
      from = parseDate(query.from);
      to = parseDate(query.to);
    } else {
      from = startOfMonth(asOf);
      to = endOfMonth(asOf);
    }
    if (to < from) throw new BadRequestException('La date de fin précède la date de début.');
    if (dayCount(from, to) > 400) {
      throw new BadRequestException('La période personnalisée est limitée à 400 jours.');
    }
    const [data, site, settings] = await Promise.all([
      this.salesInsights.build(organizationId, {
        from: dateKey(from),
        to: dateKey(to),
        siteId: query.siteId,
      }),
      query.siteId
        ? this.prisma.site.findFirst({
            where: { id: query.siteId, organizationId, isArchived: false },
            select: { name: true },
          })
        : null,
      this.prisma.financeSettings.findUnique({
        where: { organizationId },
        select: { defaultCurrency: true },
      }),
    ]);
    if (query.siteId && !site) throw new BadRequestException('Établissement introuvable.');
    const siteLabel = site?.name ?? 'Consolidation de tous les établissements';
    const currency = settings?.defaultCurrency ?? 'EUR';
    const pdf = new FinancePdf(organization, siteLabel, currency);
    const label = rangeLabel(data.period.from, data.period.to);
    pdf.start(
      'Ventes & affluence',
      label,
      `${data.period.days} jour(s) - Données opérationnelles consolidées`,
    );
    this.renderSales(pdf, data, currency);
    const buffer = await pdf.finish();
    return {
      buffer,
      filename: `ventes-affluence-${period}-${slug(siteLabel)}-${dateKey(from)}-${dateKey(to)}.pdf`,
    };
  }

  private renderFinancial(
    pdf: FinancePdf,
    data: BootstrapData,
    period: DashboardPeriod,
    executive: boolean,
  ) {
    const currency = data.settings.defaultCurrency;
    pdf.summaryBanner(
      data.dashboard.health.level,
      data.dashboard.health.label,
      data.dashboard.health.summary,
    );
    pdf.section(
      'Indicateurs essentiels',
      'Réel, objectif budgétaire, écart et comparaison historique au même stade.',
    );
    pdf.cards(
      period.core.map((metric) => ({
        label: metric.label,
        value: metricValue(metric, currency),
        detail:
          metric.budget == null
            ? metric.availabilityReason || 'Budget non disponible'
            : `Budget ${formatMoney(metric.budget, currency)} - Écart ${formatMoney(metric.variance, currency)} (${formatPercent(metric.variancePercent, true)})`,
        tone: metric.favorable == null ? 'default' : metric.favorable ? 'good' : 'critical',
      })),
      2,
    );

    if (executive) {
      pdf.section('Lecture en 30 secondes');
      pdf.bullets(this.executiveBullets(data, period, currency));
    }

    const visibleOptional = period.optional.filter(
      (metric) => metric.displayable && metric.value != null,
    );
    if (visibleOptional.length) {
      pdf.section(
        'Repères de pilotage',
        'Indicateurs complémentaires disponibles pour cette période.',
      );
      pdf.cards(
        visibleOptional.map((metric) => ({
          label: metric.label,
          value: metricValue(metric, currency),
          detail:
            metric.actualValue != null
              ? `${metric.targetLabel || 'Objectif'} ${metricValue({ ...metric, value: metric.value }, currency)} - ${metric.actualLabel || 'Réalisé'} ${formatNumber(metric.actualValue, 1)}`
              : metric.help,
        })),
        3,
      );
    }

    const series = period.series as Array<{
      label?: string;
      date?: string;
      periodStart?: string;
      actualRevenue?: number | null;
      budgetRevenue?: number | null;
      actualResult?: number | null;
      budgetResult?: number | null;
      revenue?: number;
      transactions?: number;
    }>;
    const labels = series.map(
      (item) => item.label ?? item.date?.slice(5) ?? item.periodStart?.slice(5, 7) ?? '',
    );
    const actualRevenue = series.map((item) => item.actualRevenue ?? item.revenue ?? 0);
    const budgetRevenue = series.map((item) => item.budgetRevenue ?? 0);
    if (labels.length && actualRevenue.some((value) => value !== 0)) {
      pdf.chart('Chiffre d’affaires réel vs budget', labels, [
        { label: 'Réel', values: actualRevenue, color: COLORS.emerald },
        { label: 'Budget', values: budgetRevenue, color: COLORS.blue },
      ]);
    }

    if (series.length) {
      const rows = series.map((item) => [
        item.label ?? formatDate(item.date ?? item.periodStart),
        formatMoney(item.actualRevenue ?? item.revenue, currency),
        formatMoney(item.budgetRevenue, currency),
        formatMoney(item.actualResult, currency),
        formatMoney(item.budgetResult, currency),
      ]);
      pdf.table(
        period.kind === 'annual'
          ? 'Trajectoire mois par mois'
          : period.kind === 'monthly'
            ? 'Activité jour par jour'
            : 'Détail de la journée',
        ['Période', 'CA réel', 'CA budget', 'Résultat réel', 'Résultat budget'],
        rows,
        [1.5, 1, 1, 1, 1],
      );
    }

    const comparisonRows = period.comparison.periods.map((item) => [
      `${item.label}\n${item.detail}`,
      formatMoney(item.metrics.revenue, currency),
      formatMoney(item.metrics.operating_expenses, currency),
      formatMoney(item.metrics.payroll, currency),
      formatMoney(item.metrics.operating_result, currency),
      item.metrics.transactions == null ? '-' : formatNumber(item.metrics.transactions),
    ]);
    pdf.table(
      'Comparaisons historiques',
      ['Période', 'CA', 'Charges', 'Masse salariale', 'Résultat', 'Transactions'],
      comparisonRows,
      [1.55, 0.9, 0.9, 0.95, 0.9, 0.8],
    );

    const reconciliation =
      period.kind === 'annual'
        ? data.dashboard.reconciliation.annual
        : period.kind === 'monthly'
          ? data.dashboard.reconciliation.monthly
          : data.dashboard.reconciliation.daily;
    pdf.section('Rapprochement caisse - comptabilité');
    pdf.cards(
      [
        {
          label: 'Caisse consolidée',
          value: formatMoney(reconciliation.cashRegisterRevenue, currency),
        },
        { label: 'Comptabilité', value: formatMoney(reconciliation.accountingRevenue, currency) },
        {
          label: 'Écart à contrôler',
          value: formatMoney(reconciliation.difference, currency),
          tone: reconciliation.status === 'matched' ? 'good' : 'attention',
        },
      ],
      3,
    );

    if (data.dashboard.budget) {
      const budget = data.dashboard.budget;
      pdf.section(
        'Budget de référence',
        `${budget.name} - scénario ${budget.scenario || 'de référence'}`,
      );
      pdf.cards(
        [
          { label: 'CA budgété annuel', value: formatMoney(budget.totals.revenue, currency) },
          {
            label: 'Charges budgétées',
            value: formatMoney(budget.totals.operatingExpenses, currency),
          },
          { label: 'Masse salariale', value: formatMoney(budget.totals.payroll, currency) },
          {
            label: 'Résultat d’exploitation',
            value: formatMoney(budget.totals.operatingResult, currency),
          },
        ],
        2,
      );
      if (budget.targets) {
        pdf.table(
          `Repères budgétaires - ${budget.targets.label}`,
          ['Objectif', 'Par jour', 'Par semaine', 'Sur le mois'],
          [
            [
              'CA pour respecter l’objectif',
              formatMoney(budget.targets.revenueDay, currency),
              formatMoney(budget.targets.revenueWeek, currency),
              formatMoney(budget.targets.revenueMonth, currency),
            ],
            [
              'Seuil sans perte',
              formatMoney(budget.targets.breakEvenDay, currency),
              formatMoney(budget.targets.breakEvenWeek, currency),
              formatMoney(budget.targets.breakEvenMonth, currency),
            ],
          ],
          [1.6, 1, 1, 1],
        );
      }
    }

    pdf.section('Qualité, périmètre et traçabilité');
    pdf.cards(
      [
        { label: 'Qualité des données', value: data.quality.label },
        {
          label: 'Sources connectées',
          value: `${data.quality.connectedSourceCount} / ${data.quality.sourceCount}`,
        },
        { label: 'Dernière mise à jour', value: formatDate(data.quality.lastUpdatedAt, true) },
        { label: 'Couverture', value: data.dashboard.context.actualCoverageLabel },
      ],
      2,
    );
    pdf.note(data.scope.note, data.scope.accountingAllocated ? 'info' : 'warning');
    if (data.quality.pendingReviewCount > 0) {
      pdf.note(
        `${data.quality.pendingReviewCount} import(s) nécessitent encore une validation avant consolidation.`,
        'warning',
      );
    }
    const sourceRows = data.sources
      .filter(
        (source) =>
          !data.scope.site ||
          source.site?.id === data.scope.site.id ||
          data.scope.accountingSourceIds.includes(source.id),
      )
      .map((source) => [
        source.name,
        source.provider,
        source.site?.name ??
          (data.scope.site && data.scope.accountingSourceIds.includes(source.id)
            ? `${data.scope.site.name} (attribution contrôlée)`
            : 'Organisation'),
        source.status,
        formatDate(source.coverageStart),
        formatDate(source.coverageEnd),
        formatDate(source.lastSyncedAt, true),
      ]);
    pdf.table(
      'Sources utilisées',
      ['Source', 'Type', 'Site', 'État', 'Début', 'Fin', 'Synchro'],
      sourceRows,
      [1.25, 0.7, 0.9, 0.65, 0.8, 0.8, 1.1],
    );
  }

  private executiveBullets(data: BootstrapData, period: DashboardPeriod, currency: string) {
    const metric = (id: string) => period.core.find((item) => item.id === id);
    const revenue = metric('revenue');
    const result = metric('operating_result');
    const bullets = [data.dashboard.health.summary];
    if (revenue?.value != null) {
      bullets.push(
        revenue.budget == null
          ? `Le chiffre d’affaires atteint ${formatMoney(revenue.value, currency)} ; aucun objectif budgétaire comparable n’est disponible.`
          : `Le chiffre d’affaires atteint ${formatMoney(revenue.value, currency)}, soit ${formatPercent(revenue.variancePercent, true)} par rapport au budget au même stade.`,
      );
    }
    if (result?.value != null) {
      bullets.push(
        `Le résultat d’exploitation est de ${formatMoney(result.value, currency)} (${result.value >= 0 ? 'activité rentable sur la période' : 'perte d’exploitation à corriger'}).`,
      );
    }
    bullets.push(
      data.dashboard.context.coverageComplete
        ? 'La couverture de l’exercice est complète au stade analysé.'
        : `La lecture reste provisoire : ${data.dashboard.context.actualCoverageLabel.toLowerCase()}.`,
    );
    return bullets;
  }

  private renderSales(pdf: FinancePdf, data: SalesInsightsData, currency: string) {
    const summary = data.summary;
    const money = (value: number | null | undefined) => formatMoney(value, currency);
    pdf.summaryBanner(
      data.quality.productCoveragePercent >= 90
        ? 'good'
        : data.quality.transactionRows
          ? 'attention'
          : 'unknown',
      data.quality.transactionRows ? 'Activité consolidée' : 'Données insuffisantes',
      `${formatNumber(summary.transactions)} transaction(s), ${formatNumber(data.quality.crossSourceDuplicatesExcluded)} doublon(s) inter-caisses écarté(s), couverture produits ${formatPercent(data.quality.productCoveragePercent)}.`,
    );
    pdf.section('Synthèse commerciale');
    pdf.cards(
      [
        { label: 'Chiffre d’affaires', value: money(summary.revenue) },
        { label: 'Transactions', value: formatNumber(summary.transactions) },
        { label: 'Ticket moyen', value: money(summary.averageTicket) },
        {
          label: 'Remboursements',
          value: money(summary.refunds),
          tone: summary.refunds ? 'attention' : 'good',
        },
        { label: 'Remises', value: money(summary.discounts) },
        {
          label: 'Annulations',
          value: formatNumber(summary.cancellations),
          tone: summary.cancellations ? 'attention' : 'good',
        },
      ],
      3,
    );

    pdf.table(
      'Comparaison des périodes',
      ['Référence', 'CA', 'Évol. CA', 'Transactions', 'Évol. transactions', 'Ticket moyen'],
      [
        [
          `Période précédente\n${rangeLabel(data.comparisons.previousPeriod.from, data.comparisons.previousPeriod.to)}`,
          money(data.comparisons.previousPeriod.revenue),
          formatPercent(data.comparisons.previousPeriod.revenueVariationPercent, true),
          formatNumber(data.comparisons.previousPeriod.transactions),
          formatPercent(data.comparisons.previousPeriod.transactionVariationPercent, true),
          money(data.comparisons.previousPeriod.averageTicket),
        ],
        [
          `Même période N-1\n${rangeLabel(data.comparisons.previousYear.from, data.comparisons.previousYear.to)}`,
          money(data.comparisons.previousYear.revenue),
          formatPercent(data.comparisons.previousYear.revenueVariationPercent, true),
          formatNumber(data.comparisons.previousYear.transactions),
          formatPercent(data.comparisons.previousYear.transactionVariationPercent, true),
          money(data.comparisons.previousYear.averageTicket),
        ],
      ],
      [1.6, 0.9, 0.8, 0.9, 1.05, 0.9],
    );

    if (data.daily.length) {
      pdf.chart(
        'Évolution jour par jour',
        data.daily.map(({ date }) => date.slice(5)),
        [
          {
            label: 'Chiffre d’affaires',
            values: data.daily.map(({ revenue }) => revenue),
            color: COLORS.emerald,
          },
        ],
      );
      pdf.table(
        'Détail quotidien',
        ['Date', 'Chiffre d’affaires', 'Transactions', 'Ticket moyen'],
        data.daily.map((item) => [
          formatCalendarDate(item.date),
          money(item.revenue),
          formatNumber(item.transactions),
          money(item.transactions ? item.revenue / item.transactions : null),
        ]),
        [1.4, 1, 1, 1],
      );
    }

    const activeHours = data.hourly.filter((item) => item.transactions > 0 || item.revenue !== 0);
    if (activeHours.length) {
      pdf.chart(
        'Affluence par heure',
        activeHours.map(({ label }) => label),
        [
          {
            label: 'Chiffre d’affaires',
            values: activeHours.map(({ revenue }) => revenue),
            color: COLORS.blue,
          },
        ],
      );
      pdf.table(
        'Heures de pointe et heures creuses',
        ['Heure', 'CA', 'Transactions', 'Part du CA', 'Ticket moyen'],
        activeHours.map((item) => [
          item.label,
          money(item.revenue),
          formatNumber(item.transactions),
          formatPercent(item.sharePercent),
          money(item.averageTicket),
        ]),
        [1, 1, 1, 1, 1],
      );
    }

    if (data.weekdays.length) {
      pdf.table(
        'Performance par jour de la semaine',
        ['Jour', 'CA', 'Transactions', 'Part du CA', 'Ticket moyen'],
        data.weekdays.map((item) => [
          item.label,
          money(item.revenue),
          formatNumber(item.transactions),
          formatPercent(item.sharePercent),
          money(item.averageTicket),
        ]),
        [1.2, 1, 1, 1, 1],
      );
    }

    if (data.topProducts.length) {
      pdf.table(
        'Produits les plus vendus',
        ['Produit', 'Catégorie', 'Qté', 'CA', 'Part', 'Évol. qté', 'Marge'],
        data.topProducts.map((item) => [
          item.name,
          item.category || 'Non classé',
          formatNumber(item.quantity, 1),
          money(item.gross),
          formatPercent(item.sharePercent),
          formatPercent(item.quantityVariationPercent, true),
          item.margin == null ? '-' : money(item.margin),
        ]),
        [1.45, 1, 0.6, 0.85, 0.7, 0.8, 0.8],
      );
    }

    if (data.lowProducts.length) {
      pdf.table(
        'Produits à faible rotation',
        ['Produit', 'Catégorie', 'Quantité', 'CA', 'Part du CA'],
        data.lowProducts.map((item) => [
          item.name,
          item.category || 'Non classé',
          formatNumber(item.quantity, 1),
          money(item.gross),
          formatPercent(item.sharePercent),
        ]),
        [1.7, 1.2, 0.8, 0.9, 0.9],
      );
    }

    if (data.categories.length) {
      pdf.table(
        'Mix des catégories',
        ['Catégorie', 'Quantité', 'CA brut', 'CA net', 'Part du CA'],
        data.categories.map((item) => [
          item.category,
          formatNumber(item.quantity, 1),
          money(item.gross),
          money(item.net),
          formatPercent(item.sharePercent),
        ]),
        [1.7, 0.9, 1, 1, 0.9],
      );
    }

    pdf.section('Affluence et effectif planifié');
    if (data.staffing.available) {
      pdf.cards(
        [
          { label: 'Heures planifiées', value: `${formatNumber(data.staffing.plannedHours, 1)} h` },
          { label: 'CA / heure planifiée', value: money(data.staffing.revenuePerPlannedHour) },
          { label: 'Services analysés', value: formatNumber(data.staffing.assignments) },
        ],
        3,
      );
      const staffed = data.staffing.hourly.filter((item) => item.plannedHours > 0);
      pdf.table(
        'Productivité par tranche horaire',
        ['Heure', 'Heures planifiées', 'CA', 'Transactions', 'CA / h', 'Tickets / h'],
        staffed.map((item) => [
          `${String(item.hour).padStart(2, '0')}h`,
          `${formatNumber(item.plannedHours, 1)} h`,
          money(item.revenue),
          formatNumber(item.transactions),
          money(item.revenuePerPlannedHour),
          formatNumber(item.transactionsPerPlannedHour, 1),
        ]),
        [0.7, 1.2, 1, 1, 1, 1],
      );
    } else {
      pdf.note(
        'Aucun planning exploitable n’est disponible sur la période : la comparaison affluence/effectif est volontairement masquée.',
        'warning',
      );
    }

    pdf.section('Qualité et traçabilité');
    pdf.cards(
      [
        { label: 'Tickets analysés', value: formatNumber(data.quality.transactionRows) },
        {
          label: 'Doublons écartés',
          value: formatNumber(data.quality.crossSourceDuplicatesExcluded),
        },
        { label: 'Lignes produits', value: formatNumber(data.quality.productRows) },
        { label: 'Couverture produits', value: formatPercent(data.quality.productCoveragePercent) },
      ],
      2,
    );
    if (data.quality.sources.length) {
      pdf.table(
        'Sources de ventes retenues',
        ['Source', 'Fournisseur', 'Identifiant'],
        data.quality.sources.map((source) => [source.name, source.provider, source.id]),
        [1.5, 1, 2],
      );
    }
    data.quality.limitations.forEach((limitation) => pdf.note(limitation, 'warning'));
  }
}
