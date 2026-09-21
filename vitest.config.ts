import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { obsidian: fileURLToPath(new URL('./tests/obsidian-mock.ts', import.meta.url)) } },
});
