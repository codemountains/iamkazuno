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

function load(category: string, missingImages: number[] = []) {
  const measurements = { style: 0, width: 0 };
  const eagerSizes: Array<{ image: string; sources: string[] }> = [];
  const measuredStates: Array<{
    hidden: boolean[];
    selected: string | undefined;
    label: string;
    empty: boolean;
    styleRemoved: boolean;
  }> = [];
  const grid = { dataset: {} as Record<string, string> };
  const buttons = categories.map((id) => ({
    dataset: { filter: id, filterLabel: id || 'all' },
    pressed: id === '',
    setAttribute(_name: string, value: string) { this.pressed = value === 'true'; },
  }));
  const items = [['mountain'], ['mountain'], ['ski'], ['ski', 'mountain'], ['ski'], ['ski'], ['ski'], [unusualCategory]].map((ids, index) => ({
    dataset: { categoryKeys: ids.map(encodeURIComponent).join(' ') },
    hidden: false,
    image: {
      currentLoading: 'lazy', sizes: 'auto, 160px',
      get loading() { return this.currentLoading; },
      set loading(value: string) {
        this.currentLoading = value;
        if (value === 'eager') eagerSizes.push({ image: this.sizes, sources: this.sources.map((source) => source.sizes) });
      },
      sources: [{ sizes: 'auto, 160px' }],
      getBoundingClientRect() { measurements.width++; return { width: 308 }; },
      closest() { return { querySelectorAll: () => this.sources }; },
    },
    querySelector() { return missingImages.includes(index) ? null : this.image; },
  }));
  const label = { textContent: '' };
  const empty = { hidden: true };
  const styles: Array<{ id: string; textContent: string; removed: boolean; remove(): void }> = [];
  const document = {
    head: { append(style: typeof styles[number]) { styles.push(style); } },
    createElement() { return { id: '', textContent: '', removed: false, remove() { this.removed = true; } }; },
    querySelectorAll(selector: string) { return selector === '[data-filter]' ? buttons : items; },
    querySelector(selector: string) {
      if (selector === '[data-item-grid]') return grid;
      return selector === '[data-results-label]' ? label : empty;
    },
    getElementById(id: string) { return styles.find((style) => style.id === id); },
  };
  const context = {
    document,
    window: { location: { search: `?category=${encodeURIComponent(category)}` } },
    categoryKeys: categories.slice(1).map(encodeURIComponent),
    URLSearchParams,
    getComputedStyle: () => {
      measurements.style++;
      measuredStates.push({
        hidden: items.map((item) => item.hidden),
        selected: buttons.find((button) => button.pressed)?.dataset.filter,
        label: label.textContent,
        empty: empty.hidden,
        styleRemoved: styles.every((style) => style.removed),
      });
      return { paddingLeft: '14px', paddingRight: '14px' };
    },
  };
  runInNewContext(prepare!, context);
  const initialStyle = styles[0]?.textContent;
  runInNewContext(apply!, context);
  return { buttons, items, label, empty, styles, initialStyle, grid, measurements, measuredStates, eagerSizes };
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
  assert.equal(state.grid.dataset.initialFilter, 'ski');
  for (const item of state.items.filter((item) => item.image.loading === 'eager')) {
    assert.equal(item.image.sizes, '280px');
    assert.equal(item.image.sources[0].sizes, '280px');
  }
  assert.equal(state.items[0].image.sizes, 'auto, 160px');
});

test('all and unknown categories retain the complete collection', () => {
  for (const category of ['', 'missing', '"] { display: block }']) {
    const state = load(category);
    assert.equal(state.initialStyle, undefined);
    assert.ok(state.items.every((item) => !item.hidden));
    assert.equal(state.label.textContent, '08 things, well loved.');
    assert.equal(state.buttons[0].pressed, true);
    assert.equal(state.items.filter((item) => item.image.loading === 'eager').length, 4);
    assert.equal(state.grid.dataset.initialFilter, '');
    assert.deepEqual(state.measurements, { style: 1, width: 1 });
  }
});

test('an empty category shows the empty state without loading unrelated images eagerly', () => {
  const state = load('empty');
  assert.ok(state.items.every((item) => item.hidden && item.image.loading === 'lazy'));
  assert.equal(state.empty.hidden, false);
  assert.equal(state.label.textContent, 'empty — 00 things');
  assert.deepEqual(state.measurements, { style: 0, width: 0 });
  assert.equal(state.grid.dataset.initialFilter, 'empty');
});

test('category IDs containing whitespace and markup are matched as encoded tokens', () => {
  const state = load(unusualCategory);
  assert.ok(state.initialStyle?.includes(encodeURIComponent(unusualCategory)));
  assert.ok(!state.initialStyle?.includes('</script>'));
  assert.equal(state.items.filter((item) => !item.hidden).length, 1);
  assert.equal(state.items[7].hidden, false);
  assert.equal(state.label.textContent, `${unusualCategory} — 01 things`);
  assert.equal(state.grid.dataset.initialFilter, unusualCategory);
});

test('initial visibility is finalized before one shared width measurement and eager images have explicit sizes', () => {
  const state = load('ski');
  assert.deepEqual(state.measurements, { style: 1, width: 1 });
  assert.deepEqual(state.measuredStates, [{
    hidden: [true, true, false, false, false, false, false, true],
    selected: 'ski', label: 'ski — 05 things', empty: true, styleRemoved: true,
  }]);
  assert.deepEqual(state.eagerSizes, Array.from({ length: 4 }, () => ({ image: '280px', sources: ['280px'] })));
});

test('missing images do not promote cards beyond the first four visible cards', () => {
  const state = load('ski', [2]);
  assert.deepEqual(state.items.map((item) => item.image.loading), ['lazy', 'lazy', 'lazy', 'eager', 'eager', 'eager', 'lazy', 'lazy']);
  assert.deepEqual(state.measurements, { style: 1, width: 1 });
  assert.equal(state.label.textContent, 'ski — 05 things');
  assert.equal(state.grid.dataset.initialFilter, 'ski');

  const placeholders = load('ski', [2, 3, 4, 5]);
  assert.ok(placeholders.items.every((item) => item.image.loading === 'lazy'));
  assert.deepEqual(placeholders.measurements, { style: 0, width: 0 });
  assert.equal(placeholders.grid.dataset.initialFilter, 'ski');
});
