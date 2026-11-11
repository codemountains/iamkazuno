export function initItemInteractions() {
  const grid = document.querySelector<HTMLElement>('[data-item-grid]');
  if (!grid) return;

  let pressed: { link: HTMLAnchorElement; pointerId: number; x: number; y: number } | null = null;

  function clearPressed() {
    pressed?.link.removeAttribute('data-pressed');
    pressed = null;
  }

  document.addEventListener('pointerdown', (event) => {
    // A second finger cancels the first press, without interrupting native gestures.
    clearPressed();
    grid.toggleAttribute('data-touch-input', event.pointerType !== 'mouse');
    if (!event.isPrimary || event.button !== 0 || event.pointerType === 'mouse') return;
    if (!(event.target instanceof Element)) return;

    const link = event.target.closest<HTMLAnchorElement>('.item-card-link');
    if (!link || !grid.contains(link)) return;

    pressed = { link, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    link.setAttribute('data-pressed', '');
  }, { passive: true });

  document.addEventListener('pointermove', (event) => {
    // Real mouse input re-enables hover on devices that also have a touch screen.
    if (event.pointerType === 'mouse') grid.removeAttribute('data-touch-input');
    if (!pressed || event.pointerId !== pressed.pointerId) return;
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 8) clearPressed();
  }, { passive: true });

  function endPress(event: PointerEvent) {
    if (event.pointerId === pressed?.pointerId) clearPressed();
  }

  document.addEventListener('pointerup', endPress, { passive: true });
  document.addEventListener('pointercancel', endPress, { passive: true });
  document.addEventListener('lostpointercapture', endPress, { passive: true });
  document.addEventListener('scroll', clearPressed, { capture: true, passive: true });
  document.addEventListener('contextmenu', clearPressed);
  document.addEventListener('dragstart', clearPressed);
  window.addEventListener('blur', clearPressed);
  window.addEventListener('pagehide', clearPressed);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearPressed();
  });
}
