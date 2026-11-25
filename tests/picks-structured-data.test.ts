import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'astro';
import { DomUtils, parseDocument } from 'htmlparser2';

test('the published Picks build emits a safe JSON-LD list matching the cards and detail pages', async (t) => {
  const site = 'https://picks.example';
  const name = 'スキー "Wide" & 雪 </ScRiPt>';
  const variant = '25-26 <!-- <script>';
  const contents: Record<string, unknown[]> = {
    '/api/v1/things': [
      { id: '冬 用', name, variant_label: variant },
      { id: 'classic', name },
    ],
    '/api/v1/brands': [],
    '/api/v1/categories': [],
    '/api/v1/notes': [],
  };
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.hostname, 'picks-fixture.microcms.io');
    const entries = contents[url.pathname];
    assert.ok(entries, `Unexpected endpoint: ${url.pathname}`);
    return Response.json({
      contents: entries,
      totalCount: entries.length,
      limit: Number(url.searchParams.get('limit') ?? 10),
      offset: 0,
    });
  });
  await mkdir('.tmp', { recursive: true });
  const directory = await mkdtemp('.tmp/picks-structured-data-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [key, value] of Object.entries({
    DATA_SOURCE: 'microcms',
    MICROCMS_SERVICE_DOMAIN: 'picks-fixture',
    MICROCMS_API_KEY: 'test-key',
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const outDir = join(directory, 'dist');
  await build({
    site,
    outDir,
    cacheDir: join(directory, 'cache'),
    logLevel: 'error',
  });

  const html = await readFile(join(outDir, 'picks/index.html'), 'utf8');
  const document = parseDocument(html);
  const canonical = DomUtils.findOne((tag) => tag.attribs.rel === 'canonical', document);
  assert.equal(canonical?.attribs.href, `${site}/picks`);
  assert.equal(
    DomUtils.findOne((tag) => tag.attribs.name === 'robots', document),
    null,
  );

  const scripts = DomUtils.getElementsByTagName('script', document).filter(
    (tag) => tag.attribs.type === 'application/ld+json',
  );
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].parent, canonical?.parent);
  const json = DomUtils.textContent(scripts[0]);
  assert.doesNotMatch(json, /</);

  const cards = DomUtils.findAll(
    (tag) => Object.hasOwn(tag.attribs, 'data-item'),
    document.children,
  );
  assert.equal(cards.length, 2);
  const itemListElement = await Promise.all(
    cards.map(async (card, index) => {
      const heading = DomUtils.findOne((tag) => tag.name === 'h2', card);
      const link = DomUtils.findOne((tag) => tag.name === 'a', card);
      assert.ok(heading && link);
      const href = link.attribs.href;
      assert.equal(href, ['/picks/things/%E5%86%AC%20%E7%94%A8', '/picks/things/classic'][index]);
      const label = DomUtils.textContent(heading).replace(/\s+/g, ' ').trim();
      assert.equal(label, [`${name} ${variant}`, name][index]);
      const url = new URL(href, site).href;
      const detailPath = join(outDir, decodeURIComponent(href.slice(1)), 'index.html');
      const detail = parseDocument(await readFile(detailPath, 'utf8'));
      assert.equal(
        DomUtils.findOne((tag) => tag.attribs.rel === 'canonical', detail)?.attribs.href,
        url,
      );
      return { '@type': 'ListItem', position: index + 1, name: label, url };
    }),
  );
  assert.deepEqual(JSON.parse(json), {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: canonical?.attribs.href,
    name: '/picks',
    mainEntity: { '@type': 'ItemList', numberOfItems: cards.length, itemListElement },
  });

  const headers = await readFile(join(outDir, '_headers'), 'utf8');
  assert.match(headers, /Content-Security-Policy: .*script-src 'self'/);
  assert.doesNotMatch(headers, /'unsafe-inline'/);
  const hash = createHash('sha256').update(json).digest('base64');
  assert.ok(!headers.includes(`'sha256-${hash}'`));
});
