import assert from 'node:assert/strict';
import test from 'node:test';
import { getThingImageSources } from '../src/lib/thing-image';
import type { PickImage } from '../src/types/content';

const image: PickImage = {
  url: 'https://images.microcms-assets.io/assets/service/image/product.png',
  width: 1280,
  height: 1280,
};

function candidates(srcset: string) {
  return srcset.split(', ').map((candidate) => {
    const [url, descriptor] = candidate.split(' ');
    return { url: new URL(url), width: Number(descriptor.slice(0, -1)) };
  });
}

test('AVIF and WebP offer matching widths, including small cards, without density multiplication', () => {
  const sources = getThingImageSources({ ...image, url: `${image.url}?dpr=3&w=2000&fm=jpg&q=10` });
  assert.ok(sources);
  const avif = candidates(sources.avifSrcset);
  const webp = candidates(sources.webpSrcset);
  assert.deepEqual(avif.map(({ width }) => width), webp.map(({ width }) => width));
  assert.ok(avif.some(({ width }) => width === 160));
  assert.ok(avif.some(({ width }) => width === 240));
  for (const [format, variants] of [['avif', avif], ['webp', webp]] as const) {
    for (const { url, width } of variants) {
      assert.equal(Number(url.searchParams.get('w')), width);
      assert.equal(url.searchParams.get('fm'), format);
      assert.equal(url.searchParams.get('q'), '85');
      assert.equal(url.searchParams.has('dpr'), false);
    }
  }
  assert.equal(new URL(sources.src).searchParams.get('fm'), 'webp');
});

test('small originals remain available at their full width without duplicate or upscaled candidates', () => {
  for (const width of [80, 160, 200, 320, 1254]) {
    for (const detail of [false, true]) {
      const sources = getThingImageSources({ ...image, width }, detail);
      assert.ok(sources);
      const variants = candidates(sources.avifSrcset);
      const widths = variants.map((candidate) => candidate.width);
      assert.ok(widths.length > 0);
      assert.equal(widths.length, new Set(widths).size);
      assert.ok(widths.every((candidateWidth) => candidateWidth <= width));
      assert.equal(widths.at(-1), Math.min(width, detail ? 1280 : 960));
      assert.ok(Number(new URL(sources.src).searchParams.get('w')) <= width);
    }
  }
});

test('local images, external hosts and SVGs bypass the microCMS image API', () => {
  for (const url of [
    '/images/samples/camera.svg',
    'https://example.com/product.png',
    'https://images.microcms-assets.io.example.com/product.png',
    'https://images.microcms-assets.io/assets/product.svg',
    'https://images.microcms-assets.io/assets/product.SVG?download=1',
  ]) {
    assert.equal(getThingImageSources({ ...image, url }), null);
  }
});
