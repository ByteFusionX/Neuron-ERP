import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(__dirname, '../src/sw-push.ts')],
  outfile: join(__dirname, '../src/sw-push.js'),
  bundle: false,
  format: 'iife',
  target: 'es2020',
  logLevel: 'info',
});
