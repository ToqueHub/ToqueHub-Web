import { ConfigService } from '@nestjs/config';
import { FinanceProvider } from '@prisma/client';
import { FennoaSecretService } from '../src/finance/fennoa-secret.service';
import { FinancePolicy } from '../src/finance/finance.policy';
import {
  PosApiCredentialsService,
  posApiProvider,
} from '../src/finance/pos-api-credentials.service';
import { PosApiSyncService } from '../src/finance/pos-api-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

function optionValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const organizationId = optionValue(args, '--organization-id');
  const siteId = optionValue(args, '--site-id');
  const provider = posApiProvider(optionValue(args, '--provider') || '');
  if (!organizationId) throw new Error('Indiquez --organization-id.');
  if (!siteId) throw new Error('Indiquez --site-id.');

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const user = await prisma.user.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) throw new Error('Aucun utilisateur ne peut tracer la synchronisation.');
    const policy = new FinancePolicy();
    const credentials = new PosApiCredentialsService(
      prisma,
      policy,
      new FennoaSecretService(new ConfigService(process.env)),
    );
    const service = new PosApiSyncService(prisma, policy, credentials);
    const result = await service.sync(
      organizationId,
      {
        id: user.id,
        email: user.email,
        organizationId,
        role: 'SUPER_ADMIN',
        permissions: [],
      },
      provider,
      {
        siteId,
        from: optionValue(args, '--from'),
        to: optionValue(args, '--to'),
      },
    );
    console.log(
      JSON.stringify(
        {
          provider: result.provider,
          period: result.period,
          locations: result.locations,
          transactions: result.transactions,
          productRows: result.productRows,
          rowsWritten: result.rowsWritten,
          message: result.message,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Prisma utilise un moteur natif dont la première promesse ne maintient pas toujours seule le
// processus Node actif. Ce minuteur est libéré dès la fin, mais garantit un comportement identique
// sur macOS, Windows, Linux et Raspberry Pi.
const keepAlive = setInterval(() => undefined, 60_000);
void main()
  .catch((error) => {
    const provider = process.argv.includes('paypal_pos')
      ? FinanceProvider.PAYPAL_POS
      : FinanceProvider.LOYVERSE;
    console.error(`${provider} : ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(keepAlive));
