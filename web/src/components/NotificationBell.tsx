import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { AppNotification } from '../api/types';
import { fmt } from '../lib/dates';
import { Icon } from './Icon';

/** Sino com a caixa de entrada: tudo o que o Ninshiki avisou, mesmo que o celular estivesse desligado. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const inbox = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ items: AppNotification[]; unread: number }>('/notifications'),
    refetchInterval: 30_000,
  });
  const readAll = useAction(() => api.post('/notifications/read-all'));
  const read = useAction((id: string) => api.post(`/notifications/${id}/read`));

  const items = inbox.data?.items ?? [];
  const unread = inbox.data?.unread ?? 0;

  return (
    <div className="bell">
      <button className="btn round" onClick={() => setOpen((o) => !o)} aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`} aria-expanded={open}>
        <Icon name="bell" />
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="bell-backdrop" onClick={() => setOpen(false)} />
          <div className="bell-panel" role="dialog" aria-label="Notificações">
            <header>
              <h2>Notificações</h2>
              {unread > 0 && <button className="link" onClick={() => readAll.mutate(undefined)}>Marcar todas como lidas</button>}
            </header>
            {items.length === 0 && <p className="empty">Nada por aqui. Os avisos de atividades, eventos e lembretes aparecem aqui.</p>}
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    className={`notif${n.readAt ? '' : ' unread'}`}
                    onClick={() => { if (!n.readAt) read.mutate(n.id); setOpen(false); if (n.link) navigate(n.link); }}
                  >
                    <b>{n.title}</b>
                    {n.body && <span>{n.body}</span>}
                    <small>{fmt(new Date(n.createdAt), "d MMM, HH:mm")}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
