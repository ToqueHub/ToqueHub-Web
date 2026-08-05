import { ConfigService } from '@nestjs/config';
import { FennoaClientService } from '../src/finance/fennoa-client.service';
import { FennoaSecretService } from '../src/finance/fennoa-secret.service';
import { FennoaSyncService } from '../src/finance/fennoa-sync.service';
import { FinancePolicy } from '../src/finance/finance.policy';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const settings = await prisma.financeSettings.findFirst({
      where: {
        fennoaUsername: { not: null },
        fennoaApiKeyEncrypted: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!settings) throw new Error('Aucune configuration Fennoa complète n’est enregistrée.');
    const user = await prisma.user.findFirst({
      where: { organizationId: settings.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) throw new Error('Aucun administrateur ne peut tracer la synchronisation.');

    const config = new ConfigService(process.env);
    const service = new FennoaSyncService(
      prisma,
      new FinancePolicy(),
      new FennoaSecretService(config),
      new FennoaClientService(config),
    );
    const result = await service.sync(
      settings.organizationId,
      {
        id: user.id,
        email: user.email,
        organizationId: settings.organizationId,
        role: 'SUPER_ADMIN',
        permissions: [],
      },
      { full: false },
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
