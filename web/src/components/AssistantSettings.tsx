import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { AssistantSettings as Settings, SuggestionType } from '../api/types';
import { ErrorText } from './ui';

const LEVELS = [
  { id: 'off', name: 'Desligada', hint: 'O assistente só responde ao que você pedir.' },
  { id: 'low', name: 'Discreta', hint: 'Só o que merece atenção (prazos, conflitos, gastos fora do padrão). Até 2 sugestões abertas.' },
  { id: 'normal', name: 'Normal', hint: 'Também sugere melhorias e resumos úteis. Até 5 sugestões abertas.' },
] as const;
const TYPES: { id: SuggestionType; name: string; hint: string }[] = [
  { id: 'agenda', name: 'Agenda e prazos', hint: 'Conflitos, agenda concentrada, cards atrasados.' },
  { id: 'routine', name: 'Rotina', hint: 'Lembretes que faltam, objetivos adiados vários dias.' },
  { id: 'review', name: 'Revisões', hint: 'Lembrar da revisão do dia.' },
  { id: 'finance', name: 'Finanças', hint: 'Gastos fora do padrão, cobranças ausentes, orçamento em risco, projeção de saldo.' },
];

export function AssistantSettings() {
  const q = useQuery({ queryKey: ['assistant-settings'], queryFn: () => api.get<Settings>('/assistant/settings') });
  const save = useAction((patch: Partial<Settings>) => api.put<Settings>('/assistant/settings', patch));
  const s = q.data;
  if (q.isLoading) return <p className="muted" role="status">Carregando…</p>;
  if (!s) return <ErrorText error={q.error} />;

  const toggleType = (t: SuggestionType) => save.mutate({ types: s.types.includes(t) ? s.types.filter((x) => x !== t) : [...s.types, t] });
  return (
    <div className="settings-stack">
      <section className="panel">
        <h2>Sugestões proativas</h2>
        <p className="muted">O assistente só sugere algo quando há um <b>sinal real</b> (prazo, conflito, atraso, mudança de padrão) e sempre explica o motivo. Nunca executa nada sozinho: ações financeiras e irreversíveis sempre pedem a sua confirmação.</p>
        <div className="radio-cards" role="radiogroup" aria-label="Frequência das sugestões">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={s.proactivity === l.id} className="radio-card" onClick={() => save.mutate({ proactivity: l.id })}>
              <b>{l.name}</b><span>{l.hint}</span>
            </button>
          ))}
        </div>
        <ErrorText error={save.error} />
      </section>

      <section className="panel" aria-disabled={s.proactivity === 'off'}>
        <h2>O que posso sugerir</h2>
        <ul className="check-list">
          {TYPES.map((t) => (
            <li key={t.id}>
              <label><input type="checkbox" checked={s.types.includes(t.id)} disabled={s.proactivity === 'off'} onChange={() => toggleType(t.id)} /> <span><b>{t.name}</b><em>{t.hint}</em></span></label>
            </li>
          ))}
        </ul>
        <div className="form-row">
          <label className="field"><span className="field-label">No máximo por dia</span>
            <select value={s.maxPerDay} onChange={(e) => save.mutate({ maxPerDay: Number(e.target.value) })}>{[1, 2, 3, 5, 8].map((n) => <option key={n} value={n}>{n} nova(s)</option>)}</select></label>
          <span />
        </div>
        <div className="form-row">
          <label className="field"><span className="field-label">Silêncio a partir de</span><input type="time" value={s.quietStart} onChange={(e) => e.target.value && save.mutate({ quietStart: e.target.value })} /></label>
          <label className="field"><span className="field-label">Até</span><input type="time" value={s.quietEnd} onChange={(e) => e.target.value && save.mutate({ quietEnd: e.target.value })} /></label>
        </div>
      </section>

      <section className="panel">
        <h2>Revisões</h2>
        <p className="muted">Um aviso no sino (e nos canais que você ativou) para não esquecer da revisão.</p>
        <div className="form-row">
          <label className="field"><span className="field-label">Revisão do dia</span>
            <span className="inline-field"><input type="checkbox" aria-label="Ativar revisão do dia" checked={s.dailyReviewTime !== null} onChange={(e) => save.mutate({ dailyReviewTime: e.target.checked ? '21:00' : null })} />
              <input type="time" value={s.dailyReviewTime ?? ''} disabled={s.dailyReviewTime === null} onChange={(e) => e.target.value && save.mutate({ dailyReviewTime: e.target.value })} /></span></label>
          <label className="field"><span className="field-label">Revisão da semana (domingo)</span>
            <span className="inline-field"><input type="checkbox" aria-label="Ativar revisão da semana" checked={s.weeklyReviewTime !== null} onChange={(e) => save.mutate({ weeklyReviewTime: e.target.checked ? '18:00' : null })} />
              <input type="time" value={s.weeklyReviewTime ?? ''} disabled={s.weeklyReviewTime === null} onChange={(e) => e.target.value && save.mutate({ weeklyReviewTime: e.target.value })} /></span></label>
        </div>
      </section>
    </div>
  );
}
