import { normalizeSearchQuery, type PickSearchHit } from '../lib/picks-search';
import { initFilterScroll } from './filter-scroll';
import { initFilterMotion } from './filter-motion';
import { searchPicks } from './pagefind-search';
import { initSearchSuggestions } from './picks-search-suggestions';

export function initFilters(search = searchPicks): Promise<void> | undefined {
  const filterGroup = document.querySelector<HTMLElement>('[data-filters]');
  const itemGrid = document.querySelector<HTMLElement>('[data-item-grid]');
  if (!filterGroup || !itemGrid) return;
  const controls = filterGroup;
  const grid = itemGrid;

  const buttons = Array.from(controls.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const badges = buttons.map((button) => ({
    category: button.dataset.filter ?? '',
    label: button.querySelector<HTMLElement>('.filter-count')!,
  }));
  const items = Array.from(grid.querySelectorAll<HTMLElement>('[data-item]'));
  const categories = new Map(items.map((item) => [item, JSON.parse(item.dataset.categories ?? '[]') as string[]]));
  const itemsByPath = new Map(items.map((item) => [item.querySelector<HTMLAnchorElement>('.item-card-link')?.pathname, item]));
  const input = document.querySelector<HTMLInputElement>('[data-picks-search]');
  const clear = document.querySelector<HTMLButtonElement>('[data-picks-search-clear]');
  const suggestions = document.querySelector<HTMLElement>('[data-picks-suggestions]');
  const updateSuggestions = input && suggestions ? initSearchSuggestions(input, suggestions) : undefined;
  const prefix = document.querySelector<HTMLElement>('[data-count-prefix]');
  const count = document.querySelector<HTMLElement>('[data-result-count]');
  const suffix = document.querySelector<HTMLElement>('[data-count-suffix]');
  const empty = document.querySelector<HTMLElement>('[data-empty-state]');
  const emptyMessage = document.querySelector<HTMLElement>('[data-empty-message]');
  const searchAll = document.querySelector<HTMLButtonElement>('[data-search-all-categories]');
  const error = document.querySelector<HTMLElement>('[data-search-error]');
  const retry = document.querySelector<HTMLButtonElement>('[data-search-retry]');
  const filterScroll = initFilterScroll(controls);
  const motion = initFilterMotion(grid, items);
  let resolveInitialSearch: (() => void) | undefined;
  let selected: HTMLButtonElement;
  let term = '';
  let revision = 0;
  let focusResultAfterSearch = false;
  let ranked: Set<HTMLElement> | undefined;
  let hits = new Map<string, PickSearchHit>();

  function firstSearchResult() {
    return ranked && grid.querySelector<HTMLAnchorElement>('[data-item]:not([hidden]) .item-card-link');
  }

  function notify() {
    document.dispatchEvent(new Event('picks:filter-change'));
    if (resolveInitialSearch && !grid.hasAttribute('aria-busy')) {
      resolveInitialSearch();
      resolveInitialSearch = undefined;
    }
  }

  function showCount(visible?: number) {
    const category = selected.dataset.filter;
    const mode = visible === undefined ? 'pending' : ranked ? 'matches' : 'total';
    if (controls.dataset.counts !== mode) {
      controls.dataset.counts = mode;
      // 検索時はバッジの桁数や表示が変わるため、選択中のカテゴリの横位置も合わせる。
      filterScroll.reveal(selected);
    }
    if (prefix) prefix.textContent = visible !== undefined && category ? `${selected.dataset.filterLabel} — ` : '';
    if (count) count.textContent = visible === undefined ? 'Searching…' : `${String(visible).padStart(2, '0')} things`;
    if (suffix) suffix.textContent = visible !== undefined && !category && !ranked ? ', well loved.' : '';
  }

  function select(button: HTMLButtonElement, prepared = false) {
    if (button === selected) return false;
    selected = button;
    if (!prepared) {
      for (const option of buttons) option.setAttribute('aria-pressed', String(option === selected));
    }
    filterScroll.reveal(selected);
    return true;
  }

  function render(animate: boolean, pointerType = '', order?: Iterable<HTMLElement>) {
    const category = selected.dataset.filter ?? '';
    const visible = new Set<HTMLElement>();
    const counts = new Map<string, number>([['', ranked?.size ?? items.length]]);
    for (const item of ranked ?? items) {
      const ids = categories.get(item)!;
      if (!category || ids.includes(category)) visible.add(item);
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    motion.update(() => {
      if (order) grid.append(...order);
      for (const item of items) item.hidden = !visible.has(item);
      const pending = grid.hasAttribute('aria-busy');
      if (empty) {
        empty.hidden = pending || visible.size > 0;
        empty.dataset.emptyState = ranked ? 'search' : '';
      }
      if (emptyMessage) emptyMessage.textContent = ranked ? 'No matching things.' : 'No items yet.';
      if (searchAll) {
        const matches = ranked?.size ?? 0;
        searchAll.hidden = pending || !category || visible.size > 0 || matches === 0;
        if (!searchAll.hidden) searchAll.textContent = `View ${matches} ${matches === 1 ? 'thing' : 'things'} across all categories`;
      }
      for (const badge of badges) {
        const value = String(counts.get(badge.category) ?? 0);
        if (badge.label.textContent !== value) badge.label.textContent = value;
      }
      showCount(pending ? undefined : visible.size);
      updateSuggestions?.(ranked && !pending ? visible : undefined, term, hits);
    }, { animate, pointerType });
    notify();
  }

  async function runSearch(next: string, version: number, debounce: boolean) {
    grid.setAttribute('aria-busy', 'true');
    updateSuggestions?.(undefined, next, hits);
    if (empty) empty.hidden = true;
    showCount();
    if (debounce) await new Promise((resolve) => setTimeout(resolve, 150));
    if (version !== revision) return;
    let order: Iterable<HTMLElement> | undefined;
    try {
      const matches = items.length ? await search(next) : new Map<string, PickSearchHit>();
      if (version !== revision) return;
      hits = matches;
      ranked = new Set();
      for (const path of matches.keys()) {
        const item = itemsByPath.get(path);
        if (item) ranked.add(item);
      }
      order = ranked;
    } catch {
      if (version !== revision) return;
      if (ranked) order = items;
      ranked = undefined;
      if (error) error.hidden = false;
    }
    grid.removeAttribute('aria-busy');
    render(false, '', order);
    if (focusResultAfterSearch) {
      focusResultAfterSearch = false;
      firstSearchResult()?.focus();
    }
  }

  function updateQuery(raw: string, debounce = false, force = false): Promise<void> | undefined {
    const next = normalizeSearchQuery(raw);
    if (next === term && !force) return;
    focusResultAfterSearch = false;
    term = next;
    revision++;
    if (error) error.hidden = true;
    if (next) return runSearch(next, revision, debounce);
    grid.removeAttribute('aria-busy');
    const order = ranked ? items : undefined;
    ranked = undefined;
    render(false, '', order);
  }

  function applyCategory(button: HTMLButtonElement, event: MouseEvent) {
    const category = button.dataset.filter ?? '';
    const url = new URL(window.location.href);
    if (category) url.searchParams.set('category', category);
    else url.searchParams.delete('category');
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
    if (select(button)) render(true, typeof PointerEvent !== 'undefined' && event instanceof PointerEvent ? event.pointerType : '');
  }

  for (const button of buttons) button.addEventListener('click', (event) => applyCategory(button, event));
  searchAll?.addEventListener('click', (event) => {
    applyCategory(buttons[0], event);
    buttons[0].focus({ preventScroll: true });
  });

  if (input) {
    input.hidden = false;
    let composing = false;
    const onInput = () => {
      const url = new URL(window.location.href);
      const raw = input.value.trim();
      if (raw) url.searchParams.set('q', raw);
      else url.searchParams.delete('q');
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
      void updateQuery(raw, true);
    };
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; onInput(); });
    input.addEventListener('input', (event) => {
      if (!composing && !(event as InputEvent).isComposing) onInput();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || composing || event.isComposing || !term) return;
      const pending = grid.hasAttribute('aria-busy');
      const target = pending ? clear : firstSearchResult() ?? clear;
      if (!target) return;
      event.preventDefault();
      target.focus();
      // 入力直後は古いカードを飛ばし、待機中に別の場所へ移動したらフォーカスを追わない。
      focusResultAfterSearch = pending && document.activeElement === clear;
    });
    clear?.addEventListener('blur', () => { focusResultAfterSearch = false; });
    clear?.addEventListener('click', () => {
      input.value = '';
      onInput();
      input.focus();
    });
    retry?.addEventListener('click', (event) => {
      if (event.detail === 0) input.focus();
      void updateQuery(input.value, false, true);
    });
  }

  function restoreFromUrl(initial: boolean) {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('category') ?? '';
    const button = buttons.find((option) => option.dataset.filter === requested) ?? buttons[0];
    const prepared = initial && grid.dataset.initialFilter === button.dataset.filter;
    if (initial) delete grid.dataset.initialFilter;
    const changed = select(button, prepared);
    const raw = params.get('q') ?? '';
    if (input) input.value = raw;
    const previousTerm = term;
    const ready = updateQuery(raw);
    if (prepared) {
      if (!ready) notify();
    } else if (changed && (ready || previousTerm === term)) {
      // 検索を消した際は updateQuery が元の並びと新しいカテゴリを一度に反映する。
      render(!initial);
    }
    return ready;
  }

  window.addEventListener('popstate', () => { restoreFromUrl(false); });
  if (restoreFromUrl(true) && grid.hasAttribute('aria-busy')) {
    return new Promise((resolve) => { resolveInitialSearch = resolve; });
  }
}
