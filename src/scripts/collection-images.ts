import { getThingImageSources } from '../lib/thing-image';

(() => {
  const gridElement = document.currentScript?.parentElement;
  if (!gridElement?.matches('[data-item-grid]')) return;
  const grid = gridElement;

  const margin = 240;
  const pending = new Set<HTMLImageElement>();
  const observed = new WeakSet<HTMLImageElement>();
  let frame: number | undefined;
  let adjusting = false;
  let awaitingFilters = Boolean(new URLSearchParams(location.search).get('q')?.trim());

  function categoryKey() {
    const requested = new URLSearchParams(location.search).get('category') || '';
    const valid = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter]')).some(
      (button) => button.dataset.filter === requested,
    );
    return valid ? encodeURIComponent(requested) : '';
  }

  function matchesCategory(image: HTMLImageElement, key: string) {
    const item = image.closest<HTMLElement>('[data-item]');
    return item && !item.hidden && (!key || item.dataset.categoryKeys?.split(' ').includes(key));
  }

  function loadImages(images: HTMLImageElement[], priority = false, nearbyOnly = true) {
    if (awaitingFilters || grid.ariaBusy === 'true') return;
    const key = categoryKey();
    // 交差通知の後にカテゴリや位置が変わることもあるため、読み込み直前に再確認する。
    const ready = images.filter((image) => {
      if (!image.dataset.imageSrc || !matchesCategory(image, key)) return false;
      const rect = image.getBoundingClientRect();
      return (
        rect.width > 0 &&
        (!nearbyOnly || (rect.bottom > -margin && rect.top < innerHeight + margin))
      );
    });
    if (!ready.length) return;

    // 操作中に現れた画像も取得し、モバイルでは確定まで既存の配信幅を共有する。
    // 操作していないときは実幅を測り、srcsetの有効化前に配信サイズを確定する。
    const first = ready[0];
    let sizes = first.sizes;
    if (!adjusting || !/^\d+px$/.test(sizes)) {
      const style = getComputedStyle(first);
      sizes = `${Math.max(1, Math.ceil(first.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)))}px`;
    }
    for (const image of ready) {
      const original = image.dataset.imageSrc!;
      // widthプロパティは表示幅を返すため、元画像幅を保持したHTML属性を使う。
      const variants = getThingImageSources(
        { url: original, width: Number(image.getAttribute('width')) },
        image.classList.contains('detail-image'),
      );
      image.sizes = sizes;
      image.loading = 'eager';
      image.fetchPriority = priority ? 'high' : 'auto';
      const sources = image.closest('picture')?.querySelectorAll('source') ?? [];
      for (const source of sources) source.sizes = sizes;
      // AVIFを先に有効化し、fallbackのWebPを余分に取得しない。
      if (variants) {
        for (const source of sources) source.srcset = variants.avifSrcset;
        image.srcset = variants.webpSrcset;
      }
      image.src = variants?.src ?? original;
      delete image.dataset.imageSrc;
      pending.delete(image);
      observer?.unobserve(image);
    }
  }

  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            loadImages(
              entries
                .filter((entry) => entry.isIntersecting)
                .map((entry) => entry.target as HTMLImageElement),
            );
          },
          { rootMargin: `${margin}px 0px` },
        );

  function discover() {
    const key = categoryKey();
    // HTMLの解析中から先頭4カードを優先し、全件の解析や外部moduleを待たない。
    const firstCards = Array.from(grid.querySelectorAll<HTMLElement>('[data-item]'))
      .filter(
        (item) => !item.hidden && (!key || item.dataset.categoryKeys?.split(' ').includes(key)),
      )
      .slice(0, 4);
    loadImages(
      firstCards
        .map((item) => item.querySelector<HTMLImageElement>('[data-collection-image]'))
        .filter((image): image is HTMLImageElement => image !== null),
      true,
      false,
    );
    for (const image of grid.querySelectorAll<HTMLImageElement>(
      '[data-collection-image][data-image-src]',
    )) {
      pending.add(image);
      if (observer && !observed.has(image)) {
        observed.add(image);
        observer.observe(image);
      }
    }
    if (!observer) loadImages(Array.from(pending), false, false);
  }

  function refresh() {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      loadImages(Array.from(pending), false, Boolean(observer));
    });
  }

  const parser = new MutationObserver(discover);
  parser.observe(grid, { childList: true, subtree: true });
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      // 初期検索中は aria-busy で待つ。操作用 module が失敗しても一覧の画像は読み込む。
      awaitingFilters = false;
      parser.disconnect();
      discover();
      refresh();
    },
    { once: true },
  );
  document.addEventListener('picks:filter-change', refresh);
  document.addEventListener('picks:resize', refresh);
  document.addEventListener('picks:size-start', () => {
    adjusting = true;
  });
  document.addEventListener('picks:size-end', () => {
    adjusting = false;
    refresh();
  });
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('pageshow', refresh);
})();
