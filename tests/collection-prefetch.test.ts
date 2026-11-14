import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { initCollectionPrefetch } from '../src/scripts/collection-prefetch';

class Target {
  private listeners = new Map<string, Array<(event: Record<string, unknown>) => void>>();
  addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, target: this, ...event });
  }
}

class Element extends Target {}

class Anchor extends Element {
  item = { hidden: false };
  rect = { width: 160, height: 200, top: 100, bottom: 300, left: 32, right: 192 };
  constructor(public href: string) { super(); }
  closest(selector: string) {
    if (selector === '[data-item]') return this.item;
    if (selector === 'a[data-picks-prefetch]') return this;
    throw new Error(`Unexpected selector: ${selector}`);
  }
  getBoundingClientRect() { return this.rect; }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const settle = async () => {
  // fetch、本文、finallyの各継続を処理する。実時間の待機は不要。
  for (let turn = 0; turn < 6; turn++) await Promise.resolve();
};

function setup(t: TestContext, options: {
  ready?: boolean;
  hidden?: boolean;
  online?: boolean;
  saveData?: boolean;
  effectiveType?: string;
  hrefs?: string[];
  automaticAbort?: boolean;
  navigation?: boolean;
} = {}) {
  const anchors = (options.hrefs ?? ['one', 'two', 'three', 'four', 'five'].map((id) => `/picks/things/${id}`))
    .map((href) => new Anchor(new URL(href, 'https://example.test/picks').href));
  const grid = Object.assign(new Target(), {
    querySelectorAll(selector: string) {
      assert.equal(selector, 'a[data-picks-prefetch]');
      return anchors;
    },
  });
  const document = Object.assign(new Target(), {
    readyState: options.ready === false ? 'loading' : 'complete',
    visibilityState: options.hidden ? 'hidden' : 'visible',
    querySelector(selector: string) {
      assert.equal(selector, '[data-item-grid]');
      return grid;
    },
  });
  const navigation = new Target();
  const window = Object.assign(new Target(), {
    innerWidth: 1280,
    innerHeight: 800,
    navigation: options.navigation === false ? undefined : navigation,
  });
  const connection = Object.assign(new Target(), {
    saveData: options.saveData ?? false,
    effectiveType: options.effectiveType ?? '4g',
  });
  const navigator = { onLine: options.online ?? true, connection };
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const advance = (milliseconds: number) => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.at > now) continue;
      timers.delete(id);
      timer.callback();
    }
  };
  const observed = new Set<Anchor>();
  let notify!: (entries: Array<{ target: Anchor; isIntersecting: boolean }>) => void;
  const requests: Array<{
    url: string;
    options: RequestInit;
    headers: () => void;
    finish: () => void;
    fail: () => void;
    finishAbort: () => void;
  }> = [];
  const globals = {
    document, window, navigator, Element,
    location: new URL('https://example.test/picks'),
    IntersectionObserver: class {
      constructor(callback: typeof notify) { notify = callback; }
      observe(anchor: Anchor) { observed.add(anchor); }
      unobserve(anchor: Anchor) { observed.delete(anchor); }
      disconnect() { observed.clear(); }
    },
    setTimeout(callback: () => void, milliseconds: number) {
      timers.set(++timerId, { at: now + milliseconds, callback });
      return timerId;
    },
    clearTimeout(id: number) { timers.delete(id); },
    fetch(url: string, options: RequestInit) {
      const headers = deferred<{ arrayBuffer: () => Promise<ArrayBuffer> }>();
      const body = deferred<ArrayBuffer>();
      let receivedHeaders = false;
      const reject = (message: string) => {
        if (receivedHeaders) body.reject(new Error(message));
        else headers.reject(new Error(message));
      };
      const request = {
        url, options,
        headers() {
          receivedHeaders = true;
          headers.resolve({ arrayBuffer: () => body.promise });
        },
        finish() { this.headers(); body.resolve(new ArrayBuffer(0)); },
        fail() { reject('Network failed'); },
        finishAbort() { reject('Aborted'); },
      };
      requests.push(request);
      if (automaticAbort) options.signal?.addEventListener('abort', request.finishAbort);
      return headers.promise;
    },
  };
  const automaticAbort = options.automaticAbort !== false;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  t.after(async () => {
    window.emit('pagehide');
    for (const request of requests) if (request.options.signal?.aborted) request.finishAbort();
    await settle();
    for (const [key, old] of previous) {
      if (old) Object.defineProperty(globalThis, key, old);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  initCollectionPrefetch();
  return {
    anchors, grid, document, window, navigator, connection, observed, requests, timers, advance,
    intersect(indices = anchors.map((_, index) => index), visible = true) {
      notify(indices.map((index) => ({ target: anchors[index], isIntersecting: visible }))
        .filter((entry) => observed.has(entry.target)));
    },
    load() { document.readyState = 'complete'; window.emit('load'); },
    visibility(hidden: boolean) {
      document.visibilityState = hidden ? 'hidden' : 'visible';
      document.emit('visibilitychange');
    },
    navigate(options: { sameDocument?: boolean; downloadRequest?: string; defaultPrevented?: boolean } = {}) {
      const controller = new AbortController();
      navigation.emit('navigate', {
        signal: controller.signal,
        destination: { sameDocument: options.sameDocument ?? false },
        downloadRequest: options.downloadRequest ?? null,
        defaultPrevented: options.defaultPrevented ?? false,
      });
      return controller;
    },
  };
}

test('viewport prefetch waits for page load and 300ms, cancelling cards that leave early', (t) => {
  const h = setup(t, { ready: false });
  assert.equal(h.observed.size, 0);
  h.intersect();
  h.advance(1000);
  assert.equal(h.requests.length, 0);
  h.load();
  h.intersect([0, 1]);
  h.advance(299);
  assert.equal(h.requests.length, 0);
  h.intersect([1], false);
  h.advance(1);
  assert.deepEqual(h.requests.map((request) => request.url), [h.anchors[0].href]);
});

test('two slots remain occupied until response bodies finish, and failures release a slot', async (t) => {
  const h = setup(t);
  h.intersect();
  h.advance(300);
  assert.equal(h.requests.length, 2);
  for (const request of h.requests) {
    assert.equal(request.options.priority, 'low');
    request.headers();
  }
  await settle();
  assert.equal(h.requests.length, 2);
  h.requests[0].finish();
  await settle();
  assert.equal(h.requests.length, 3);
  h.requests[1].fail();
  await settle();
  assert.equal(h.requests.length, 4);
  h.requests[2].fail();
  await settle();
  assert.equal(h.requests.length, 5);
});

test('queued cards are rechecked when filters or scroll change before observer notifications', async (t) => {
  const h = setup(t, { hrefs: Array.from({ length: 7 }, (_, index) => `/picks/things/${index}`) });
  h.intersect();
  h.advance(300);
  h.anchors[2].item.hidden = true;
  h.anchors[3].rect.top = 900;
  h.anchors[3].rect.bottom = 1100;
  h.anchors[4].rect.width = 0;
  h.intersect([5], false);
  h.requests[0].finish();
  await settle();
  assert.deepEqual(h.requests.map((request) => request.url), [0, 1, 6].map((index) => h.anchors[index].href));
});

test('URL hashes are deduplicated and external/current-page links are excluded', async (t) => {
  const h = setup(t, { hrefs: [
    '/picks/things/one#first', '/picks/things/one#second', 'https://other.test/picks/things/two',
    '/picks#top', '/picks?category=ski', '/picks/things/two',
  ] });
  h.intersect();
  h.advance(300);
  assert.deepEqual(h.requests.map((request) => request.url), [
    'https://example.test/picks/things/one', 'https://example.test/picks?category=ski',
  ]);
  h.requests[0].finish();
  await settle();
  assert.equal(h.requests[2].url, 'https://example.test/picks/things/two');
  h.intersect([0, 1]);
  h.advance(300);
  h.requests[1].finish();
  h.requests[2].finish();
  await settle();
  assert.equal(h.requests.length, 3);
});

test('offline queues wait for connectivity and do not refill slots while disconnected', async (t) => {
  const h = setup(t, { online: false });
  h.intersect();
  h.advance(300);
  assert.equal(h.requests.length, 0);
  h.navigator.onLine = true;
  h.window.emit('online');
  assert.equal(h.requests.length, 2);
  h.navigator.onLine = false;
  h.requests[0].finish();
  await settle();
  assert.equal(h.requests.length, 2);
  h.navigator.onLine = true;
  h.window.emit('online');
  assert.equal(h.requests.length, 3);
});

for (const network of [{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) {
  test(`constrained connection waits for an actual press: ${JSON.stringify(network)}`, async (t) => {
    const h = setup(t, network);
    h.intersect();
    h.advance(300);
    assert.equal(h.requests.length, 0);
    h.grid.emit('pointerdown', { target: h.anchors[3] });
    assert.deepEqual(h.requests.map((request) => request.url), [h.anchors[3].href]);
    h.requests[0].finish();
    await settle();
    assert.equal(h.requests.length, 1);
    h.connection.saveData = false;
    h.connection.effectiveType = '4g';
    h.connection.emit('change');
    assert.equal(h.requests.length, 3);
  });
}

test('a pending viewport timer cannot overwrite a queued press on a constrained connection', async (t) => {
  const h = setup(t, { saveData: true });
  h.intersect([0, 1, 2]);
  for (const anchor of h.anchors.slice(0, 3)) h.grid.emit('pointerdown', { target: anchor });
  assert.equal(h.requests.length, 2);
  h.advance(300);
  h.requests[0].finish();
  await settle();
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].url, h.anchors[2].href);
});

test('hidden tabs clear pending work and resume observation when shown', async (t) => {
  const h = setup(t, { hidden: true });
  assert.equal(h.observed.size, 0);
  h.visibility(false);
  h.intersect();
  h.advance(300);
  assert.equal(h.requests.length, 2);
  h.visibility(true);
  assert.equal(h.observed.size, 0);
  assert.equal(h.timers.size, 0);
  h.requests[0].finish();
  await settle();
  assert.equal(h.requests.length, 2);
  h.visibility(false);
  h.intersect();
  h.advance(300);
  assert.equal(h.requests.length, 3);
});

test('without the Navigation API, pagehide aborts requests and BFCache restoration respects occupied slots', async (t) => {
  const h = setup(t, { automaticAbort: false, navigation: false });
  h.intersect();
  h.advance(300);
  h.window.emit('pagehide', { persisted: true });
  assert.equal(h.observed.size, 0);
  assert.ok(h.requests.every((request) => request.options.signal?.aborted));
  h.window.emit('pageshow', { persisted: true });
  h.intersect();
  h.advance(300);
  assert.equal(h.requests.length, 2);
  h.requests[0].finishAbort();
  await settle();
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].url, h.anchors[0].href);
  h.requests[1].finishAbort();
  await settle();
  assert.equal(h.requests.length, 4);
  assert.equal(h.requests[3].url, h.anchors[1].href);
  assert.equal(h.requests.filter((request) => !request.options.signal?.aborted).length, 2);
});

test('document navigation aborts prefetch and stops refilling slots before pagehide', async (t) => {
  const h = setup(t);
  h.intersect([0, 1, 2]);
  h.advance(300);
  h.intersect([3, 4]);
  assert.equal(h.requests.length, 2);
  assert.equal(h.timers.size, 2);

  h.navigate();
  assert.ok(h.requests.every((request) => request.options.signal?.aborted));
  assert.equal(h.timers.size, 0);
  assert.equal(h.observed.size, 0);
  await settle();
  h.advance(1000);
  h.visibility(true);
  h.visibility(false);
  h.window.emit('online');
  assert.equal(h.requests.length, 2);
  assert.equal(h.observed.size, 0);
});

test('canceling document navigation resumes prefetch for the current page', async (t) => {
  const h = setup(t);
  h.intersect();
  h.advance(300);
  const pending = h.navigate();
  await settle();
  pending.abort();
  assert.equal(h.observed.size, h.anchors.length);
  h.intersect();
  h.advance(300);
  assert.equal(h.requests.length, 4);
  assert.deepEqual(h.requests.slice(2).map((request) => request.url), h.anchors.slice(0, 2).map((anchor) => anchor.href));
});

for (const navigation of [
  { sameDocument: true },
  { downloadRequest: 'image.png' },
  { defaultPrevented: true },
]) {
  test(`non-departing navigation keeps prefetch running: ${JSON.stringify(navigation)}`, (t) => {
    const h = setup(t);
    h.intersect();
    h.advance(300);
    h.navigate(navigation);
    assert.ok(h.requests.every((request) => !request.options.signal?.aborted));
    assert.equal(h.observed.size, h.anchors.length - 2);
  });
}

test('canceling an older navigation cannot resume prefetch during a newer navigation', async (t) => {
  const h = setup(t);
  h.intersect();
  h.advance(300);
  const first = h.navigate();
  const second = h.navigate();
  first.abort();
  await settle();
  assert.equal(h.observed.size, 0);
  assert.equal(h.requests.length, 2);

  second.abort();
  assert.equal(h.observed.size, h.anchors.length);
  h.intersect();
  h.advance(300);
  assert.equal(h.requests.length, 4);
});

test('pagehide keeps prefetch stopped when a navigation signal aborts, until pageshow', async (t) => {
  const h = setup(t);
  h.intersect();
  h.advance(300);
  const pending = h.navigate();
  h.window.emit('pagehide', { persisted: true });
  pending.abort();
  await settle();
  assert.equal(h.observed.size, 0);

  h.window.emit('pageshow', { persisted: true });
  assert.equal(h.observed.size, h.anchors.length);
  h.intersect();
  h.advance(300);
  assert.equal(h.requests.length, 4);
});

test('pressing a cloned card cannot bypass the real-grid candidates', (t) => {
  const h = setup(t, { saveData: true });
  h.grid.emit('pointerdown', { target: new Anchor(h.anchors[0].href) });
  assert.equal(h.requests.length, 0);
});
