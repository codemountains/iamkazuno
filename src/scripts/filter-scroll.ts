export function initFilterScroll(controls: HTMLElement): { reveal(button: HTMLButtonElement): void } {
  const navigation = controls.closest<HTMLElement>('[data-filter-navigation]');
  const previous = navigation?.querySelector<HTMLButtonElement>('[data-filter-scroll="previous"]');
  const next = navigation?.querySelector<HTMLButtonElement>('[data-filter-scroll="next"]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const overlayWidth = 40;
  const tolerance = 1;

  function position() {
    const maximum = Math.max(0, controls.scrollWidth - controls.clientWidth);
    const left = Math.max(0, Math.min(controls.scrollLeft, maximum));
    return { left, maximum };
  }

  function update() {
    const { left, maximum } = position();
    const canScrollPrevious = left > tolerance;
    const canScrollNext = maximum - left > tolerance;
    if (previous) previous.disabled = !canScrollPrevious;
    if (next) next.disabled = !canScrollNext;
    if (navigation) {
      navigation.dataset.canScrollPrevious = String(canScrollPrevious);
      navigation.dataset.canScrollNext = String(canScrollNext);
    }
  }

  function reveal(button: HTMLButtonElement) {
    if (!controls.contains(button)) return;
    const { left, maximum } = position();
    if (maximum <= tolerance || controls.clientWidth === 0) {
      update();
      return;
    }

    const viewportLeft = controls.getBoundingClientRect().left + controls.clientLeft;
    const buttonRect = button.getBoundingClientRect();
    const buttonLeft = buttonRect.left - viewportLeft + left;
    const buttonRight = buttonLeft + buttonRect.width;
    const visibleLeft = left + (left > tolerance ? overlayWidth : 0);
    const visibleRight = left + controls.clientWidth - (maximum - left > tolerance ? overlayWidth : 0);
    let target = left;

    // 長いラベルは先頭を優先し、再度呼ばれても左右に往復させない。
    if (buttonRect.width > controls.clientWidth - overlayWidth * 2) {
      if (buttonLeft < visibleLeft || buttonLeft >= visibleRight) target = buttonLeft - overlayWidth;
    } else if (buttonLeft < visibleLeft) {
      target = buttonLeft - overlayWidth;
    } else if (buttonRight > visibleRight) {
      target = buttonRight - controls.clientWidth + overlayWidth;
    }

    target = Math.max(0, Math.min(target, maximum));
    if (Math.abs(target - left) > tolerance) {
      // 横位置のみ変更し、フォーカスやURL復元でページ全体をスクロールしない。
      controls.scrollTo({ left: target, behavior: 'instant' });
    }
    update();
  }

  function scroll(direction: number) {
    controls.scrollBy({
      left: direction * controls.clientWidth * 0.75,
      behavior: reducedMotion.matches ? 'instant' : 'smooth',
    });
  }

  previous?.addEventListener('click', () => scroll(-1));
  next?.addEventListener('click', () => scroll(1));
  controls.addEventListener('scroll', update, { passive: true });
  controls.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLButtonElement && event.target.matches('[data-filter]')) reveal(event.target);
  });

  if (navigation) navigation.hidden = false;
  new ResizeObserver(update).observe(controls);
  void document.fonts.ready.then(update);
  update();

  return { reveal };
}
