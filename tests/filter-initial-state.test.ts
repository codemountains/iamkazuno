import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../src/pages/picks/index.astro', import.meta.url), 'utf8');
const prepare = page.match(/<script[^>]*data-filter-prepare>([\s\S]*?)<\/script>/)?.[1];
const apply = page.match(/<script[^>]*data-filter-apply>([\s\S]*?)<\/script>/)?.[1];
if (!prepare || !apply) throw new Error('Collection needs initial filtering before the external module.');

const unusualCategory = 'ski & "snow" </script>';
const categories = ['', 'mountain', 'ski', 'empty', unusualCategory];

function load(category: string) {
  const buttons = categories.map((id) => ({
    dataset: { filter: id, filterLabel: id || 'all' },
    pressed: id === '',
    setAttribute(_name: string, value: string) { this.pressed = value === 'true'; },
  }));
  const items = [['mountain'], ['mountain'], ['ski'], ['ski', 'mountain'], ['ski'], ['ski'], ['ski'], [unusualCategory]].map((ids) => ({
    dataset: { categoryKeys: ids.map(encodeURIComponent).join(' ') },
    hidden: false,
    image: { loading: 'lazy' },
    querySelector() { return this.image; },
  }));
  const label = { textContent: '' };
  const empty = { hidden: true };
  const styles: Array<{ id: string; textContent: string; removed: boolean; remove(): void }> = [];
  const document = {
    head: { append(style: typeof styles[number]) { styles.push(style); } },
    createElement() { return { id: '', textContent: '', removed: false, remove() { this.removed = true; } }; },
    querySelectorAll(selector: string) { return selector === '[data-filter]' ? buttons : items; },
    querySelector(selector: string) { return selector === '[data-results-label]' ? label : empty; },
    getElementById(id: string) { return styles.find((style) => style.id === id); },
  };
  const context = {
    document,
    window: { location: { search: `?category=${encodeURIComponent(category)}` } },
    categoryKeys: categories.slice(1).map(encodeURIComponent),
    URLSearchParams,
  };
  runInNewContext(prepare!, context);
  const initialStyle = styles[0]?.textContent;
  runInNewContext(apply!, context);
  return { buttons, items, label, empty, styles, initialStyle };
}

test('a category is ready before the external module and prioritizes only its first four images', () => {
  const state = load('ski');
  assert.match(state.initialStyle!, /data-category-keys~="ski"/);
  assert.deepEqual(state.items.map((item) => item.hidden), [true, true, false, false, false, false, false, true]);
  assert.deepEqual(state.items.map((item) => item.image.loading), ['lazy', 'lazy', 'eager', 'eager', 'eager', 'eager', 'lazy', 'lazy']);
  assert.equal(state.label.textContent, 'ski — 05 things');
  assert.equal(state.buttons.find((button) => button.pressed)?.dataset.filter, 'ski');
  assert.equal(state.empty.hidden, true);
  assert.equal(state.styles[0].removed, true);
});

test('all and unknown categories retain the complete collection', () => {
  for (const category of ['', 'missing', '"] { display: block }']) {
    const state = load(category);
    assert.equal(state.initialStyle, undefined);
    assert.ok(state.items.every((item) => !item.hidden));
    assert.equal(state.label.textContent, '08 things, well loved.');
    assert.equal(state.buttons[0].pressed, true);
    assert.equal(state.items.filter((item) => item.image.loading === 'eager').length, 4);
  }
});

test('an empty category shows the empty state without loading unrelated images eagerly', () => {
  const state = load('empty');
  assert.ok(state.items.every((item) => item.hidden && item.image.loading === 'lazy'));
  assert.equal(state.empty.hidden, false);
  assert.equal(state.label.textContent, 'empty — 00 things');
});

test('category IDs containing whitespace and markup are matched as encoded tokens', () => {
  const state = load(unusualCategory);
  assert.ok(state.initialStyle?.includes(encodeURIComponent(unusualCategory)));
  assert.ok(!state.initialStyle?.includes('</script>'));
  assert.equal(state.items.filter((item) => !item.hidden).length, 1);
  assert.equal(state.items[7].hidden, false);
  assert.equal(state.label.textContent, `${unusualCategory} — 01 things`);
});
