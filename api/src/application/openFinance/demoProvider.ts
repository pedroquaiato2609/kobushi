// Provedor de DEMONSTRAÇÃO: um banco fictício com dados gerados. Serve para conhecer o fluxo (consentimento, sincronização,
// conciliação, transferências) sem nenhum banco real. Tudo o que ele importa é marcado como DEMO e removível.
import { addDays } from '../../domain/dates';
import { clampDay, monthsBack, ym } from '../finance/analytics';
import type { ConnectStart, OpenFinanceProvider, RemoteAccount, RemoteItem, RemoteTx } from './types';

export const DEMO_INSTITUTION = 'Banco Demonstração (fictício)';
const OPENING = { chk: 250000, sav: 800000 };

export class DemoOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = 'demo' as const;
  readonly label = 'Demonstração — banco fictício, nenhum dado real';
  readonly isDemo = true;
  private items = new Map<string, { userId: string; syncs: number }>();
  constructor(private today: () => string) {}

  async startConnect(input: { userId: string }): Promise<ConnectStart> {
    const itemId = `demo-${input.userId.slice(0, 8)}-${this.items.size + 1}-${Date.now().toString(36)}`;
    this.items.set(itemId, { userId: input.userId, syncs: 0 });
    return { mode: 'instant', itemId };
  }
  async getItem(itemId: string): Promise<RemoteItem> {
    return { id: itemId, institution: DEMO_INSTITUTION, status: 'active', consentExpiresAt: addDays(this.today(), 365), clientUserId: this.items.get(itemId)?.userId ?? null };
  }
  async revoke(itemId: string) { this.items.delete(itemId); }

  private history(itemId: string): RemoteTx[] {
    const today = this.today();
    const acc = (k: string) => `${itemId}:${k}`;
    const out: RemoteTx[] = [];
    let seed = [...itemId].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 2147483647, 11);
    const rnd = (a: number, b: number) => { seed = (seed * 48271) % 2147483647; return Math.round(a + (seed / 2147483647) * (b - a)); };
    const add = (id: string, account: string, date: string, cents: number, direction: 'in' | 'out', description: string, pending = false) => {
      if (date <= today) out.push({ id: `${itemId}:${id}`, accountId: acc(account), date, amountCents: cents, direction, description, pending });
    };
    const months = monthsBack(ym(today), 5);
    const cardSpend = new Map<string, number>();
    for (const m of months) {
      add(`sal-${m}`, 'chk', clampDay(m, 5), 520000, 'in', 'SALARIO EMPRESA DEMO');
      add(`tro-${m}`, 'chk', clampDay(m, 6), 80000, 'out', 'TRANSF POUPANCA');
      add(`tri-${m}`, 'sav', clampDay(m, 6), 80000, 'in', 'TRANSF RECEBIDA');
      add(`rent-${m}`, 'chk', clampDay(m, 8), 150000, 'out', 'ALUGUEL IMOBILIARIA DEMO');
      add(`luz-${m}`, 'chk', clampDay(m, 12), rnd(15000, 24000), 'out', 'ENERGIA DEMO');
      let spend = 0;
      for (const d of [3, 12, 22]) { const v = rnd(15000, 30000); spend += v; add(`mkt-${m}-${d}`, 'cc', clampDay(m, d), v, 'out', 'MERCADO CENTRAL DEMO'); }
      spend += 4990; add(`str-${m}`, 'cc', clampDay(m, 15), 4990, 'out', 'STREAMING FILMES DEMO');
      cardSpend.set(m, spend);
    }
    for (const m of months) { // a fatura de um mês é paga no mês seguinte: uma saída na conta e uma entrada no cartão, mesmo valor e dia
      const prev = cardSpend.get(monthsBack(m, 2)[0]);
      if (prev) { add(`pgo-${m}`, 'chk', clampDay(m, 20), prev, 'out', 'PAGAMENTO FATURA CARTAO'); add(`pgi-${m}`, 'cc', clampDay(m, 20), prev, 'in', 'PAGAMENTO RECEBIDO'); }
    }
    add('pend', 'chk', today, 3500, 'out', 'COMPRA EM PROCESSAMENTO DEMO', true);
    const syncs = this.items.get(itemId)?.syncs ?? 0;
    for (let n = 1; n <= syncs; n++) add(`extra-${n}`, 'chk', today, 1200 + n * 100, 'out', `PADARIA DEMO ${n}`);
    return out;
  }

  async listAccounts(itemId: string): Promise<RemoteAccount[]> {
    const state = this.items.get(itemId); if (state) state.syncs++; // cada atualização traz uma movimentação nova
    const tx = this.history(itemId).filter((t) => !t.pending);
    const bal = (k: string) => tx.filter((t) => t.accountId.endsWith(`:${k}`)).reduce((n, t) => n + (t.direction === 'in' ? t.amountCents : -t.amountCents), 0);
    return [
      { id: `${itemId}:chk`, kind: 'checking', name: 'Conta Corrente (demo)', number: '0001-9', balanceCents: OPENING.chk + bal('chk') },
      { id: `${itemId}:sav`, kind: 'savings', name: 'Poupança (demo)', balanceCents: OPENING.sav + bal('sav') },
      { id: `${itemId}:cc`, kind: 'credit_card', name: 'Cartão (demo)', balanceCents: bal('cc'), creditLimitCents: 600000, closingDay: 10, dueDay: 20 },
    ];
  }
  async listTransactions(itemId: string, accountId: string, from: string, to: string): Promise<RemoteTx[]> {
    return this.history(itemId).filter((t) => t.accountId === accountId && t.date >= from && t.date <= to);
  }
}
