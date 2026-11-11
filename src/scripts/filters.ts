import { initFilterScroll } from './filter-scroll';
import { initFilterMotion } from './filter-motion';

export function initFilters() {
  const controls = document.querySelector<HTMLElement>('[data-filters]');
  const grid = document.querySelector<HTMLElement>('[data-item-grid]');
  if (!controls || !grid) return;

  const buttons = Array.from(controls.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-item]'));
  const categoriesByItem = new Map(items.map((item) => [item, JSON.parse(item.dataset.categories ?? '[]') as string[]]));
  const resultLabel = document.querySelector<HTMLElement>('[data-results-label]');
  const emptyState = document.querySelector<HTMLElement>('[data-empty-state]');
  const validCategories = new Set(buttons.map((button) => button.dataset.filter));
  const filterScroll = initFilterScroll(controls);
  const motion = initFilterMotion(grid, items);
  let currentCategory: string | undefined;

  function applyFilter(category: string, updateHistory: boolean, animate = true, pointerType = '') {
    const selected = validCategories.has(category) ? category : '';
    if (updateHistory) {
      const url = new URL(window.location.href);
      if (selected === '') url.searchParams.delete('category');
      else url.searchParams.set('category', selected);
      if (url.href !== window.location.href) window.history.pushState(null, '', url);
    }
    if (selected === currentCategory) return;
    currentCategory = selected;
    const visibleItems = new Set(items.filter((item) => selected === '' || categoriesByItem.get(item)?.includes(selected)));
    const visible = visibleItems.size;
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === selected));
    }
    const selectedButton = buttons.find((button) => button.dataset.filter === selected);
    if (selectedButton) filterScroll.reveal(selectedButton);
    if (resultLabel) {
      const name = buttons.find((button) => button.dataset.filter === selected)?.dataset.filterLabel ?? 'all';
      resultLabel.textContent = selected === ''
        ? `${String(visible).padStart(2, '0')} things, well loved.`
        : `${name} — ${String(visible).padStart(2, '0')} things`;
    }
    motion.update(() => {
      for (const item of items) item.hidden = !visibleItems.has(item);
      if (emptyState) emptyState.hidden = visible !== 0;
    }, { animate, pointerType });
    document.dispatchEvent(new Event('picks:filter-change'));
  }

  for (const button of buttons) {
    button.addEventListener('click', (event) => applyFilter(
      button.dataset.filter ?? '', true, true,
      typeof PointerEvent !== 'undefined' && event instanceof PointerEvent ? event.pointerType : '',
    ));
  }
  const restoreFromUrl = () => applyFilter(new URLSearchParams(window.location.search).get('category') ?? '', false);
  window.addEventListener('popstate', restoreFromUrl);
  // 初回表示はURLのカテゴリを即時適用し、入場アニメーションを付けない。
  applyFilter(new URLSearchParams(window.location.search).get('category') ?? '', false, false);
}
