import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { runInNewContext } from 'node:vm';
import { initFilters } from '../src/scripts/filters';
import type { PickSearchHit } from '../src/lib/picks-search';

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

function matches(paths: string[]): Map<string, PickSearchHit> {
  return new Map(paths.map((path) => [path, { loadEvidence: async () => ({}) }]));
}

function setup(t: TestContext, category = 'ski', options: {
  inline?: boolean;
  nextCategory?: string;
  query?: string;
  search?: (term: string) => Promise<Map<string, PickSearchHit>>;
  emptyCollection?: boolean;
} = {}) {
  const writes = { items: 0, buttons: 0, label: 0, empty: 0 };
  const notifications: string[] = [];
  const scrolls: number[] = [];
  const historyEntries: string[] = [];
  let currentUrl = new URL('https://picks.invalid/picks');
  const setCategory = (value: string, query = '') => {
    currentUrl = new URL('https://picks.invalid/picks');
    if (value) currentUrl.searchParams.set('category', value);
    if (query) currentUrl.searchParams.set('q', query);
  };
  setCategory(category, options.query);
  let scrollLeft = 0;
  const itemCategories = options.emptyCollection ? [] : [['mountain'], ['ski'], ['mountain', 'ski'], [unusualCategory]];
  const badges = categories.map((id) => ({ textContent: String(itemCategories.filter((ids) => !id || ids.includes(id)).length) }));
  const buttons = categories.map((id, index) => Object.assign(new Target(), {
    dataset: { filter: id, filterLabel: id || 'all' },
    pressed: id === '',
    focus() {},
    querySelector: () => badges[index],
    setAttribute(_name: string, value: string) {
      writes.buttons++;
      this.pressed = value === 'true';
    },
    getBoundingClientRect() { return { left: index * 120 - scrollLeft, width: 100 }; },
  }));
  const items = itemCategories.map((ids, index) => {
    let hidden = false;
    return {
      dataset: { categories: JSON.stringify(ids), categoryKeys: ids.map(encodeURIComponent).join(' ') },
      querySelector: () => ({ pathname: `/picks/things/${index}` }),
      get hidden() { return hidden; },
      set hidden(value: boolean) { writes.items++; hidden = value; },
    };
  });
  let labelText = '';
  const count = {
    get textContent() { return labelText; },
    set textContent(value: string) { writes.label++; labelText = value; },
  };
  const prefix = { textContent: '' };
  const suffix = { textContent: '' };
  const label = { get textContent() { return prefix.textContent + count.textContent + suffix.textContent; } };
  const input = Object.assign(new Target(), { value: '', hidden: true });
  const retry = new Target();
  const error = { hidden: true };
  const emptyMessage = { textContent: '' };
  const searchAll = Object.assign(new Target(), { textContent: '', hidden: true });
  let emptyHidden = true;
  const empty = {
    dataset: { emptyState: '' },
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
    dataset: {} as Record<string, string>,
    clientWidth: 160, clientLeft: 0, scrollWidth: 600,
    get scrollLeft() { return scrollLeft; },
    closest: () => navigation,
    contains: (button: unknown) => buttons.includes(button as typeof buttons[number]),
    querySelectorAll: () => buttons,
    getBoundingClientRect: () => ({ left: 0 }),
    scrollTo({ left }: { left: number }) { scrollLeft = left; scrolls.push(left); },
  });
  Object.defineProperty(controls, 'scrollLeft', { get: () => scrollLeft });
  let orderedItems = [...items];
  const grid = {
    dataset: {} as Record<string, string>, querySelectorAll: () => items,
    attributes: new Map<string, string>(),
    setAttribute(key: string, value: string) { this.attributes.set(key, value); },
    removeAttribute(key: string) { this.attributes.delete(key); },
    hasAttribute(key: string) { return this.attributes.has(key); },
    append(...moved: typeof items) { orderedItems = [...orderedItems.filter((item) => !moved.includes(item)), ...moved]; },
  };
  const visible = () => orderedItems.filter((item) => !item.hidden).map((item) => items.indexOf(item));
  const documentTarget = new Target();
  const document = Object.assign(documentTarget, {
    documentElement: { dataset: {} as Record<string, string> },
    fonts: { ready: Promise.resolve() },
    querySelector(selector: string) {
      if (selector === '[data-filters]') return controls;
      if (selector === '[data-item-grid]') return grid;
      if (selector === '[data-count-prefix]') return prefix;
      if (selector === '[data-result-count]') return count;
      if (selector === '[data-count-suffix]') return suffix;
      if (selector === '[data-picks-search]') return input;
      if (selector === '[data-picks-suggestions]') return null;
      if (selector === '[data-picks-search-clear]') return null;
      if (selector === '[data-search-retry]') return retry;
      if (selector === '[data-search-error]') return error;
      if (selector === '[data-empty-message]') return emptyMessage;
      if (selector === '[data-search-all-categories]') return searchAll;
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
      state: { saved: true },
      replaceState(state: unknown, _unused: string, url: URL | string) {
        assert.deepEqual(state, this.state);
        currentUrl = new URL(String(url), currentUrl);
      },
      pushState(_state: unknown, _unused: string, url: URL | string) {
        currentUrl = new URL(String(url), currentUrl);
        historyEntries.push(currentUrl.href);
      },
    },
  });
  Object.defineProperty(window, 'location', { get: () => currentUrl });
  if (options.inline !== false) {
    runInNewContext(inlineApply!, { document, window, URLSearchParams });
  }
  if (options.nextCategory !== undefined) setCategory(options.nextCategory);
  const globals = {
    document, window,
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
  const ready = initFilters(options.search);
  return { buttons, badges, controls, items, input, error, retry, emptyMessage, searchAll, ready, visible, label, empty, grid, navigation, writes, notifications, scrolls, historyEntries, window, setCategory, clearStats };
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

test('IME commits once and a newer search keeps its rank even when the previous request finishes later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = new Map<string, (results: Map<string, PickSearchHit>) => void>();
  const h = setup(t, '', { search: (term) => new Promise((resolve) => requests.set(term, resolve)) });
  const firstUrl = h.window.location.href;
  h.input.emit('compositionstart');
  h.input.value = 'alpha';
  h.input.emit('input', { isComposing: true });
  t.mock.timers.tick(200);
  await Promise.resolve();
  assert.equal(h.window.location.href, firstUrl);
  assert.equal(requests.size, 0);
  h.input.emit('compositionend');
  h.input.emit('input');
  t.mock.timers.tick(200);
  await Promise.resolve();
  assert.deepEqual([...requests.keys()], ['alpha']);

  h.input.value = 'beta';
  h.input.emit('input');
  h.buttons[2].emit('click');
  assert.equal(h.label.textContent, 'Searching…');
  assert.equal(h.grid.attributes.get('aria-busy'), 'true');
  assert.equal(h.controls.dataset.counts, 'pending');
  t.mock.timers.tick(200);
  await Promise.resolve();
  requests.get('beta')!(matches(['/picks/things/2', '/picks/things/1', '/picks/things/0']));
  await Promise.resolve();
  assert.deepEqual(h.visible(), [2, 1]);
  assert.deepEqual(h.badges.map((badge) => badge.textContent), ['3', '2', '2', '0', '0']);
  assert.equal(h.label.textContent, 'ski — 02 things');
  assert.equal(h.grid.attributes.has('aria-busy'), false);
  requests.get('alpha')!(matches(['/picks/things/1']));
  await Promise.resolve();
  assert.deepEqual(h.visible(), [2, 1]);

  h.input.value = '';
  h.input.emit('input');
  assert.equal(h.window.location.search, '?category=ski');
  assert.deepEqual(h.visible(), [1, 2]);
  assert.deepEqual(h.badges.map((badge) => badge.textContent), ['4', '2', '2', '0', '1']);
  assert.equal(h.controls.dataset.counts, 'total');
  assert.equal(h.historyEntries.length, 1);
});

test('clearing an initial URL query releases navigation readiness and ignores its late response', async (t) => {
  let finish!: (results: Map<string, PickSearchHit>) => void;
  const h = setup(t, '', { query: 'alpha', search: () => new Promise((resolve) => { finish = resolve; }) });
  assert.ok(h.ready);
  assert.equal(h.input.value, 'alpha');
  h.input.value = '';
  h.input.emit('input');
  await h.ready;
  assert.deepEqual(h.visible(), [0, 1, 2, 3]);
  finish(matches([]));
  await Promise.resolve();
  assert.deepEqual(h.visible(), [0, 1, 2, 3]);
  assert.equal(h.grid.attributes.has('aria-busy'), false);
});

test('history traversal restores the search text, category and ranking from the URL', async (t) => {
  const h = setup(t, '', { search: async () => matches(['/picks/things/2', '/picks/things/1', '/picks/things/0']) });
  h.setCategory('ski', 'alpha');
  h.window.emit('popstate');
  await Promise.resolve();
  assert.equal(h.input.value, 'alpha');
  assert.deepEqual(h.visible(), [2, 1]);
  h.setCategory('mountain');
  h.window.emit('popstate');
  assert.equal(h.input.value, '');
  assert.deepEqual(h.visible(), [0, 2]);
  assert.equal(h.historyEntries.length, 0);
});

test('empty category searches can show every match while keeping the query and browser history', async (t) => {
  const search = t.mock.fn(async () => matches(['/picks/things/2', '/picks/things/0']));
  const h = setup(t, 'empty', { query: 'alpha', search });
  await h.ready;
  assert.deepEqual(h.visible(), []);
  assert.deepEqual(h.badges.map((badge) => badge.textContent), ['2', '2', '1', '0', '0']);
  assert.equal(h.controls.dataset.counts, 'matches');
  assert.equal(h.searchAll.hidden, false);
  assert.equal(h.searchAll.textContent, 'View 2 things across all categories');
  h.searchAll.emit('click');
  assert.equal(h.window.location.search, '?q=alpha');
  assert.equal(h.buttons[0].pressed, true);
  assert.deepEqual(h.visible(), [2, 0]);
  assert.equal(h.searchAll.hidden, true);
  assert.equal(h.historyEntries.length, 1);

  h.setCategory('empty', 'alpha');
  h.window.emit('popstate');
  assert.equal(h.searchAll.hidden, false);
  assert.equal(h.input.value, 'alpha');
  assert.deepEqual(h.visible(), []);
  assert.equal(search.mock.callCount(), 1);
});

test('an empty category search offers a single match with a singular label', async (t) => {
  const h = setup(t, 'ski', { query: 'alpha', search: async () => matches(['/picks/things/0']) });
  await h.ready;
  assert.equal(h.searchAll.hidden, false);
  assert.equal(h.searchAll.textContent, 'View 1 thing across all categories');
});

test('a failed initial search keeps the category visible and can be retried without changing history', async (t) => {
  let attempts = 0;
  const h = setup(t, 'ski', { query: 'alpha', search: async () => {
    if (++attempts === 1) throw new Error('Index unavailable');
    return matches([]);
  } });
  await h.ready;
  assert.equal(h.error.hidden, false);
  assert.deepEqual(h.visible(), [1, 2]);
  assert.equal(h.empty.hidden, true);
  assert.equal(h.searchAll.hidden, true);
  assert.equal(h.controls.dataset.counts, 'total');
  h.retry.emit('click');
  await Promise.resolve();
  assert.equal(attempts, 2);
  assert.equal(h.error.hidden, true);
  assert.equal(h.empty.hidden, false);
  assert.equal(h.emptyMessage.textContent, 'No matching things.');
  assert.equal(h.searchAll.hidden, true);
  assert.deepEqual(h.badges.map((badge) => badge.textContent), ['0', '0', '0', '0', '0']);
  assert.equal(h.label.textContent, 'ski — 00 things');
  assert.equal(h.historyEntries.length, 0);
});

test('an empty collection shows zero results without requesting an index', async (t) => {
  const search = t.mock.fn(async () => matches([]));
  const h = setup(t, '', { emptyCollection: true, query: 'alpha', search });
  await h.ready;
  assert.equal(search.mock.callCount(), 0);
  assert.equal(h.error.hidden, true);
  assert.equal(h.empty.hidden, false);
  assert.equal(h.emptyMessage.textContent, 'No matching things.');
  assert.equal(h.grid.attributes.has('aria-busy'), false);
});
