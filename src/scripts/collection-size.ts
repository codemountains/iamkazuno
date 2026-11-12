import { collectionSize, mobileCollectionColumns, parseCollectionSize } from '../lib/collection-size';

export function initCollectionSize() {
  const gridElement = document.querySelector<HTMLElement>('[data-item-grid]');
  const range = document.querySelector<HTMLInputElement>('[data-size-range]');
  if (!gridElement || !range) return;
  const grid = gridElement;
  const slider = range;

  const root = document.documentElement;
  const mobile = window.matchMedia('(max-width: 600px)');
  const images = Array.from(grid.querySelectorAll<HTMLImageElement>('img'));
  const pictures = Array.from(grid.querySelectorAll<HTMLImageElement | HTMLSourceElement>('img, source'));
  const items = Array.from(grid.querySelectorAll<HTMLElement>('[data-item]'));
  let size = parseCollectionSize(root.style.getPropertyValue('--collection-item-size').replace('px', ''));

  function updateImageSizes() {
    const image = images.find((image) => image.getBoundingClientRect().width > 0);
    if (!image) return;
    const style = getComputedStyle(image);
    // 非表示カテゴリの画像にも設定し、次に表示されたときの候補を正しく選ばせる。
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const sizes = `${Math.max(1, Math.ceil(image.getBoundingClientRect().width - padding))}px`;
    for (const picture of pictures) {
      if (picture.sizes !== sizes) picture.sizes = sizes;
    }
  }

  function apply(value: string | number, save: boolean) {
    size = parseCollectionSize(value);
    // リサイズはwindow.resizeを起こさないため、絞り込みの残像を先に解除する。
    document.dispatchEvent(new Event('picks:resize'));
    const anchor = save ? items.find((item) => !item.hidden && item.getBoundingClientRect().bottom > 0) : undefined;
    const anchorTop = anchor?.getBoundingClientRect().top;
    root.style.setProperty('--collection-item-size', `${size}px`);
    const columns = mobileCollectionColumns(size);
    root.style.setProperty('--collection-mobile-columns', String(columns));
    slider.value = String(size);
    slider.style.setProperty('--size-progress', `${(size - collectionSize.min) / (collectionSize.max - collectionSize.min) * 100}%`);
    slider.setAttribute('aria-valuetext', mobile.matches ? `横に${columns}列` : `${size}ピクセル`);
    if (save) {
      try { sessionStorage.setItem(collectionSize.storageKey, String(size)); } catch { /* 保存不可でも調整できる。 */ }
    }
    updateImageSizes();
    if (anchor && anchorTop !== undefined) {
      // 並び直しで見ていた道具を見失わないよう、画面内の縦位置を保つ。
      window.scrollTo({ top: Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - anchorTop), behavior: 'instant' });
    }
  }

  // 戻り位置を計測するinitCollectionNavigation()より先にレイアウトを確定する。
  apply(size, false);
  slider.addEventListener('input', () => apply(slider.value, true));
  mobile.addEventListener('change', () => apply(size, false));
  new ResizeObserver(updateImageSizes).observe(grid);
  // bfcacheではその履歴のDOMとスクロール位置を保ち、配信幅だけ再確認する。
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      try { sessionStorage.setItem(collectionSize.storageKey, String(size)); } catch { /* 保存できなくても閲覧可能。 */ }
    }
    updateImageSizes();
  });
}
