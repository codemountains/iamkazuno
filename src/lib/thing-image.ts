import type { PickImage } from '../types/content';

interface ThingImageSources {
  src: string;
  avifSrcset: string;
  webpSrcset: string;
}

// The width descriptors represent output pixels; the browser applies the device DPR.
export function getThingImageSources(image: PickImage, detail = false): ThingImageSources | null {
  let original: URL;
  try {
    original = new URL(image.url);
  } catch {
    return null;
  }
  if (original.hostname !== 'images.microcms-assets.io' || /\.svgz?$/i.test(original.pathname)) return null;

  const candidates = detail ? [480, 640, 960, 1280] : [80, 120, 160, 240, 320, 400, 480, 640, 960];
  const widths = [...new Set(candidates.map((width) => Math.min(width, image.width)))];
  // 一覧の転送量を抑え、詳細では細部を確認できる品質を維持する。
  const quality = detail ? 85 : 80;
  const imageAt = (width: number, format: 'avif' | 'webp') => {
    const url = new URL(original);
    url.searchParams.set('w', String(width));
    url.searchParams.set('fm', format);
    url.searchParams.set('q', String(quality));
    // Do not multiply an already explicit output width a second time.
    url.searchParams.delete('dpr');
    return url.href;
  };
  const srcset = (format: 'avif' | 'webp') => widths.map((width) => `${imageAt(width, format)} ${width}w`).join(', ');

  return {
    src: imageAt(Math.min(detail ? 960 : 640, image.width), 'webp'),
    avifSrcset: srcset('avif'),
    webpSrcset: srcset('webp'),
  };
}
