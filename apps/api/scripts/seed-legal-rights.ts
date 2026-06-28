import { PrismaClient } from '@prisma/client';
import { seedFrenchLegalRights } from '../src/legal-rights/legal-rights.seed';

const prisma = new PrismaClient();

async function main() {
  const result = await seedFrenchLegalRights(prisma, undefined, { logger: console });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
