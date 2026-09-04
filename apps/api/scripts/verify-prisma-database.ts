import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const expectedTables = Prisma.dmmf.datamodel.models.map((model) => model.dbName ?? model.name);
  const rows = await prisma.$queryRaw<Array<{ tableName: string }>>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = current_schema()
  `;
  const existingTables = new Set(rows.map(({ tableName }) => tableName));
  const missingTables = expectedTables.filter((tableName) => !existingTables.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(
      [
        'The database is missing tables required by the generated Prisma Client:',
        ...missingTables.map((tableName) => `  - ${tableName}`),
        'Run "npm run prisma:deploy" or "npm run welcome" before starting the API.',
      ].join('\n'),
    );
  }

  console.log(`Prisma database verification passed (${expectedTables.length} model tables found).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
