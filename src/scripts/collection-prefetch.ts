interface Connection extends EventTarget {
  saveData?: boolean;
  effectiveType?: string;
}

const concurrency = 2;
const viewportDelay = 300;

export function initCollectionPrefetch(): void {
  const grid = document.querySelector<HTMLElement>('[data-item-grid]');
  if (!grid || typeof IntersectionObserver === 'undefined') return;

  const anchors = Array.from(grid.querySelectorAll<HTMLAnchorElement>('a[data-picks-prefetch]'));
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  const timers = new Map<HTMLAnchorElement, ReturnType<typeof setTimeout>>();
  const queued = new Map<HTMLAnchorElement, boolean>();
  const requested = new Set<string>();
  const active = new Set<AbortController>();
  let running = false;
  let pageActive = true;

  const slowConnection = () => Boolean(connection?.saveData || /2g/.test(connection?.effectiveType ?? ''));
  const isVisible = (anchor: HTMLAnchorElement) => {
    if (anchor.closest<HTMLElement>('[data-item]')?.hidden) return false;
    const rect = anchor.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
      && rect.right > 0 && rect.left < window.innerWidth;
  };

  function drain(): void {
    if (!running || document.visibilityState === 'hidden' || !navigator.onLine) return;
    const slow = slowConnection();
    for (const [anchor, intentional] of queued) {
      if (active.size >= concurrency) break;
      if (slow && !intentional) continue;
      queued.delete(anchor);
      const url = new URL(anchor.href, location.href);
      url.hash = '';
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)
        || requested.has(url.href)) {
        observer.unobserve(anchor);
        continue;
      }
      // Observerの通知より先に絞り込み・スクロールが発生した場合も再確認する。
      if (!isVisible(anchor)) continue;
      requested.add(url.href);
      observer.unobserve(anchor);
      const controller = new AbortController();
      active.add(controller);
      void (async () => {
        try {
          const response = await fetch(url.href, { priority: 'low', signal: controller.signal });
          // fetchの解決はヘッダー受信時。本文の転送終了まで同時数の枠を保持する。
          await response.arrayBuffer();
        } catch { /* 先読みの失敗は通常のページ遷移に影響させない。 */ }
        finally {
          active.delete(controller);
          if (controller.signal.aborted) {
            requested.delete(url.href);
            // bfcache復帰後に中断が完了した場合も、表示中なら再び候補にする。
            if (running) {
              observer.unobserve(anchor);
              observer.observe(anchor);
            }
          }
          drain();
        }
      })();
    }
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const anchor = entry.target as HTMLAnchorElement;
      clearTimeout(timers.get(anchor));
      timers.delete(anchor);
      if (running && entry.isIntersecting) {
        timers.set(anchor, setTimeout(() => {
          timers.delete(anchor);
          queued.set(anchor, false);
          drain();
        }, viewportDelay));
      } else queued.delete(anchor);
    }
  });

  function start(): void {
    if (running || !pageActive || document.readyState !== 'complete' || document.visibilityState === 'hidden') return;
    running = true;
    for (const anchor of anchors) observer.observe(anchor);
  }

  function stop(): void {
    running = false;
    observer.disconnect();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    queued.clear();
  }

  // 初期の画像取得を優先し、画面内に留まったカードを少しずつ先読みする。
  window.addEventListener('load', start, { once: true });
  window.addEventListener('online', drain);
  connection?.addEventListener('change', drain);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
    else start();
  });
  window.addEventListener('pagehide', () => {
    pageActive = false;
    stop();
    for (const controller of active) controller.abort();
  });
  window.addEventListener('pageshow', () => {
    pageActive = true;
    start();
  });
  grid.addEventListener('pointerdown', (event) => {
    // データ節約・低速回線では、従来どおり実際の押下時だけ先読みする。
    if (!slowConnection() || !(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>('a[data-picks-prefetch]');
    if (!anchor || !anchors.includes(anchor)) return;
    clearTimeout(timers.get(anchor));
    timers.delete(anchor);
    queued.set(anchor, true);
    drain();
  }, { passive: true });
  start();
}
