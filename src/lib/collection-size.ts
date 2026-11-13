export const collectionSize = {
  min: 88,
  max: 280,
  step: 8,
  initial: 240,
  storageKey: 'picks:image-size',
} as const;

export function parseCollectionSize(value: unknown): number {
  const size = typeof value === 'string' ? Number(value) : value;
  return typeof size === 'number' && Number.isInteger(size)
    && size >= collectionSize.min && size <= collectionSize.max
    && (size - collectionSize.min) % collectionSize.step === 0
    ? size : collectionSize.initial;
}

// モバイルはスライダーの左端6列・中央3列・右端1列。保存値とPCの範囲は共通。
export function mobileCollectionColumns(size: number): number {
  const progress = (size - collectionSize.min) / (collectionSize.max - collectionSize.min);
  return Math.round(progress <= 0.5 ? 6 - progress * 6 : 5 - progress * 4);
}
