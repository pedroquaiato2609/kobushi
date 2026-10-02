import { useContext } from 'react';
import { brl, brlShort } from '../../lib/money';
import { monthShort, PrivacyCtx } from './shared';

const niceMax = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

/** Receitas × despesas por mês. Cada barra é um valor real; o título (tooltip) traz o número exato. */
export function CashFlowChart({ data }: { data: { month: string; incomeCents: number; expenseCents: number }[] }) {
  const hide = useContext(PrivacyCtx);
  const W = 640; const H = 210; const padL = 44; const padB = 24; const padT = 8;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.expenseCents])));
  const gw = (W - padL) / data.length; const bw = Math.min(16, gw / 3);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const hasData = data.some((d) => d.incomeCents || d.expenseCents);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Receitas e despesas dos últimos 12 meses">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(max * t)} y2={y(max * t)} className="grid" />
            {!hide && <text x={padL - 6} y={y(max * t) + 4} textAnchor="end" className="axis">{brlShort(max * t)}</text>}
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + gw * i + gw / 2;
          return (
            <g key={d.month}>
              <title>{hide ? d.month : `${monthShort(d.month)}/${d.month.slice(0, 4)} — receitas ${brl(d.incomeCents)} · despesas ${brl(d.expenseCents)}`}</title>
              <rect x={cx - bw - 1} y={y(d.incomeCents)} width={bw} height={Math.max(0, H - padB - y(d.incomeCents))} rx="3" className="bar income" />
              <rect x={cx + 1} y={y(d.expenseCents)} width={bw} height={Math.max(0, H - padB - y(d.expenseCents))} rx="3" className="bar expense" />
              <text x={cx} y={H - 6} textAnchor="middle" className="axis">{monthShort(d.month)}</text>
            </g>
          );
        })}
      </svg>
      {!hasData && <figcaption className="chart-empty">Sem movimentações neste período.</figcaption>}
      <div className="legend"><span><i className="sw income" />Receitas</span><span><i className="sw expense" />Despesas</span></div>
    </figure>
  );
}

/** Evolução do patrimônio líquido (contas − dívidas de cartão). */
export function PatrimonyChart({ data }: { data: { month: string; netCents: number }[] }) {
  const hide = useContext(PrivacyCtx);
  const W = 640; const H = 190; const padL = 44; const padB = 24; const padT = 12;
  const vals = data.map((d) => d.netCents);
  const lo = Math.min(...vals, 0); const hi = Math.max(...vals, 1);
  const span = hi - lo || 1;
  const x = (i: number) => padL + ((W - padL - 12) * i) / Math.max(1, data.length - 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / span);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.netCents).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const last = data[data.length - 1]; const first = data[0];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolução do patrimônio líquido nos últimos 12 meses">
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="grid" />
            {!hide && <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="axis">{brlShort(v)}</text>}
          </g>
        ))}
        {lo < 0 && <line x1={padL} x2={W} y1={y(0)} y2={y(0)} className="zero" />}
        <path d={area} className="area" />
        <path d={line} className="line" />
        {data.map((d, i) => (
          <g key={d.month}>
            <title>{hide ? d.month : `${monthShort(d.month)}/${d.month.slice(0, 4)} — ${brl(d.netCents)}`}</title>
            <circle cx={x(i)} cy={y(d.netCents)} r={i === data.length - 1 ? 4.5 : 2.5} className="dot" />
            {(i === 0 || i === data.length - 1 || i % 3 === 0) && <text x={x(i)} y={H - 6} textAnchor="middle" className="axis">{monthShort(d.month)}</text>}
          </g>
        ))}
      </svg>
      <div className="legend"><span>{hide ? '' : `${monthShort(first.month)}: ${brl(first.netCents)} → ${monthShort(last.month)}: ${brl(last.netCents)}`}</span></div>
    </figure>
  );
}

/** Rosca de gastos por categoria: o arco de cada fatia é proporcional ao valor. */
export function Donut({ slices, total, label = 'gastos', ariaLabel = 'Gastos por categoria', centerCents }: {
  slices: { name: string; cents: number; color: string }[]; total: number; label?: string; ariaLabel?: string; centerCents?: number;
}) {
  const hide = useContext(PrivacyCtx);
  let acc = 0;
  return (
    <svg viewBox="0 0 42 42" className="donut" role="img" aria-label={ariaLabel}>
      <circle cx="21" cy="21" r="15.9155" className="donut-bg" />
      {total > 0 && slices.map((s) => {
        const pct = (s.cents / total) * 100;
        const el = <circle key={s.name} cx="21" cy="21" r="15.9155" fill="none" stroke={s.color} strokeWidth="5" strokeDasharray={`${Math.max(0, pct - 0.6)} ${100 - Math.max(0, pct - 0.6)}`} strokeDashoffset={25 - acc} transform="rotate(0 21 21)"><title>{hide ? s.name : `${s.name}: ${brl(s.cents)} (${Math.round(pct)}%)`}</title></circle>;
        acc += pct;
        return el;
      })}
      <text x="21" y="20" textAnchor="middle" className="donut-l">{label}</text>
      <text x="21" y="26" textAnchor="middle" className="donut-v">{hide ? '••••' : brlShort(centerCents ?? total)}</text>
    </svg>
  );
}
