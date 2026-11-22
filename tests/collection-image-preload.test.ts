import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { bundleInlineScript } from '../build/bundle-inline-script.mjs';
import { getCollectionPreloadEntries } from '../src/lib/collection-image-preload';
import type { Thing } from '../src/types/content';

const thing = (id: string, category: string, image = true): Thing => ({
  id, name: id, brand: null, descriptionHtml: '', morePickIds: [],
  categories: [{ id: category, name: category }],
  image: image ? { url: `https://images.microcms-assets.io/assets/${id}.png`, width: 1280, height: 1280 } : null,
});
const unusualCategory = 'ski & "snow" </script>';
const entries = getCollectionPreloadEntries([
  thing('no-image', 'mountain', false), thing('tent', 'mountain'), thing('ski', unusualCategory),
], [{ id: 'mountain', name: 'Mountain' }, { id: unusualCategory, name: 'Ski' }, { id: 'empty', name: 'Empty' }]);
const script = await bundleInlineScript('src/scripts/collection-image-preload.ts');

function preload(category = '', saved: string | null = null, mobile = true, storageBlocked = false, query = '') {
  const links: Array<Record<string, unknown>> = [];
  // head時点で本文やレイアウトAPIを利用できなくても実行できることを確認する。
  runInNewContext(script, {
    window: { matchMedia: () => ({ matches: mobile }), innerWidth: 412 },
    location: { search: `?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query)}` },
    sessionStorage: { getItem: () => { if (storageBlocked) throw new Error('Blocked'); return saved; } },
    document: {
      currentScript: { dataset: { images: JSON.stringify(entries) } },
      createElement: () => ({ dataset: {} }),
      head: { append: (link: Record<string, unknown>) => links.push(link) },
    },
    URL, URLSearchParams,
  });
  return links;
}

test('preload selects the first illustrated item of the actual category, including encoded IDs', () => {
  const all = preload();
  assert.equal(all.length, 1);
  assert.match(String(all[0].imageSrcset), /\/tent\.png\?/);
  assert.equal(all[0].fetchPriority, 'high');
  assert.equal(all[0].type, 'image/avif');
  assert.equal(all[0].href, undefined);
  assert.match(String(preload(unusualCategory)[0].imageSrcset), /\/ski\.png\?/);
  assert.match(String(preload('__proto__')[0].imageSrcset), /\/tent\.png\?/);
  assert.equal(preload('empty').length, 0);
  assert.equal(preload('', null, false).length, 0);
  assert.equal(preload(unusualCategory, null, true, false, 'スキー').length, 0);
});

test('preload uses stored two/three-column sizes and falls back when storage is invalid or unavailable', () => {
  assert.equal(preload('', '232')[0].imageSizes, '164px');
  assert.equal(preload('', '176')[0].imageSizes, '99px');
  for (const value of [null, '', '89', 'invalid', '900']) {
    assert.equal(preload('', value)[0].imageSizes, '164px');
  }
  assert.equal(preload('', '176', true, true)[0].imageSizes, '164px');
});
