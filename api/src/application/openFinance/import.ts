// Plano de importação (puro, sem banco): decide o que criar, o que conciliar e o que atualizar.
// Regras: nunca duplica; nunca sobrescreve o que você lançou à mão; só junta transferências quando há um par único e claro.
import { diffDays } from '../../domain/dates';
import type { FinTransaction, TxKind } from '../finance/types';
import type { RemoteTx } from './types';

export interface BatchItem { accountId: string; tx: RemoteTx }
export interface PlannedCreate {
  accountId: string; kind: TxKind; amountCents: number; occurredOn: string; description: string; merchant: string;
  categoryId: string | null; status: 'pending' | 'confirmed'; transferAccountId: string | null; externalId: string;
  seen: { accountId: string; externalId: string }[];
}
export interface PlannedUpdate { txId: string; accountId: string; externalId: string; patch: { status?: 'confirmed' | 'pending'; amountCents?: number; occurredOn?: string; externalId?: string } }
export interface ImportPlan { creates: PlannedCreate[]; reconciles: PlannedUpdate[]; updates: PlannedUpdate[]; stats: { created: number; transfers: number; reconciled: number; updated: number; skipped: number } }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const seenKey = (accountId: string, externalId: string) => `${accountId}|${externalId}`;

export function planImport(input: { batch: BatchItem[]; seen: Map<string, string | null>; existing: FinTransaction[] }): ImportPlan {
  const { batch, seen, existing } = input;
  const byId = new Map(existing.map((t) => [t.id, t]));
  const plan: ImportPlan = { creates: [], reconciles: [], updates: [], stats: { created: 0, transfers: 0, reconciled: 0, updated: 0, skipped: 0 } };

  // 1) o que já foi visto: só atualiza pendente -> confirmada (ou valor/data que o banco corrigiu)
  const fresh: BatchItem[] = [];
  for (const b of batch) {
    const key = seenKey(b.accountId, b.tx.id);
    if (!seen.has(key)) { fresh.push(b); continue; }
    const local = byId.get(seen.get(key) ?? '');
    if (local && local.status === 'pending' && !b.tx.pending && local.source !== 'manual') {
      plan.updates.push({ txId: local.id, accountId: b.accountId, externalId: b.tx.id, patch: { status: 'confirmed', amountCents: b.tx.amountCents, occurredOn: b.tx.date } });
      plan.stats.updated++;
    } else plan.stats.skipped++;
  }

  // 2) transferências entre contas suas: par único (mesmo valor, contas diferentes, até 1 dia de diferença)
  const outs = fresh.filter((b) => b.tx.direction === 'out');
  const ins = fresh.filter((b) => b.tx.direction === 'in');
  const near = (a: BatchItem, b: BatchItem) => a.accountId !== b.accountId && a.tx.amountCents === b.tx.amountCents && Math.abs(diffDays(a.tx.date, b.tx.date)) <= 1;
  const paired = new Set<BatchItem>();
  for (const o of outs) {
    const cand = ins.filter((i) => near(o, i));
    if (cand.length !== 1) continue;
    const back = outs.filter((x) => near(x, cand[0]));
    if (back.length !== 1) continue; // ambíguo: melhor não juntar do que juntar errado
    const i = cand[0];
    paired.add(o); paired.add(i);
    plan.creates.push({
      accountId: o.accountId, kind: 'transfer', amountCents: o.tx.amountCents, occurredOn: o.tx.date < i.tx.date ? o.tx.date : i.tx.date,
      description: o.tx.description || 'Transferência', merchant: '', categoryId: null, status: o.tx.pending || i.tx.pending ? 'pending' : 'confirmed',
      transferAccountId: i.accountId, externalId: o.tx.id, seen: [{ accountId: o.accountId, externalId: o.tx.id }, { accountId: i.accountId, externalId: i.tx.id }],
    });
    plan.stats.transfers++;
  }

  // 3) o resto: concilia com lançamento manual (par único) ou cria como importada
  const learned = new Map<string, string>(); // descrição -> categoria já usada antes
  for (const t of [...existing].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))) {
    const k = norm(t.merchant || t.description);
    if (k && t.categoryId && !learned.has(k)) learned.set(k, t.categoryId);
  }
  const claimed = new Set<string>();
  for (const b of fresh) {
    if (paired.has(b)) continue;
    const kind: TxKind = b.tx.direction === 'in' ? 'income' : 'expense';
    const matches = existing.filter((e) => e.source === 'manual' && !e.externalId && e.kind === kind && e.accountId === b.accountId
      && e.amountCents === b.tx.amountCents && Math.abs(diffDays(e.occurredOn, b.tx.date)) <= 3 && !claimed.has(e.id));
    if (matches.length === 1) {
      claimed.add(matches[0].id);
      plan.reconciles.push({ txId: matches[0].id, accountId: b.accountId, externalId: b.tx.id, patch: { externalId: b.tx.id, ...(b.tx.pending ? {} : { status: 'confirmed' as const }) } });
      plan.stats.reconciled++;
      continue;
    }
    plan.creates.push({
      accountId: b.accountId, kind, amountCents: b.tx.amountCents, occurredOn: b.tx.date, description: b.tx.description, merchant: b.tx.description,
      categoryId: learned.get(norm(b.tx.description)) ?? null, status: b.tx.pending ? 'pending' : 'confirmed', transferAccountId: null, externalId: b.tx.id,
      seen: [{ accountId: b.accountId, externalId: b.tx.id }],
    });
    plan.stats.created++;
  }
  return plan;
}
