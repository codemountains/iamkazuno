/** ThemeInit owns preference, storage and system changes; this only binds the UI. */
export function initThemePicker() {
  const toggles = document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]');
  const sync = () => {
    const theme = document.documentElement.dataset.theme;
    if (theme !== 'light' && theme !== 'dark') return;

    for (const toggle of toggles) {
      toggle.setAttribute('aria-checked', String(theme === 'dark'));
      toggle.title = theme === 'dark' ? 'ライトモードに切り替える' : 'ダークモードに切り替える';
      toggle.disabled = false;
      toggle.hidden = false;
    }
  };

  for (const toggle of toggles) {
    toggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.dispatchEvent(new CustomEvent('picks:theme-change', { detail: next }));
    });
  }
  document.addEventListener('picks:theme-updated', sync);
  sync();
}
