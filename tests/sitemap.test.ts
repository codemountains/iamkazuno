import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { type TestContext } from 'node:test';
import type { HookParameters } from 'astro';
import indexableSitemap from '../build/sitemap.mjs';

interface PageFixture {
  pathname: string;
  file: string;
  head: string;
}

const site = 'https://preview.example.test';
const canonical = (pathname: string) => `<link rel="canonical" href="${site}${pathname}">`;
const locations = (xml: string) =>
  Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]).sort();

async function buildSitemap(t: TestContext, fixtures: PageFixture[]) {
  await mkdir('.tmp', { recursive: true });
  const directory = await mkdtemp('.tmp/sitemap-test-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const fixture of fixtures) {
    const file = join(directory, fixture.file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      `<!doctype html><html><head>${fixture.head}</head><body>Page</body></html>`,
    );
  }
  await writeFile(
    join(directory, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap-index.xml\n`,
  );

  const integration = indexableSitemap();
  const configure = integration.hooks['astro:config:done'];
  const resolveRoutes = integration.hooks['astro:routes:resolved'];
  const finishBuild = integration.hooks['astro:build:done'];
  assert.ok(configure && resolveRoutes && finishBuild);
  const logger = {
    info() {},
    warn(message: string) {
      assert.fail(message);
    },
    error(message: string) {
      assert.fail(message);
    },
  };
  // These hook fixtures provide only the Astro fields consumed by the sitemap integration.
  await configure({
    config: { site, base: '/', trailingSlash: 'ignore', build: { format: 'directory' } },
    logger,
  } as unknown as HookParameters<'astro:config:done'>);
  await resolveRoutes({
    routes: [
      ...['/', '/picks', '/notes', '/404'].map((pathname) => ({
        type: 'page',
        pathname,
        generate: () => pathname,
      })),
      { type: 'page', pathname: undefined, generate: () => '/picks/things/camera' },
      { type: 'page', pathname: undefined, generate: () => '/notes/first-entry' },
      { type: 'redirect', pathname: '/things/camera', generate: () => '/things/camera' },
      { type: 'endpoint', pathname: '/robots.txt', generate: () => '/robots.txt' },
    ],
    logger,
  } as unknown as HookParameters<'astro:routes:resolved'>);
  await finishBuild({
    dir: pathToFileURL(`${directory}/`),
    pages: fixtures.map(({ pathname }) => ({ pathname })),
    assets: new Map(),
    logger,
  } as unknown as HookParameters<'astro:build:done'>);
  return {
    index: await readFile(join(directory, 'sitemap-index.xml'), 'utf8'),
    sitemap: await readFile(join(directory, 'sitemap-0.xml'), 'utf8'),
  };
}

test('generated sitemap includes static and dynamic canonical URLs using the configured site', async (t) => {
  const paths = ['/', '/picks', '/picks/things/camera', '/notes', '/notes/first-entry'];
  const { index, sitemap } = await buildSitemap(
    t,
    paths.map((pathname) => ({
      pathname: pathname === '/' ? '' : `${pathname.slice(1)}/`,
      file: pathname === '/' ? 'index.html' : `${pathname.slice(1)}/index.html`,
      head: canonical(pathname),
    })),
  );

  assert.deepEqual(locations(index), [`${site}/sitemap-0.xml`]);
  assert.deepEqual(locations(sitemap), paths.map((pathname) => `${site}${pathname}`).sort());
});

test('generated sitemap excludes noindex and none pages, status pages, redirects, and endpoints', async (t) => {
  const { sitemap } = await buildSitemap(t, [
    { pathname: '', file: 'index.html', head: canonical('/') },
    {
      pathname: 'picks/',
      file: 'picks/index.html',
      head: `${canonical('/picks')}<meta name="robots" content="noindex, follow">`,
    },
    {
      pathname: 'picks/things/sample/',
      file: 'picks/things/sample/index.html',
      head: `${canonical('/picks/things/sample')}<meta name="robots" content="NOINDEX, FOLLOW">`,
    },
    {
      pathname: 'notes/',
      file: 'notes/index.html',
      head: `<meta name="robots" content="none">${canonical('/notes')}`,
    },
    { pathname: '404', file: '404.html', head: canonical('/404') },
    {
      pathname: 'things/camera/',
      file: 'things/camera/index.html',
      head: '<meta http-equiv="refresh" content="0;url=/picks/things/camera">',
    },
    {
      pathname: 'uncanonicalized/',
      file: 'uncanonicalized/index.html',
      head: '<title>No canonical</title>',
    },
  ]);

  assert.deepEqual(locations(sitemap), [`${site}/`]);
});
