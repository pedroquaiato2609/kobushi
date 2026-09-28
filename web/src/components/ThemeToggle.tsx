import { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme, setStoredTheme, systemTheme, type Theme } from '../lib/theme';
import { Icon } from './Icon';

/** Alterna claro/escuro. Sem escolha salva, segue o sistema — e acompanha se ele mudar. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? systemTheme());

  useEffect(() => {
    applyTheme(getStoredTheme());
    if (getStoredTheme()) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setTheme(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setStoredTheme(next);
  };

  return (
    <button className="icon-btn theme-toggle" onClick={toggle} title={theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro'} aria-label="Alternar entre modo claro e escuro">
      <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
    </button>
  );
}
