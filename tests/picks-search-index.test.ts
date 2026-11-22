import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPicksSearch } from '../src/lib/picks-search-index';

test('Pagefind indexes a pick with a name and no description or categories', async () => {
  const files = await buildPicksSearch([
    {
      id: 'talisman',
      name: 'Talisman',
      brand: null,
      image: null,
      descriptionHtml: '',
      categories: [],
      morePickIds: [],
    },
  ]);
  const manifest = files.find((file) => file.path === 'pagefind-entry.json');
  assert.ok(manifest);
  assert.equal(JSON.parse(new TextDecoder().decode(manifest.content)).languages.ja?.page_count, 1);
});
