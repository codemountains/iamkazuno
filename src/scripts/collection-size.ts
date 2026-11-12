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
  const gridStyle = getComputedStyle(grid);
  const columnGap = parseFloat(gridStyle.getPropertyValue('--collection-column-gap'));
  const maxColumns = parseInt(gridStyle.getPropertyValue('--collection-max-columns'), 10);
  let gridWidth = grid.getBoundingClientRect().width;
  let gridWidthDirty = false;
  let size = parseCollectionSize(root.style.getPropertyValue('--collection-item-size').replace('px', ''));
  let layoutInitialized = false;
  let mobileLayout = mobile.matches;
  let pendingSize: number | undefined;
  let frame: number | undefined;
  let imageSizesPending = false;
  let lastImageSizes: string | undefined;
  let adjusting = false;
  let unsaved = false;

  function layoutColumns(value: number) {
    if (mobile.matches) return mobileCollectionColumns(value);
    // 幅が未確定なら省略せず、従来どおりサイズ変更として扱う。
    if (!(gridWidth > 0 && columnGap >= 0 && maxColumns > 0)) return value;
    return Math.max(1, Math.min(maxColumns, Math.floor((gridWidth + columnGap) / (value + columnGap))));
  }

  function updateImageSizes() {
    for (const image of images) {
      const width = image.getBoundingClientRect().width;
      if (width <= 0) continue;
      const style = getComputedStyle(image);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const sizes = `${Math.max(1, Math.ceil(width - padding))}px`;
      // 同じ配信幅なら、非表示画像を含む全要素の確認も省く。
      if (sizes === lastImageSizes) return;
      for (const picture of pictures) {
        if (picture.sizes !== sizes) picture.sizes = sizes;
      }
      lastImageSizes = sizes;
      return;
    }
  }

  function syncItemSize() {
    if (root.style.getPropertyValue('--collection-item-size') !== `${size}px`) {
      root.style.setProperty('--collection-item-size', `${size}px`);
    }
  }

  function apply(value: number, preservePosition: boolean) {
    // 旧値も最新の幅で評価し、ウィンドウ変更前の列数との比較を避ける。
    const previousColumns = layoutColumns(size);
    size = parseCollectionSize(value);
    const columns = mobileCollectionColumns(size);
    const layoutChanged = !layoutInitialized || previousColumns !== layoutColumns(size) || mobileLayout !== mobile.matches;
    let anchor: HTMLElement | undefined;
    let anchorTop = 0;
    if (layoutChanged) {
      // リサイズはwindow.resizeを起こさないため、位置計測より先に残像を解除する。
      document.dispatchEvent(new Event('picks:resize'));
      if (preservePosition) {
        let firstVisibleItem = true;
        for (const item of items) {
          if (item.hidden) continue;
          const rect = item.getBoundingClientRect();
          if (rect.bottom <= 0) {
            firstVisibleItem = false;
            continue;
          }
          // 先頭カードの上端は列数で動かない。更新後の同期計測を省く。
          if (!firstVisibleItem) {
            anchor = item;
            anchorTop = rect.top;
          }
          break;
        }
      }
    }
    // モバイルの描画に使うのは列数だけ。未使用の継承変数で全体を再評価させない。
    if (!mobile.matches) syncItemSize();
    if (root.style.getPropertyValue('--collection-mobile-columns') !== String(columns)) {
      root.style.setProperty('--collection-mobile-columns', String(columns));
    }
    slider.value = String(size);
    slider.style.setProperty('--size-progress', `${(size - collectionSize.min) / (collectionSize.max - collectionSize.min) * 100}%`);
    slider.setAttribute('aria-valuetext', mobile.matches ? `横に${columns}列` : `${size}ピクセル`);
    // 同じ幅・列数ならカード幅も同じ。PCの18列上限中も計測と位置補正を省く。
    if (!layoutChanged) return;
    layoutInitialized = true;
    mobileLayout = mobile.matches;
    imageSizesPending = true;
    if (anchor) {
      // 並び直しで見ていた道具を見失わないよう、画面内の縦位置を保つ。
      window.scrollTo({ top: Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - anchorTop), behavior: 'instant' });
    }
  }

  function flush(preservePosition = true) {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    if (gridWidthDirty) {
      const nextWidth = grid.getBoundingClientRect().width;
      imageSizesPending ||= gridWidth !== nextWidth;
      gridWidth = nextWidth;
      gridWidthDirty = false;
    }
    const value = pendingSize;
    pendingSize = undefined;
    if (value !== undefined) apply(value, preservePosition);
    // モバイル操作中は計測も画像候補の更新も確定まで保留する。
    // 列数変更で発火するResizeObserverからも同じ保留を維持する。
    if (imageSizesPending && !(mobile.matches && adjusting)) {
      imageSizesPending = false;
      updateImageSizes();
    }
  }

  function schedule() {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      flush();
    });
  }

  function saveSize() {
    try {
      sessionStorage.setItem(collectionSize.storageKey, String(size));
      unsaved = false;
    } catch { /* 保存不可でも調整できる。 */ }
  }

  function commit() {
    adjusting = false;
    flush();
    syncItemSize();
    if (unsaved) saveSize();
  }

  // 戻り位置を計測するinitCollectionNavigation()より先にレイアウトを確定する。
  pendingSize = size;
  flush(false);
  slider.addEventListener('input', () => {
    pendingSize = parseCollectionSize(slider.value);
    adjusting = true;
    unsaved = true;
    schedule();
  });
  slider.addEventListener('change', () => {
    pendingSize = parseCollectionSize(slider.value);
    unsaved ||= pendingSize !== size;
    commit();
  });
  slider.addEventListener('blur', commit);
  slider.addEventListener('pointercancel', commit);
  slider.addEventListener('lostpointercapture', commit);
  window.addEventListener('pagehide', commit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') commit();
  });
  mobile.addEventListener('change', () => {
    // 画面幅が変わっても、直前のinputを以前の値で上書きしない。
    gridWidthDirty = true;
    pendingSize ??= size;
    flush(false);
  });
  // ResizeObserver通知より先に入力のrAFが走る場合だけ、最新幅を取り直す。
  window.addEventListener('resize', () => { gridWidthDirty = true; }, { passive: true });
  new ResizeObserver(([entry]) => {
    if (entry) {
      gridWidth = entry.contentRect.width;
      gridWidthDirty = false;
    }
    imageSizesPending = true;
    schedule();
  }).observe(grid);
  // bfcacheでは履歴のサイズとスクロール位置を保ち、表示モードと配信幅を再確認する。
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      gridWidthDirty = true;
      // 履歴の保存中に表示モードが変わった場合も、このDOMの値を適用する。
      pendingSize ??= size;
      saveSize();
    }
    imageSizesPending = true;
    if (event.persisted) flush(false);
    else schedule();
  });
}
