// Adaptador para o agregador Pluggy (Open Finance no Brasil). SOMENTE LEITURA.
// ATENÇÃO: escrito a partir da documentação pública e testado apenas com respostas simuladas; ainda não foi executado contra a API real.
// Premissas a validar com uma conta de teste (sandbox) da Pluggy estão marcadas com "PREMISSA".
import { AppError } from '../../domain/errors';
import { ProviderAuthError, type ConnectStart, type OpenFinanceProvider, type RemoteAccount, type RemoteItem, type RemoteTx } from '../../application/openFinance/types';
import type { AccountKind } from '../../application/finance/types';

const BASE = 'https://api.pluggy.ai';
const DEFAULT_SCRIPT = 'https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js';
const toCents = (n: number) => Math.round(Math.abs(n) * 100);
const day = (iso?: string | null) => (iso ? Number(iso.slice(8, 10)) : undefined);

export class PluggyProvider implements OpenFinanceProvider {
  readonly name = 'pluggy' as const;
  readonly label = 'Open Finance (via Pluggy)';
  readonly isDemo = false;
  private key: { value: string; until: number } | null = null;

  constructor(private cfg: { clientId: string; clientSecret: string; script?: string; webhook?: string; fetch?: typeof fetch }) {}
  private f(url: string, init?: RequestInit) { return (this.cfg.fetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(30_000) }); }

  /** A chave de API fica só no servidor; é renovada antes de vencer (dura ~2 h). */
  private async apiKey(): Promise<string> {
    if (this.key && this.key.until > Date.now()) return this.key.value;
    const r = await this.f(`${BASE}/auth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: this.cfg.clientId, clientSecret: this.cfg.clientSecret }) });
    if (!r.ok) throw new AppError('Não consegui autenticar no provedor de Open Finance (confira as credenciais no servidor).', 502);
    const body = (await r.json()) as { apiKey: string };
    this.key = { value: body.apiKey, until: Date.now() + 100 * 60_000 };
    return body.apiKey;
  }
  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const r = await this.f(`${BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', 'X-API-KEY': await this.apiKey(), ...(init.headers ?? {}) } });
    if (r.status === 401 || r.status === 403) throw new ProviderAuthError('O provedor recusou o acesso a esta conexão.');
    if (r.status === 404) throw new ProviderAuthError('A conexão não existe mais no provedor.');
    if (!r.ok) throw new AppError(`O provedor de Open Finance respondeu com erro ${r.status}.`, 502);
    return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
  }

  async startConnect(input: { userId: string; itemId?: string }): Promise<ConnectStart> {
    const body = await this.call<{ accessToken: string }>('/connect_token', {
      method: 'POST', body: JSON.stringify({ ...(input.itemId ? { itemId: input.itemId } : {}), options: { clientUserId: input.userId, ...(this.cfg.webhook ? { webhookUrl: this.cfg.webhook } : {}) } }),
    });
    return { mode: 'widget', token: body.accessToken, script: this.cfg.script ?? DEFAULT_SCRIPT, ...(input.itemId ? { itemId: input.itemId } : {}) }; // token de curta duração, feito para o navegador
  }

  async getItem(itemId: string): Promise<RemoteItem> {
    const it = await this.call<{ id: string; status: string; clientUserId?: string | null; connector?: { name?: string }; consentExpiresAt?: string | null; error?: { message?: string } | null }>(`/items/${encodeURIComponent(itemId)}`);
    const status = it.status === 'UPDATED' ? 'active' : it.status === 'UPDATING' ? 'updating'
      : ['LOGIN_ERROR', 'WAITING_USER_INPUT'].includes(it.status) ? 'needs_reconnect' : 'error';
    return { id: it.id, institution: it.connector?.name ?? '', status, consentExpiresAt: it.consentExpiresAt ? it.consentExpiresAt.slice(0, 10) : null, clientUserId: it.clientUserId ?? null, error: it.error?.message ?? undefined };
  }

  async listAccounts(itemId: string): Promise<RemoteAccount[]> {
    const r = await this.call<{ results: { id: string; type: string; subtype?: string; name?: string; number?: string; balance?: number; creditData?: { creditLimit?: number; balanceCloseDate?: string; balanceDueDate?: string } | null }[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
    return r.results.map((a) => {
      const card = a.type === 'CREDIT' || a.subtype === 'CREDIT_CARD';
      const kind: AccountKind = card ? 'credit_card' : a.subtype === 'SAVINGS_ACCOUNT' ? 'savings' : 'checking';
      const balance = a.balance ?? 0;
      return {
        id: a.id, kind, name: a.name ?? (card ? 'Cartão' : 'Conta'), number: a.number,
        // PREMISSA: em cartão, `balance` é o valor devido (positivo) → guardamos como dívida (negativa).
        balanceCents: Math.round((card ? -balance : balance) * 100),
        ...(card ? { creditLimitCents: a.creditData?.creditLimit ? toCents(a.creditData.creditLimit) : undefined, closingDay: day(a.creditData?.balanceCloseDate), dueDay: day(a.creditData?.balanceDueDate) } : {}),
      };
    });
  }

  async listTransactions(_itemId: string, accountId: string, from: string, to: string): Promise<RemoteTx[]> {
    const out: RemoteTx[] = [];
    const params = new URLSearchParams({ accountId, dateFrom: from, dateTo: to });
    const cursors = new Set<string>();
    for (let page = 1; page <= 50; page++) { // limite de segurança
      const r = await this.call<{ results: { id: string; description?: string; amount: number; date: string; type?: string; status?: string }[]; next: string | null }>(
        `/v2/transactions?${params.toString()}`);
      for (const t of r.results) {
        // O sentido vem do campo `type` (DEBIT = saiu, CREDIT = entrou); o valor é sempre guardado positivo. PREMISSA validada só na documentação.
        out.push({ id: t.id, accountId, date: t.date.slice(0, 10), amountCents: toCents(t.amount), direction: t.type === 'CREDIT' ? 'in' : 'out', description: (t.description ?? '').trim(), pending: t.status === 'PENDING' });
      }
      if (r.next === null) return out.filter((t) => t.amountCents > 0);
      // `next` is a query string, not a URL or a cursor. Keep our account/date scope.
      const after = typeof r.next === 'string' && r.next.startsWith('?') ? new URLSearchParams(r.next).get('after') : null;
      if (!after || cursors.has(after)) throw new AppError('O provedor retornou uma paginação de extrato inválida.', 502);
      cursors.add(after);
      params.set('after', after);
    }
    throw new AppError('O extrato excedeu o limite de páginas. A importação não foi concluída; reduza o período consultado.', 502);
  }

  async revoke(itemId: string) { await this.call<void>(`/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }); }
}
