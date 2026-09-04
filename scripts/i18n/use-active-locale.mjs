import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const rootDir = resolve(import.meta.dirname, '../..');
const sourceDir = resolve(rootDir, 'apps/web/src');
const i18nDir = resolve(sourceDir, 'i18n/runtime');
const sourceFiles = ts.sys
  .readDirectory(sourceDir, ['.ts', '.tsx'], undefined, undefined)
  .filter((file) => !file.includes('/i18n/'));

let updated = 0;
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  if (!source.includes("'fr-FR'") && !source.includes('"fr-FR"')) continue;

  let next = source.replaceAll("'fr-FR'", 'activeLocale()').replaceAll('"fr-FR"', 'activeLocale()');
  if (!next.includes("i18n/runtime'")) {
    let importPath = relative(dirname(file), i18nDir).replaceAll('\\', '/');
    if (!importPath.startsWith('.')) importPath = `./${importPath}`;
    const pragma = '// @ts-nocheck\n';
    next = next.startsWith(pragma)
      ? `${pragma}import { activeLocale } from '${importPath}';\n${next.slice(pragma.length)}`
      : `import { activeLocale } from '${importPath}';\n${next}`;
  } else {
    const i18nImport = /import \{([^}]+)\} from '([^']*\/i18n\/runtime|\.\/i18n\/runtime)';/;
    const match = next.match(i18nImport);
    if (match && !match[1].split(',').some((name) => name.trim() === 'activeLocale')) {
      next = next.replace(i18nImport, `import {${match[1]}, activeLocale } from '${match[2]}';`);
    }
  }

  await writeFile(file, next, 'utf8');
  updated += 1;
}

console.log(`Updated ${updated} files to use the active application locale.`);
