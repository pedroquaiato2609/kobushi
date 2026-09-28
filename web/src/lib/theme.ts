export type Theme = 'light' | 'dark';
const KEY = 'ninshiki.theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#090b12', light: '#eef0f6' };

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Aplica o tema no <html> e ajusta a cor da barra do navegador/PWA. `null` = seguir o sistema. */
export function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
  const effective = theme ?? systemTheme();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[effective]);
}

export function setStoredTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* localStorage indisponível */ }
  applyTheme(theme);
}
