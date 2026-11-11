import { initFilterScroll } from './filter-scroll';

export function initFilters() {
  const controls = document.querySelector<HTMLElement>('[data-filters]');
  if (!controls) return;

  const buttons = Array.from(controls.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-item]'));
  const categoriesByItem = new Map(items.map((item) => [item, JSON.parse(item.dataset.categories ?? '[]') as string[]]));
  const resultLabel = document.querySelector<HTMLElement>('[data-results-label]');
  const emptyState = document.querySelector<HTMLElement>('[data-empty-state]');
  const validCategories = new Set(buttons.map((button) => button.dataset.filter));
  const filterScroll = initFilterScroll(controls);

  function applyFilter(category: string, updateHistory: boolean) {
    const selected = validCategories.has(category) ? category : '';
    let visible = 0;
    for (const item of items) {
      item.hidden = selected !== '' && !categoriesByItem.get(item)?.includes(selected);
      if (!item.hidden) visible += 1;
    }
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
    if (emptyState) emptyState.hidden = visible !== 0;

    if (updateHistory) {
      const url = new URL(window.location.href);
      if (selected === '') url.searchParams.delete('category');
      else url.searchParams.set('category', selected);
      if (url.href !== window.location.href) window.history.pushState(null, '', url);
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => applyFilter(button.dataset.filter ?? '', true));
  }
  const restoreFromUrl = () => applyFilter(new URLSearchParams(window.location.search).get('category') ?? '', false);
  window.addEventListener('popstate', restoreFromUrl);
  restoreFromUrl();
}
