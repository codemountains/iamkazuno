import { collectionPath } from '../lib/paths';

interface ReturnPosition {
  listUrl: string;
  detailPath: string;
  scrollY: number;
  itemTop: number;
  restoreFocus?: boolean;
}

const departureKey = 'picks:detail-departure';
const returnKey = 'picks:list-return';
const historyKey = 'picksReturnPosition';

export function parseReturnPosition(value: unknown): ReturnPosition | null {
  if (!value || typeof value !== 'object') return null;
  const position = value as Partial<ReturnPosition>;
  if (typeof position.listUrl !== 'string' || typeof position.detailPath !== 'string'
    || typeof position.scrollY !== 'number' || !Number.isFinite(position.scrollY) || position.scrollY < 0
    || typeof position.itemTop !== 'number' || !Number.isFinite(position.itemTop)) return null;
  try {
    const url = new URL(position.listUrl, 'https://picks.invalid');
    if (url.origin !== 'https://picks.invalid' || url.pathname !== collectionPath || url.hash
      || !/^\/picks\/things\/[^/?#]+$/.test(position.detailPath)) return null;
    return {
      listUrl: `${url.pathname}${url.search}`,
      detailPath: position.detailPath,
      scrollY: position.scrollY,
      itemTop: position.itemTop,
      ...(typeof position.restoreFocus === 'boolean' ? { restoreFocus: position.restoreFocus } : {}),
    };
  } catch {
    return null;
  }
}

function matchesReferrer(referrer: string, path: string, origin: string) {
  try {
    const url = new URL(referrer);
    return url.origin === origin && `${url.pathname.replace(/\/$/, '')}${url.search}` === path;
  } catch {
    return false;
  }
}

export function detailReturnPosition(options: {
  pending: unknown;
  saved: unknown;
  navigationType: string;
  currentUrl: string;
  referrer: string;
}): ReturnPosition | null {
  const current = new URL(options.currentUrl);
  if (options.navigationType === 'reload' || options.navigationType === 'back_forward') {
    const saved = parseReturnPosition(options.saved);
    return saved?.detailPath === current.pathname ? saved : null;
  }
  const pending = parseReturnPosition(options.pending);
  return pending?.detailPath === current.pathname && matchesReferrer(options.referrer, pending.listUrl, current.origin)
    ? pending : null;
}

function takePosition(key: string) {
  try {
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return value ? parseReturnPosition(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

function savePosition(key: string, position: ReturnPosition) {
  try { sessionStorage.setItem(key, JSON.stringify(position)); } catch { /* 通常のリンク移動は維持する。 */ }
}

function isSameTabClick(event: MouseEvent, link: HTMLAnchorElement) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && (!link.target || link.target === '_self') && !link.hasAttribute('download');
}

function restorePosition(position: ReturnPosition) {
  const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-item]:not([hidden]) .item-card-link'))
    .find((item) => new URL(item.href).pathname === position.detailPath);
  const item = link?.closest<HTMLElement>('[data-item]');
  const scroll = () => {
    const top = item ? window.scrollY + item.getBoundingClientRect().top - position.itemTop : position.scrollY;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  };
  if (position.restoreFocus) link?.focus({ preventScroll: true });
  scroll();

  // フォント確定で行の高さが変わった場合だけ補正。操作開始後は引き戻さない。
  const controller = new AbortController();
  for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'pagehide']) {
    window.addEventListener(type, () => controller.abort(), { once: true, passive: true, signal: controller.signal });
  }
  void document.fonts.ready.then(() => requestAnimationFrame(() => {
    if (!controller.signal.aborted) scroll();
    controller.abort();
  }));
}

// initFilters()の初期適用後に呼び、絞り込んだレイアウトで位置を復元する。
export function initCollectionNavigation() {
  const grid = document.querySelector<HTMLElement>('[data-item-grid]');
  if (!grid) return;
  if (window.location.hash === '#collection') {
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`);
  }

  takePosition(departureKey);
  const pending = takePosition(returnKey);
  if (pending && pending.listUrl === `${window.location.pathname}${window.location.search}`
    && matchesReferrer(document.referrer, pending.detailPath, window.location.origin)) {
    restorePosition(pending);
  }

  grid.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('.item-card-link');
    const item = link?.closest<HTMLElement>('[data-item]');
    if (!link || !item || !isSameTabClick(event, link)) return;
    const target = new URL(link.href);
    if (target.origin !== window.location.origin) return;
    savePosition(departureKey, {
      listUrl: `${collectionPath}${window.location.search}`,
      detailPath: target.pathname,
      scrollY: window.scrollY,
      itemTop: item.getBoundingClientRect().top,
    });
  });

  window.addEventListener('pageshow', (event) => {
    // ブラウザの「戻る」ではネイティブの位置復元をそのまま使う。
    if (event.persisted) takePosition(departureKey);
  });
}

export function initDetailNavigation() {
  const link = document.querySelector<HTMLAnchorElement>('[data-back-to-picks]');
  if (!link) return;
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const position = detailReturnPosition({
    pending: takePosition(departureKey),
    saved: history.state?.[historyKey],
    navigationType: navigation?.type ?? 'navigate',
    currentUrl: window.location.href,
    referrer: document.referrer,
  });
  // リロード・履歴移動時だけ、この詳細ページ自身の履歴に紐づく位置を再利用する。
  history.replaceState({ ...history.state, [historyKey]: position }, '');
  link.href = position?.listUrl ?? collectionPath;
  link.addEventListener('click', (event) => {
    if (!isSameTabClick(event, link)) return;
    takePosition(returnKey);
    // キーボード・支援技術によるクリックだけ、戻った商品へフォーカスを移す。
    if (position) savePosition(returnKey, { ...position, restoreFocus: event.detail === 0 });
  });
}
