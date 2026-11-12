import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createInlineScriptMinifier } from '../build/minify-inline-scripts.mjs';

test('inline minification preserves execution order, global bindings and element attributes', async () => {
  const html = '<head><script nonce="a>b">const collectionSize = { initial: 160 };\n' +
    '(() => { const initialSize = collectionSize.initial; window.size = initialSize; })();</script></head>' +
    '<body><script data-filter-apply>window.sizes.push(collectionSize.initial, window.size);</script></body>';
  const minified = await createInlineScriptMinifier()(html);
  assert.ok(minified.length < html.length);
  assert.ok(minified.startsWith('<head><script nonce="a>b">'));
  assert.ok(minified.includes('</script></head><body><script data-filter-apply>'));
  assert.ok(minified.endsWith('</script></body>'));
  const window = { size: 0, sizes: [] as number[] };
  const context = { window };
  for (const match of minified.matchAll(/<script(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/script>/g)) {
    runInNewContext(match[1], context);
  }
  assert.deepEqual(window.sizes, [160, 160]);
});

test('non-JavaScript blocks, external scripts and HTML text remain byte-for-byte unchanged', async () => {
  const html = '<!-- <script>this is not JavaScript</script> -->' +
    '<textarea><script>this is text</script></textarea>' +
    '<script type="application/ld+json">{ "name": "<b>Product</b>" }</script>' +
    '<script type="importmap">{ "imports": {} }</script>' +
    '<script type="module">import "./theme.js";</script>' +
    '<script src="/theme.js">ignored content</script>';
  assert.equal(await createInlineScriptMinifier()(html), html);
});

test('minifying serialized values never introduces an HTML script closing tag', async () => {
  const category = 'ski & "snow" </script><script>window.injected = true;</script>';
  const serialized = JSON.stringify(category).replaceAll('<', '\\u003C');
  const html = `<script data-filter-prepare>const category = ${serialized};\nwindow.category = category;</script>`;
  const minified = await createInlineScriptMinifier()(html);
  const content = minified.slice(minified.indexOf('>') + 1, minified.lastIndexOf('</script>'));
  assert.ok(!/<\/script/i.test(content));
  const window = { category: '', injected: false };
  runInNewContext(content, { window });
  assert.equal(window.category, category);
  assert.equal(window.injected, false);
});

test('escaped HTML comment markers retain Astro serialization instead of changing HTML parsing', async () => {
  const html = '<script>const value = "\\u003C!--\\u003Cscript>";\nwindow.value = value;</script><p>Visible</p>';
  assert.equal(await createInlineScriptMinifier()(html), html);
});
