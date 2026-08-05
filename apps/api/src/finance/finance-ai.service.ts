import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';
import type { FinanceAiAnalysisDto } from './dto/finance.dto';
import { FinanceAnalyticsService } from './finance-analytics.service';
import { FinancePolicy } from './finance.policy';
import { FinanceSalesInsightsService } from './finance-sales-insights.service';

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'strengths', 'risks', 'actions', 'dataLimits'],
  properties: {
    status: { type: 'string', enum: ['favorable', 'attention', 'critical', 'insufficient_data'] },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    risks: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    actions: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['priority', 'title', 'detail'],
        properties: {
          priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    dataLimits: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
} as const;

@Injectable()
export class FinanceAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FinancePolicy,
    private readonly analytics: FinanceAnalyticsService,
    private readonly mistral: MistralClientService,
    private readonly salesInsights: FinanceSalesInsightsService,
  ) {}

  async analyze(organizationId: string, actor: AuthenticatedUser, dto: FinanceAiAnalysisDto) {
    this.policy.assertPermission(actor, 'finance.read');
    const settings = await this.prisma.financeSettings.findUnique({ where: { organizationId } });
    const [result, sales] = await Promise.all([
      this.analytics.build(
        organizationId,
        {
          ...(dto.asOf ? { to: dto.asOf, from: dto.asOf } : {}),
          ...(dto.siteId ? { siteId: dto.siteId } : {}),
        },
        settings?.fiscalYearStartMonth ?? 1,
      ),
      this.salesInsights.build(organizationId, {
        from: dto.from,
        to: dto.asOf,
        siteId: dto.siteId,
      }),
    ]);
    const view = dto.view ?? 'annual';
    const selected = result.dashboard[view === 'sales' ? 'monthly' : view];
    const snapshot = {
      view,
      scope: { siteId: dto.siteId ?? null },
      context: result.dashboard.context,
      health: result.dashboard.health,
      period: { label: selected.label, from: selected.from, to: selected.to },
      core: selected.core,
      optional: selected.optional,
      budget: result.dashboard.budget
        ? { name: result.dashboard.budget.name, scenario: result.dashboard.budget.scenario }
        : null,
      salesOperations: {
        period: sales.period,
        summary: sales.summary,
        comparisons: sales.comparisons,
        peakHours: sales.hourly
          .filter(({ transactions }) => transactions > 0)
          .sort((left, right) => right.transactions - left.transactions)
          .slice(0, 5),
        weekdays: sales.weekdays,
        topProducts: sales.topProducts.slice(0, 10),
        lowProducts: sales.lowProducts.slice(0, 5),
        categories: sales.categories.slice(0, 10),
        staffing: sales.staffing,
        quality: sales.quality,
      },
      qualityRules: [
        'Une valeur null signifie donnée indisponible et ne doit jamais être interprétée comme zéro.',
        'Les écarts annuels comparent le réalisé cumulé au budget des mêmes mois uniquement.',
        'Le résultat est provisoire tant que la période comptable n’est pas verrouillée.',
        'Les classements produit ne doivent être commentés que si leur couverture est suffisante.',
        'Les heures d’affluence proviennent des horodatages des tickets des caisses incluses.',
        'La marge produit n’est commentée que lorsqu’une fiche technique fournit un coût par portion.',
        'Le rapprochement affluence/effectif n’est commenté que lorsque staffing.available vaut true.',
        'Quand scope.siteId est défini, ne jamais extrapoler les charges, la trésorerie ou le budget global à cet établissement.',
      ],
    };
    return this.mistral.chatJson<{
      status: 'favorable' | 'attention' | 'critical' | 'insufficient_data';
      summary: string;
      strengths: string[];
      risks: string[];
      actions: Array<{ priority: 'P1' | 'P2' | 'P3'; title: string; detail: string }>;
      dataLimits: string[];
    }>(
      organizationId,
      [
        {
          role: 'system',
          content:
            'Tu es un contrôleur de gestion pédagogique. Analyse uniquement les agrégats vérifiés fournis. N’invente aucun chiffre, ne donne pas de conseil fiscal ou juridique et distingue clairement faits, signaux et données manquantes. Écris en français simple mais précis pour un dirigeant et un expert-comptable.',
        },
        {
          role: 'user',
          content: `Analyse cette situation financière ToqueHub : ${JSON.stringify(snapshot)}`,
        },
      ],
      'finance_management_analysis',
      ANALYSIS_SCHEMA,
      { temperature: 0, fallbackToJsonObject: true },
    );
  }
}
