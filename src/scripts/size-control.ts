export function initSizeControl() {
  const control = document.querySelector<HTMLElement>('[data-size-control]');
  const grid = document.querySelector<HTMLElement>('[data-item-grid]');
  if (!control || !grid || control.dataset.sizeReady) return;
  control.dataset.sizeReady = 'true';

  const updateAvailability = () => {
    control.hidden = !grid.querySelector('[data-item]:not([hidden])');
  };

  document.addEventListener('picks:filter-change', updateAvailability);
  window.addEventListener('pageshow', updateAvailability);
  updateAvailability();
}
