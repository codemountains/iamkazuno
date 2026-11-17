import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const variants = {
  home: 'iamkaz<span>.</span>uno',
  notes: '<span>/</span>notes<span>.</span>',
};
const [target, requestedOutput, ...extra] = process.argv.slice(2);
if (!Object.hasOwn(variants, target) || extra.length) {
  throw new Error('Usage: node generate.mjs <home|notes> [output.png] (run from the repository root)');
}
const output = resolve(requestedOutput ?? `public/og-${target}.png`);
if (!output.endsWith('.png')) throw new Error('Output must have a .png extension.');

const styles = await readFile('src/styles/global.css', 'utf8');
const lightTheme = styles.match(/:root\s*\{([^}]+)\}/)?.[1] ?? '';
function color(name) {
  const value = lightTheme.match(new RegExp(`--${name}:\\s*(#[\\da-fA-F]{3,8})\\s*;`))?.[1];
  if (!value) throw new Error(`Missing light-theme color: --${name}`);
  return value;
}
const font = await readFile(new URL(import.meta.resolve('@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2')));
const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'DM Mono';
    font-style: normal;
    font-weight: 400;
    src: url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');
  }
  html, body { margin: 0; width: 1200px; height: 630px; }
  body {
    display: grid;
    place-items: center;
    background: ${color('paper')};
    color: ${color('ink')};
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  h1 {
    margin: 0;
    font-family: 'DM Mono', monospace;
    font-size: 96px;
    font-weight: 400;
    letter-spacing: -0.06em;
    line-height: 1.2;
  }
  span { color: ${color('accent')}; }
</style>
<h1>${variants[target]}</h1>
</html>`;

await mkdir('.tmp/simple-og', { recursive: true });
await writeFile(`.tmp/simple-og/${target}.html`, html);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  await mkdir(dirname(output), { recursive: true });
  const { width, height, size } = await sharp(png)
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(output);
  console.log(JSON.stringify({ target, output, width, height, bytes: size }, null, 2));
} finally {
  await browser.close();
}
