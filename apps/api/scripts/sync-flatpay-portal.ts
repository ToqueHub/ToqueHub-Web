import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { FinanceProvider } from '@prisma/client';
import {
  chromium,
  type BrowserContext,
  type Download,
  type Locator,
  type Page,
} from 'playwright-core';
import { FennoaSecretService } from '../src/finance/fennoa-secret.service';
import {
  resolveFlatpayDownloadedReportKey,
  resolveFlatpayDownloadFileName,
} from '../src/finance/flatpay-download';
import { FlatpayCredentialsService } from '../src/finance/flatpay-credentials.service';
import { FinancePolicy } from '../src/finance/finance.policy';
import {
  applyFlatpayHistoryObservations,
  capFlatpayHistoryRangeCount,
  completeFlatpayHistoryAtPortalBoundary,
  createFlatpayHistoryDiscovery,
  discardUnconfirmedFlatpayOrderKeys,
  FLATPAY_HISTORY_DISCOVERY_VERSION,
  planFlatpayHistoryRanges,
  type FlatpayHistoryDiscovery,
  type FlatpayHistoryRange,
} from '../src/finance/flatpay-history';
import {
  flatpayRuntimeDirectory,
  resolveFlatpayBrowserExecutable,
} from '../src/finance/flatpay-browser';
import { PrismaService } from '../src/prisma/prisma.service';

const run = promisify(execFile);
const DEFAULT_PORTAL_URL = 'https://portal.flatpay.fi/';
const DEFAULT_RUNTIME_DIRECTORY = flatpayRuntimeDirectory();
const DEFAULT_PROFILE_DIRECTORY = resolve(DEFAULT_RUNTIME_DIRECTORY, 'browser-profile');
const DEFAULT_STATE_PATH = resolve(DEFAULT_RUNTIME_DIRECTORY, 'state');
const DATE_RANGE_PATTERN =
  /\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}(?:,\s*\d{2}:\d{2})?\s*-\s*\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}/;

const REPORTS = {
  orders: { heading: 'Orders', dialogHeading: 'Export orders', submit: 'Export' },
  'sales-overview': {
    heading: 'Sales overview',
    dialogHeading: 'Export sales data',
    submit: 'Send',
  },
  turnover: {
    heading: 'Turnover',
    dialogHeading: 'Export turnover report',
    submit: 'Send',
  },
  transactions: {
    heading: 'Card transactions',
    dialogHeading: 'Get report via email',
    submit: 'Send',
  },
} as const;

type ReportType = keyof typeof REPORTS;
type HistoryReportType = Extract<ReportType, 'orders' | 'sales-overview'>;
type DateRange = { from: string; to: string };
type Options = {
  command: 'setup' | 'run' | 'diagnose';
  automaticSetup: boolean;
  runAfterSetup: boolean;
  portalUrl: string;
  inbox: string;
  profileDirectory: string;
  statePath: string;
  chromePath: string;
  from?: string;
  to: string;
  reportTypes: ReportType[];
  orderChunkDays: number;
  productChunkDays: number;
  transactionChunkDays: number;
  maxGenerationsPerRun: number;
  headed: boolean;
  organizationId?: string;
  siteId?: string;
};
type FlatpayCredentials = { username: string; password: string; portalUrl: string };
type AutomationState = {
  generatedKeys: string[];
  downloadedReportKeys: string[];
  generatedThrough: Partial<Record<ReportType, string>>;
  historyStart?: string;
  historyDiscovery?: FlatpayHistoryDiscovery;
  productDailyBackfillVersion?: number;
  historyQueueVersion?: number;
  lastGeneratedTo?: string;
  updatedAt?: string;
};

class FlatpayHistoryBoundaryError extends Error {
  constructor(readonly boundary: string) {
    super(`La date ${boundary} précède l’historique disponible dans FlatPay.`);
  }
}

function isHistoryReportType(type: ReportType): type is HistoryReportType {
  return type === 'orders' || type === 'sales-overview';
}

function optionValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function localIsoDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function isoWeek(value: Date) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

async function organizedInbox(inbox: string, value = new Date()) {
  const directory = resolve(
    inbox,
    String(value.getFullYear()),
    String(value.getMonth() + 1).padStart(2, '0'),
    `semaine-${String(isoWeek(value)).padStart(2, '0')}`,
  );
  await mkdir(directory, { recursive: true });
  return directory;
}

function firstDayOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function assertIsoDate(value: string, name: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${name} doit utiliser le format YYYY-MM-DD.`);
  }
}

function parseOptions(): Options {
  const args = process.argv.slice(2);
  const command = args.includes('--setup')
    ? 'setup'
    : args.includes('--diagnose')
      ? 'diagnose'
      : 'run';
  const inbox = optionValue(args, '--inbox') || process.env.FLATPAY_REPORTS_INBOX;
  if (!inbox) {
    throw new Error('Indiquez le dossier de téléchargement avec --inbox ou FLATPAY_REPORTS_INBOX.');
  }
  const from = optionValue(args, '--from') || process.env.FLATPAY_HISTORY_START || undefined;
  const organizationId =
    optionValue(args, '--organization-id') || process.env.FLATPAY_ORGANIZATION_ID || undefined;
  const siteId = optionValue(args, '--site-id') || process.env.FLATPAY_SITE_ID || undefined;
  const to = optionValue(args, '--to') || localIsoDate();
  if (from) assertIsoDate(from, '--from');
  assertIsoDate(to, '--to');
  const requestedTypes = (
    optionValue(args, '--reports') ||
    process.env.FLATPAY_REPORT_TYPES ||
    'orders,sales-overview,turnover,transactions'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const reportTypes = requestedTypes.filter((value): value is ReportType => value in REPORTS);
  if (!reportTypes.length || reportTypes.length !== requestedTypes.length) {
    throw new Error(`Rapports acceptés : ${Object.keys(REPORTS).join(', ')}.`);
  }
  for (const required of ['orders', 'sales-overview'] as const) {
    if (!reportTypes.includes(required)) reportTypes.unshift(required);
  }
  const orderChunkDays = Number(process.env.FLATPAY_ORDER_CHUNK_DAYS || '1');
  const productChunkDays = Number(process.env.FLATPAY_PRODUCT_CHUNK_DAYS || '1');
  const transactionChunkDays = Number(process.env.FLATPAY_TRANSACTION_CHUNK_DAYS || '1');
  const maxGenerationsPerRun = Number(process.env.FLATPAY_MAX_GENERATIONS_PER_RUN || '20');
  for (const [name, value] of [
    ['FLATPAY_ORDER_CHUNK_DAYS', orderChunkDays],
    ['FLATPAY_PRODUCT_CHUNK_DAYS', productChunkDays],
    ['FLATPAY_TRANSACTION_CHUNK_DAYS', transactionChunkDays],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 7) {
      throw new Error(`${name} doit être compris entre 1 et 7.`);
    }
  }
  if (
    !Number.isInteger(maxGenerationsPerRun) ||
    maxGenerationsPerRun < 1 ||
    maxGenerationsPerRun > 100
  ) {
    throw new Error('FLATPAY_MAX_GENERATIONS_PER_RUN doit être compris entre 1 et 100.');
  }
  return {
    command,
    automaticSetup: args.includes('--setup-auto'),
    runAfterSetup: args.includes('--run-after-setup'),
    portalUrl: process.env.FLATPAY_PORTAL_URL || DEFAULT_PORTAL_URL,
    inbox: resolve(inbox),
    profileDirectory: resolve(process.env.FLATPAY_BROWSER_PROFILE_DIR || DEFAULT_PROFILE_DIRECTORY),
    statePath: resolve(process.env.FLATPAY_AUTOMATION_STATE_PATH || DEFAULT_STATE_PATH),
    chromePath: optionValue(args, '--chrome-path') || process.env.FLATPAY_CHROME_PATH || '',
    from,
    to,
    reportTypes,
    orderChunkDays,
    productChunkDays,
    transactionChunkDays,
    maxGenerationsPerRun,
    headed: args.includes('--headed') || command !== 'run',
    organizationId,
    siteId,
  };
}

async function selectOrganization(prisma: PrismaService, requestedId?: string) {
  if (requestedId) {
    const organization = await prisma.organization.findFirst({
      where: { id: requestedId, financeInstalledAt: { not: null } },
    });
    if (!organization) throw new Error('Organisation Finance introuvable pour --organization-id.');
    return organization;
  }
  const organizations = await prisma.organization.findMany({
    where: { financeInstalledAt: { not: null } },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });
  if (!organizations.length) throw new Error('Le module Finance doit être installé.');
  if (organizations.length > 1) {
    throw new Error('Plusieurs organisations Finance existent : utilisez --organization-id.');
  }
  return organizations[0];
}

async function readState(path: string): Promise<AutomationState> {
  const content = await readFile(path, 'utf8').catch(() => null);
  if (!content) return { generatedKeys: [], downloadedReportKeys: [], generatedThrough: {} };
  try {
    const parsed = JSON.parse(content) as Partial<AutomationState>;
    return {
      ...parsed,
      generatedKeys: Array.isArray(parsed.generatedKeys) ? parsed.generatedKeys : [],
      downloadedReportKeys: Array.isArray(parsed.downloadedReportKeys)
        ? parsed.downloadedReportKeys
        : [],
      generatedThrough:
        parsed.generatedThrough && typeof parsed.generatedThrough === 'object'
          ? parsed.generatedThrough
          : {},
    };
  } catch {
    const backupPath = `${path}.invalid-${Date.now()}`;
    await rename(path, backupPath);
    return { generatedKeys: [], downloadedReportKeys: [], generatedThrough: {} };
  }
}

async function saveState(path: string, state: AutomationState) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}

function monthlyRanges(from: string, to: string): DateRange[] {
  const ranges: DateRange[] = [];
  let cursor = new Date(`${from}T12:00:00`);
  const limit = new Date(`${to}T12:00:00`);
  while (cursor <= limit) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
    const rangeEnd = monthEnd < limit ? monthEnd : limit;
    ranges.push({ from: localIsoDate(cursor), to: localIsoDate(rangeEnd) });
    cursor = new Date(rangeEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return ranges;
}

function fixedDayRanges(from: string, to: string, chunkDays: number): DateRange[] {
  const ranges: DateRange[] = [];
  let cursor = from;
  while (cursor <= to) {
    const rangeEnd = addDays(cursor, chunkDays - 1);
    ranges.push({ from: cursor, to: rangeEnd < to ? rangeEnd : to });
    cursor = addDays(rangeEnd, 1);
  }
  return ranges;
}

function rangesForReport(type: ReportType, from: string, to: string, options: Options) {
  if (type === 'orders') return fixedDayRanges(from, to, options.orderChunkDays);
  if (type === 'sales-overview') {
    return fixedDayRanges(from, to, options.productChunkDays);
  }
  if (type === 'transactions') {
    return fixedDayRanges(from, to, options.transactionChunkDays);
  }
  return monthlyRanges(from, to);
}

async function firstVisible(locators: Locator[]) {
  for (const locator of locators) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible()) return candidate;
    }
  }
  return null;
}

async function waitForVisible(locators: Locator[], timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await firstVisible(locators);
    if (visible) return visible;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  return null;
}

function portalUrl(options: Options, path: string) {
  return new URL(path, options.portalUrl).toString();
}

function usernameLocators(page: Page) {
  return [
    page.locator('input[type="email"]'),
    page.locator('input[name="email"]'),
    page.locator('input[name="username"]'),
    page.locator('input[autocomplete="email"]'),
    page.locator('input[autocomplete="username"]'),
  ];
}

function passwordLocators(page: Page) {
  return [
    page.locator('input[type="password"]'),
    page.locator('input[autocomplete="current-password"]'),
  ];
}

function loginInputLocators(page: Page) {
  return [...passwordLocators(page), ...usernameLocators(page)];
}

async function loginWithCredentials(page: Page, credentials: FlatpayCredentials) {
  const username = await waitForVisible(usernameLocators(page), 15_000);
  if (username) {
    await username.fill(credentials.username);

    // Flatpay affiche actuellement l'e-mail, le mot de passe et le bouton
    // « Sign in » sur le même écran. Ne jamais soumettre cet écran avant que
    // le mot de passe soit rempli. Le bouton intermédiaire ne sert qu'aux
    // variantes d'authentification réellement en deux étapes.
    const visiblePassword = await firstVisible(passwordLocators(page));
    if (!visiblePassword) {
      const continueButton = await firstVisible([
        page.getByRole('button', { name: /continue|next|suivant|jatka/i }),
        page.locator('button[type="submit"]'),
      ]);
      if (continueButton) {
        await continueButton.click();
        await page.waitForTimeout(500);
      }
    }
  }
  const password = await waitForVisible(passwordLocators(page), 12_000);
  if (!password) {
    throw new Error('Le champ mot de passe Flatpay est introuvable.');
  }
  await password.fill(credentials.password);
  const submit = await firstVisible([
    page.getByRole('button', { name: /log in|sign in|connexion|connecter|kirjaudu|continue/i }),
    page.locator('button[type="submit"]'),
    page.locator('input[type="submit"]'),
  ]);
  if (!submit) throw new Error('Le bouton de connexion Flatpay est introuvable.');
  await submit.click();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const loginInput = await firstVisible(loginInputLocators(page));
    if (!loginInput && !isFlatpayLoginFlow(page)) return;
    await page.waitForTimeout(250);
  }
}

async function ensureAuthenticated(page: Page, options: Options, credentials?: FlatpayCredentials) {
  if (page.url() === 'about:blank') {
    await page.goto(options.portalUrl, { waitUntil: 'domcontentloaded' });
  }
  // Le formulaire React peut apparaître après DOMContentLoaded. Sur une URL
  // de connexion, attendre son rendu évite de croire à tort que la session est
  // encore valide.
  const loginInputs = isFlatpayLoginFlow(page)
    ? await waitForVisible(loginInputLocators(page), 15_000)
    : await waitForVisible(loginInputLocators(page), 1_500);
  if (loginInputs && credentials) {
    await loginWithCredentials(page, credentials);
    await page.waitForTimeout(750);
  }
  const remainingLogin = await firstVisible(loginInputLocators(page));
  if (remainingLogin || isFlatpayLoginFlow(page)) {
    throw new Error(
      credentials
        ? 'La connexion Flatpay n’a pas abouti. Vérifiez les identifiants ; si Flatpay demande une validation supplémentaire (MFA, captcha ou consentement), ouvrez une fois la commande --setup.'
        : 'La session Flatpay a expiré. Enregistrez les identifiants dans ToqueHub ou relancez avec --setup.',
    );
  }
}

async function openAllReports(page: Page, options: Options) {
  await page.goto(portalUrl(options, '/all-reports'), { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'All Reports', exact: true }).waitFor();
}

function calendarDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function calendarMonthLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function calendarRangeFragment(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

async function triggerMatchesRange(trigger: Locator, range: DateRange) {
  const label = (await trigger.innerText()).replace(/\s+/g, ' ').trim();
  return (
    label.includes(`${calendarRangeFragment(range.from)},`) &&
    label.includes(`- ${calendarRangeFragment(range.to)},`)
  );
}

function monthNumber(label: string) {
  const parsed = new Date(`1 ${label} 12:00:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Mois Flatpay illisible : ${label}.`);
  return parsed.getFullYear() * 12 + parsed.getMonth();
}

async function visibleArrow(page: Page, direction: 'previous' | 'next') {
  const pathFragment = direction === 'previous' ? 'M20 11H7.83' : 'm12 4-1.41';
  const buttons = page.locator('button').filter({
    has: page.locator(`svg path[d*="${pathFragment}"]`),
  });
  return firstVisible([buttons]);
}

async function visibleCalendarMonths(page: Page) {
  const grids = page.getByRole('grid');
  const labels: string[] = [];
  for (let index = 0; index < (await grids.count()); index += 1) {
    const grid = grids.nth(index);
    if (!(await grid.isVisible())) continue;
    const label = (await grid.getAttribute('aria-label'))?.trim();
    // Les tableaux Orders et Sales overview utilisent eux aussi role="grid".
    // Un calendrier Flatpay se reconnaît à un aria-label réduit au mois et à
    // l'année (par exemple « August 2026 »).
    if (label && /^[A-Z][a-z]+\s+20\d{2}$/.test(label)) labels.push(label);
  }
  return labels;
}

async function waitForCalendar(page: Page, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await visibleCalendarMonths(page)).length) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function moveCalendarTo(page: Page, target: string) {
  const targetNumber = monthNumber(calendarMonthLabel(target));
  for (let attempt = 0; attempt < 72; attempt += 1) {
    const months = await visibleCalendarMonths(page);
    if (!months.length) throw new Error('Le calendrier Flatpay ne présente aucun mois.');
    const monthNumbers = months.map(monthNumber);
    if (monthNumbers.includes(targetNumber)) return;
    const direction = targetNumber < Math.min(...monthNumbers) ? 'previous' : 'next';
    const arrow = await visibleArrow(page, direction);
    if (!arrow) throw new Error(`Flèche ${direction} du calendrier Flatpay introuvable.`);
    await arrow.click();
    await page.waitForTimeout(80);
  }
  throw new Error(
    `Impossible d’atteindre ${calendarMonthLabel(target)} dans le calendrier Flatpay.`,
  );
}

async function clickCalendarDate(page: Page, value: string) {
  await moveCalendarTo(page, value);
  const label = calendarDateLabel(value);
  const [weekday, date] = label.split(', ');
  const [day, month, year] = date.split(' ');
  const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexibleLabel = [
    `(?=.*\\b${escape(weekday)}\\b)`,
    `(?=.*\\b${escape(day)}(?:st|nd|rd|th)?\\b)`,
    `(?=.*\\b${escape(month)}\\b)`,
    `(?=.*\\b${escape(year)}\\b)`,
  ].join('');
  const dateButton = page.getByRole('button', {
    name: new RegExp(flexibleLabel, 'i'),
  });
  const visible = await firstVisible([dateButton]);
  if (!visible) throw new Error(`Date Flatpay introuvable : ${value}.`);
  if (!(await visible.isEnabled())) throw new FlatpayHistoryBoundaryError(value);
  await visible.click();
}

async function selectDateRange(page: Page, scope: Locator, range: DateRange) {
  // getByRole({ name }) peut sélectionner le bouton conteneur de la navigation
  // Flatpay, dont le nom accessible contient tout le texte de la page. Chercher
  // ici un vrai bouton court dont le libellé est uniquement une période.
  const buttons = scope.locator('button');
  let visibleTrigger: Locator | null = null;
  for (let index = 0; index < (await buttons.count()); index += 1) {
    const candidate = buttons.nth(index);
    if (!(await candidate.isVisible())) continue;
    const label = (await candidate.innerText()).replace(/\s+/g, ' ').trim();
    if (label.length <= 160 && DATE_RANGE_PATTERN.test(label)) {
      visibleTrigger = candidate;
      break;
    }
  }
  if (!visibleTrigger) throw new Error('Le sélecteur de période Flatpay est introuvable.');
  await visibleTrigger.click();
  const calendarOpened = await waitForCalendar(page);
  if (!calendarOpened) {
    const visibleButtons = (await page.getByRole('button').allTextContents())
      .map((label) => label.trim())
      .filter((label) => label && label.length < 120)
      .slice(0, 24);
    throw new Error(
      `Le calendrier Flatpay ne s’est pas ouvert. Boutons visibles : ${visibleButtons.join(' · ') || 'aucun'}.`,
    );
  }
  await clickCalendarDate(page, range.from);
  await page.waitForTimeout(100);
  // Lorsque la fin souhaitée est déjà la fin de la sélection courante (cas
  // fréquent du mois en cours), Flatpay met immédiatement la bonne plage en
  // sélection après le premier clic. Recliquer sur cette fin réduirait alors
  // la plage à une seule journée.
  if (!(await triggerMatchesRange(visibleTrigger, range))) {
    await clickCalendarDate(page, range.to);
    await page.waitForTimeout(100);
  }
  if (!(await triggerMatchesRange(visibleTrigger, range))) {
    throw new Error(`Flatpay n’a pas appliqué la période ${range.from} → ${range.to}.`);
  }
  const confirm = await firstVisible([page.getByRole('button', { name: 'Confirm', exact: true })]);
  if (!confirm) throw new Error('Le bouton Confirm du calendrier Flatpay est introuvable.');
  await confirm.click();
}

async function reportCard(page: Page, heading: string) {
  const title = page.getByRole('heading', { name: heading, exact: true, level: 5 });
  if ((await title.count()) !== 1) throw new Error(`Carte Flatpay introuvable : ${heading}.`);
  return title.locator('xpath=../../..');
}

async function openReportDialog(page: Page, type: Exclude<ReportType, 'sales-overview'>) {
  const card = await reportCard(page, REPORTS[type].heading);
  if (type === 'orders' || type === 'transactions') {
    const actions = card.getByRole('button', { name: 'More actions', exact: true });
    if ((await actions.count()) !== 1) throw new Error(`Menu d’export introuvable : ${type}.`);
    await actions.click();
    const exportItem = page.getByRole('menuitem', { name: 'Export', exact: true });
    if ((await exportItem.count()) !== 1) throw new Error(`Action Export introuvable : ${type}.`);
    await exportItem.click();
  } else {
    const exportButton = card.getByRole('button', { name: 'Export', exact: true });
    if ((await exportButton.count()) !== 1) throw new Error(`Bouton Export introuvable : ${type}.`);
    await exportButton.click();
  }
  const dialogTitle = page.getByRole('heading', {
    name: REPORTS[type].dialogHeading,
    exact: true,
  });
  await dialogTitle.waitFor();
  return dialogTitle.locator('xpath=ancestor::*[@role="dialog"][1]');
}

async function chooseExcel(page: Page, dialog: Locator) {
  const typeButton = dialog.getByRole('button', { name: /^Type / });
  if ((await typeButton.count()) !== 1 || !(await typeButton.isEnabled())) return;
  await typeButton.click();
  const excel = page.getByRole('option', { name: 'Excel', exact: true });
  if ((await excel.count()) === 1) await excel.click();
}

async function submitDialog(dialog: Locator, name: string) {
  const submit = dialog.getByRole('button', { name, exact: true });
  if ((await submit.count()) !== 1)
    throw new Error(`Bouton ${name} introuvable dans l’export Flatpay.`);
  await submit.click();
}

async function generateReport(page: Page, options: Options, type: ReportType, range: DateRange) {
  if (type === 'sales-overview') {
    await page.goto(portalUrl(options, '/pos/saleafterproduct'), { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Sales overview', exact: true, level: 1 }).waitFor();
    await selectDateRange(page, page.locator('body'), range);
    const exportButton = page.getByRole('button', { name: 'Export', exact: true });
    if ((await exportButton.count()) !== 1)
      throw new Error('Bouton Export de Sales overview introuvable.');
    await exportButton.click();
    const dialogTitle = page.getByRole('heading', {
      name: REPORTS[type].dialogHeading,
      exact: true,
    });
    await dialogTitle.waitFor();
    const dialog = dialogTitle.locator('xpath=ancestor::*[@role="dialog"][1]');
    await submitDialog(dialog, REPORTS[type].submit);
    return;
  }

  await openAllReports(page, options);
  const dialog = await openReportDialog(page, type);
  await selectDateRange(page, dialog, range);
  if (type === 'transactions') await chooseExcel(page, dialog);
  await submitDialog(dialog, REPORTS[type].submit);
}

async function generateCurrentOrdersReport(page: Page, options: Options, range: DateRange) {
  // Le calendrier de la page Orders ne permet de sélectionner que les trois
  // derniers mois, alors que l'API de la page conserve des commandes plus
  // anciennes. Les filtres de l'URL ne sont pas soumis à cette restriction :
  // ils sont normalisés par le portail dans le fuseau local puis réutilisés
  // par l'export. Cela permet de reprendre tout l'historique sans fabriquer
  // un appel privé ni contourner l'authentification du portail.
  const ordersUrl = new URL(portalUrl(options, '/pos/orders'));
  ordersUrl.searchParams.set('pageIndex', '0');
  ordersUrl.searchParams.set('status', 'all');
  ordersUrl.searchParams.set('fromDate', `${range.from}T00:00:00.000Z`);
  ordersUrl.searchParams.set('toDate', `${range.to}T23:59:59.000Z`);
  ordersUrl.searchParams.set('sorting', 'orderId-desc');
  await page.goto(ordersUrl.toString(), { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Orders', exact: true, level: 1 }).waitFor();

  let appliedRange = false;
  const rangeDeadline = Date.now() + 10_000;
  while (!appliedRange && Date.now() < rangeDeadline) {
    const buttons = page.locator('button');
    for (let index = 0; index < (await buttons.count()); index += 1) {
      const candidate = buttons.nth(index);
      if (!(await candidate.isVisible())) continue;
      const label = (await candidate.innerText()).replace(/\s+/g, ' ').trim();
      if (label.length <= 160 && DATE_RANGE_PATTERN.test(label)) {
        appliedRange = await triggerMatchesRange(candidate, range);
        if (appliedRange) break;
      }
    }
    if (!appliedRange) await page.waitForTimeout(100);
  }
  if (!appliedRange) {
    throw new Error(`Flatpay n'a pas appliqué la période Orders ${range.from} → ${range.to}.`);
  }

  const exportButton = page.getByRole('button', { name: 'Export', exact: true });
  if ((await exportButton.count()) !== 1) {
    throw new Error('Bouton Export de la page Orders introuvable.');
  }
  await exportButton.click();

  const dialogTitle = page.getByRole('heading', {
    name: REPORTS.orders.dialogHeading,
    exact: true,
  });
  await dialogTitle.waitFor();
  const dialog = dialogTitle.locator('xpath=ancestor::*[@role="dialog"][1]');
  await submitDialog(dialog, REPORTS.orders.submit);
}

async function generateSelectedReport(
  page: Page,
  options: Options,
  type: ReportType,
  range: DateRange,
) {
  if (type === 'orders') return generateCurrentOrdersReport(page, options, range);
  return generateReport(page, options, type, range);
}

async function saveDownload(download: Download, inbox: string, reportName: string) {
  const fileName = resolveFlatpayDownloadFileName(download.suggestedFilename(), reportName);
  const extension = extname(fileName);
  const stem = basename(fileName, extension);
  const directory = await organizedInbox(inbox);
  let target = resolve(directory, fileName);
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    if (
      !(await access(target)
        .then(() => true)
        .catch(() => false))
    )
      break;
    target = resolve(directory, `${stem}-${suffix}${extension}`);
  }
  await download.saveAs(target);
  return target;
}

async function downloadReadyReports(
  page: Page,
  options: Options,
  state: AutomationState,
  forceLatestPrefixes: string[] = [],
  credentials?: FlatpayCredentials,
) {
  await page.goto(portalUrl(options, '/profile/reporting'), { waitUntil: 'domcontentloaded' });
  await ensureAuthenticated(page, options, credentials);
  const reportPage = await waitForVisible(
    [
      page.getByRole('heading', { name: /downloads|download history|reports/i }),
      page.getByRole('heading', { level: 6 }),
    ],
    30_000,
  );
  if (!reportPage) {
    const headings = (await page.getByRole('heading').allTextContents())
      .filter(Boolean)
      .slice(0, 10);
    throw new Error(
      `Page des téléchargements Flatpay introuvable (${page.url()}) : ${headings.join(' · ') || 'aucun titre'}.`,
    );
  }
  const headings = page.getByRole('heading', { level: 6 });
  const downloadedKeys = new Set(state.downloadedReportKeys);
  const forcedPrefixes = new Set<string>();
  const saved: string[] = [];
  const reportCount = await headings.count();
  for (let index = 0; index < reportCount; index += 1) {
    const heading = headings.nth(index);
    const reportName = (await heading.innerText()).trim();
    const normalizedName = reportName.toLowerCase();
    const forcedPrefix = forceLatestPrefixes.find((prefix) => normalizedName.startsWith(prefix));
    const shouldForce = Boolean(forcedPrefix && !forcedPrefixes.has(forcedPrefix));
    if (!reportName || (!shouldForce && downloadedKeys.has(reportName))) continue;
    const row = heading.locator('xpath=../..');
    if (!(await row.innerText()).includes('Completed')) continue;
    const button = row.getByRole('button');
    if ((await button.count()) !== 1 || !(await button.isVisible()) || !(await button.isEnabled()))
      continue;
    const pending = page.waitForEvent('download', { timeout: 30_000 });
    await button.click();
    const download = await pending;
    saved.push(await saveDownload(download, options.inbox, reportName));
    if (forcedPrefix) forcedPrefixes.add(forcedPrefix);
    downloadedKeys.add(reportName);
    state.downloadedReportKeys = [...downloadedKeys].slice(-10_000);
    await saveState(options.statePath, state);
  }
  return saved;
}

async function diagnose(page: Page, options: Options) {
  await openAllReports(page, options);
  const headings = await page.getByRole('heading', { level: 5 }).allTextContents();
  const downloadsUrl = portalUrl(options, '/profile/reporting');
  console.log(
    JSON.stringify(
      {
        authenticated: true,
        allReportsUrl: page.url(),
        downloadsUrl,
        availableReports: headings,
      },
      null,
      2,
    ),
  );
}

async function importDownloadedReports(inbox: string, organizationId: string, siteId: string) {
  const compiledScript = resolve(__dirname, 'import-flatpay-reports.js');
  const sourceScript = resolve(__dirname, 'import-flatpay-reports.ts');
  const useCompiledScript = await access(compiledScript)
    .then(() => true)
    .catch(() => false);
  const importScript = useCompiledScript ? compiledScript : sourceScript;
  const loader = resolve(__dirname, '../../../node_modules/tsx/dist/loader.mjs');
  const result = await run(
    process.execPath,
    [
      ...(useCompiledScript ? [] : ['--import', loader]),
      importScript,
      '--inbox',
      inbox,
      '--recursive',
      '--settle-seconds',
      '0',
      '--organization-id',
      organizationId,
      '--site-id',
      siteId,
    ],
    { cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
}

async function observeHistoricalRanges(
  prisma: PrismaService,
  organizationId: string,
  siteId: string,
  ranges: FlatpayHistoryRange[],
) {
  const sources = await prisma.financeDataSource.findMany({
    where: { organizationId, siteId, provider: FinanceProvider.FLATPAY },
    select: { id: true },
  });
  const sourceIds = sources.map(({ id }) => id);
  if (!sourceIds.length) {
    return ranges.map((range) => ({ range, revenueRows: 0, productRows: 0 }));
  }
  return Promise.all(
    ranges.map(async (range) => {
      const saleDate = {
        gte: new Date(`${range.from}T00:00:00.000Z`),
        lt: new Date(`${addDays(range.to, 1)}T00:00:00.000Z`),
      };
      const [revenueRows, productRows] = await Promise.all([
        prisma.financeDailySales.count({
          where: {
            organizationId,
            sourceId: { in: sourceIds },
            saleDate,
            isRevenueRecord: true,
            OR: [
              { transactionCount: { gt: 0 } },
              { grossAmount: { not: 0 } },
              { netAmount: { not: 0 } },
              { vatAmount: { not: 0 } },
              { refundAmount: { not: 0 } },
            ],
          },
        }),
        prisma.financeDailySales.count({
          where: {
            organizationId,
            sourceId: { in: sourceIds },
            saleDate,
            isRevenueRecord: false,
            OR: [
              { transactionCount: { gt: 0 } },
              { grossAmount: { not: 0 } },
              { netAmount: { not: 0 } },
              { vatAmount: { not: 0 } },
              { refundAmount: { not: 0 } },
            ],
          },
        }),
      ]);
      return { range, revenueRows, productRows };
    }),
  );
}

function isFlatpayLoginFlow(page: Page) {
  return /\/(?:login|auth|verify|challenge|mfa|consent)(?:\/|\?|$)/i.test(page.url());
}

async function setup(
  options: Options,
  context: BrowserContext,
  page: Page,
  credentials?: FlatpayCredentials,
) {
  await page.goto(options.portalUrl, { waitUntil: 'domcontentloaded' });
  console.log('Connectez-vous à Flatpay dans la fenêtre Chrome ouverte.');
  if (options.automaticSetup) {
    await ensureAuthenticated(page, options, credentials).catch(() => undefined);
    const deadline = Date.now() + 10 * 60_000;
    let authenticated = false;
    while (Date.now() < deadline) {
      const loginInput = await firstVisible([
        page.locator('input[type="password"]'),
        page.locator('input[type="email"]'),
        page.locator('input[name="email"]'),
        page.locator('input[name="username"]'),
        page.locator('input[autocomplete="email"]'),
      ]);
      if (!loginInput && !isFlatpayLoginFlow(page)) {
        await page.goto(portalUrl(options, '/profile/reporting'), {
          waitUntil: 'domcontentloaded',
        });
        const redirectedToLogin = isFlatpayLoginFlow(page);
        const redirectedLoginInput = await firstVisible([
          page.locator('input[type="password"]'),
          page.locator('input[type="email"]'),
          page.locator('input[name="email"]'),
          page.locator('input[name="username"]'),
          page.locator('input[autocomplete="email"]'),
        ]);
        if (!redirectedToLogin && !redirectedLoginInput) {
          authenticated = true;
          break;
        }
      }
      await page.waitForTimeout(1_000);
    }
    if (!authenticated) {
      throw new Error('La reconnexion FlatPay n’a pas été terminée dans les 10 minutes.');
    }
  } else {
    const prompt = createInterface({ input, output });
    await prompt.question('Quand le tableau de bord Flatpay est visible, appuyez sur Entrée… ');
    prompt.close();
    await ensureAuthenticated(page, options);
  }
  await context.storageState({ path: resolve(options.profileDirectory, 'storage-state.json') });
  console.log(`Session Flatpay enregistrée dans ${options.profileDirectory}.`);
}

async function main() {
  const options = parseOptions();
  const prisma = new PrismaService();
  await prisma.$connect();
  const organization = await selectOrganization(prisma, options.organizationId);
  options.organizationId = organization.id;
  const credentialService = new FlatpayCredentialsService(
    prisma,
    new FinancePolicy(),
    new FennoaSecretService(new ConfigService(process.env)),
  );
  const credentials = await credentialService
    .credentials(organization.id, options.siteId)
    .catch(() => undefined);
  if (!credentials) {
    throw new Error('Connexion FlatPay introuvable pour cet établissement.');
  }
  options.siteId = credentials.defaultSiteId;
  options.profileDirectory = resolve(options.profileDirectory, credentials.id);
  options.statePath =
    extname(options.statePath).toLowerCase() === '.json'
      ? options.statePath
      : resolve(options.statePath, `${credentials.id}.json`);
  options.chromePath = await resolveFlatpayBrowserExecutable(options.chromePath);
  if (credentials && !process.env.FLATPAY_PORTAL_URL) options.portalUrl = credentials.portalUrl;
  await mkdir(options.inbox, { recursive: true });
  await mkdir(options.profileDirectory, { recursive: true });
  const context = await chromium.launchPersistentContext(options.profileDirectory, {
    executablePath: options.chromePath,
    headless: !options.headed,
    acceptDownloads: true,
    downloadsPath: options.inbox,
    viewport: { width: 1440, height: 1000 },
    args:
      process.env.FLATPAY_CHROME_NO_SANDBOX === 'true'
        ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        : [],
  });
  try {
    const pages = context.pages();
    const page = pages[0] || (await context.newPage());
    if (options.command === 'setup') {
      await setup(options, context, page, credentials);
      if (!options.runAfterSetup) return;
    }
    await page.goto(options.portalUrl, { waitUntil: 'domcontentloaded' });
    await ensureAuthenticated(page, options, credentials);
    if (options.command === 'diagnose') {
      await diagnose(page, options);
      return;
    }

    const state = await readState(options.statePath);
    if (state.productDailyBackfillVersion !== 1) {
      delete state.generatedThrough['sales-overview'];
      state.generatedKeys = state.generatedKeys.filter((key) => !key.startsWith('sales-overview:'));
      state.productDailyBackfillVersion = 1;
      await saveState(options.statePath, state);
    }
    if (!state.historyStart) {
      state.historyStart = options.from ?? options.to;
      await saveState(options.statePath, state);
    }
    const readyBefore = await downloadReadyReports(page, options, state, [], credentials);

    const reconciledKeys = new Set(state.generatedKeys);
    for (const reportName of state.downloadedReportKeys) {
      const key = resolveFlatpayDownloadedReportKey(reportName);
      if (key) reconciledKeys.add(key);
    }
    if (reconciledKeys.size !== state.generatedKeys.length) {
      state.generatedKeys = [...reconciledKeys].slice(-5000);
      await saveState(options.statePath, state);
    }

    let generated = new Set(state.generatedKeys);
    const results: Array<Record<string, unknown>> = [];
    let generationCount = 0;
    const today = localIsoDate();
    if (options.to === today) {
      const liveReports: Array<{ type: ReportType; range: DateRange }> = [
        { type: 'orders', range: { from: today, to: today } },
        {
          type: 'sales-overview',
          range: { from: firstDayOfMonth(today), to: today },
        },
      ];
      for (const { type, range } of liveReports) {
        if (!options.reportTypes.includes(type) || generationCount >= options.maxGenerationsPerRun)
          continue;
        try {
          await generateSelectedReport(page, options, type, range);
          generationCount += 1;
          const key = `${type}:${range.from}:${range.to}`;
          generated.add(key);
          state.generatedKeys = [...generated].slice(-5000);
          // Le rafraîchissement du jour ne doit pas avancer le curseur historique :
          // la boucle de rattrapage ci-dessous le fera uniquement dans l'ordre.
          await saveState(options.statePath, state);
          results.push({ type, ...range, generated: true, liveRefresh: true });
        } catch (error) {
          results.push({
            type,
            ...range,
            generated: false,
            liveRefresh: true,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (
      !state.historyDiscovery ||
      state.historyDiscovery.version !== FLATPAY_HISTORY_DISCOVERY_VERSION
    ) {
      state.historyDiscovery = createFlatpayHistoryDiscovery([...generated], options.to);
      await saveState(options.statePath, state);
    }
    if (state.historyQueueVersion !== 1 && !state.historyDiscovery.complete) {
      state.generatedKeys = discardUnconfirmedFlatpayOrderKeys(
        state.generatedKeys,
        state.historyDiscovery.nextTo,
      );
      state.historyQueueVersion = 1;
      await saveState(options.statePath, state);
    }
    generated = new Set(state.generatedKeys);
    const historyTypes = options.reportTypes.filter(isHistoryReportType);
    // Orders est la source transactionnelle nécessaire aux ventes et à
    // l'affluence. Sales overview n'est qu'un enrichissement produit : sa
    // limite de calendrier ne doit jamais interrompre la reprise des tickets.
    const discoveryHistoryTypes = historyTypes.filter((type) => type === 'orders');
    const availableHistoryGenerations = Math.max(0, options.maxGenerationsPerRun - generationCount);
    const requestedHistoryRangeCount = discoveryHistoryTypes.length
      ? Math.floor(availableHistoryGenerations / discoveryHistoryTypes.length)
      : 0;
    const historyRanges = planFlatpayHistoryRanges(
      state.historyDiscovery,
      capFlatpayHistoryRangeCount(state.historyDiscovery, requestedHistoryRangeCount, 7),
      7,
    );
    const pending = new Map<ReportType, DateRange[]>();
    for (const type of historyTypes) pending.set(type, [...historyRanges]);
    const historyDownloadAliases = new Map<string, string>();
    for (const type of options.reportTypes) {
      if (isHistoryReportType(type)) continue;
      const firstDate = state.generatedThrough[type]
        ? addDays(state.generatedThrough[type]!, 1)
        : state.historyStart;
      if (!firstDate || firstDate > options.to) continue;
      pending.set(type, rangesForReport(type, firstDate, options.to, options));
    }
    let historyBoundary: string | undefined;
    let historyBoundaryRange: DateRange | undefined;
    while (generationCount < options.maxGenerationsPerRun) {
      let madeProgress = false;
      for (const type of options.reportTypes) {
        const queue = pending.get(type);
        const range = queue?.shift();
        if (!range) continue;
        madeProgress = true;
        const key = `${type}:${range.from}:${range.to}`;
        if (!generated.has(key)) {
          try {
            await generateSelectedReport(page, options, type, range);
            generationCount += 1;
            generated.add(key);
            state.generatedKeys = [...generated].slice(-5000);
            results.push({ type, ...range, generated: true });
          } catch (error) {
            if (error instanceof FlatpayHistoryBoundaryError && type === 'sales-overview') {
              pending.set(type, []);
              results.push({
                type,
                ...range,
                generated: false,
                historyComplete: true,
                enrichmentUnavailable: true,
                portalBoundary: error.boundary,
              });
            } else if (error instanceof FlatpayHistoryBoundaryError && type === 'orders') {
              historyBoundary = error.boundary;
              historyBoundaryRange = range;
              // Une semaine peut chevaucher le début réel du compte FlatPay.
              // Chercher le premier jour activé dans cette même semaine permet
              // d'importer les derniers jours disponibles avant de clore le
              // rattrapage, au lieu de perdre toute la période partielle.
              let partialFrom = addDays(error.boundary, 1);
              let partialRange: DateRange | undefined;
              while (partialFrom <= range.to) {
                const candidate = { from: partialFrom, to: range.to };
                try {
                  for (const historyType of discoveryHistoryTypes) {
                    await generateSelectedReport(page, options, historyType, candidate);
                  }
                  partialRange = candidate;
                  break;
                } catch (partialError) {
                  if (!(partialError instanceof FlatpayHistoryBoundaryError)) throw partialError;
                  historyBoundary = partialError.boundary;
                  partialFrom = addDays(partialError.boundary, 1);
                }
              }
              if (partialRange) {
                generationCount += discoveryHistoryTypes.length;
                for (const historyType of discoveryHistoryTypes) {
                  const actualKey = `${historyType}:${partialRange.from}:${partialRange.to}`;
                  generated.add(actualKey);
                  historyDownloadAliases.set(`${historyType}:${range.from}:${range.to}`, actualKey);
                  results.push({
                    type: historyType,
                    ...partialRange,
                    plannedFrom: range.from,
                    generated: true,
                    partialHistoryBoundary: true,
                  });
                }
                state.generatedKeys = [...generated].slice(-5000);
              }
              for (const historyType of discoveryHistoryTypes) pending.set(historyType, []);
              results.push({
                type,
                ...range,
                generated: false,
                historyComplete: true,
                portalBoundary: error.boundary,
              });
            } else {
              pending.set(type, []);
              results.push({
                type,
                ...range,
                generated: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
        if (generated.has(key)) {
          if (!isHistoryReportType(type)) state.generatedThrough[type] = range.to;
          state.lastGeneratedTo = range.to;
        }
        await saveState(options.statePath, state);
        if (generationCount >= options.maxGenerationsPerRun) break;
      }
      if (!madeProgress) break;
    }

    if (results.some(({ generated: ok }) => ok)) await page.waitForTimeout(8_000);
    const refreshedPrefixes = [
      ...(results.some(
        ({ type, generated: ok, liveRefresh }) =>
          type === 'orders' && ok === true && liveRefresh === true,
      )
        ? ['orders report']
        : []),
      ...(results.some(
        ({ type, generated: ok, liveRefresh }) =>
          type === 'sales-overview' && ok === true && liveRefresh === true,
      )
        ? ['sales overview report']
        : []),
    ];
    const readyAfter = await downloadReadyReports(
      page,
      options,
      state,
      refreshedPrefixes,
      credentials,
    );
    const expectedHistoryDownloads = historyRanges.flatMap((range) =>
      discoveryHistoryTypes
        .map((type) => {
          const plannedKey = `${type}:${range.from}:${range.to}`;
          return historyDownloadAliases.get(plannedKey) ?? plannedKey;
        })
        .filter((key) => generated.has(key)),
    );
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const downloadedKeys = new Set(
        state.downloadedReportKeys
          .map(resolveFlatpayDownloadedReportKey)
          .filter((key): key is string => Boolean(key)),
      );
      if (expectedHistoryDownloads.every((key) => downloadedKeys.has(key))) break;
      await page.waitForTimeout(5_000);
      readyAfter.push(...(await downloadReadyReports(page, options, state, [], credentials)));
    }
    await importDownloadedReports(options.inbox, organization.id, credentials.defaultSiteId);
    const downloadedHistoryKeys = new Set(
      state.downloadedReportKeys
        .map(resolveFlatpayDownloadedReportKey)
        .filter((key): key is string => Boolean(key)),
    );
    const completedHistoryRanges: DateRange[] = [];
    for (const range of historyRanges) {
      if (
        discoveryHistoryTypes.every((type) => {
          const plannedKey = `${type}:${range.from}:${range.to}`;
          return downloadedHistoryKeys.has(historyDownloadAliases.get(plannedKey) ?? plannedKey);
        })
      ) {
        completedHistoryRanges.push(range);
      } else break;
    }
    if (completedHistoryRanges.length) {
      const observations = await observeHistoricalRanges(
        prisma,
        organization.id,
        credentials.defaultSiteId,
        completedHistoryRanges,
      );
      state.historyDiscovery = applyFlatpayHistoryObservations(
        state.historyDiscovery,
        observations,
      );
      const earliest =
        state.historyDiscovery.earliestActivity ?? state.historyDiscovery.earliestScanned;
      if (earliest && (!state.historyStart || earliest < state.historyStart))
        state.historyStart = earliest;
    }
    const boundaryRangeCompleted =
      !historyBoundaryRange ||
      completedHistoryRanges.some(
        (range) =>
          range.from === historyBoundaryRange?.from && range.to === historyBoundaryRange?.to,
      );
    if (historyBoundary && boundaryRangeCompleted) {
      state.historyDiscovery = completeFlatpayHistoryAtPortalBoundary(
        state.historyDiscovery,
        historyBoundary,
      );
    }
    await saveState(options.statePath, state);
    if (state.historyStart) {
      await prisma.financeFlatpayConnection.update({
        where: { id: credentials.id },
        data: { historyStart: new Date(`${state.historyStart}T00:00:00.000Z`) },
      });
    }
    const failed = results.filter(
      ({ generated: ok, historyComplete }) => ok === false && historyComplete !== true,
    );
    console.log(
      JSON.stringify(
        {
          ok: failed.length === 0,
          period: { from: state.historyStart, to: options.to },
          reportTypes: options.reportTypes,
          maxGenerationsPerRun: options.maxGenerationsPerRun,
          generatedThrough: state.generatedThrough,
          historyDiscovery: state.historyDiscovery,
          downloadedBefore: readyBefore,
          downloadedAfter: readyAfter,
          generated: results,
        },
        null,
        2,
      ),
    );
    if (failed.length) process.exitCode = 1;
    await credentialService.recordSync(
      organization.id,
      credentials.defaultSiteId,
      failed.length ? `${failed.length} rapport(s) n’ont pas pu être générés.` : undefined,
    );
  } catch (error) {
    await credentialService
      .recordSync(
        organization.id,
        credentials.defaultSiteId,
        error instanceof Error ? error.message : String(error),
      )
      .catch(() => undefined);
    throw error;
  } finally {
    await context.close();
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
