// Insights financeiros: só regras sobre dados reais do usuário. Cada um diz o que viu (`why`) e o que dá para fazer.
import { addDays, diffDays } from '../../domain/dates';
import { brl } from '../../domain/money';
import {
  balances, budgetStatus, cardInvoices, clampDay, dayOf, daysInMonth, incomeCommitment, isRealized, prevMonth, upcoming, ym,
} from './analytics';
import type { FinCategory, FinData, FinTransaction, Insight } from './types';

const SEVERITY_ORDER = { high: 0, attention: 1, info: 2 } as const;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const label = (t: FinTransaction) => norm(t.merchant || t.description);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pctText = (cur: number, prev: number) => `${cur >= prev ? '+' : '−'}${Math.abs(Math.round(((cur - prev) / prev) * 100))}%`;

const topCategory = (cats: FinCategory[], id: string | null) => {
  const c = cats.find((x) => x.id === id);
  return c?.parentId ? cats.find((x) => x.id === c.parentId) ?? c : c;
};

const openTx = (m: string, extra = '') => `/financas?tab=movimentacoes&month=${m}${extra}`;

export function computeInsights(d: FinData): Insight[] {
  const out: Insight[] = [];
  const month = ym(d.today);
  const dd = dayOf(d.today);
  const pm = prevMonth(month);
  const prevEnd = clampDay(pm, dd);
  const expenses = d.txs.filter((t) => t.kind === 'expense' && isRealized(t, d.today));
  const inRange = (t: FinTransaction, from: string, to: string) => t.occurredOn >= from && t.occurredOn <= to;
  const cur = expenses.filter((t) => ym(t.occurredOn) === month);
  const prevSame = expenses.filter((t) => inRange(t, `${pm}-01`, prevEnd));
  const sum = (xs: FinTransaction[]) => xs.reduce((n, t) => n + t.amountCents, 0);

  // 1) Categorias com maior crescimento (mesmo período do mês anterior)
  const groups = new Map<string, { name: string; cur: FinTransaction[]; prev: FinTransaction[] }>();
  for (const [list, field] of [[cur, 'cur'], [prevSame, 'prev']] as const) {
    for (const t of list) {
      const top = topCategory(d.categories, t.categoryId);
      const id = top?.id ?? 'none';
      const g = groups.get(id) ?? { name: top?.name ?? 'Sem categoria', cur: [], prev: [] };
      g[field].push(t); groups.set(id, g);
    }
  }
  for (const [id, g] of groups) {
    const c = sum(g.cur); const p = sum(g.prev);
    if (id === 'none' || p < 5000 || c < p * 1.3 || c - p < 10000) continue;
    const biggest = [...g.cur].sort((a, b) => b.amountCents - a.amountCents).slice(0, 3);
    out.push({
      key: `growth:${id}:${month}`, type: 'category_growth', severity: c - p >= 30000 ? 'attention' : 'info',
      title: `${g.name} subiu ${pctText(c, p).replace('+', '')} em relação ao mês passado`,
      summary: `Você gastou ${brl(c)} em ${g.name} até o dia ${dd}, contra ${brl(p)} no mesmo período do mês anterior.`,
      why: [
        `${g.name}: ${brl(c)} em ${g.cur.length} compra(s) de 1 a ${dd} deste mês`,
        `${g.name}: ${brl(p)} em ${g.prev.length} compra(s) de 1 a ${dd} do mês anterior`,
        ...biggest.map((t) => `Maior(es): ${t.description || t.merchant || 'compra'} — ${brl(t.amountCents)} em ${t.occurredOn.slice(8)}/${t.occurredOn.slice(5, 7)}`),
      ],
      actions: [{ kind: 'open', label: 'Ver movimentações', href: openTx(month, id === 'none' ? '' : `&category=${id}`) }, { kind: 'chat', label: 'Analisar com o assistente', prompt: `Analise por que meus gastos com ${g.name} aumentaram este mês e o que posso ajustar.` }],
    });
  }

  // 2) Compras fora do padrão: bem acima da mediana da mesma categoria
  for (const t of expenses.filter((x) => x.occurredOn >= addDays(d.today, -14))) {
    if (!t.categoryId) continue;
    const base = expenses.filter((x) => x.id !== t.id && x.categoryId === t.categoryId && x.occurredOn < t.occurredOn && x.occurredOn >= addDays(t.occurredOn, -150));
    if (base.length < 5) continue;
    const med = median(base.map((x) => x.amountCents));
    if (t.amountCents < med * 3 || t.amountCents < 10000) continue;
    out.push({
      key: `unusual:${t.id}`, type: 'unusual_purchase', severity: t.amountCents >= med * 6 ? 'high' : 'attention',
      title: `Compra fora do padrão: ${t.merchant || t.description || 'despesa'}`,
      summary: `${brl(t.amountCents)} em ${t.occurredOn.slice(8)}/${t.occurredOn.slice(5, 7)} — cerca de ${Math.round(t.amountCents / med)}× o valor típico dessa categoria.`,
      why: [`Valor: ${brl(t.amountCents)}`, `Mediana das últimas ${base.length} compras da categoria: ${brl(Math.round(med))}`, `Categoria: ${d.categories.find((c) => c.id === t.categoryId)?.name ?? '—'}`],
      actions: [{ kind: 'open', label: 'Ver movimentação', href: openTx(ym(t.occurredOn), `&highlight=${t.id}`) }, { kind: 'chat', label: 'Revisar com o assistente', prompt: `Revise a compra de ${brl(t.amountCents)} em ${t.merchant || t.description}. Ela está correta ou parece um erro?` }],
    });
  }

  // 3) Cobranças recorrentes que não apareceram (histórico de 3 meses seguidos + recorrências cadastradas)
  const byLabel = new Map<string, FinTransaction[]>();
  for (const t of expenses) { const l = label(t); if (l) byLabel.set(l, [...(byLabel.get(l) ?? []), t]); }
  const seenMissing = new Set<string>();
  for (const [l, list] of byLabel) {
    const months = [prevMonth(month), prevMonth(prevMonth(month)), prevMonth(prevMonth(prevMonth(month)))];
    const per = months.map((m) => list.filter((t) => ym(t.occurredOn) === m));
    if (per.some((p) => p.length === 0) || list.some((t) => ym(t.occurredOn) === month)) continue;
    const amounts = per.map((p) => p[0].amountCents);
    if (Math.max(...amounts) > Math.min(...amounts) * 1.15) continue; // valores diferentes demais: não é cobrança fixa
    const usualDay = Math.round(per.reduce((n, p) => n + dayOf(p[0].occurredOn), 0) / 3);
    if (dd < usualDay + 5) continue;
    seenMissing.add(l);
    const name = per[0][0].merchant || per[0][0].description;
    out.push({
      key: `missing:${l}:${month}`, type: 'missing_recurring', severity: 'attention',
      title: `A cobrança de ${name} não apareceu este mês`,
      summary: `Ela costuma cair por volta do dia ${usualDay}, em ${brl(amounts[0])}. Pode ter sido cancelada, atrasada ou não importada.`,
      why: [...months.map((m, i) => `${m}: ${brl(per[i][0].amountCents)} em ${per[i][0].occurredOn.slice(8)}/${m.slice(5)}`), `Neste mês (até dia ${dd}): nenhum lançamento`],
      actions: [{ kind: 'open', label: 'Ver histórico', href: openTx(month, `&q=${encodeURIComponent(name)}`) }, { kind: 'chat', label: 'Revisar com o assistente', prompt: `A cobrança de ${name} não apareceu este mês. Ajude-me a verificar se foi cancelada ou se esqueci de lançar.` }],
    });
  }
  for (const r of d.recurring) {
    if (!r.active || r.kind !== 'expense' || r.nextDue >= addDays(d.today, -3) || seenMissing.has(norm(r.description))) continue;
    const paid = d.txs.some((t) => t.kind === 'expense' && (t.recurringId === r.id || label(t).includes(norm(r.description))) && t.occurredOn >= addDays(r.nextDue, -7));
    if (paid) continue;
    out.push({
      key: `missing-rec:${r.id}:${r.nextDue}`, type: 'missing_recurring', severity: 'attention',
      title: `${r.description} está sem lançamento`,
      summary: `Estava prevista para ${r.nextDue.slice(8)}/${r.nextDue.slice(5, 7)} (${brl(r.amountCents)}) e não há movimentação correspondente.`,
      why: [`Recorrência cadastrada: ${brl(r.amountCents)}, próxima data ${r.nextDue}`, 'Nenhuma despesa parecida encontrada desde uma semana antes da data'],
      actions: [{ kind: 'open', label: 'Ver recorrências', href: '/financas?tab=recorrentes' }],
    });
  }

  // 4) Possíveis cobranças duplicadas
  const recent = d.txs.filter((t) => t.kind === 'expense' && t.occurredOn >= addDays(d.today, -30) && label(t));
  const dupSeen = new Set<string>();
  for (let i = 0; i < recent.length; i++) for (let j = i + 1; j < recent.length; j++) {
    const a = recent[i]; const b = recent[j];
    if (a.accountId !== b.accountId || a.amountCents !== b.amountCents || label(a) !== label(b) || Math.abs(diffDays(a.occurredOn, b.occurredOn)) > 3) continue;
    if (a.recurringId && a.recurringId === b.recurringId) continue;
    const key = `dup:${[a.id, b.id].sort().join(':')}`;
    if (dupSeen.has(key)) continue; dupSeen.add(key);
    out.push({
      key, type: 'duplicate_charge', severity: 'attention',
      title: `Possível cobrança duplicada: ${a.merchant || a.description}`,
      summary: `Duas cobranças de ${brl(a.amountCents)} na mesma conta em ${Math.abs(diffDays(a.occurredOn, b.occurredOn))} dia(s) de diferença.`,
      why: [a, b].map((t) => `${t.occurredOn}: ${t.merchant || t.description} — ${brl(t.amountCents)}`),
      actions: [{ kind: 'open', label: 'Ver movimentações', href: openTx(ym(a.occurredOn), `&highlight=${a.id}`) }],
    });
  }

  // 5) Estabelecimentos mais frequentes no mês
  const merchants = new Map<string, { name: string; n: number; cents: number }>();
  for (const t of cur) { const l = norm(t.merchant); if (!l) continue; const m = merchants.get(l) ?? { name: t.merchant, n: 0, cents: 0 }; m.n++; m.cents += t.amountCents; merchants.set(l, m); }
  const topM = [...merchants.values()].filter((m) => m.n >= 2).sort((a, b) => b.n - a.n || b.cents - a.cents).slice(0, 3);
  if (topM.length) out.push({
    key: `merchants:${month}`, type: 'top_merchants', severity: 'info', title: 'Onde você mais comprou neste mês',
    summary: topM.map((m) => `${m.name} (${m.n}×)`).join(', ') + '.',
    why: topM.map((m) => `${m.name}: ${m.n} compras, ${brl(m.cents)} no total`), actions: [{ kind: 'open', label: 'Ver movimentações', href: openTx(month) }],
  });

  // 6) Comparação com o mês anterior (mesmo período)
  if (sum(cur) > 0 && sum(prevSame) > 0) {
    const c = sum(cur); const p = sum(prevSame);
    out.push({
      key: `compare:${month}`, type: 'month_compare', severity: 'info',
      title: c > p ? `Você gastou ${pctText(c, p).replace('+', '')} a mais que no mês passado` : `Você gastou ${pctText(c, p).replace('−', '')} a menos que no mês passado`,
      summary: `${brl(c)} até o dia ${dd}, contra ${brl(p)} no mesmo período do mês anterior.`,
      why: [`Este mês (1–${dd}): ${brl(c)} em ${cur.length} despesas`, `Mês anterior (1–${dd}): ${brl(p)} em ${prevSame.length} despesas`], actions: [{ kind: 'open', label: 'Ver visão geral', href: '/financas?tab=visao' }],
    });
  }

  // 7) Pequenas compras recorrentes
  const small = cur.filter((t) => t.amountCents < 3000);
  if (small.length >= 8) out.push({
    key: `small:${month}`, type: 'small_purchases', severity: 'info', title: 'Pequenas compras somam bastante',
    summary: `${small.length} compras abaixo de R$ 30 somaram ${brl(sum(small))} neste mês (${Math.round((sum(small) / Math.max(1, sum(cur))) * 100)}% do que você gastou).`,
    why: [`${small.length} compras abaixo de R$ 30,00`, `Total: ${brl(sum(small))} · média ${brl(Math.round(sum(small) / small.length))}`, `Gasto total do mês até agora: ${brl(sum(cur))}`], actions: [{ kind: 'open', label: 'Ver movimentações', href: openTx(month) }],
  });

  // 8) Projeção do saldo até o fim do mês
  const bal = balances(d);
  const liquid = d.accounts.filter((a) => !a.archived && a.kind !== 'credit_card').reduce((n, a) => n + (bal.get(a.id)?.balanceCents ?? 0), 0);
  if (dd >= 3) {
    const monthEnd = clampDay(month, 31);
    const ups = upcoming(d, diffDays(d.today, monthEnd)).filter((u) => u.date <= monthEnd);
    const outgoing = ups.filter((u) => u.direction === 'out').reduce((n, u) => n + u.cents, 0);
    const incoming = ups.filter((u) => u.direction === 'in').reduce((n, u) => n + u.cents, 0);
    const variable = cur.filter((t) => !t.recurringId && t.accountId && d.accounts.find((a) => a.id === t.accountId)?.kind !== 'credit_card');
    const daily = sum(variable) / dd;
    const rest = daysInMonth(month) - dd;
    const projected = Math.round(liquid + incoming - outgoing - daily * rest);
    const sev = projected < 0 ? 'high' : projected < liquid * 0.15 ? 'attention' : 'info';
    out.push({
      key: `projection:${month}`, type: 'projection', severity: sev,
      title: projected < 0 ? 'Seu saldo pode ficar negativo antes do fim do mês' : `Saldo projetado para o fim do mês: ${brl(projected)}`,
      summary: `Estimativa com o saldo de hoje, os vencimentos já cadastrados e o seu ritmo de gastos variáveis (${brl(Math.round(daily))} por dia).`,
      why: [`Saldo em contas hoje: ${brl(liquid)}`, `A receber até o fim do mês: ${brl(incoming)}`, `A pagar até o fim do mês (contas, recorrências e faturas): ${brl(outgoing)}`, `Gastos variáveis previstos: ${brl(Math.round(daily * rest))} (${rest} dias × ${brl(Math.round(daily))})`],
      actions: [{ kind: 'open', label: 'Ver próximos vencimentos', href: '/financas?tab=visao' }, { kind: 'chat', label: 'Planejar com o assistente', prompt: 'Com base na projeção do meu saldo, o que posso ajustar até o fim do mês?' }],
    });
  }

  // 9) Orçamentos
  for (const b of budgetStatus(d, month)) {
    if (b.state === 'ok') continue;
    out.push({
      key: `budget:${b.budget.id}:${month}:${b.state}`, type: 'budget', severity: b.state === 'exceeded' ? 'high' : 'attention',
      title: b.state === 'exceeded' ? `Orçamento de ${b.name} estourou` : `Risco de estourar o orçamento de ${b.name}`,
      summary: b.state === 'exceeded' ? `Você já gastou ${brl(b.spentCents)} de ${brl(b.budget.limitCents)}.` : `No ritmo atual, ${b.name} chega a ${brl(b.projectedCents)} contra um limite de ${brl(b.budget.limitCents)}.`,
      why: [`Gasto no mês: ${brl(b.spentCents)} (${b.pct}% do limite)`, `Limite mensal: ${brl(b.budget.limitCents)}`, `Projeção no ritmo atual: ${brl(b.projectedCents)}`],
      actions: [{ kind: 'open', label: 'Ver orçamentos', href: '/financas?tab=orcamentos' }, { kind: 'chat', label: 'Ajustar com o assistente', prompt: `O orçamento de ${b.name} está ${b.state === 'exceeded' ? 'estourado' : 'em risco'}. O que posso fazer?` }],
    });
  }

  // 10) Renda comprometida
  const commit = incomeCommitment(d, month);
  if (commit.committedCents > 0 && commit.pct >= 50) out.push({
    key: `committed:${month}`, type: 'income_committed', severity: commit.pct >= 90 ? 'high' : commit.pct >= 70 ? 'attention' : 'info',
    title: `${commit.pct}% da sua renda já está comprometida`,
    summary: `Despesas fixas e faturas a pagar somam ${brl(commit.committedCents)} para uma renda média de ${brl(commit.incomeCents)}.`,
    why: [`Renda média (últimos meses com receita): ${brl(commit.incomeCents)}`, `Recorrências ativas por mês: ${brl(commit.fixedCents)}`, `Faturas fechadas a pagar: ${brl(commit.invoicesCents)}`], actions: [{ kind: 'open', label: 'Ver recorrências', href: '/financas?tab=recorrentes' }],
  });

  // 11) Evolução da reserva (contas do tipo poupança/reserva)
  const reserve = d.accounts.filter((a) => a.kind === 'savings' && !a.archived);
  if (reserve.length) {
    const now = reserve.reduce((n, a) => n + (bal.get(a.id)?.balanceCents ?? 0), 0);
    const cutoff = addDays(d.today, -90);
    const before = reserve.reduce((n, a) => n + a.initialBalanceCents + d.txs.filter((t) => t.status === 'confirmed' && t.occurredOn <= cutoff).reduce((k, t) => k + (t.accountId === a.id || t.transferAccountId === a.id ? deltaLocal(t, a.id) : 0), 0), 0);
    if (now !== before) out.push({
      key: `reserve:${month}`, type: 'reserve', severity: 'info', title: now > before ? 'Sua reserva cresceu nos últimos 3 meses' : 'Sua reserva diminuiu nos últimos 3 meses',
      summary: `${brl(before)} → ${brl(now)} (${now > before ? '+' : '−'}${brl(Math.abs(now - before))}).`,
      why: [`Contas de reserva consideradas: ${reserve.map((a) => a.name).join(', ')}`, `Há 90 dias: ${brl(before)}`, `Hoje: ${brl(now)}`], actions: [{ kind: 'open', label: 'Ver visão geral', href: '/financas?tab=visao' }],
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.type.localeCompare(b.type));
}

function deltaLocal(t: FinTransaction, id: string) {
  if (t.kind === 'income') return t.accountId === id ? t.amountCents : 0;
  if (t.kind === 'expense') return t.accountId === id ? -t.amountCents : 0;
  return t.accountId === id ? -t.amountCents : t.transferAccountId === id ? t.amountCents : 0;
}
