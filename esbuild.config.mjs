import { build, context } from 'esbuild';
import { readFile } from 'node:fs/promises';

const license = await readFile(new URL('./LICENSE', import.meta.url), 'utf8');
const yamlLicense = await readFile(new URL('./node_modules/yaml/LICENSE', import.meta.url), 'utf8');

const production = process.argv.includes('production');
const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2021',
  outfile: 'main.js',
  sourcemap: production ? false : 'inline',
  minify: production,
  logLevel: 'info',
  banner: { js: `/*! Note Quiz Engine — generated from src/main.ts.\n${license}\nBundled yaml (ISC):\n${yamlLicense}\n*/` },
};

if (production) await build(options);
else await (await context(options)).watch();
