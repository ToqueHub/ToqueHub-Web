import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionOperationalExportQueryDto } from './dto/production-execution.dto';
import { OperationalTasksService } from './operational-tasks.service';

type Actor = {
  id: string;
  role: string;
  permissions: string[];
  employeeId?: string | null;
};
type ExportLanguage = 'fr' | 'en';
type OperationalPdfInput = {
  title: string;
  organizationName: string;
  serviceName: string;
  siteName: string | null;
  day: string;
  tasks: any[];
  language: ExportLanguage;
};

@Injectable()
export class ProductionOperationalExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationalTasks: OperationalTasksService,
  ) {}

  async exportDayPdf(
    organizationId: string,
    actor: Actor,
    query: ProductionOperationalExportQueryDto,
  ) {
    const day = String(query.date).slice(0, 10);
    const start = new Date(`${day}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Date d’export invalide.');
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [organization, department, site, tasks] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
      this.prisma.hrDepartment.findFirst({
        where: {
          id: query.serviceId,
          organizationId,
          isArchived: false,
        },
        select: { id: true, name: true },
      }),
      query.siteId
        ? this.prisma.site.findFirst({
            where: {
              id: query.siteId,
              organizationId,
              isArchived: false,
            },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      this.operationalTasks.list(organizationId, actor, {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        departmentId: query.serviceId,
        siteId: query.siteId,
      }),
    ]);

    if (!department) throw new NotFoundException('Service introuvable.');
    if (query.siteId && !site) throw new NotFoundException('Site introuvable.');

    const language: ExportLanguage = query.lang === 'en' ? 'en' : 'fr';
    const title = `${language === 'en' ? 'Operational schedule' : 'Planning opérationnel'} · ${department.name}`;
    const buffer = await this.buildPdf({
      title,
      organizationName: organization?.name ?? 'ToqueHub',
      serviceName: department.name,
      siteName: site?.name ?? null,
      day,
      tasks,
      language,
    });
    const slug = this.slug(`${department.name}-${site?.name ?? 'tous-sites'}`);
    return {
      buffer,
      filename: `${language === 'en' ? 'production-schedule' : 'planning-production'}-${day}-${slug}.pdf`,
    };
  }

  private buildPdf(input: OperationalPdfInput) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 24,
        bufferPages: false,
        info: { Title: input.title, Author: 'ToqueHub' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      this.drawPdf(doc, input);
      doc.end();
    });
  }

  private drawPdf(
    doc: PDFKit.PDFDocument,
    input: OperationalPdfInput,
  ) {
    const tasks = [...input.tasks].sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime() ||
        String(left.title).localeCompare(String(right.title), 'fr'),
    );
    let pageNumber = 0;
    let y = 0;

    const startPage = () => {
      if (pageNumber > 0) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
      }
      pageNumber += 1;
      y = this.drawHeader(doc, input, pageNumber);
    };

    startPage();
    if (!tasks.length) {
      doc
        .roundedRect(doc.page.margins.left, y + 18, 360, 62, 8)
        .fillAndStroke('#f8fafc', '#dbe4ee');
      doc
        .fillColor('#475569')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(input.language === 'en' ? 'No tasks for this department and date.' : 'Aucune tâche pour ce service et cette journée.', doc.page.margins.left + 14, y + 42);
      return;
    }

    for (const task of tasks) {
      const team = this.taskTeam(task, input.language);
      const recipe = this.taskRecipe(task, input.language);
      const rowHeight = Math.max(
        34,
        this.textHeight(doc, String(task.title ?? ''), 208, 7.4) + 12,
        this.textHeight(doc, team, 118, 7) + 12,
        this.textHeight(doc, recipe, 138, 7) + 12,
      );
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 16) {
        startPage();
      }
      this.drawTaskRow(doc, task, y, rowHeight, team, recipe, input.language);
      y += rowHeight;
    }
  }

  private drawHeader(
    doc: PDFKit.PDFDocument,
    input: OperationalPdfInput,
    pageNumber: number,
  ) {
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const locale = input.language === 'en' ? 'en-GB' : 'fr-FR';
    const date = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${input.day}T12:00:00.000Z`));

    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(input.title, left, 24, { width: width * 0.72 });
    doc
      .fillColor('#64748b')
      .font('Helvetica')
      .fontSize(8)
      .text(
        `${input.organizationName} · ${date}${input.siteName ? ` · ${input.siteName}` : ''} · ${input.tasks.length} ${input.language === 'en' ? 'task(s)' : 'tâche(s)'}`,
        left,
        46,
        { width: width * 0.78 },
      );
    doc
      .fillColor('#94a3b8')
      .fontSize(7)
      .text(`Page ${pageNumber}`, left + width - 70, 27, {
        width: 70,
        align: 'right',
      });

    const tableY = 72;
    const columns = this.columns(left, input.language);
    doc
      .rect(left, tableY, width, 24)
      .fillAndStroke('#e7f8f1', '#b8d8cd');
    for (const column of columns) {
      doc
        .fillColor('#0f513f')
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(column.label, column.x + 4, tableY + 8, {
          width: column.width - 8,
          align: column.align ?? 'left',
        });
    }
    return tableY + 24;
  }

  private drawTaskRow(
    doc: PDFKit.PDFDocument,
    task: any,
    y: number,
    height: number,
    team: string,
    recipe: string,
    language: ExportLanguage,
  ) {
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const columns = this.columns(left, language);
    doc.rect(left, y, width, height).fillAndStroke('#ffffff', '#dbe4ee');
    columns.slice(1).forEach((column) => {
      doc
        .moveTo(column.x, y)
        .lineTo(column.x, y + height)
        .strokeColor('#dbe4ee')
        .lineWidth(0.4)
        .stroke();
    });

    const values = [
      this.timeRange(task.startsAt, task.endsAt, language),
      team,
      String(task.title ?? ''),
      recipe,
      task.quantity == null
        ? '—'
        : `${Number(task.quantity).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR', {
            maximumFractionDigits: 3,
          })} ${task.unitLabel ?? ''}`.trim(),
      this.statusLabel(task.status, language),
      task.site?.name ?? '—',
    ];
    columns.forEach((column, index) => {
      doc
        .fillColor(index === 5 ? this.statusColor(task.status) : '#1f2937')
        .font(index === 2 || index === 5 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(index === 2 ? 7.4 : 7)
        .text(values[index], column.x + 4, y + 7, {
          width: column.width - 8,
          height: height - 10,
          align: column.align ?? 'left',
          ellipsis: true,
        });
    });
  }

  private columns(left: number, language: ExportLanguage) {
    const definitions = language === 'en' ? [
      { label: 'Time', width: 58, align: 'center' as const },
      { label: 'Employee(s)', width: 126 },
      { label: 'Task', width: 216 },
      { label: 'Recipe / batch', width: 146 },
      { label: 'Quantity', width: 72, align: 'center' as const },
      { label: 'Status', width: 78, align: 'center' as const },
      { label: 'Site', width: 97 },
    ] : [
      { label: 'Heure', width: 58, align: 'center' as const },
      { label: 'Collaborateur(s)', width: 126 },
      { label: 'Tâche', width: 216 },
      { label: 'Recette / lot', width: 146 },
      { label: 'Quantité', width: 72, align: 'center' as const },
      { label: 'Statut', width: 78, align: 'center' as const },
      { label: 'Site', width: 97 },
    ];
    let x = left;
    return definitions.map((column) => {
      const result = { ...column, x };
      x += column.width;
      return result;
    });
  }

  private taskTeam(task: any, language: ExportLanguage) {
    const people = [
      ...(task.assignments ?? []).map((assignment: any) => assignment.employee),
      ...(task.assignments?.length ? [] : [task.assignedEmployee]),
    ].filter(Boolean);
    const names = [
      ...new Set(
        people.map(
          (employee: any) =>
            [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() ||
            employee.email ||
            language === 'en' ? 'Employee' : 'Collaborateur',
        ),
      ),
    ];
    return names.length ? names.join(', ') : language === 'en' ? 'Unassigned' : 'À affecter';
  }

  private taskRecipe(task: any, language: ExportLanguage) {
    const parts = [
      task.technicalSheet?.name,
      task.productionBatch?.reference,
      task.productionOperation?.title &&
      task.productionOperation?.title !== task.title
        ? task.productionOperation.title
        : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : task.source === 'MANUAL' ? language === 'en' ? 'Manual task' : 'Tâche manuelle' : '—';
  }

  private timeRange(start: string | Date, end: string | Date, language: ExportLanguage) {
    const format = (value: string | Date) =>
      new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    return `${format(start)}\n${format(end)}`;
  }

  private statusLabel(status: string, language: ExportLanguage) {
    return (language === 'en' ? {
      TODO: 'To do',
      IN_PROGRESS: 'In progress',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
    } : {
      TODO: 'À faire',
      IN_PROGRESS: 'En cours',
      COMPLETED: 'Terminée',
      CANCELLED: 'Annulée',
    })[status] ?? status;
  }

  private statusColor(status: string) {
    return {
      TODO: '#475569',
      IN_PROGRESS: '#1d4ed8',
      COMPLETED: '#047857',
      CANCELLED: '#b91c1c',
    }[status] ?? '#475569';
  }

  private textHeight(
    doc: PDFKit.PDFDocument,
    text: string,
    width: number,
    fontSize: number,
  ) {
    doc.font('Helvetica').fontSize(fontSize);
    return doc.heightOfString(text || '—', { width, lineGap: 1 });
  }

  private slug(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70);
  }
}
