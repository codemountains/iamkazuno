import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createContentSecurityPolicy, writeContentSecurityPolicy } from '../build/content-security-policy.mjs';
import { createInlineScriptMinifier } from '../build/minify-inline-scripts.mjs';

const hash = (content: string) => `'sha256-${createHash('sha256').update(content).digest('base64')}'`;

test('CSP hashes exact inline scripts, modules and styles, including the no-JS fallback', () => {
  const script = '\nwindow.label = "雪 &amp; <b>";\n';
  const module = 'import "./app.js";';
  const css = '[data-deferred-picture] { display: none !important; }';
  const policy = createContentSecurityPolicy([
    `<script data-value="a>b">${script.replaceAll('\n', '\r\n')}</script>` +
    `<script type="module">${module}</script><noscript><style>${css}</style></noscript>` +
    '<script src="/app.js">ignored external body</script>' +
    '<script type="application/ld+json">{"name":"product"}</script>' +
    '<!-- <script>comment</script> --><textarea><script>text only</script></textarea>',
  ]);
  assert.ok(policy.includes(hash(script)));
  assert.ok(policy.includes(hash(module)));
  assert.ok(policy.includes(hash(css)));
  assert.equal((policy.match(/'sha256-/g) ?? []).length, 3);
  assert.ok(!policy.includes("'unsafe-inline'"));
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(policy, /style-src-attr 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
});

test('hashes are deduplicated and deterministic across page ordering', () => {
  const a = '<script>window.a = 1;</script><style>body { color: red }</style>';
  const b = '<script type="module">import "./b.js";</script>';
  assert.equal(createContentSecurityPolicy([a, b, a]), createContentSecurityPolicy([b, a]));
});

test('the deployed header allows the minified script, not its earlier source', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'picks-csp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = '\n  (() => { const message = "ready"; window.message = message; })();\n';
  const html = await createInlineScriptMinifier()(`<script>${source}</script>`);
  const minified = html.slice('<script>'.length, -'</script>'.length);
  assert.notEqual(minified, source);
  await writeFile(join(directory, 'index.html'), html);
  await writeFile(join(directory, '_headers'), '/*\n  X-Frame-Options: DENY\n');
  await writeContentSecurityPolicy(directory);
  const headers = await readFile(join(directory, '_headers'), 'utf8');
  assert.ok(headers.includes(hash(minified)));
  assert.ok(!headers.includes(hash(source)));
});

test('one shared CSP covers more than 100 pages while preserving existing headers', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'picks-csp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = '/*\n  X-Frame-Options: DENY\n\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n';
  await writeFile(join(directory, '_headers'), original);
  await mkdir(join(directory, 'picks/things'), { recursive: true });
  await Promise.all(Array.from({ length: 110 }, (_, i) => writeFile(
    join(directory, 'picks/things', `${i}.html`), '<script>window.ready = true;</script>',
  )));
  await writeContentSecurityPolicy(directory);
  const headers = await readFile(join(directory, '_headers'), 'utf8');
  assert.equal(headers.replace(/^  Content-Security-Policy: .*\n/m, ''), original);
  assert.equal((headers.match(/Content-Security-Policy:/g) ?? []).length, 1);
  assert.equal((headers.match(/'sha256-/g) ?? []).length, 1);
  assert.equal(headers.split('\n').filter((line) => line.startsWith('/')).length, 2);
  await assert.rejects(writeContentSecurityPolicy(directory), /generated once/);
});

test('Cloudflare limits fail the build before writing an ignored or conflicting policy', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'picks-csp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = '/*\n  X-Frame-Options: DENY\n';
  await writeFile(join(directory, '_headers'), original);
  await writeFile(join(directory, 'index.html'), Array.from(
    { length: 40 }, (_, i) => `<script>window.value = ${i};</script>`,
  ).join(''));
  await assert.rejects(writeContentSecurityPolicy(directory), /2,000-character/);
  assert.equal(await readFile(join(directory, '_headers'), 'utf8'), original);

  await writeFile(join(directory, 'index.html'), '<p>Page</p>');
  const manyRules = original + Array.from({ length: 100 }, (_, i) => `/page-${i}\n  X-Frame-Options: DENY`).join('\n');
  await writeFile(join(directory, '_headers'), manyRules);
  await assert.rejects(writeContentSecurityPolicy(directory), /100 header rule/);
  assert.equal(await readFile(join(directory, '_headers'), 'utf8'), manyRules);
});
