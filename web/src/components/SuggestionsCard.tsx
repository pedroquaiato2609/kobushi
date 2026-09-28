import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { Suggestion } from '../api/types';
import { askAssistant } from '../lib/chatPrompt';
import { Icon } from './Icon';

const TYPE_LABEL = { agenda: 'Agenda', routine: 'Rotina', review: 'Revisão', finance: 'Finanças' } as const;

/** Sugestões proativas: poucas, sempre com o motivo e os dados usados, e fáceis de dispensar. */
export function SuggestionsCard() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['suggestions'], queryFn: () => api.get<Suggestion[]>('/assistant/suggestions') });
  const resolve = useAction((v: { id: string; status: 'accepted' | 'dismissed' | 'snoozed'; days?: number }) => api.post(`/assistant/suggestions/${v.id}/resolve`, { status: v.status, days: v.days }));
  const list = (q.data ?? []).slice(0, 2);
  if (list.length === 0) return null;
  const more = (q.data ?? []).length - list.length;

  return (
    <div className="sugg-wrap" role="region" aria-label="Sugestões do assistente">
      {list.map((s) => (
        <article key={s.id} className={`sugg sev-${s.severity}`}>
          <header>
            <span className="sugg-type">{TYPE_LABEL[s.type]}</span>
            <h3>{s.title}</h3>
            <button className="icon-btn" aria-label="Dispensar sugestão" title="Dispensar" onClick={() => resolve.mutate({ id: s.id, status: 'dismissed' })}><Icon name="x" size={14} /></button>
          </header>
          <p>{s.reason}</p>
          <details>
            <summary>Por que estou sugerindo isso?</summary>
            <ul>{s.data.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </details>
          <footer>
            {s.actions.map((a) => (
              <button key={a.label} className={`btn small${a.kind === 'chat' ? ' primary' : ''}`} onClick={() => {
                if (a.kind === 'open' && a.href) { navigate(a.href); return; }
                if (a.prompt) { resolve.mutate({ id: s.id, status: 'accepted' }); askAssistant(navigate, a.prompt); }
              }}>{a.label}</button>
            ))}
            <button className="btn small ghost" onClick={() => resolve.mutate({ id: s.id, status: 'snoozed', days: 1 })}>Depois</button>
          </footer>
        </article>
      ))}
      {more > 0 && <p className="hint">Mais {more} sugestão(ões) aguardando. Ajuste a frequência em Configurações → Assistente.</p>}
    </div>
  );
}
