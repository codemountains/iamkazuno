import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url)), {
    gitignoreResolution: true,
  }),
  js.configs.recommended,
  {
    files: ['**/*.{ts,astro}'],
    extends: [tseslint.configs.recommended],
  },
  astro.configs.recommended,
  {
    files: ['**/*.mjs', 'playwright.config.ts', 'tests/**/*.ts'],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    files: ['src/scripts/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['.agents/skills/generate-og/scripts/generate.mjs'],
    // Playwright の page.evaluate 内でページのフォントの読み込みを待つ。
    languageOptions: { globals: { document: 'readonly' } },
  },
]);
