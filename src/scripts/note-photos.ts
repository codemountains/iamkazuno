export function initNotePhotos() {
  const gallery = document.querySelector<HTMLElement>('.note-photos');
  const track = gallery?.querySelector<HTMLElement>('.note-photos-track');
  const controls = gallery?.querySelector<HTMLElement>('.note-photos-controls');
  const count = controls?.querySelector<HTMLElement>('.note-photos-count');
  const play = controls?.querySelector<HTMLButtonElement>('.note-photos-play');
  const previous = controls?.querySelector<HTMLButtonElement>('.note-photos-prev');
  const next = controls?.querySelector<HTMLButtonElement>('.note-photos-next');
  if (!gallery || !track || !controls || !count || !play || !previous || !next) return;

  const slides = Array.from(track.querySelectorAll('picture'));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !motion.matches;
  let inView = false;
  let hovering = false;
  let timer: number | undefined;
  let destination: number | null = null;
  let pointerStart: number | null = null;
  let visibleIndex = -1;

  const position = () => Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  const syncPosition = () => {
    if (pointerStart !== null && Math.abs(track.scrollLeft - pointerStart) > 2) {
      takeControl();
    }
    if (destination !== null && Math.abs(track.scrollLeft - destination * track.clientWidth) <= 1) destination = null;
    const index = position();
    if (index === visibleIndex) return;
    visibleIndex = index;
    count.textContent = `${index + 1} / ${slides.length}`;
    slides.forEach((slide, i) => { slide.inert = i !== index; });
  };
  const move = (step: number) => {
    pointerStart = null;
    // 連打時は移動中のスクロール位置ではなく、直前に指定した写真から数える。
    const from = destination ?? position();
    const to = (from + step + slides.length) % slides.length;
    destination = to;
    track.scrollTo({
      left: to * track.clientWidth,
      behavior: motion.matches || Math.abs(from - to) > 1 ? 'instant' : 'smooth',
    });
  };
  const syncTimer = () => {
    window.clearInterval(timer);
    if (playing && inView && !hovering && !document.hidden) timer = window.setInterval(() => move(1), 3_500);
  };
  const setPlaying = (enabled: boolean) => {
    playing = enabled;
    play.toggleAttribute('data-playing', enabled);
    play.title = enabled ? '自動再生を停止' : '自動再生を開始';
    play.setAttribute('aria-label', play.title);
    count.setAttribute('aria-live', enabled ? 'off' : 'polite');
    syncTimer();
  };
  const manualMove = (step: number) => {
    setPlaying(false);
    move(step);
  };

  play.addEventListener('click', () => setPlaying(!playing));
  previous.addEventListener('click', () => manualMove(-1));
  next.addEventListener('click', () => manualMove(1));
  track.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    manualMove(event.key === 'ArrowLeft' ? -1 : 1);
  });
  const takeControl = () => {
    pointerStart = null;
    destination = null;
    setPlaying(false);
  };
  // 写真の上から本文を縦にスクロールしただけなら、自動再生を維持する。
  track.addEventListener('pointerdown', () => { pointerStart = track.scrollLeft; });
  track.addEventListener('wheel', (event) => { if (event.deltaX || event.shiftKey) takeControl(); }, { passive: true });
  track.addEventListener('scroll', syncPosition, { passive: true });
  track.addEventListener('pointerenter', (event) => {
    hovering = event.pointerType === 'mouse';
    syncTimer();
  });
  track.addEventListener('pointerleave', () => { hovering = false; syncTimer(); });
  gallery.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) setPlaying(false);
  });
  motion.addEventListener('change', () => { if (motion.matches) setPlaying(false); });
  document.addEventListener('visibilitychange', syncTimer);
  new IntersectionObserver(([entry]) => {
    inView = entry.intersectionRatio >= 0.5;
    syncTimer();
  }, { threshold: 0.5 }).observe(track);

  syncPosition();
  setPlaying(playing);
  controls.hidden = false;
}
