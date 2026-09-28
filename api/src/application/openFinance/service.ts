// Open Finance (somente leitura): conectar, atualizar, conciliar, renovar e revogar. Nunca pede nem guarda senha bancária.
import { addDays, diffDays } from '../../domain/dates';
import { AppError, NotFoundError, ValidationError } from '../../domain/errors';
import type { UserRepository } from '../authPorts';
import type { FieldCrypto } from '../fieldCrypto';
import type { FinanceService } from '../finance/service';
import type { FinAccount } from '../finance/types';
import { planImport, type BatchItem } from './import';
import type { PluggyEvent } from './webhook';
import {
  ProviderAuthError, type ConnectStart, type OfConnection, type OpenFinanceProvider, type OpenFinanceRepository, type PublicConnection,
} from './types';

const SYNC_EVERY_MS = 6 * 3_600_000;
const WINDOW_DAYS = 90;
const clean = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/[A-Za-z0-9_\-]{24,}/g, '•••').slice(0, 200); // nunca deixa um token vazar no erro

export interface SyncResult { ok: boolean; status: string; created: number; transfers: number; reconciled: number; updated: number; skipped: number; warnings: string[]; error?: string }
const empty = (status: string, over: Partial<SyncResult> = {}): SyncResult => ({ ok: true, status, created: 0, transfers: 0, reconciled: 0, updated: 0, skipped: 0, warnings: [], ...over });

export class OpenFinanceService {
  private byName: Map<string, OpenFinanceProvider>;
  private syncing = new Map<string, Promise<SyncResult>>();
  constructor(private d: {
    repo: OpenFinanceRepository; finance: FinanceService; providers: OpenFinanceProvider[]; primary: string; crypto: FieldCrypto; users: UserRepository;
    audit: (userId: string, action: string, target?: string, detail?: Record<string, unknown>) => void; now?: () => Date; today: () => string;
  }) { this.byName = new Map(d.providers.map((p) => [p.name, p])); }

  private now() { return (this.d.now ?? (() => new Date()))(); }
  private provider(name: string) { const p = this.byName.get(name); if (!p) throw new ValidationError('Provedor de Open Finance indisponível.'); return p; }
  private async own(userId: string, id: string) { const c = await this.d.repo.get(userId, id); if (!c) throw new NotFoundError('Conexão'); return c; }

  async status(userId: string) {
    const primary = this.provider(this.d.primary);
    const accounts = (await this.d.finance.refs(userId)).accounts;
    const connections: PublicConnection[] = (await this.d.repo.list(userId)).map(({ itemEnc, ...c }) => ({ ...c, accountCount: accounts.filter((a) => a.connectionId === c.id).length }));
    return {
      provider: { name: primary.name, label: primary.label, isDemo: primary.isDemo }, demoAvailable: this.byName.has('demo'), readOnly: true,
      connections,
    };
  }

  startConnect(userId: string, providerName?: string): Promise<ConnectStart & { provider: string }> {
    const p = this.provider(providerName ?? this.d.primary);
    return p.startConnect({ userId }).then((s) => ({ ...s, provider: p.name }));
  }

  /** Registra a conexão depois que o usuário autorizou na instituição. O consentimento explícito é obrigatório. */
  async completeConnect(userId: string, input: { itemId: string; provider?: string; consent: boolean }): Promise<PublicConnection> {
    if (input.consent !== true) throw new ValidationError('É preciso autorizar explicitamente a leitura dos dados para conectar.');
    const p = this.provider(input.provider ?? this.d.primary);
    const item = await p.getItem(input.itemId);
    if (item.clientUserId !== userId) throw new AppError('Não foi possível confirmar que esta conexão pertence a você.', 403);
    for (const c of await this.d.repo.list(userId)) {
      if (c.status !== 'revoked' && c.provider === p.name && this.d.crypto.decrypt(c.itemEnc) === input.itemId) throw new AppError('Esta instituição já está conectada.', 409);
    }
    const conn = await this.d.repo.create(userId, {
      provider: p.name, institution: item.institution, itemEnc: this.d.crypto.encrypt(input.itemId),
      consentExpiresAt: item.consentExpiresAt ? new Date(`${item.consentExpiresAt}T23:59:59`) : null,
    });
    this.d.audit(userId, 'openfinance.connected', conn.id, { provider: p.name, institution: item.institution, readOnly: true });
    await this.sync(userId, conn.id);
    const fresh = await this.own(userId, conn.id);
    const { itemEnc, ...pub } = fresh;
    return { ...pub, accountCount: (await this.d.finance.refs(userId)).accounts.filter((a) => a.connectionId === conn.id).length };
  }

  async handleWebhook(event: PluggyEvent): Promise<string> {
    // Only already-authorized connections can be changed. Never trust clientUserId in a webhook.
    const conn = (await this.d.repo.listAllActive()).find((c) => c.provider === 'pluggy' && this.d.crypto.decrypt(c.itemEnc) === event.itemId);
    if (!conn) return 'ignored_unlinked';
    const result = await this.sync(conn.userId, conn.id);
    if (result.status === 'error' || result.status === 'updating') throw new Error('Retry provider sync');
    if (event.event === 'transactions/deleted') {
      // Paired transfers/manual reconciliations cannot safely be deleted from a notification alone.
      await this.d.repo.update(conn.userId, conn.id, { status: 'error', lastError: 'A instituição removeu movimentações. Revise o extrato importado: exclusões não são aplicadas automaticamente.' });
      this.d.audit(conn.userId, 'openfinance.deletion_review', conn.id);
      return 'review_required';
    }
    return result.ok ? 'synced' : result.status;
  }

  sync(userId: string, id: string): Promise<SyncResult> {
    const key = `${userId}:${id}`;
    const running = this.syncing.get(key);
    if (running) return running;
    const job = this.performSync(userId, id).finally(() => this.syncing.delete(key));
    this.syncing.set(key, job);
    return job;
  }

  private async performSync(userId: string, id: string): Promise<SyncResult> {
    const conn = await this.own(userId, id);
    if (conn.status === 'revoked') throw new AppError('Esta conexão foi revogada.', 409);
    const p = this.provider(conn.provider);
    const itemId = this.d.crypto.decrypt(conn.itemEnc);
    const now = this.now(); const today = this.d.today();
    await this.d.repo.update(userId, id, { status: 'updating' });
    try {
      const item = await p.getItem(itemId);
      const expires = item.consentExpiresAt ? new Date(`${item.consentExpiresAt}T23:59:59`) : conn.consentExpiresAt;
      if (expires && expires.getTime() <= now.getTime()) {
        await this.d.repo.update(userId, id, { status: 'expired', consentExpiresAt: expires, lastError: 'O consentimento venceu. Renove para continuar.' });
        return empty('expired', { ok: false, error: 'O consentimento venceu. Renove para continuar.' });
      }
      if (item.status === 'updating') {
        await this.d.repo.update(userId, id, { status: 'updating', lastError: null });
        return empty('updating', { warnings: ['A instituição ainda está preparando os dados. A importação será tentada novamente.'] });
      }
      if (item.status === 'needs_reconnect' || item.status === 'expired') {
        await this.d.repo.update(userId, id, { status: item.status, lastError: item.error ?? 'A instituição pediu que você renove o consentimento.', consentExpiresAt: expires });
        this.d.audit(userId, 'openfinance.needs_reconnect', id, { status: item.status });
        return empty(item.status, { ok: false, error: 'É preciso renovar o consentimento com a instituição.' });
      }
      if (item.status === 'error') throw new Error(item.error ?? 'A instituição não respondeu.');

      const remoteAccounts = await p.listAccounts(itemId);
      const source = p.isDemo ? 'demo' : 'import';
      let data = await this.d.finance.load(userId);
      const local = new Map<string, FinAccount>(); const isNew = new Set<string>(); const warnings: string[] = [];
      for (const ra of remoteAccounts) {
        let acc = data.accounts.find((a) => a.connectionId === conn.id && a.externalId === ra.id);
        if (!acc) {
          const card = ra.kind === 'credit_card';
          if (card && (!ra.closingDay || !ra.dueDay)) warnings.push(`${ra.name}: a instituição não informou fechamento/vencimento da fatura; usei dia 28 e 5 — ajuste na conta.`);
          acc = await this.d.finance.createAccount(userId, {
            name: ra.name, kind: ra.kind, institution: item.institution || conn.institution, number: ra.number, initialBalanceCents: 0, creditLimitCents: ra.creditLimitCents ?? null,
            closingDay: card ? ra.closingDay ?? 28 : null, dueDay: card ? ra.dueDay ?? 5 : null, connectionId: conn.id, externalId: ra.id,
          }, source);
          isNew.add(acc.id);
        }
        // A failed first import can leave accounts created but without a provider balance.
        if (acc.providerBalanceAt == null) isNew.add(acc.id);
        local.set(ra.id, acc);
      }

      const from = conn.lastSyncAt ? addDays(today, -Math.min(WINDOW_DAYS, Math.max(7, diffDays(conn.lastSyncAt.toISOString().slice(0, 10), today) + 7))) : addDays(today, -WINDOW_DAYS);
      const batch = new Map<string, BatchItem>();
      for (const ra of remoteAccounts) {
        const acc = local.get(ra.id) as FinAccount;
        for (const tx of await p.listTransactions(itemId, ra.id, from, today)) batch.set(`${acc.id}|${tx.id}`, { accountId: acc.id, tx });
      }
      const items = [...batch.values()];
      const seen = await this.d.repo.seenMany(userId, items.map((b) => ({ accountId: b.accountId, externalId: b.tx.id })));
      data = await this.d.finance.load(userId);
      const plan = planImport({ batch: items, seen, existing: data.txs });

      for (const u of [...plan.updates, ...plan.reconciles]) {
        await this.d.finance.applyImportPatch(userId, u.txId, u.patch);
        await this.d.repo.seenAdd(userId, u.accountId, u.externalId, u.txId);
      }
      for (const c of plan.creates) {
        const tx = await this.d.finance.createTransaction(userId, {
          accountId: c.accountId, kind: c.kind, amountCents: c.amountCents, occurredOn: c.occurredOn, description: c.description, merchant: c.merchant, categoryId: c.categoryId,
          status: c.status, transferAccountId: c.transferAccountId, source, externalId: c.externalId,
        }, { audit: false });
        for (const s of c.seen) await this.d.repo.seenAdd(userId, s.accountId, s.externalId, tx.id);
      }
      for (const ra of remoteAccounts) await this.d.finance.recordProviderBalance(userId, (local.get(ra.id) as FinAccount).id, ra.balanceCents, now, isNew.has((local.get(ra.id) as FinAccount).id));

      await this.d.repo.update(userId, id, { status: 'active', lastSyncAt: now, lastError: null, consentExpiresAt: expires, institution: item.institution || conn.institution });
      this.d.audit(userId, 'openfinance.sync', id, { ...plan.stats });
      return empty('active', { ...plan.stats, warnings });
    } catch (e) {
      const status = e instanceof ProviderAuthError ? 'needs_reconnect' : 'error';
      const message = clean(e);
      await this.d.repo.update(userId, id, { status, lastError: message });
      this.d.audit(userId, 'openfinance.sync_failed', id, { status });
      return empty(status, { ok: false, error: message });
    }
  }

  /** Atualização periódica (chamada pelo agendador). */
  async syncAll(now = this.now()) {
    for (const c of await this.d.repo.listAllActive()) {
      if (c.status === 'needs_reconnect' || c.status === 'expired' || c.status === 'revoked') continue;
      if (c.status !== 'updating' && c.lastSyncAt && now.getTime() - c.lastSyncAt.getTime() < SYNC_EVERY_MS) continue;
      await this.sync(c.userId, c.id).catch(() => undefined);
    }
  }

  /** Avisa 30 dias antes do consentimento vencer e marca como expirado quando vence. */
  async checkConsents(notify: (userId: string, title: string, body: string, key: string) => Promise<void>, now = this.now()) {
    for (const c of await this.d.repo.listAllActive()) {
      if (!c.consentExpiresAt || c.status === 'revoked') continue;
      const days = Math.ceil((c.consentExpiresAt.getTime() - now.getTime()) / 86_400_000);
      if (days <= 0) {
        if (c.status !== 'expired') { await this.d.repo.update(c.userId, c.id, { status: 'expired', lastError: 'O consentimento venceu. Renove para voltar a atualizar.' }); }
        await notify(c.userId, `Consentimento de ${c.institution || 'instituição'} venceu`, 'Renove em Finanças → Conexões para voltar a atualizar seus dados.', `ofconsent:${c.id}:expired`);
      } else if (days <= 30) {
        await notify(c.userId, `Consentimento de ${c.institution || 'instituição'} vence em ${days} dia(s)`, 'Renove em Finanças → Conexões para não perder a atualização automática.', `ofconsent:${c.id}:${c.consentExpiresAt.toISOString().slice(0, 10)}`);
      }
    }
  }

  /** Renovar consentimento: no provedor real reabre o fluxo oficial da instituição; na demonstração só estende o prazo. */
  async renew(userId: string, id: string): Promise<(ConnectStart & { provider: string }) | { mode: 'done'; provider: string }> {
    const conn = await this.own(userId, id);
    if (conn.status === 'revoked') throw new AppError('Esta conexão foi revogada. Conecte de novo.', 409);
    const p = this.provider(conn.provider);
    this.d.audit(userId, 'openfinance.renew', id);
    if (p.isDemo) { await this.d.repo.update(userId, id, { status: 'active', lastError: null }); await this.sync(userId, id); return { mode: 'done', provider: p.name }; }
    return { ...(await p.startConnect({ userId, itemId: this.d.crypto.decrypt(conn.itemEnc) })), provider: p.name };
  }

  /** Revoga o consentimento. Você escolhe se mantém ou apaga o que já foi importado dessa instituição. */
  async revoke(userId: string, id: string, deleteData: boolean) {
    const conn = await this.own(userId, id);
    const p = this.provider(conn.provider);
    let providerError: string | undefined;
    try { await p.revoke(this.d.crypto.decrypt(conn.itemEnc)); } catch (e) { providerError = clean(e); }
    await this.d.repo.update(userId, id, { status: 'revoked', revokedAt: this.now() });
    let removed = 0;
    if (deleteData) {
      for (const a of (await this.d.finance.refs(userId)).accounts.filter((x) => x.connectionId === id)) { await this.d.finance.deleteAccount(userId, a.id); removed++; }
    }
    this.d.audit(userId, 'openfinance.revoked', id, { deleteData, accountsRemoved: removed, providerConfirmed: !providerError });
    return { ok: true, accountsRemoved: removed, providerError };
  }
}
