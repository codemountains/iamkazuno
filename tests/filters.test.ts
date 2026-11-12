import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { runInNewContext } from 'node:vm';
import { initFilters } from '../src/scripts/filters';

const page = readFileSync(new URL('../src/pages/picks/index.astro', import.meta.url), 'utf8');
const inlineApply = page.match(/<script[^>]*data-filter-apply>([\s\S]*?)<\/script>/)?.[1];
if (!inlineApply) throw new Error('Collection needs initial filtering before the external module.');

class Target {
  private listeners = new Map<string, Array<(event: Record<string, unknown>) => void>>();
  addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, target: this, ...event });
  }
}

const unusualCategory = 'ski & "snow" </script>';
const categories = ['', 'mountain', 'ski', 'empty', unusualCategory];

function setup(t: TestContext, category = 'ski', options: { inline?: boolean; nextCategory?: string } = {}) {
  const writes = { items: 0, buttons: 0, label: 0, empty: 0 };
  const notifications: string[] = [];
  const scrolls: number[] = [];
  const historyEntries: string[] = [];
  let currentUrl = new URL('https://picks.invalid/picks');
  const setCategory = (value: string) => {
    currentUrl = new URL('https://picks.invalid/picks');
    if (value) currentUrl.searchParams.set('category', value);
  };
  setCategory(category);
  let scrollLeft = 0;
  const buttons = categories.map((id, index) => Object.assign(new Target(), {
    dataset: { filter: id, filterLabel: id || 'all' },
    pressed: id === '',
    setAttribute(_name: string, value: string) {
      writes.buttons++;
      this.pressed = value === 'true';
    },
    getBoundingClientRect() { return { left: index * 120 - scrollLeft, width: 100 }; },
  }));
  const items = [['mountain'], ['ski'], ['mountain', 'ski'], [unusualCategory]].map((ids) => {
    let hidden = false;
    const image = {
      loading: 'lazy', sizes: 'auto, 160px',
      getBoundingClientRect: () => ({ width: 188 }),
      closest: () => ({ querySelectorAll: () => [{ sizes: 'auto, 160px' }] }),
    };
    return {
      dataset: { categories: JSON.stringify(ids), categoryKeys: ids.map(encodeURIComponent).join(' ') },
      get hidden() { return hidden; },
      set hidden(value: boolean) { writes.items++; hidden = value; },
      querySelector: () => image,
    };
  });
  let labelText = '';
  const label = {
    get textContent() { return labelText; },
    set textContent(value: string) { writes.label++; labelText = value; },
  };
  let emptyHidden = true;
  const empty = {
    get hidden() { return emptyHidden; },
    set hidden(value: boolean) { writes.empty++; emptyHidden = value; },
  };
  const previous = Object.assign(new Target(), { disabled: true });
  const next = Object.assign(new Target(), { disabled: false });
  const navigation = {
    hidden: true,
    dataset: {} as Record<string, string>,
    querySelector: (selector: string) => selector.includes('previous') ? previous : next,
  };
  const controls = Object.assign(new Target(), {
    clientWidth: 160, clientLeft: 0, scrollWidth: 600,
    get scrollLeft() { return scrollLeft; },
    closest: () => navigation,
    contains: (button: unknown) => buttons.includes(button as typeof buttons[number]),
    querySelectorAll: () => buttons,
    getBoundingClientRect: () => ({ left: 0 }),
    scrollTo({ left }: { left: number }) { scrollLeft = left; scrolls.push(left); },
  });
  Object.defineProperty(controls, 'scrollLeft', { get: () => scrollLeft });
  const grid = { dataset: {} as Record<string, string>, querySelectorAll: () => items };
  const documentTarget = new Target();
  const document = Object.assign(documentTarget, {
    fonts: { ready: Promise.resolve() },
    querySelector(selector: string) {
      if (selector === '[data-filters]') return controls;
      if (selector === '[data-item-grid]') return grid;
      if (selector === '[data-results-label]') return label;
      if (selector === '[data-empty-state]') return empty;
      throw new Error(`Unexpected selector: ${selector}`);
    },
    querySelectorAll: (selector: string) => selector === '[data-filter]' ? buttons : items,
    getElementById: () => undefined,
    dispatchEvent(event: Event) {
      notifications.push(event.type);
      documentTarget.emit(event.type);
      return true;
    },
  });
  const window = Object.assign(new Target(), {
    get location() { return currentUrl; },
    matchMedia: () => Object.assign(new Target(), { matches: true }),
    history: {
      pushState(_state: unknown, _unused: string, url: URL | string) {
        currentUrl = new URL(String(url), currentUrl);
        historyEntries.push(currentUrl.href);
      },
    },
  });
  Object.defineProperty(window, 'location', { get: () => currentUrl });
  const getComputedStyle = () => ({ paddingLeft: '14px', paddingRight: '14px' });
  if (options.inline !== false) {
    runInNewContext(inlineApply!, { document, window, URLSearchParams, getComputedStyle });
  }
  if (options.nextCategory !== undefined) setCategory(options.nextCategory);
  const globals = {
    document, window, getComputedStyle,
    ResizeObserver: class { observe() {} },
  };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (old) Object.defineProperty(globalThis, key, old);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const clearStats = () => {
    for (const key of Object.keys(writes) as Array<keyof typeof writes>) writes[key] = 0;
    notifications.length = 0;
    scrolls.length = 0;
    historyEntries.length = 0;
  };
  clearStats();
  initFilters();
  return { buttons, items, label, empty, grid, navigation, writes, notifications, scrolls, historyEntries, window, setCategory, clearStats };
}

for (const category of ['ski', '', 'missing', 'empty', unusualCategory]) {
  test(`prepared category ${JSON.stringify(category)} transfers without rewriting its initial DOM`, (t) => {
    const h = setup(t, category);
    assert.deepEqual(h.writes, { items: 0, buttons: 0, label: 0, empty: 0 });
    assert.equal(h.grid.dataset.initialFilter, undefined);
    assert.deepEqual(h.notifications, ['picks:filter-change']);
    assert.equal(h.navigation.hidden, false);
    const normalized = categories.includes(category) ? category : '';
    assert.equal(h.buttons.find((button) => button.pressed)?.dataset.filter, normalized);
    const visible = h.items.filter((item) => !item.hidden);
    assert.equal(h.empty.hidden, visible.length > 0);
    assert.equal(h.label.textContent, normalized
      ? `${normalized} — ${String(visible.length).padStart(2, '0')} things`
      : '04 things, well loved.');
    if (normalized) assert.ok(h.scrolls.length > 0, 'the selected category must still be revealed');
  });
}

test('missing inline preparation falls back to an immediate initial filter', (t) => {
  const h = setup(t, 'ski', { inline: false });
  assert.deepEqual(h.items.map((item) => item.hidden), [true, false, false, true]);
  assert.equal(h.label.textContent, 'ski — 02 things');
  assert.equal(h.writes.items, 4);
  assert.equal(h.writes.label, 1);
  assert.deepEqual(h.notifications, ['picks:filter-change']);
  assert.equal(h.historyEntries.length, 0);
});

test('URL changes before module initialization override a previously prepared category', (t) => {
  const h = setup(t, 'ski', { nextCategory: 'mountain' });
  assert.deepEqual(h.items.map((item) => item.hidden), [false, true, false, true]);
  assert.equal(h.label.textContent, 'mountain — 02 things');
  assert.equal(h.writes.items, 4);
  assert.equal(h.grid.dataset.initialFilter, undefined);
  assert.equal(h.historyEntries.length, 0);
});

test('clicks and history traversal still filter after the initial state is consumed', (t) => {
  const h = setup(t);
  h.clearStats();
  h.buttons[2].emit('click');
  assert.deepEqual(h.writes, { items: 0, buttons: 0, label: 0, empty: 0 });
  assert.equal(h.notifications.length, 0);
  assert.equal(h.historyEntries.length, 0);

  h.buttons[1].emit('click');
  assert.deepEqual(h.items.map((item) => item.hidden), [false, true, false, true]);
  assert.equal(h.window.location.search, '?category=mountain');
  assert.equal(h.historyEntries.length, 1);
  assert.equal(h.label.textContent, 'mountain — 02 things');
  h.clearStats();
  h.setCategory('ski');
  h.window.emit('popstate');
  assert.deepEqual(h.items.map((item) => item.hidden), [true, false, false, true]);
  assert.equal(h.label.textContent, 'ski — 02 things');
  assert.equal(h.historyEntries.length, 0);
  assert.deepEqual(h.notifications, ['picks:filter-change']);
});

test('selecting all cleans an unknown category URL without rewriting the already visible collection', (t) => {
  const h = setup(t, 'missing');
  h.clearStats();
  h.buttons[0].emit('click');
  assert.equal(h.window.location.search, '');
  assert.equal(h.historyEntries.length, 1);
  assert.deepEqual(h.writes, { items: 0, buttons: 0, label: 0, empty: 0 });
  assert.equal(h.notifications.length, 0);
});
