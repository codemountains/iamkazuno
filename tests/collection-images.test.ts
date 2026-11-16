import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { bundleInlineScript } from '../build/bundle-inline-script.mjs';

const script = await bundleInlineScript('src/scripts/collection-images.ts');

function load(url: string, withSource: boolean) {
  const writes: string[] = [];
  const source = { sizes: '', srcset: '' };
  const picture = { querySelectorAll: () => withSource ? [source] : [] };
  const image = {
    dataset: { imageSrc: url } as Record<string, string>,
    sizes: 'auto, 240px',
    srcset: '',
    src: 'data:image/gif;base64,placeholder',
    loading: 'lazy',
    fetchPriority: 'auto',
    // HTMLImageElement.width is the rendered width, not the original image width.
    width: 119,
    classList: { contains: () => false },
    getAttribute: (name: string) => name === 'width' ? '1280' : null,
    getBoundingClientRect: () => ({ width: 119, top: 181, bottom: 308 }),
    closest(selector: string): unknown { return selector === 'picture' ? picture : item; },
  };
  const item = {
    hidden: false,
    dataset: { categoryKeys: 'mountain' },
    querySelector: () => image,
  };
  function track<T extends object, K extends keyof T>(name: string, target: T, property: K) {
    let value = target[property];
    Object.defineProperty(target, property, {
      get: () => value,
      set: (next: T[K]) => { value = next; writes.push(name); },
    });
  }
  track('image sizes', image, 'sizes');
  track('source sizes', source, 'sizes');
  track('AVIF', source, 'srcset');
  track('WebP', image, 'srcset');
  track('fallback', image, 'src');
  const grid = {
    matches: () => true,
    querySelectorAll(selector: string) {
      if (selector === '[data-item]') return [item];
      return image.dataset.imageSrc ? [image] : [];
    },
  };
  let discover!: () => void;
  runInNewContext(script, {
    URL, URLSearchParams,
    location: { search: '' },
    innerHeight: 823,
    getComputedStyle: () => ({ paddingLeft: '10px', paddingRight: '10px' }),
    document: {
      currentScript: { parentElement: grid },
      querySelectorAll: () => [{ dataset: { filter: '' } }],
      addEventListener() {},
    },
    window: { addEventListener() {} },
    MutationObserver: class {
      constructor(callback: () => void) { discover = callback; }
      observe() {}
    },
  });
  discover();
  return { image, source, writes };
}

test('bundled inline image loader derives responsive sources from original metadata before fallback', () => {
  const { image, source, writes } = load('https://images.microcms-assets.io/assets/product.png?dpr=3', true);
  assert.equal(image.sizes, '99px');
  assert.equal(source.sizes, '99px');
  assert.equal(image.loading, 'eager');
  assert.equal(image.fetchPriority, 'high');
  assert.equal(image.dataset.imageSrc, undefined);
  assert.deepEqual(writes, ['image sizes', 'source sizes', 'AVIF', 'WebP', 'fallback']);
  for (const [srcset, format] of [[source.srcset, 'avif'], [image.srcset, 'webp']]) {
    const candidates = srcset.split(', ').map((candidate) => candidate.split(' '));
    assert.deepEqual(candidates.map(([, width]) => width), ['80w', '120w', '160w', '240w', '320w', '400w', '480w', '640w', '960w']);
    assert.ok(candidates.every(([url]) => new URL(url).searchParams.get('fm') === format));
    assert.ok(candidates.every(([url]) => !new URL(url).searchParams.has('dpr')));
  }
  assert.equal(new URL(image.src).searchParams.get('w'), '640');
  assert.equal(new URL(image.src).searchParams.get('q'), '80');
});

test('bundled inline image loader retains local and unsupported original URLs', () => {
  for (const url of ['/images/samples/sample.svg', 'https://example.com/product.png']) {
    const { image, writes } = load(url, false);
    assert.equal(image.src, url);
    assert.equal(image.srcset, '');
    assert.equal(image.dataset.imageSrc, undefined);
    assert.deepEqual(writes, ['image sizes', 'fallback']);
  }
});
