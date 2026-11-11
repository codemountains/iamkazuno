export const collectionSize = {
  min: 88,
  max: 280,
  step: 8,
  initial: 160,
  mobileInitial: 136,
  storageKey: 'picks:image-size',
} as const;

export function parseCollectionSize(value: unknown): number {
  const size = typeof value === 'string' ? Number(value) : value;
  return typeof size === 'number' && Number.isInteger(size)
    && size >= collectionSize.min && size <= collectionSize.max
    && (size - collectionSize.min) % collectionSize.step === 0
    ? size : collectionSize.initial;
}

// auto-fill の空きトラックも含め、絞り込み後も同じカード幅を保つ。
export function collectionCardWidth(availableWidth: number, minimum: number, gap: number): number {
  const columns = Math.max(1, Math.floor((availableWidth + gap) / (minimum + gap)));
  return Math.max(0, (availableWidth - gap * (columns - 1)) / columns);
}
