import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

const rootDir = dirname(fileURLToPath(import.meta.url));

try {
  loadEnvFile(resolve(rootDir, '.env'));
} catch {
  // The Prisma CLI will report missing variables with its standard validation errors.
}

export default defineConfig({
  schema: 'apps/api/prisma/schema.prisma',
  migrations: {
    path: 'apps/api/prisma/migrations',
    seed: 'node --import tsx apps/api/prisma/seed.ts',
  },
});
