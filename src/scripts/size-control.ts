export function initSizeControl() {
  const control = document.querySelector<HTMLElement>('[data-size-control]');
  const grid = document.querySelector<HTMLElement>('[data-item-grid]');
  if (!control || !grid || control.dataset.sizeReady) return;
  control.dataset.sizeReady = 'true';

  let timer: ReturnType<typeof setTimeout> | undefined;
  let scrolling = false;
  let keyboardInput = true;
  let keyboardFocused = false;
  let pointerId: number | null = null;

  function render() {
    control!.toggleAttribute('data-scroll-hidden', scrolling && pointerId === null && !keyboardFocused);
  }

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function reset() {
    clearTimer();
    scrolling = false;
    pointerId = null;
    keyboardFocused = false;
    render();
  }

  function updateAvailability() {
    control!.hidden = !Array.from(grid!.querySelectorAll<HTMLElement>('[data-item]')).some((item) => !item.hidden);
    if (control!.hidden) reset();
    else render();
  }

  document.addEventListener('scroll', () => {
    scrolling = true;
    clearTimer();
    render();
    timer = setTimeout(() => {
      timer = undefined;
      scrolling = false;
      render();
    }, 400);
  }, { capture: true, passive: true });

  document.addEventListener('pointerdown', (event) => {
    keyboardInput = false;
    keyboardFocused = false;
    if (control.contains(event.target as Node | null) && event.isPrimary && event.button === 0) {
      pointerId = event.pointerId;
    }
    render();
  }, { passive: true });

  function releasePointer(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    render();
  }

  document.addEventListener('pointerup', releasePointer, { passive: true });
  document.addEventListener('pointercancel', releasePointer, { passive: true });
  document.addEventListener('lostpointercapture', releasePointer, { passive: true });

  document.addEventListener('keydown', () => {
    keyboardInput = true;
    keyboardFocused = control.contains(document.activeElement);
    render();
  });

  control.addEventListener('focusin', () => {
    keyboardFocused = keyboardInput;
    // Tabで到達したときは即座に戻す。pointer操作はpointerdownで表示を保つ。
    render();
  });

  control.addEventListener('focusout', (event) => {
    if (control.contains(event.relatedTarget as Node | null)) return;
    keyboardFocused = false;
    render();
  });

  document.addEventListener('picks:filter-change', updateAvailability);
  window.addEventListener('blur', reset);
  window.addEventListener('focus', () => {
    keyboardFocused = keyboardInput && control.contains(document.activeElement);
    render();
  });
  window.addEventListener('pagehide', reset);
  window.addEventListener('pageshow', () => {
    reset();
    keyboardFocused = keyboardInput && control.contains(document.activeElement);
    updateAvailability();
  });
  updateAvailability();
}
