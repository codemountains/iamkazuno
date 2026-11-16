import { collectionSize, parseCollectionSize } from '../lib/collection-size';
import { mobileCollectionImageSizes, type CollectionPreloadEntry } from '../lib/collection-image-preload';
import { getThingImageSources } from '../lib/thing-image';

// CSSとカードの解析を待たず、実際のカテゴリ・保存サイズに合う画像を取得する。
// PCはスクロールバーなどによる幅の差を避け、既存の実幅計測に任せる。
if (window.matchMedia('(max-width: 600px) and (pointer: coarse)').matches) {
  const script = document.currentScript as HTMLScriptElement | null;
  const entries = new Map<string, CollectionPreloadEntry[1]>(JSON.parse(script?.dataset.images ?? '[]'));
  const category = new URLSearchParams(location.search).get('category') ?? '';
  const image = entries.get(entries.has(category) ? category : '');
  if (image) {
    let size: number = collectionSize.initial;
    try { size = parseCollectionSize(sessionStorage.getItem(collectionSize.storageKey)); } catch { /* 既定サイズを使う。 */ }
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.fetchPriority = 'high';
    link.dataset.collectionPreload = '';
    const sources = getThingImageSources(image);
    if (sources) {
      // 未対応ブラウザには別サイズを先読みさせず、通常のpicture選択を使う。
      link.type = 'image/avif';
      link.imageSizes = mobileCollectionImageSizes(window.innerWidth, size);
      link.imageSrcset = sources.avifSrcset;
    } else {
      link.href = image.url;
    }
    document.head.append(link);
  }
}
