import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { sampleBrands, sampleCategories, sampleThings } from '../src/data/sample';
import { getContent } from '../src/lib/content';
import {
  resolveContentConfiguration,
  validateBrands,
  validateCategories,
  validateThings,
} from '../src/lib/content-validation';

const brands = validateBrands(sampleBrands);
const categories = validateCategories(sampleCategories);
const credentials = { MICROCMS_SERVICE_DOMAIN: 'my-picks', MICROCMS_API_KEY: 'test-key' };

test('credentials determine auto mode; partial configuration never silently falls back', () => {
  assert.deepEqual(resolveContentConfiguration({}), { source: 'sample' });
  assert.deepEqual(resolveContentConfiguration(credentials), { source: 'microcms', serviceDomain: 'my-picks', apiKey: 'test-key' });
  assert.throws(() => resolveContentConfiguration({ MICROCMS_SERVICE_DOMAIN: 'my-picks' }), /両方/);
  assert.throws(() => resolveContentConfiguration({ MICROCMS_API_KEY: 'test-key' }), /両方/);
  assert.throws(() => resolveContentConfiguration({ DATA_SOURCE: 'microcms' }), /必要/);
  assert.throws(() => resolveContentConfiguration({ DATA_SOURCE: 'typo' }), /DATA_SOURCE/);
});

test('explicit sample mode works with complete credentials without contacting the CMS', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Sample mode must not fetch'); });
  const content = await getContent({ ...credentials, DATA_SOURCE: 'sample' });
  assert.equal(content.source, 'sample');
  assert.equal(content.things.length, 100);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('service domain must be an ID, not a URL or arbitrary host', () => {
  for (const domain of ['https://my-picks.microcms.io', 'my-picks.microcms.io', 'host/path']) {
    assert.throws(() => resolveContentConfiguration({ ...credentials, MICROCMS_SERVICE_DOMAIN: domain }), /サービスID/);
  }
});

test('sample fixtures provide 100 unique local items with the actual CMS schema', async () => {
  const content = await getContent({});
  assert.equal(content.source, 'sample');
  assert.equal(content.things.length, 100);
  assert.equal(new Set(content.things.map((thing) => thing.id)).size, 100);
  assert.equal(new Set(content.things.map((thing) => thing.name)).size, 100);
  assert.deepEqual(content.categories, categories);
  assert.deepEqual(content.brands, brands);
  assert.ok(content.things.every((thing) => thing.image === null || thing.image.url === '/images/samples/sample.svg'));
  assert.ok(content.things.every((thing) => thing.brand === null || thing.brand.id === 'sample-objects'));
  assert.ok(content.things.some((thing) => thing.descriptionHtml.includes('<strong>')));
  assert.deepEqual(content.categories.map((category) => category.id), ['mountain', 'ski', 'myog', 'other']);
  assert.deepEqual(content.things.slice(0, 8).map((thing) => thing.id), [
    'mountain-boots', 'mountain-backpack', 'mountain-watch', 'ski-skis',
    'ski-goggles', 'myog-tote', 'myog-stuff-sack', 'other-camera',
  ]);
  for (const category of categories) {
    assert.ok(content.things.filter((thing) => thing.categories.some((reference) => reference.id === category.id)).length >= 20,
      `${category.id} must have enough items to exercise scrolling after filtering`);
  }
  const find = (id: string) => content.things.find((thing) => thing.id === id)!;
  assert.deepEqual(find('sample-multi-category').categories.map((category) => category.id), ['mountain', 'myog']);
  assert.equal(find('sample-no-image').image, null);
  assert.equal(find('sample-no-brand').brand, null);
  assert.equal(find('sample-no-description').descriptionHtml, '');
  assert.deepEqual(find('sample-uncategorized').categories, []);
});

function cmsThing() {
  return {
    ...sampleThings[0],
    main_image: { url: 'https://images.microcms-assets.io/assets/image.webp', width: 640, height: 640 },
  };
}

function mockCMS(t: TestContext, things: unknown[]) {
  const requests: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    assert.equal(url.hostname, 'my-picks.microcms.io');
    const endpoints: Record<string, unknown[]> = {
      '/api/v1/brands': sampleBrands,
      '/api/v1/categories': sampleCategories,
      '/api/v1/things': things,
    };
    const all = endpoints[url.pathname];
    assert.ok(all, `Unexpected endpoint: ${url.pathname}`);
    const limit = Number(url.searchParams.get('limit') ?? 10);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return new Response(JSON.stringify({ contents: all.slice(offset, offset + limit), totalCount: all.length, limit, offset }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return requests;
}

test('things map main_image and resolve current brand and category names from their APIs', () => {
  const currentBrands = [{ id: 'brand', name: 'Current brand' }];
  const currentCategories = [{ id: 'first', name: 'First category' }, { id: 'second', name: 'Second category' }];
  const [thing] = validateThings([{
    ...cmsThing(),
    ref_brand: { id: 'brand', name: 'Old embedded brand' },
    ref_categories: [{ id: 'second', name: 'Old category' }, { id: 'first' }, { id: 'second' }],
    description: '<p>A <strong>favorite</strong>.</p><script>alert(1)</script>',
  }], currentBrands, currentCategories);
  assert.equal(thing.image?.url, cmsThing().main_image.url);
  assert.deepEqual(thing.brand, currentBrands[0]);
  assert.deepEqual(thing.categories, [currentCategories[1], currentCategories[0]]);
  assert.ok(thing.descriptionHtml.includes('<strong>favorite</strong>'));
  assert.ok(!thing.descriptionHtml.includes('<script>'));
});

test('all optional fields may be absent, empty or null without blocking publication', () => {
  const empty = { id: 'missing-fields' };
  const explicit = { id: 'null-fields', name: ' ', description: null, main_image: null, ref_brand: null, ref_categories: null };
  for (const thing of validateThings([empty, explicit], [], [])) {
    assert.equal(thing.name, 'Unnamed item');
    assert.equal(thing.brand, null);
    assert.equal(thing.image, null);
    assert.equal(thing.descriptionHtml, '');
    assert.deepEqual(thing.categories, []);
  }
  assert.deepEqual(validateBrands([{ id: 'brand' }]), [{ id: 'brand', name: 'Unnamed brand' }]);
  assert.deepEqual(validateCategories([{ id: 'category', name: null }]), [{ id: 'category', name: 'Unnamed category' }]);
});

test('missing or unpublished references are omitted without adding synthetic categories', () => {
  const actualCategories = [{ id: 'all', name: 'An actual category named all' }];
  const [thing] = validateThings([{
    id: 'references',
    ref_brand: { id: 'unpublished-brand' },
    ref_categories: [null, { id: 'unpublished-category' }, { id: 'all' }, { id: 'all' }],
  }], [], actualCategories);
  assert.equal(thing.brand, null);
  assert.deepEqual(thing.categories, actualCategories);
  assert.deepEqual(validateCategories([]), []);
  assert.deepEqual(validateThings([], [], []), []);
});

test('present malformed values still fail rather than silently displaying broken data', () => {
  const thing = cmsThing();
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//example.com', 'https://user:pass@example.com']) {
    assert.throws(() => validateThings([{ ...thing, main_image: { ...thing.main_image, url } }], brands, categories), /URL/);
  }
  assert.throws(() => validateThings([{ ...thing, main_image: { ...thing.main_image, width: 0 } }], brands, categories), /width/);
  assert.throws(() => validateThings(sampleThings, brands, categories), /URL/);
  assert.throws(() => validateThings([{ ...thing, name: 42 }], brands, categories), /name/);
  assert.throws(() => validateThings([{ ...thing, description: {} }], brands, categories), /description/);
  assert.throws(() => validateThings([{ ...thing, ref_categories: {} }], brands, categories), /複数コンテンツ参照/);
  assert.throws(() => validateThings([{ ...thing, ref_brand: {} }], brands, categories), /ref_brand.id/);
});

test('API ordering is preserved and duplicate content IDs are rejected', () => {
  const first = { ...cmsThing(), id: 'first' };
  const second = { ...cmsThing(), id: 'second' };
  assert.deepEqual(validateThings([first, second], brands, categories).map((thing) => thing.id), ['first', 'second']);
  assert.throws(() => validateThings([first, first], brands, categories), /重複/);
  assert.throws(() => validateCategories([sampleCategories[0], sampleCategories[0]]), /重複/);
  assert.throws(() => validateBrands([sampleBrands[0], sampleBrands[0]]), /重複/);
});

test('CMS retrieval uses only the three Content API endpoints and retrieves more than one page of things', async (t) => {
  const sourceThings = Array.from({ length: 101 }, (_, index) => ({ ...cmsThing(), id: `thing-${index}` }));
  const requests = mockCMS(t, sourceThings);
  const content = await getContent(credentials);
  assert.equal(content.source, 'microcms');
  assert.equal(content.things.length, 101);
  assert.equal(content.things[100].id, 'thing-100');
  assert.deepEqual(new Set(requests.map((url) => `${url.hostname}${url.pathname}`)), new Set([
    'my-picks.microcms.io/api/v1/brands',
    'my-picks.microcms.io/api/v1/categories',
    'my-picks.microcms.io/api/v1/things',
  ]));
  const thingRequests = requests.filter((url) => url.pathname === '/api/v1/things');
  assert.ok(thingRequests.some((url) => Number(url.searchParams.get('offset')) > 0));
  assert.ok(thingRequests.every((url) => url.searchParams.get('depth') === '1'));
  assert.ok(thingRequests.every((url) => url.searchParams.get('fields') === 'id,name,description,main_image,ref_brand,ref_categories'));
  assert.ok(requests.every((url) => !url.searchParams.has('draftKey')));
});

test('an empty CMS remains empty instead of receiving sample data or fixed categories', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ contents: [], totalCount: 0, limit: 100, offset: 0 }), {
    headers: { 'Content-Type': 'application/json' },
  }));
  const content = await getContent(credentials);
  assert.deepEqual(content, { things: [], brands: [], categories: [], source: 'microcms' });
});

test('CMS access errors stop the build instead of falling back to samples or exposing credentials', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    return new Response(JSON.stringify({ message: `Forbidden: ${credentials.MICROCMS_API_KEY}` }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  await assert.rejects(getContent(credentials), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /things \/ brands \/ categories/);
    assert.match(error.message, /サンプルへの自動切り替えは行いません/);
    assert.ok(!error.message.includes(credentials.MICROCMS_API_KEY));
    return true;
  });
});
