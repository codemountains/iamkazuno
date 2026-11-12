import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { initSizeControl } from '../src/scripts/size-control';

interface FakeEvent {
  target: unknown;
  relatedTarget?: unknown;
  pointerId?: number;
  isPrimary?: boolean;
  button?: number;
}

class Target {
  private listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  addEventListener(type: string, listener: (event: FakeEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: Partial<FakeEvent> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ target: this, ...event });
  }
}

class Element extends Target {
  hidden = false;
  dataset: Record<string, string> = {};
  attributes = new Set<string>();
  children: Element[] = [];
  contains(value: unknown) { return value === this || this.children.includes(value as Element); }
  toggleAttribute(name: string, present: boolean) {
    if (present) this.attributes.add(name);
    else this.attributes.delete(name);
  }
  querySelectorAll() { return this.children; }
}

function setup(t: TestContext, visible = true) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const control = new Element();
  control.hidden = true;
  const range = new Element();
  control.children.push(range);
  const item = new Element();
  item.hidden = !visible;
  const grid = new Element();
  grid.children.push(item);
  const document = Object.assign(new Target(), {
    activeElement: null as Element | null,
    querySelector: (selector: string) => selector === '[data-size-control]' ? control : grid,
  });
  const window = new Target();
  for (const [key, value] of Object.entries({ document, window })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (old) Object.defineProperty(globalThis, key, old);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  initSizeControl();
  return {
    control, range, item, document, window,
    faded: () => control.attributes.has('data-scroll-hidden'),
    pointerDown: (id = 1) => document.emit('pointerdown', { target: range, pointerId: id, isPrimary: true, button: 0 }),
    focus: () => { document.activeElement = range; control.emit('focusin', { target: range }); },
  };
}

test('scroll hides immediately and waits 400ms after the latest event to return', (t) => {
  const h = setup(t);
  assert.equal(h.control.hidden, false);
  h.document.emit('scroll');
  assert.equal(h.faded(), true);
  t.mock.timers.tick(399);
  assert.equal(h.faded(), true);
  h.document.emit('scroll');
  t.mock.timers.tick(399);
  assert.equal(h.faded(), true);
  t.mock.timers.tick(1);
  assert.equal(h.faded(), false);
});

test('pointer drag stays visible and release outside permits hiding despite retained focus', (t) => {
  const h = setup(t);
  h.pointerDown();
  h.focus();
  h.document.emit('scroll');
  assert.equal(h.faded(), false);
  h.document.emit('pointerup', { pointerId: 2 });
  assert.equal(h.faded(), false);
  h.document.emit('pointerup', { pointerId: 1 });
  assert.equal(h.faded(), true);
  t.mock.timers.tick(400);
  assert.equal(h.faded(), false);
  h.document.emit('scroll');
  assert.equal(h.faded(), true);
  assert.equal(h.document.activeElement, h.range);
});

test('Tab can reveal a scrolling-hidden slider and keyboard focus keeps it visible', (t) => {
  const h = setup(t);
  h.document.emit('scroll');
  assert.equal(h.faded(), true);
  h.document.emit('keydown');
  h.focus();
  assert.equal(h.faded(), false);
  assert.equal(h.control.hidden, false);
  h.document.emit('scroll');
  assert.equal(h.faded(), false);
  h.document.activeElement = null;
  h.control.emit('focusout', { relatedTarget: null });
  assert.equal(h.faded(), true);
});

test('pointer cancellation and window lifecycle never leave the control dragging or faded', (t) => {
  const h = setup(t);
  h.pointerDown();
  h.document.emit('scroll');
  h.document.emit('pointercancel', { pointerId: 1 });
  assert.equal(h.faded(), true);
  h.window.emit('blur');
  assert.equal(h.faded(), false);
  h.document.emit('scroll');
  assert.equal(h.faded(), true);
  h.window.emit('pageshow');
  assert.equal(h.faded(), false);
  h.document.emit('scroll');
  assert.equal(h.faded(), true);
  t.mock.timers.tick(400);
  assert.equal(h.faded(), false);
});

test('returning from another app restores keyboard focus protection without retaining pointer focus protection', (t) => {
  const h = setup(t);
  h.document.emit('keydown');
  h.focus();
  h.window.emit('blur');
  h.window.emit('focus');
  h.document.emit('scroll');
  assert.equal(h.faded(), false);

  h.pointerDown();
  h.document.emit('pointerup', { pointerId: 1 });
  h.window.emit('blur');
  h.window.emit('focus');
  h.document.emit('scroll');
  assert.equal(h.document.activeElement, h.range);
  assert.equal(h.faded(), true);
});

test('empty initial results and filter changes toggle availability, including BFCache restore', (t) => {
  const h = setup(t, false);
  assert.equal(h.control.hidden, true);
  h.item.hidden = false;
  h.document.emit('picks:filter-change');
  assert.equal(h.control.hidden, false);
  h.pointerDown();
  h.document.emit('scroll');
  h.item.hidden = true;
  h.document.emit('picks:filter-change');
  assert.equal(h.control.hidden, true);
  h.item.hidden = false;
  h.window.emit('pageshow');
  assert.equal(h.control.hidden, false);
  assert.equal(h.faded(), false);
  h.document.emit('scroll');
  assert.equal(h.faded(), true);
});
