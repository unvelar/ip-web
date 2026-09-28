import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(dirname(dirname(fileURLToPath(import.meta.url))), 'dist/assets');
for (const name of await readdir(assets)) {
  if (!name.endsWith('.js')) continue;
  const code = await readFile(join(assets, name), 'utf8');
  if (code.includes(':53000') || /(?:editor@(?:giardini|paula)\.example|catalog-admin@unvelar\.example)/.test(code)) {
    throw new Error(`Local monitoring transport or sample credentials leaked into production asset ${name}`);
  }
}
console.log('Verified local monitoring transport and sample credentials are excluded from production.');
