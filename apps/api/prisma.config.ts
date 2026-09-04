import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

const configDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(configDir, '../..');

try {
  loadEnvFile(resolve(rootDir, '.env'));
} catch {
  // The Prisma CLI will report missing variables with its standard validation errors.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
});
