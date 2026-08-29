import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { resolveFlatpayBrowserExecutable } from '../src/finance/flatpay-browser';
import { PrismaService } from '../src/prisma/prisma.service';

const DEFAULT_SCHEDULE = ['07:00', '15:00', '19:00', '23:00'];

function optionValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const organizationId =
    optionValue(args, '--organization-id') || process.env.FLATPAY_ORGANIZATION_ID;
  const siteId = optionValue(args, '--site-id') || process.env.FLATPAY_SITE_ID;
  if (!organizationId) throw new Error('Indiquez --organization-id.');
  if (!siteId) throw new Error('Indiquez --site-id pour sélectionner le compte FlatPay.');

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const connection = await prisma.financeFlatpayConnection.findUnique({
      where: { organizationId_defaultSiteId: { organizationId, defaultSiteId: siteId } },
    });
    if (!connection) {
      throw new Error('Enregistrez d’abord la connexion FlatPay dans Finance > Sources.');
    }
    if (args.includes('--uninstall')) {
      await prisma.financeFlatpayConnection.update({
        where: { id: connection.id },
        data: { automationInstalledAt: null },
      });
      console.log('Agent local FlatPay désactivé pour cet établissement.');
      return;
    }

    const inbox = resolve(
      optionValue(args, '--inbox') ||
        process.env.FLATPAY_REPORTS_INBOX ||
        resolve(homedir(), 'Documents/ToqueHub/Finance/FlatPay', connection.id),
    );
    const historyStart =
      optionValue(args, '--from') ||
      process.env.FLATPAY_HISTORY_START ||
      connection.historyStart?.toISOString().slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(historyStart)) {
      throw new Error('--from doit utiliser le format YYYY-MM-DD.');
    }
    const schedule = [
      ...new Set(
        (optionValue(args, '--schedule') || DEFAULT_SCHEDULE.join(','))
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ].sort();
    if (!schedule.length || schedule.some((value) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
      throw new Error('--schedule doit contenir des horaires HH:mm séparés par des virgules.');
    }
    const browserExecutable = await resolveFlatpayBrowserExecutable(
      optionValue(args, '--chrome-path'),
    );
    if (args.includes('--dry-run')) {
      console.log(
        JSON.stringify(
          {
            organizationId,
            siteId,
            platform: process.platform,
            runtime: 'TOQUEHUB_LOCAL_AGENT',
            inbox,
            historyStart,
            schedule,
            browserExecutable,
            requiredReports: ['orders', 'sales-overview'],
          },
          null,
          2,
        ),
      );
      return;
    }

    await mkdir(inbox, { recursive: true });
    await prisma.financeFlatpayConnection.update({
      where: { id: connection.id },
      data: {
        automationInstalledAt: new Date(),
        automationInbox: inbox,
        automationSchedule: schedule,
        historyStart: new Date(`${historyStart}T00:00:00.000Z`),
        lastError: null,
      },
    });
    console.log(
      `Agent local FlatPay activé sur ${process.platform} à ${schedule.join(', ')}. L’historique Orders et Sales Overview sera découvert automatiquement.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
