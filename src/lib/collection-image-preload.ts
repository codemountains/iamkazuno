import { mobileCollectionColumns } from './collection-size';
import type { Category, Thing } from '../types/content';

export type CollectionPreloadImage = { url: string; width: number };
export type CollectionPreloadEntry = [string, CollectionPreloadImage | null];

export function getCollectionPreloadEntries(things: Thing[], categories: Category[]): CollectionPreloadEntry[] {
  return ['', ...categories.map((category) => category.id)].map((category) => {
    const image = things.find((thing) => thing.image && (!category
      || thing.categories.some((entry) => entry.id === category)))?.image;
    return [category, image ? { url: image.url, width: image.width } : null];
  });
}

// global.css のモバイル一覧幅・列間・画像paddingと一致させる。
// 初期の取得だけに使い、描画後やサイズ変更時は実幅の計測を使う。
export function mobileCollectionImageSizes(viewportWidth: number, size: number): string {
  const columns = mobileCollectionColumns(size);
  const gap = Math.min(12, Math.max(6, 18 - columns * 2));
  const cardWidth = (viewportWidth - 32 - gap * (columns - 1)) / columns;
  const padding = cardWidth < 88 ? 10 : 20;
  return `${Math.max(1, Math.ceil(cardWidth - padding))}px`;
}
