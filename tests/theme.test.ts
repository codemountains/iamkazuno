import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const component = readFileSync(new URL('../src/components/ThemeInit.astro', import.meta.url), 'utf8');
const inlineScript = component.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
if (!inlineScript) throw new Error('ThemeInit must contain an early inline initializer.');

class ThemeDocument extends EventTarget {
  documentElement = { dataset: {} as Record<string, string> };
}

class SystemTheme extends EventTarget {
  constructor(public matches: boolean) { super(); }

  change(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

class ThemeWindow extends EventTarget {
  constructor(
    private media: SystemTheme,
    private storage: Map<string, string>,
    private storageBlocked: boolean,
  ) { super(); }

  matchMedia() { return this.media; }

  get localStorage() {
    if (this.storageBlocked) throw new Error('Storage access denied');
    return {
      getItem: (key: string) => this.storage.get(key) ?? null,
      setItem: (key: string, value: string) => { this.storage.set(key, value); },
    };
  }
}

function loadPage(options: { dark?: boolean; storage?: Map<string, string>; blocked?: boolean } = {}) {
  const document = new ThemeDocument();
  const media = new SystemTheme(options.dark ?? false);
  const storage = options.storage ?? new Map<string, string>();
  const window = new ThemeWindow(media, storage, options.blocked ?? false);
  runInNewContext(inlineScript!, { document, window, CustomEvent });
  return {
    state: document.documentElement.dataset,
    storage,
    media,
    window,
    choose: (preference: string) => document.dispatchEvent(new CustomEvent('picks:theme-change', { detail: preference })),
  };
}

test('the first page follows the light or dark system preference before interaction', () => {
  for (const dark of [false, true]) {
    const page = loadPage({ dark });
    assert.equal(page.state.themePreference, 'system');
    assert.equal(page.state.theme, dark ? 'dark' : 'light');
  }
});

test('an explicit preference is saved and restored across page loads', () => {
  const first = loadPage({ dark: false });
  first.choose('dark');
  assert.equal(first.storage.get('picks-theme'), 'dark');
  const next = loadPage({ dark: false, storage: first.storage });
  assert.equal(next.state.themePreference, 'dark');
  assert.equal(next.state.theme, 'dark');

  next.choose('light');
  const reloaded = loadPage({ dark: true, storage: next.storage });
  assert.equal(reloaded.state.themePreference, 'light');
  assert.equal(reloaded.state.theme, 'light');
});

test('OS changes affect only system mode and resume immediately when system is selected', () => {
  const page = loadPage({ dark: true });
  page.choose('light');
  page.media.change(false);
  page.media.change(true);
  assert.equal(page.state.theme, 'light');

  page.choose('dark');
  page.media.change(false);
  assert.equal(page.state.theme, 'dark');

  page.choose('system');
  assert.equal(page.state.themePreference, 'system');
  assert.equal(page.state.theme, 'light');
  page.media.change(true);
  assert.equal(page.state.theme, 'dark');
});

test('unavailable storage and invalid saved values fall back to a working system theme', () => {
  const invalid = loadPage({ dark: true, storage: new Map([['picks-theme', 'unexpected']]) });
  assert.equal(invalid.state.themePreference, 'system');
  assert.equal(invalid.state.theme, 'dark');

  const blocked = loadPage({ dark: true, blocked: true });
  assert.equal(blocked.state.themePreference, 'system');
  blocked.choose('light');
  assert.equal(blocked.state.theme, 'light');
  blocked.choose('system');
  blocked.media.change(false);
  assert.equal(blocked.state.theme, 'light');
});
