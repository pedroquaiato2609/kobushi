import type { ReactNode } from 'react';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';

/** Título + uma linha explicando para que serve a tela + ações + tema + sino de notificações. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        <p className="page-sub">{subtitle}</p>
      </div>
      <div className="head-actions">
        {children}
        <ThemeToggle />
        <NotificationBell />
      </div>
    </header>
  );
}
