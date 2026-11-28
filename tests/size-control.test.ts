import assert from 'node:assert/strict';
import test from 'node:test';
import { initSizeControl } from '../src/scripts/size-control';

test('image size is available only with visible items, including after a history restore', (t) => {
  const control = { hidden: true, dataset: {} };
  let visibleItem: object | null = null;
  const grid = {
    querySelector(selector: string) {
      assert.equal(selector, '[data-item]:not([hidden])');
      return visibleItem;
    },
  };
  const document = Object.assign(new EventTarget(), {
    querySelector: (selector: string) => (selector === '[data-size-control]' ? control : grid),
  });
  const window = new EventTarget();
  for (const [key, value] of Object.entries({ document, window })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }

  initSizeControl();
  assert.equal(control.hidden, true);
  visibleItem = {};
  document.dispatchEvent(new Event('picks:filter-change'));
  assert.equal(control.hidden, false);
  visibleItem = null;
  document.dispatchEvent(new Event('picks:filter-change'));
  assert.equal(control.hidden, true);
  visibleItem = {};
  window.dispatchEvent(new Event('pageshow'));
  assert.equal(control.hidden, false);
});
