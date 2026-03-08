const STORAGE_KEY = 'alloy-theme';
const VALID_THEMES = new Set(['light', 'dark']);

export function initThemeToggle(selector = '#theme-toggle') {
  const button = document.querySelector(selector);
  const sync = () => {
    const theme = getCurrentTheme();
    document.documentElement.dataset.theme = theme;
    if (!button) {
      return;
    }
    button.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    button.setAttribute('title', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  };

  sync();

  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    const nextTheme = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    persistTheme(nextTheme);
    sync();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      sync();
    }
  });
}

function getCurrentTheme() {
  const current = document.documentElement.dataset.theme;
  if (VALID_THEMES.has(current)) {
    return current;
  }
  return readStoredTheme();
}

function persistTheme(theme) {
  const nextTheme = VALID_THEMES.has(theme) ? theme : 'light';
  document.documentElement.dataset.theme = nextTheme;
  try {
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  } catch {
    // Ignore storage failures and keep the in-memory theme.
  }
}

function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (VALID_THEMES.has(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage access failures and fall back to light mode.
  }
  return 'light';
}
