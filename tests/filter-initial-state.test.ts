import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../src/pages/picks/index.astro', import.meta.url), 'utf8');
const prepare = page.match(/<script[^>]*data-filter-prepare>([\s\S]*?)<\/script>/)?.[1];
const apply = page.match(/<script[^>]*data-filter-apply>([\s\S]*?)<\/script>/)?.[1];
const styleDeclaration = page.match(/const initialFilterStyles =[\s\S]*?(?=\n---)/)?.[0];
if (!prepare || !apply || !styleDeclaration) throw new Error('Collection needs initial filtering before the external module.');

const unusualCategory = 'ski & "snow" \' </style><script>';
const categories = ['', 'mountain', 'ski', 'empty', unusualCategory];
const categoryKeys = categories.slice(1).map(encodeURIComponent);
const initialStyles: string = runInNewContext(`${styleDeclaration}\ninitialFilterStyles;`, { categoryKeys });

function load(category: string) {
  const grid = { dataset: {} as Record<string, string> };
  const buttons = categories.map((id) => ({
    dataset: { filter: id, filterLabel: id || 'all' },
    pressed: id === '',
    setAttribute(_name: string, value: string) { this.pressed = value === 'true'; },
  }));
  const items = [['mountain'], ['mountain'], ['ski'], ['ski', 'mountain'], ['ski'], ['ski'], ['ski'], [unusualCategory]].map((ids) => ({
    dataset: { categoryKeys: ids.map(encodeURIComponent).join(' ') },
    hidden: false,
  }));
  const label = { textContent: '' };
  const empty = { hidden: true };
  const style = { id: 'picks-initial-filter', removed: false, remove() { this.removed = true; } };
  const root = { dataset: {} as Record<string, string> };
  const document = {
    documentElement: root,
    querySelectorAll(selector: string) { return selector === '[data-filter]' ? buttons : items; },
    querySelector(selector: string) {
      if (selector === '[data-item-grid]') return grid;
      return selector === '[data-results-label]' ? label : empty;
    },
    getElementById(id: string) { return style.id === id ? style : null; },
  };
  const context = {
    document,
    window: { location: { search: `?category=${encodeURIComponent(category)}` } },
    categoryKeys,
    URLSearchParams,
  };
  runInNewContext(prepare!, context);
  const initialCategory = root.dataset.initialCategory;
  runInNewContext(apply!, context);
  return { buttons, items, label, empty, style, initialCategory, grid, root };
}

test('prebuilt initial styles are gated by a selected category and cannot contain HTML from category IDs', () => {
  const rules = initialStyles.split('\n');
  assert.ok(rules.every((rule) => rule.startsWith('html[data-initial-category')));
  for (const key of categoryKeys) {
    assert.ok(rules.includes(`html[data-initial-category="${key}"] [data-item]:not([data-category-keys~="${key}"]) { display: none !important; }`));
  }
  assert.ok(!initialStyles.includes('<'));
  assert.match(initialStyles, /html\[data-initial-category\] \[data-results-label\] \{ visibility: hidden; \}/);
});

test('a category is ready before the external module with matching visibility, selection, and count', () => {
  const state = load('ski');
  assert.equal(state.initialCategory, 'ski');
  assert.deepEqual(state.items.map((item) => item.hidden), [true, true, false, false, false, false, false, true]);
  assert.equal(state.label.textContent, 'ski — 05 things');
  assert.equal(state.buttons.find((button) => button.pressed)?.dataset.filter, 'ski');
  assert.equal(state.empty.hidden, true);
  assert.equal(state.style.removed, true);
  assert.equal(state.root.dataset.initialCategory, undefined);
  assert.equal(state.grid.dataset.initialFilter, 'ski');
});

test('all and unknown categories retain the complete collection', () => {
  for (const category of ['', 'missing', '"] { display: block }']) {
    const state = load(category);
    assert.equal(state.initialCategory, undefined);
    assert.ok(state.items.every((item) => !item.hidden));
    assert.equal(state.label.textContent, '08 things, well loved.');
    assert.equal(state.buttons[0].pressed, true);
    assert.equal(state.grid.dataset.initialFilter, '');
  }
});

test('an empty category hides all cards and shows the empty state', () => {
  const state = load('empty');
  assert.ok(state.items.every((item) => item.hidden));
  assert.equal(state.empty.hidden, false);
  assert.equal(state.label.textContent, 'empty — 00 things');
  assert.equal(state.buttons.find((button) => button.pressed)?.dataset.filter, 'empty');
  assert.equal(state.initialCategory, 'empty');
  assert.equal(state.style.removed, true);
  assert.equal(state.root.dataset.initialCategory, undefined);
  assert.equal(state.grid.dataset.initialFilter, 'empty');
});

test('category IDs containing whitespace and markup are matched as encoded tokens', () => {
  const state = load(unusualCategory);
  assert.equal(state.initialCategory, encodeURIComponent(unusualCategory));
  assert.equal(state.items.filter((item) => !item.hidden).length, 1);
  assert.equal(state.items[7].hidden, false);
  assert.equal(state.label.textContent, `${unusualCategory} — 01 things`);
  assert.equal(state.grid.dataset.initialFilter, unusualCategory);
});
