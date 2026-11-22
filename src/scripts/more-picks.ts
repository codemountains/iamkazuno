import { initItemInteractions } from './item-interactions';

export function initMorePicks() {
  const section = document.querySelector<HTMLElement>('[data-more-picks]');
  const track = section?.querySelector<HTMLElement>('[data-more-picks-track]');
  const controls = section?.querySelector<HTMLElement>('[data-more-picks-controls]');
  const progress = section?.querySelector<HTMLProgressElement>('[data-more-picks-progress]');
  const previous = section?.querySelector<HTMLButtonElement>('[data-more-picks-previous]');
  const next = section?.querySelector<HTMLButtonElement>('[data-more-picks-next]');
  if (!track || !controls || !progress || !previous || !next) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const position = () => {
    const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
    return { maximum, left: Math.max(0, Math.min(track.scrollLeft, maximum)) };
  };
  const update = () => {
    const { maximum, left } = position();
    controls.hidden = maximum <= 1;
    previous.disabled = left <= 1;
    next.disabled = maximum - left <= 1;
    // 最初に見えている範囲から始め、最後のカードまで進むとバーが満たされる。
    progress.value = track.scrollWidth > 0 ? (left + track.clientWidth) / track.scrollWidth : 1;
  };
  const scroll = (direction: number) => {
    const card = track.firstElementChild;
    if (!card) return;
    const style = getComputedStyle(track);
    const gap = parseFloat(style.columnGap);
    const step = card.getBoundingClientRect().width + gap;
    const width =
      track.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const count = Math.max(1, Math.floor((width + gap) / step));
    track.scrollBy({
      left: direction * step * count,
      behavior: reducedMotion.matches ? 'instant' : 'smooth',
    });
  };

  previous.addEventListener('click', () => scroll(-1));
  next.addEventListener('click', () => scroll(1));
  track.addEventListener('scroll', update, { passive: true });
  track.addEventListener('focusin', (event) => {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest<HTMLElement>('.item');
    if (!card || !track.contains(card)) return;
    const viewport = track.getBoundingClientRect();
    const item = card.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
    // 横位置だけを補正し、Tab移動でカードやフォーカス枠が切れないようにする。
    const offset =
      item.left < viewport.left + inset
        ? item.left - viewport.left - inset
        : item.right > viewport.right - inset
          ? item.right - viewport.right + inset
          : 0;
    if (offset) track.scrollBy({ left: offset, behavior: 'instant' });
  });
  new ResizeObserver(update).observe(track);
  window.addEventListener('pageshow', update);
  initItemInteractions(track);
  update();
}
