import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { NavLink } from 'react-router-dom';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { DailyReview, ReadingOverview, Stats } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { ErrorText, Field } from '../components/ui';
import { fmt, parseYmd, ymd } from '../lib/dates';
import { KIND_GROUP } from '../lib/labels';
import { progressPct } from '../lib/reading';

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
const RANGES = [7, 30, 90];

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const today = ymd(new Date());
  const from = ymd(subDays(new Date(), days - 1));

  const stats = useQuery({ queryKey: ['stats', from, today], queryFn: () => api.get<Stats>(`/stats?from=${from}&to=${today}`) });
  const reviews = useQuery({ queryKey: ['reviews', from, today], queryFn: () => api.get<DailyReview[]>(`/reviews?from=${from}&to=${today}`) });
  const s = stats.data;

  const chartData = (s?.days ?? []).map((d) => ({
    label: fmt(parseYmd(d.date), 'dd/MM'), min: d.min, ideal: d.ideal, max: d.max, missed: d.applicable - d.done,
  }));
  const meditationData = (s?.meditation ?? []).map((m) => ({
    label: fmt(parseYmd(m.date), 'dd/MM'), Atenção: m.attention, Espacial: m.spatial, Sonoro: m.sound, Imagético: m.imagery, 'Estado após': m.afterState,
  }));
  const tooltipStyle = { background: cssVar('--surface-2'), border: `1px solid ${cssVar('--line-strong')}`, borderRadius: 12, color: cssVar('--ink') };
  const tooltipLabel = { color: cssVar('--ink') };

  return (
    <div className="page dashboard">
      <PageHeader title="Dashboard" subtitle="Como seus dias têm sido — sem notas, só continuidade. O nível mínimo conta como dia cumprido.">
        <div className="btn-group" role="group" aria-label="Período">
          {RANGES.map((r) => <button key={r} className="btn" aria-pressed={days === r} onClick={() => setDays(r)}>{r} dias</button>)}
        </div>
      </PageHeader>
      <ErrorText error={stats.error} />

      {s && (
        <>
          <section className="panel summary">
            <p className="summary-line">
              {s.currentStreak > 0
                ? `${s.currentStreak} ${s.currentStreak === 1 ? 'dia seguido' : 'dias seguidos'} com tudo registrado, ao menos no mínimo.`
                : 'Nenhuma sequência ativa. Um dia no mínimo já preserva a continuidade.'}
            </p>
            <dl className="totals">
              <div className="tot min"><dt>Mínimo</dt><dd>{s.totals.min}</dd></div>
              <div className="tot ideal"><dt>Ideal</dt><dd>{s.totals.ideal}</dd></div>
              <div className="tot max"><dt>Máximo</dt><dd>{s.totals.max}</dd></div>
              <div className="tot missed"><dt>Sem registro</dt><dd>{s.totals.applicable - s.totals.done}</dd></div>
            </dl>
          </section>

          <section className="panel">
            <h2>Execução por dia</h2>
            {chartData.length === 0 ? <p className="empty">Sem dados no período.</p> : (
              <div className="chart">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={cssVar('--line')} />
                    <XAxis dataKey="label" tick={{ fill: cssVar('--ink-soft'), fontSize: 12 }} tickLine={false} minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fill: cssVar('--ink-soft'), fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} cursor={{ fill: cssVar('--sunken') }} />
                    <Legend wrapperStyle={{ color: cssVar('--ink-soft'), fontSize: 12 }} />
                    <Bar dataKey="min" name="Mínimo" stackId="d" fill={cssVar('--min')} />
                    <Bar dataKey="ideal" name="Ideal" stackId="d" fill={cssVar('--ideal')} />
                    <Bar dataKey="max" name="Máximo" stackId="d" fill={cssVar('--max')} />
                    <Bar dataKey="missed" name="Sem registro" stackId="d" fill={cssVar('--line')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="two-col">
            <section className="panel">
              <h2>Por atividade</h2>
              {s.byActivity.length === 0 && <p className="empty">Nenhuma atividade no período.</p>}
              <ul className="by-activity">
                {s.byActivity.map((a) => (
                  <li key={a.activityId}>
                    <div className="by-line"><strong>{a.name}</strong><span className="muted">{KIND_GROUP[a.kind]}</span></div>
                    <div className="stack" role="img" aria-label={`${a.name}: mínimo ${a.min}, ideal ${a.ideal}, máximo ${a.max}, sem registro ${a.missed}`}>
                      <span className="seg min" style={{ flexGrow: a.min }} />
                      <span className="seg ideal" style={{ flexGrow: a.ideal }} />
                      <span className="seg max" style={{ flexGrow: a.max }} />
                      <span className="seg missed" style={{ flexGrow: a.missed }} />
                    </div>
                    <p className="muted small">mín {a.min} · ideal {a.ideal} · máx {a.max} · sem registro {a.missed}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <h2>Meditação</h2>
              {meditationData.length === 0 ? (
                <p className="empty">Nenhuma sessão no período. Registre a primeira abaixo.</p>
              ) : (
                <>
                  <p className="muted small">
                    {s.meditation.length} {s.meditation.length === 1 ? 'sessão' : 'sessões'} · média de{' '}
                    {Math.round(s.meditation.reduce((t, m) => t + m.durationMin, 0) / s.meditation.length)} min
                  </p>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={meditationData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={cssVar('--line')} />
                        <XAxis dataKey="label" tick={{ fill: cssVar('--ink-soft'), fontSize: 12 }} tickLine={false} />
                        <YAxis domain={[0, 10]} tick={{ fill: cssVar('--ink-soft'), fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} />
                        <Legend wrapperStyle={{ color: cssVar('--ink-soft'), fontSize: 12 }} />
                        {[['Atenção', '--accent'], ['Espacial', '--min'], ['Sonoro', '--ideal'], ['Imagético', '--max'], ['Estado após', '--danger']].map(([key, v]) => (
                          <Line key={key} type="monotone" dataKey={key} stroke={cssVar(v)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}

      <div className="two-col">
        <ReviewCard />
        <MeditationCard />
      </div>

      <ReadingCard />

      <section className="panel">
        <h2>Revisões recentes</h2>
        {(reviews.data ?? []).length === 0 && <p className="empty">Nenhuma revisão no período.</p>}
        <ul className="reviews">
          {(reviews.data ?? []).map((r) => (
            <li key={r.date}>
              <details>
                <summary><span className="muted">{fmt(parseYmd(r.date), "d 'de' MMM")}</span> {r.learned || r.responsibilities || r.goals || r.state || '(sem texto)'}</summary>
                <dl>
                  <dt>Responsabilidades</dt><dd>{r.responsibilities || '—'}</dd>
                  <dt>Objetivos</dt><dd>{r.goals || '—'}</dd>
                  <dt>Estado</dt><dd>{r.state || '—'}</dd>
                  <dt>Aprendi</dt><dd>{r.learned || '—'}</dd>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReviewCard() {
  const [date, setDate] = useState(() => ymd(new Date()));
  const review = useQuery({ queryKey: ['review', date], queryFn: () => api.get<{ date: string; review: DailyReview | null }>(`/reviews/${date}`) });
  return (
    <section className="panel">
      <h2>Revisão do dia</h2>
      <Field label="Data"><input type="date" value={date} max={ymd(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
      {review.data && <ReviewForm key={date} date={date} initial={review.data.review} />}
    </section>
  );
}

function ReviewForm({ date, initial }: { date: string; initial: DailyReview | null }) {
  const [f, setF] = useState({ responsibilities: initial?.responsibilities ?? '', goals: initial?.goals ?? '', state: initial?.state ?? '', learned: initial?.learned ?? '' });
  const save = useAction(() => api.put(`/reviews/${date}`, f));
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
      <Field label="Cumpri minhas responsabilidades?"><textarea rows={2} value={f.responsibilities} onChange={(e) => set('responsibilities', e.target.value)} /></Field>
      <Field label="Mantive meus objetivos?"><textarea rows={2} value={f.goals} onChange={(e) => set('goals', e.target.value)} /></Field>
      <Field label="Como estavam meu estado mental, físico e espiritual?"><textarea rows={2} value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
      <Field label="O que aprendi sobre mim hoje?"><textarea rows={2} value={f.learned} onChange={(e) => set('learned', e.target.value)} /></Field>
      <ErrorText error={save.error} />
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={save.isPending}>Salvar revisão</button>
        {save.isSuccess && <span className="muted small">Salva.</span>}
      </div>
    </form>
  );
}

const SCORES = [
  ['attention', 'Atenção'], ['spatial', 'Reconstrução espacial'], ['sound', 'Localização sonora'], ['imagery', 'Imagética'], ['afterState', 'Estado após'],
] as const;

/** Some quando não há nenhum livro cadastrado: não polui o dashboard de quem não usa o módulo. */
function ReadingCard() {
  const overview = useQuery({ queryKey: ['reading', 'overview'], queryFn: () => api.get<ReadingOverview>('/reading/overview') });
  const o = overview.data;
  if (!o || o.totalBooks === 0) return null;
  return (
    <section className="panel">
      <h2>Leitura</h2>
      <dl className="totals">
        <div className="tot ideal"><dt>Lendo agora</dt><dd>{o.reading.length}</dd></div>
        <div className="tot min"><dt>Páginas este mês</dt><dd>{o.pagesThisMonth}</dd></div>
        <div className="tot max"><dt>Terminados em {new Date().getFullYear()}</dt><dd>{o.finishedThisYear}</dd></div>
        <div className="tot"><dt>Sequência</dt><dd>{o.streak}</dd></div>
      </dl>
      {o.reading.length > 0 && (
        <ul className="rd-sessions">
          {o.reading.map((b) => {
            const pct = progressPct(b);
            return <li key={b.id}><b>{b.title}</b><span>{pct !== null ? `${b.currentPage}/${b.totalPages} páginas (${pct}%)` : `${b.currentPage} páginas`}</span></li>;
          })}
        </ul>
      )}
      <div className="form-actions"><NavLink to="/leitura" className="btn small">Ver estante</NavLink></div>
    </section>
  );
}

function MeditationCard() {
  const [date, setDate] = useState(() => ymd(new Date()));
  const [duration, setDuration] = useState('15');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const save = useAction(() => {
    const payload: Record<string, unknown> = { date, durationMin: Number(duration), note };
    for (const [key] of SCORES) payload[key] = scores[key] === undefined || scores[key] === '' ? null : Number(scores[key]);
    return api.post('/meditations', payload);
  }, () => { setScores({}); setNote(''); });

  return (
    <section className="panel">
      <h2>Registrar meditação</h2>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <div className="row">
          <Field label="Data"><input type="date" value={date} max={ymd(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
          <Field label="Duração (min)"><input type="number" min={1} max={300} value={duration} onChange={(e) => setDuration(e.target.value)} required /></Field>
        </div>
        <p className="muted small">Notas de 0 a 10 para a própria prática — opcionais. Deixe em branco o que não quiser medir.</p>
        <div className="scores">
          {SCORES.map(([key, label]) => (
            <Field key={key} label={label}>
              <input type="number" min={0} max={10} value={scores[key] ?? ''} onChange={(e) => setScores((p) => ({ ...p, [key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <Field label="Observação"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorText error={save.error} />
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={save.isPending || !Number(duration)}>Registrar sessão</button>
          {save.isSuccess && <span className="muted small">Registrada.</span>}
        </div>
      </form>
    </section>
  );
}
