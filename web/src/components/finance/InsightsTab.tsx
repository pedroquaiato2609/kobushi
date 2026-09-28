import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { Insight } from '../../api/types';
import { askAssistant } from '../../lib/chatPrompt';
import { Icon } from '../Icon';
import { StateBox } from './shared';

const SEV = { high: 'Precisa de atenção', attention: 'Vale olhar', info: 'Para saber' } as const;

/** Um insight sempre mostra o que foi visto, os dados usados e o que dá para fazer. */
export function InsightCard({ insight, compact = false }: { insight: Insight; compact?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const hide = useAction((state: { state: 'dismissed' | 'muted'; days?: number }) => api.post('/finance/insights/state', { key: insight.key, ...state }));
  return (
    <article className={`insight sev-${insight.severity}`}>
      <header>
        <span className="sev-dot" aria-hidden />
        <div>
          <h3>{insight.title}</h3>
          <p>{insight.summary}</p>
        </div>
      </header>
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Dados usados nesta análise</summary>
        <ul>{insight.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
      </details>
      <footer>
        {insight.actions.map((a) => (
          <button key={a.label} className={`btn small${a.kind === 'chat' ? '' : ' ghost'}`}
            onClick={() => (a.kind === 'open' && a.href ? navigate(a.href) : a.prompt && askAssistant(navigate, a.prompt))}>
            {a.kind === 'chat' && <Icon name="sparkles" size={14} />} {a.label}
          </button>
        ))}
        {!compact && (
          <span className="insight-hide">
            <button className="btn small ghost" disabled={hide.isPending} onClick={() => hide.mutate({ state: 'muted', days: 30 })}>Silenciar 30 dias</button>
            <button className="btn small ghost" disabled={hide.isPending} onClick={() => hide.mutate({ state: 'dismissed' })}>Ignorar</button>
          </span>
        )}
      </footer>
    </article>
  );
}

export function InsightsTab({ insights, loading, error }: { insights: Insight[] | undefined; loading: boolean; error: unknown }) {
  if (loading) return <StateBox kind="loading" title="Analisando seus dados…" />;
  if (error) return <StateBox kind="error" title="Não consegui calcular os insights">{(error as Error).message}</StateBox>;
  if (!insights || insights.length === 0) {
    return <StateBox kind="empty" title="Nenhum insight no momento">Os insights aparecem quando há dados suficientes (alguns meses de movimentações) e algo digno de nota. Nada é inventado: cada um mostra os números que usou.</StateBox>;
  }
  return (
    <div className="insights">
      {(['high', 'attention', 'info'] as const).map((sev) => {
        const list = insights.filter((i) => i.severity === sev);
        return list.length ? (
          <section key={sev}>
            <h2 className="insight-group">{SEV[sev]} <span className="muted">({list.length})</span></h2>
            <div className="insight-grid">{list.map((i) => <InsightCard key={i.key} insight={i} />)}</div>
          </section>
        ) : null;
      })}
    </div>
  );
}
