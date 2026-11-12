import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { collectionSize, mobileCollectionColumns } from '../src/lib/collection-size';
import { initCollectionSize } from '../src/scripts/collection-size';

class Target {
  private listeners = new Map<string, Array<(event: Record<string, unknown>) => void>>();
  addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, target: this, ...event });
  }
}

class Style {
  private values = new Map<string, string>();
  setProperty(name: string, value: string) { this.values.set(name, value); }
  getPropertyValue(name: string) { return this.values.get(name) ?? ''; }
}

function setup(t: TestContext, options: { mobile?: boolean; blockedStorage?: boolean; width?: number; initial?: number } = {}) {
  const mobile = Object.assign(new Target(), { matches: options.mobile ?? false });
  const initial = options.initial ?? (mobile.matches ? collectionSize.mobileInitial : collectionSize.initial);
  const root = { style: new Style() };
  root.style.setProperty('--collection-item-size', `${initial}px`);
  root.style.setProperty('--collection-mobile-columns', String(mobileCollectionColumns(initial)));
  const slider = Object.assign(new Target(), {
    value: String(initial),
    style: new Style(),
    attributes: new Map<string, string>(),
    setAttribute(name: string, value: string) { this.attributes.set(name, value); },
  });
  const stats = { gridReads: 0, itemReads: 0, imageReads: 0, styleReads: 0, sizeWrites: 0, resizeEvents: 0 };
  const stored = new Map<string, string>();
  const saves: string[] = [];
  const scrolls: number[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const requestAnimationFrame = (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  const cancelAnimationFrame = (id: number) => { frames.delete(id); };
  const window = Object.assign(new Target(), {
    scrollY: 250,
    matchMedia: () => mobile,
    requestAnimationFrame,
    cancelAnimationFrame,
    scrollTo({ top }: { top: number }) { this.scrollY = top; scrolls.push(top); },
  });
  let containerWidth = options.width ?? (mobile.matches ? 360 : 960);
  const imageWidth = () => {
    if (mobile.matches) return containerWidth / Number(root.style.getPropertyValue('--collection-mobile-columns'));
    // auto-fillは空き列も維持し、残り幅を列へ均等に配る。
    const minimum = Number.parseFloat(root.style.getPropertyValue('--collection-item-size'));
    let columns = 1;
    while (columns < 18 && (columns + 1) * minimum + columns * 16 <= containerWidth) columns++;
    return (containerWidth - (columns - 1) * 16) / columns;
  };
  const items = [false, true].map((hidden, index) => ({
    hidden,
    getBoundingClientRect() {
      stats.itemReads++;
      const top = 300 + index * 300 + (imageWidth() - initial) * 2 - window.scrollY;
      return { top, bottom: top + imageWidth(), width: imageWidth() };
    },
  }));
  function picture() {
    let sizes = 'auto, 160px';
    return {
      get sizes() { return sizes; },
      set sizes(value: string) { sizes = value; stats.sizeWrites++; },
    };
  }
  const images = items.map((item) => Object.assign(picture(), {
    getBoundingClientRect() {
      stats.imageReads++;
      return { width: item.hidden ? 0 : imageWidth() };
    },
  }));
  const sources = items.map(() => picture());
  const pictures = [...images, ...sources];
  const grid = {
    getBoundingClientRect() {
      stats.gridReads++;
      return { width: containerWidth };
    },
    querySelectorAll(selector: string) {
      if (selector === 'img') return images;
      if (selector === 'img, source') return pictures;
      if (selector === '[data-item]') return items;
      throw new Error(`Unexpected selector: ${selector}`);
    },
  };
  const documentTarget = new Target();
  const document = Object.assign(documentTarget, {
    documentElement: root,
    visibilityState: 'visible',
    querySelector: (selector: string) => selector === '[data-item-grid]' ? grid : slider,
    dispatchEvent(event: Event) {
      if (event.type === 'picks:resize') stats.resizeEvents++;
      documentTarget.emit(event.type);
      return true;
    },
  });
  const observers: Array<() => void> = [];
  const globals = {
    document, window, requestAnimationFrame, cancelAnimationFrame,
    sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem(key: string, value: string) {
        if (options.blockedStorage) throw new Error('Storage blocked');
        stored.set(key, value);
        saves.push(value);
      },
    },
    getComputedStyle(target: unknown) {
      stats.styleReads++;
      if (target === grid) return {
        getPropertyValue(name: string) {
          if (name === '--collection-column-gap') return '16px';
          if (name === '--collection-max-columns') return '18';
          throw new Error(`Unexpected grid property: ${name}`);
        },
      };
      return { paddingLeft: '14px', paddingRight: '14px' };
    },
    ResizeObserver: class {
      constructor(callback: (entries: unknown[]) => void) {
        observers.push(() => callback([{ target: grid, contentRect: { width: containerWidth, height: 900 } }]));
      }
      observe() {}
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (old) Object.defineProperty(globalThis, key, old);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const flushFrame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(16);
  };
  const clearStats = () => {
    for (const key of Object.keys(stats) as Array<keyof typeof stats>) stats[key] = 0;
    saves.length = 0;
    scrolls.length = 0;
  };
  initCollectionSize();
  flushFrame();
  clearStats();
  const notifyResize = (width = containerWidth) => {
    containerWidth = width;
    for (const notify of observers) notify();
  };
  return {
    root, slider, mobile, window, document, items, images, sources, stats, stored, saves, scrolls, frames,
    flushFrame, clearStats, notifyResize,
    setContainerWidth(width: number) { containerWidth = width; },
    input(value: number) { slider.value = String(value); slider.emit('input'); },
    resize(width = containerWidth) {
      notifyResize(width);
      flushFrame();
    },
  };
}

test('rapid input applies only the latest value once per frame without storing during drag', (t) => {
  const h = setup(t);
  h.input(168);
  h.input(176);
  h.input(184);
  assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '160px');
  assert.equal(h.stats.itemReads + h.stats.imageReads, 0);
  assert.equal(h.saves.length, 0);
  h.flushFrame();
  assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '184px');
  assert.equal(h.stats.resizeEvents, 1);
  assert.equal(h.scrolls.length, 1);
  assert.equal(h.saves.length, 0);
});

test('change commits the latest value even before a scheduled frame and supports keyboard steps', (t) => {
  const h = setup(t);
  h.input(184);
  h.slider.emit('change');
  assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '184px');
  assert.deepEqual(h.saves, ['184']);
  assert.equal(h.frames.size, 0);
  h.flushFrame();
  assert.equal(h.stats.resizeEvents, 1);
  h.input(192);
  h.slider.emit('change');
  assert.equal(h.slider.attributes.get('aria-valuetext'), '192ピクセル');
  assert.equal(h.stored.get(collectionSize.storageKey), '192');
});

test('mobile inputs within the same column count update the control without measuring or scrolling', (t) => {
  const h = setup(t, { mobile: true });
  const progress = h.slider.style.getPropertyValue('--size-progress');
  assert.equal(mobileCollectionColumns(184), mobileCollectionColumns(192));
  h.input(192);
  h.flushFrame();
  assert.equal(h.slider.value, '192');
  assert.notEqual(h.slider.style.getPropertyValue('--size-progress'), progress);
  assert.equal(h.slider.attributes.get('aria-valuetext'), '横に3列');
  assert.equal(h.stats.itemReads + h.stats.imageReads + h.stats.styleReads, 0);
  assert.equal(h.stats.resizeEvents, 0);
  assert.equal(h.stats.sizeWrites, 0);
  assert.equal(h.scrolls.length, 0);
  h.slider.emit('change');
  assert.deepEqual(h.saves, ['192']);
});

for (const { width, lastCappedSize, cappedImageSize, nextImageSize } of [
  { width: 3776, lastCappedSize: 192, cappedImageSize: '167px', nextImageSize: '180px' },
  { width: 2496, lastCappedSize: 120, cappedImageSize: '96px', nextImageSize: '104px' },
]) {
  test(`desktop 18-column plateau at grid width ${width} skips work and still commits the selected size`, (t) => {
    const h = setup(t, { width, initial: 88 });
    for (let size = 96; size <= lastCappedSize; size += 8) {
      h.input(size);
      h.flushFrame();
    }
    assert.equal(h.root.style.getPropertyValue('--collection-item-size'), `${lastCappedSize}px`);
    assert.equal(h.slider.attributes.get('aria-valuetext'), `${lastCappedSize}ピクセル`);
    assert.equal(h.slider.style.getPropertyValue('--size-progress'), `${(lastCappedSize - 88) / 192 * 100}%`);
    assert.deepEqual(h.stats, { gridReads: 0, itemReads: 0, imageReads: 0, styleReads: 0, sizeWrites: 0, resizeEvents: 0 });
    assert.equal(h.scrolls.length, 0);
    for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, cappedImageSize);
    h.slider.emit('change');
    assert.deepEqual(h.saves, [String(lastCappedSize)]);

    const before = h.items[0].getBoundingClientRect().top;
    h.input(lastCappedSize + 8);
    h.flushFrame();
    assert.equal(h.stats.resizeEvents, 1);
    assert.equal(h.scrolls.length, 1);
    assert.equal(h.items[0].getBoundingClientRect().top, before);
    for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, nextImageSize);
  });
}

test('desktop inputs within an uncapped column count also skip measuring and scrolling', (t) => {
  const h = setup(t);
  h.input(176);
  h.slider.emit('change');
  assert.deepEqual(h.stats, { gridReads: 0, itemReads: 0, imageReads: 0, styleReads: 0, sizeWrites: 0, resizeEvents: 0 });
  assert.deepEqual(h.saves, ['176']);
  assert.equal(h.scrolls.length, 0);
});

test('ResizeObserver width changes do not leave a stale desktop column baseline', (t) => {
  const h = setup(t, { width: 1000 });
  h.resize(1500);
  h.clearStats();
  const before = h.items[0].getBoundingClientRect().top;
  // 以前の幅では5列、リサイズ後は8列。280pxへの変更は8→5列になる。
  h.input(280);
  h.flushFrame();
  assert.equal(h.stats.gridReads, 0);
  assert.equal(h.stats.resizeEvents, 1);
  assert.equal(h.items[0].getBoundingClientRect().top, before);
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '260px');
});

test('an input before the resize observer uses the current grid width', (t) => {
  const h = setup(t, { width: 1000 });
  h.setContainerWidth(1500);
  h.window.emit('resize');
  const before = h.items[0].getBoundingClientRect().top;
  // 古い幅なら160pxと176pxは同じ5列。現在の幅では8→7列なので省略できない。
  h.input(176);
  h.flushFrame();
  assert.equal(h.stats.gridReads, 1);
  assert.equal(h.stats.resizeEvents, 1);
  assert.equal(h.items[0].getBoundingClientRect().top, before);
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '173px');
});

test('a resized grid still refreshes images when the next input keeps the same column count', (t) => {
  const h = setup(t);
  h.setContainerWidth(990);
  h.window.emit('resize');
  h.input(176);
  h.flushFrame();
  assert.equal(h.stats.gridReads, 1);
  assert.equal(h.stats.imageReads, 1);
  assert.equal(h.stats.resizeEvents, 0);
  assert.equal(h.scrolls.length, 0);
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '158px');
});

test('BFCache restoration refreshes a changed desktop width before the next slider input', (t) => {
  const h = setup(t, { width: 1000 });
  h.setContainerWidth(1500);
  h.window.emit('pageshow', { persisted: true });
  h.flushFrame();
  assert.equal(h.stats.gridReads, 1);
  assert.equal(h.scrolls.length, 0);
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '146px');
  h.clearStats();
  h.input(176);
  h.flushFrame();
  assert.equal(h.stats.gridReads, 0);
  assert.equal(h.stats.resizeEvents, 1);
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '173px');
});

test('layout changes preserve the visible item position and update both visible and hidden image candidates', (t) => {
  const h = setup(t);
  const before = h.items[0].getBoundingClientRect().top;
  h.input(232);
  h.flushFrame();
  assert.equal(h.items[0].getBoundingClientRect().top, before);
  assert.ok(h.window.scrollY > 250);
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '282px');
  h.clearStats();
  h.resize();
  assert.equal(h.stats.sizeWrites, 0);
  assert.equal(h.scrolls.length, 0);
});

test('pagehide commits pending input and BFCache restores the page value without moving its position', (t) => {
  const h = setup(t);
  h.input(232);
  h.window.emit('pagehide');
  assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '232px');
  assert.equal(h.stored.get(collectionSize.storageKey), '232');
  assert.equal(h.frames.size, 0);
  const scrollY = h.window.scrollY;
  h.stored.set(collectionSize.storageKey, '280');
  h.clearStats();
  h.window.emit('pageshow', { persisted: true });
  h.flushFrame();
  assert.equal(h.slider.value, '232');
  assert.equal(h.stored.get(collectionSize.storageKey), '232');
  assert.equal(h.window.scrollY, scrollY);
  assert.equal(h.scrolls.length, 0);
});

test('viewport resize and switching to desktop keep image candidates and the saved slider value current', (t) => {
  const h = setup(t, { mobile: true });
  h.input(192);
  h.slider.emit('change');
  h.resize(420);
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '112px');
  h.setContainerWidth(960);
  h.mobile.matches = false;
  h.mobile.emit('change');
  h.flushFrame();
  assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '192px');
  assert.equal(h.slider.attributes.get('aria-valuetext'), '192ピクセル');
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '200px');
});

test('switching to desktop before the next frame retains the latest pending mobile input', (t) => {
  const h = setup(t, { mobile: true });
  h.input(208);
  h.input(232);
  h.setContainerWidth(960);
  h.mobile.matches = false;
  h.mobile.emit('change');
  assert.equal(h.slider.value, '232');
  assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '232px');
  assert.equal(h.slider.attributes.get('aria-valuetext'), '232ピクセル');
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '282px');
  assert.equal(h.frames.size, 0);
  assert.equal(h.scrolls.length, 0);
  h.slider.emit('change');
  assert.equal(h.stored.get(collectionSize.storageKey), '232');
});

for (const reason of ['blur', 'hidden'] as const) {
  test(`${reason} commits pending input once and leaves no animation frame or unsaved value`, (t) => {
    const h = setup(t);
    h.input(208);
    if (reason === 'blur') {
      h.slider.emit('blur');
    } else {
      h.document.emit('visibilitychange');
      assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '160px');
      assert.equal(h.saves.length, 0);
      h.document.visibilityState = 'hidden';
      h.document.emit('visibilitychange');
    }
    assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '208px');
    assert.deepEqual(h.saves, ['208']);
    assert.equal(h.frames.size, 0);
    h.window.emit('pagehide');
    h.flushFrame();
    assert.deepEqual(h.saves, ['208']);
    assert.equal(h.stats.resizeEvents, 1);
  });
}

test('resize notifications and repeated input in one frame share a single image measurement', (t) => {
  const h = setup(t);
  h.notifyResize();
  h.input(176);
  h.notifyResize();
  h.input(208);
  assert.equal(h.stats.imageReads, 0);
  assert.equal(h.frames.size, 1);
  h.flushFrame();
  assert.equal(h.stats.imageReads, 1);
  assert.equal(h.stats.styleReads, 1);
  assert.equal(h.stats.resizeEvents, 1);
  assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '208px');
  for (const picture of [...h.images, ...h.sources]) assert.equal(picture.sizes, '200px');
  h.flushFrame();
  assert.equal(h.stats.imageReads, 1);
});

test('blocked storage does not prevent input, commit, pagehide, or BFCache restore', (t) => {
  const h = setup(t, { blockedStorage: true });
  assert.doesNotThrow(() => {
    h.input(280);
    h.slider.emit('change');
    h.window.emit('pagehide');
    h.window.emit('pageshow', { persisted: true });
    h.flushFrame();
  });
  assert.equal(h.root.style.getPropertyValue('--collection-item-size'), '280px');
  assert.equal(h.slider.attributes.get('aria-valuetext'), '280ピクセル');
});
