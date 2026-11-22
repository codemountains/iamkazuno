import { collectionPath } from '../lib/paths';

interface ReturnPosition {
  listUrl: string;
  // 関連詳細を巡回しても、一覧で最初に開いた商品を復元対象にする。
  detailPath: string;
  scrollY: number;
  itemTop: number;
  restoreFocus?: boolean;
}

interface ReturnContext {
  position: ReturnPosition;
  currentDetailUrl: string;
}

interface DetailDeparture extends ReturnContext {
  fromUrl: string;
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

function parseDetailUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, 'https://picks.invalid');
    return url.origin === 'https://picks.invalid' && !url.hash && /^\/picks\/things\/[^/?#]+$/.test(url.pathname)
      ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

function parseReturnContext(value: unknown): ReturnContext | null {
  if (!value || typeof value !== 'object') return null;
  const context = value as Partial<ReturnContext>;
  const position = parseReturnPosition(context.position);
  const currentDetailUrl = parseDetailUrl(context.currentDetailUrl);
  return position && currentDetailUrl ? { position, currentDetailUrl } : null;
}

function parseDetailDeparture(value: unknown): DetailDeparture | null {
  const context = parseReturnContext(value);
  if (!context) return null;
  const fromUrl = (value as Partial<DetailDeparture>).fromUrl;
  if (typeof fromUrl !== 'string' || (fromUrl !== context.position.listUrl && parseDetailUrl(fromUrl) !== fromUrl)) return null;
  return { ...context, fromUrl };
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
  const currentDetailUrl = `${current.pathname}${current.search}`;
  if (options.navigationType === 'reload' || options.navigationType === 'back_forward') {
    const saved = parseReturnContext(options.saved);
    return saved?.currentDetailUrl === currentDetailUrl ? saved.position : null;
  }
  const pending = parseDetailDeparture(options.pending);
  return pending?.currentDetailUrl === currentDetailUrl && matchesReferrer(options.referrer, pending.fromUrl, current.origin)
    ? pending.position : null;
}

export function collectionReturnPosition(options: {
  pending: unknown;
  currentUrl: string;
  referrer: string;
}): ReturnPosition | null {
  const current = new URL(options.currentUrl);
  const pending = parseReturnContext(options.pending);
  return pending && pending.position.listUrl === `${current.pathname}${current.search}`
    && matchesReferrer(options.referrer, pending.currentDetailUrl, current.origin)
    ? pending.position : null;
}

function takeStoredPosition(key: string): unknown {
  try {
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function savePosition(key: string, position: ReturnContext | DetailDeparture) {
  try { sessionStorage.setItem(key, JSON.stringify(position)); } catch { /* 通常のリンク移動は維持する。 */ }
}

function isSameTabClick(event: MouseEvent, link: HTMLAnchorElement) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && (!link.target || link.target === '_self') && !link.hasAttribute('download');
}

// 候補から開くときも、一覧上のカードの位置を使って戻り先を記録する。
export function rememberCollectionDeparture(event: MouseEvent, cardLink: HTMLAnchorElement) {
  const item = cardLink.closest<HTMLElement>('[data-item]');
  if (!item || !isSameTabClick(event, cardLink)) return;
  const target = new URL(cardLink.href);
  const currentDetailUrl = parseDetailUrl(`${target.pathname}${target.search}`);
  if (target.origin !== window.location.origin || !currentDetailUrl) return;
  const listUrl = `${collectionPath}${window.location.search}`;
  const position = { listUrl, detailPath: target.pathname, scrollY: window.scrollY, itemTop: item.getBoundingClientRect().top };
  if (new URLSearchParams(window.location.search).get('q')?.trim()) {
    // 履歴移動で一覧が再生成された場合も、検索結果が戻った後に元の商品へ合わせる。
    history.replaceState({ ...history.state, [historyKey]: { ...position, restoreFocus: event.detail === 0 } }, '');
  }
  savePosition(departureKey, { position, currentDetailUrl, fromUrl: listUrl });
}

async function restorePosition(position: ReturnPosition, filtersReady?: Promise<void>) {
  const controller = new AbortController();
  for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'pagehide', 'popstate']) {
    window.addEventListener(type, () => controller.abort(), { once: true, passive: true, signal: controller.signal });
  }
  if (filtersReady) await filtersReady;
  if (controller.signal.aborted || position.listUrl !== `${collectionPath}${window.location.search}`) {
    controller.abort();
    return;
  }
  const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-item]:not([hidden]) .item-card-link'))
    .find((item) => new URL(item.href).pathname === position.detailPath);
  const item = link?.closest<HTMLElement>('[data-item]');
  const scroll = () => {
    const rect = item?.getBoundingClientRect();
    // 検索候補を選んだときは、対応するカードが画面外にある場合がある。
    if (position.restoreFocus && rect && (position.itemTop >= window.innerHeight || position.itemTop + rect.height <= 0)) {
      link?.scrollIntoView({ block: 'center', behavior: 'instant' });
      return;
    }
    const top = rect ? window.scrollY + rect.top - position.itemTop : position.scrollY;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  };
  if (position.restoreFocus) link?.focus({ preventScroll: true });
  scroll();

  // フォント確定で行の高さが変わった場合だけ補正。操作開始後は引き戻さない。
  void document.fonts.ready.then(() => requestAnimationFrame(() => {
    if (!controller.signal.aborted) scroll();
    controller.abort();
  }));
}

export function initCollectionNavigation(filtersReady?: Promise<void>) {
  const grid = document.querySelector<HTMLElement>('[data-item-grid]');
  if (!grid) return;
  if (window.location.hash === '#collection') {
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`);
  }

  takeStoredPosition(departureKey);
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const position = collectionReturnPosition({
    pending: takeStoredPosition(returnKey),
    currentUrl: window.location.href,
    referrer: document.referrer,
  }) ?? (navigation?.type === 'back_forward' ? parseReturnPosition(history.state?.[historyKey]) : null);
  if (position) void restorePosition(position, filtersReady);

  grid.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('.item-card-link');
    if (link) rememberCollectionDeparture(event, link);
  });

  window.addEventListener('pageshow', (event) => {
    // ブラウザの「戻る」ではネイティブの位置復元をそのまま使う。
    if (event.persisted) takeStoredPosition(departureKey);
  });
}

export function initDetailNavigation() {
  const link = document.querySelector<HTMLAnchorElement>('[data-back-to-picks]');
  if (!link) return;
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const position = detailReturnPosition({
    pending: takeStoredPosition(departureKey),
    saved: history.state?.[historyKey],
    navigationType: navigation?.type ?? 'navigate',
    currentUrl: window.location.href,
    referrer: document.referrer,
  });
  const currentDetailUrl = `${window.location.pathname}${window.location.search}`;
  // リロード・履歴移動時だけ、この詳細ページ自身の履歴に紐づく位置を再利用する。
  history.replaceState({ ...history.state, [historyKey]: position ? { position, currentDetailUrl } : null }, '');
  link.href = position?.listUrl ?? collectionPath;
  link.addEventListener('click', (event) => {
    if (!isSameTabClick(event, link)) return;
    takeStoredPosition(returnKey);
    // キーボード・支援技術によるクリックだけ、戻った商品へフォーカスを移す。
    if (position) savePosition(returnKey, {
      position: { ...position, restoreFocus: event.detail === 0 },
      currentDetailUrl,
    });
  });

  document.querySelector<HTMLElement>('[data-more-picks]')?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const relatedLink = event.target.closest<HTMLAnchorElement>('.item-card-link');
    if (!relatedLink || !isSameTabClick(event, relatedLink)) return;
    const target = new URL(relatedLink.href);
    const nextDetailUrl = parseDetailUrl(`${target.pathname}${target.search}`);
    if (target.origin !== window.location.origin || !nextDetailUrl) return;
    takeStoredPosition(departureKey);
    // 巡回先だけを更新し、一覧で最初に開いた商品とその位置は保持する。
    if (position) savePosition(departureKey, { position, currentDetailUrl: nextDetailUrl, fromUrl: currentDetailUrl });
  });

  window.addEventListener('pageshow', (event) => {
    // bfcacheでは初期化を再実行しないため、取消し・履歴移動で残った出発情報を破棄する。
    if (event.persisted) {
      takeStoredPosition(departureKey);
      takeStoredPosition(returnKey);
    }
  });
}
