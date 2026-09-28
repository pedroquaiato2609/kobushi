import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { OfConnectStart, OfConnection, OfOverview, OfStatus, OfSyncResult } from '../../api/types';
import { useReauth } from '../AuthGate';
import { Icon } from '../Icon';
import { ErrorText, Modal } from '../ui';
import { StateBox } from './shared';

const STATUS: Record<OfStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'idle' }> = {
  active: { label: 'Atualizada', tone: 'ok' }, updating: { label: 'Atualizando…', tone: 'idle' }, error: { label: 'Erro na atualização', tone: 'bad' },
  needs_reconnect: { label: 'Precisa renovar', tone: 'warn' }, expired: { label: 'Consentimento vencido', tone: 'bad' }, revoked: { label: 'Revogada', tone: 'idle' },
};
const ago = (iso: string | null) => {
  if (!iso) return 'nunca';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'agora há pouco' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dia(s)`;
};
const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

declare global { interface Window { PluggyConnect?: new (o: Record<string, unknown>) => { init(): void } } }

/** Abre o fluxo oficial do provedor (a senha do banco é digitada lá, nunca aqui). Só carrega scripts do domínio do provedor. */
async function openWidget(start: Extract<OfConnectStart, { mode: 'widget' }>): Promise<string> {
  if (!start.script.startsWith('https://cdn.pluggy.ai/')) throw new Error('Endereço do widget não reconhecido.');
  if (!window.PluggyConnect) {
    await new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = start.script; el.onload = () => resolve(); el.onerror = () => reject(new Error('Não consegui carregar o widget de conexão.'));
      document.head.appendChild(el);
    });
  }
  return new Promise<string>((resolve, reject) => {
    const Widget = window.PluggyConnect;
    if (!Widget) return reject(new Error('Widget indisponível.'));
    new Widget({ connectToken: start.token, updateItem: start.itemId, includeSandbox: false, language: 'pt', countries: ['BR'], onSuccess: (r: { item: { id: string } }) => resolve(r.item.id), onError: (e: { message?: string }) => reject(new Error(e?.message ?? 'A conexão foi cancelada.')), onClose: () => reject(new Error('Conexão cancelada.')) }).init();
  });
}

function ConsentModal({ overview, onClose, onConnected }: { overview: OfOverview; onClose: () => void; onConnected: (msg: string) => void }) {
  const [agree, setAgree] = useState(false);
  const [useDemo, setUseDemo] = useState(overview.provider.isDemo);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const demo = useDemo;

  async function connect() {
    setBusy(true); setError(null);
    try {
      const start = await api.post<OfConnectStart>('/open-finance/connect', { provider: demo ? 'demo' : undefined });
      const itemId = start.mode === 'instant' ? start.itemId : await openWidget(start);
      const connection = await api.post<OfConnection>('/open-finance/connections', { itemId, provider: start.provider, consent: true });
      onConnected(demo ? 'Banco de demonstração conectado. Os dados são fictícios e ficam marcados como DEMO.' : connection.status === 'active' ? 'Instituição conectada e dados importados.' : connection.status === 'updating' ? 'Instituição conectada. Aguardando o banco preparar os dados.' : `Conexão registrada, mas os dados ainda não foram importados: ${connection.lastError ?? STATUS[connection.status].label}`);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Modal title="Conectar uma instituição" onClose={onClose} onSubmit={connect}
      footer={<><button className="btn primary" disabled={!agree || busy}>{busy ? 'Conectando…' : demo ? 'Conectar (demonstração)' : 'Continuar para a instituição'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></>}>
      {demo
        ? <p className="demo-note"><Icon name="alert" size={16} /> <span><b>Modo demonstração.</b> Nenhum banco real será acessado: os dados são gerados para você conhecer o fluxo e ficam marcados como DEMO.</span></p>
        : <p className="muted">Você será levado ao fluxo oficial de autorização do Open Finance. Sua senha bancária é digitada lá, <b>nunca no Ninshiki</b>.</p>}
      <div className="consent-cols">
        <div><h4>O Ninshiki vai ler</h4><ul><li>Contas e saldos</li><li>Cartões de crédito e faturas</li><li>Transações (extrato)</li></ul></div>
        <div><h4>O Ninshiki nunca fará</h4><ul><li>Pagamentos ou transferências</li><li>Pedir ou guardar sua senha bancária</li></ul></div>
      </div>
      {!demo && <p className="hint">A Pluggy processa os dados para realizar esta integração. Se você consultar suas finanças pelo assistente, os dados usados na resposta também passam pelo provedor de IA configurado.</p>}
      <p className="hint">O consentimento tem prazo (o Ninshiki avisa antes de vencer) e você pode revogá-lo a qualquer momento, aqui ou na própria instituição. Ao revogar, você escolhe se mantém ou apaga o que já foi importado.</p>
      {!overview.provider.isDemo && overview.demoAvailable && <label className="check-line"><input type="checkbox" checked={useDemo} onChange={(e) => setUseDemo(e.target.checked)} /> Prefiro apenas conhecer com o banco de demonstração</label>}
      <label className="check-line consent-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Li e autorizo o Ninshiki a ler esses dados {demo ? '(fictícios)' : ''} em modo somente leitura.</label>
      <ErrorText error={error} />
    </Modal>
  );
}

function RevokeModal({ conn, onClose }: { conn: OfConnection; onClose: () => void }) {
  const { guard } = useReauth();
  const [del, setDel] = useState(false);
  const revoke = useAction(() => guard(() => api.del(`/open-finance/connections/${conn.id}?deleteData=${del ? 'true' : ''}`)), onClose);
  return (
    <Modal title={`Revogar ${conn.institution || 'conexão'}`} onClose={onClose} onSubmit={() => revoke.mutate(undefined)}
      footer={<><button className="btn danger" disabled={revoke.isPending}>{revoke.isPending ? 'Revogando…' : 'Revogar consentimento'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></>}>
      <p className="muted">O Ninshiki deixa de atualizar esta instituição e pede ao provedor que encerre o acesso. Você poderá conectar de novo quando quiser.</p>
      <div className="radio-cards" role="radiogroup" aria-label="O que fazer com os dados já importados">
        <button type="button" role="radio" aria-checked={!del} className="radio-card" onClick={() => setDel(false)}><b>Manter os dados</b><span>Contas e movimentações importadas continuam no Ninshiki, sem novas atualizações.</span></button>
        <button type="button" role="radio" aria-checked={del} className="radio-card" onClick={() => setDel(true)}><b>Apagar os dados importados</b><span>Remove as contas dessa instituição e todas as movimentações delas. Não dá para desfazer.</span></button>
      </div>
      <ErrorText error={revoke.error} />
    </Modal>
  );
}

export function ConnectionsTab() {
  const q = useQuery({ queryKey: ['of-status'], queryFn: () => api.get<OfOverview>('/open-finance'), refetchInterval: 30_000 });
  const [modal, setModal] = useState<{ type: 'connect' } | { type: 'revoke'; conn: OfConnection } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sync = useAction(async (id: string) => {
    setBusyId(id); setError(null);
    try { return await api.post<OfSyncResult>(`/open-finance/connections/${id}/sync`); }
    catch (e) { setError(e); throw e; }
    finally { setBusyId(null); }
  }, (r) => {
    setBusyId(null);
    setNotice(r.status === 'updating' ? 'A instituição ainda está preparando os dados. Aguarde a próxima importação ou consulte novamente em alguns instantes.' : r.ok
      ? `Atualizada: ${r.created} nova(s), ${r.reconciled} conciliada(s) com seus lançamentos, ${r.transfers} transferência(s) entre suas contas identificada(s).${r.warnings.length ? ` Atenção: ${r.warnings.join(' ')}` : ''}`
      : (r.error ?? 'Não foi possível atualizar.'));
  });
  async function renew(c: OfConnection) {
    setError(null); setBusyId(c.id);
    try {
      const r = await api.post<OfConnectStart | { mode: 'done'; provider: string }>(`/open-finance/connections/${c.id}/renew`);
      if (r.mode === 'widget') {
        const itemId = await openWidget(r);
        if (itemId !== r.itemId) throw new Error('A instituição retornou uma conexão diferente da solicitada.');
        const result = await api.post<OfSyncResult>(`/open-finance/connections/${c.id}/sync`);
        if (!result.ok) throw new Error(result.error ?? 'Não foi possível atualizar a conexão.');
        setNotice(result.status === 'updating' ? 'Autorização recebida. Aguardando os dados da instituição.' : 'Consentimento renovado e dados importados.');
      } else setNotice('Consentimento renovado.');
      await q.refetch();
    } catch (e) { setError(e); } finally { setBusyId(null); }
  }

  if (q.isLoading) return <StateBox kind="loading" title="Carregando conexões…" />;
  if (q.error || !q.data) return <StateBox kind="error" title="Não consegui carregar as conexões">{(q.error as Error | undefined)?.message}</StateBox>;
  const o = q.data;
  const live = o.connections.filter((c) => c.status !== 'revoked');
  const revoked = o.connections.filter((c) => c.status === 'revoked');

  return (
    <div className="conn-tab">
      <section className="panel readonly-note">
        <Icon name="shield" size={20} />
        <div><b>Somente leitura.</b> <span>O Ninshiki consulta seus dados por meio do Open Finance, mas não faz pagamentos nem transferências e nunca pede sua senha bancária. {o.provider.isDemo ? 'Ainda não há um provedor real configurado neste servidor: por enquanto existe apenas o banco de demonstração.' : `Provedor: ${o.provider.label}.`}</span></div>
      </section>

      {o.provider.isDemo && <section className="panel">
        <h3>Ativar conexão com seu banco</h3>
        <p>A integração real ainda não foi configurada. Crie uma aplicação na Pluggy com acesso a instituições reais e configure as credenciais no servidor. Depois, volte aqui para escolher seu banco e autorizar a leitura.</p>
        <a className="btn primary" href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">Abrir painel da Pluggy</a>
        <p className="hint">Bancos de teste fornecem dados fictícios. Uma demonstração existente não se transforma em conta real: será necessário conectar sua instituição.</p>
      </section>}
      <div className="panel-head"><h2>Instituições conectadas</h2><button className="btn primary" onClick={() => setModal({ type: 'connect' })}><Icon name="plus" size={16} /> {o.provider.isDemo ? 'Experimentar demonstração' : 'Conectar meu banco'}</button></div>
      {notice && <p className="ok-note" role="status">{notice}</p>}
      <ErrorText error={error} />

      {live.length === 0 && <StateBox kind="empty" title="Nenhuma instituição conectada">Conecte para importar contas, cartões e transações automaticamente. Lançamentos que você já digitou são preservados e conciliados, sem duplicar.</StateBox>}
      <div className="conn-list">
        {live.map((c) => {
          const st = STATUS[c.status]; const left = daysLeft(c.consentExpiresAt); const busy = busyId === c.id;
          return (
            <article key={c.id} className={`conn-card tone-${st.tone}`}>
              <header>
                <div><h3>{c.institution || 'Instituição'} {c.provider === 'demo' && <span className="chip demo">DEMO</span>}</h3><span className="muted small">{c.accountCount} conta(s)/cartão(ões) importada(s)</span></div>
                <span className={`status-pill ${st.tone}`}>{busy ? <span className="spinner mini" aria-hidden /> : null}{busy ? 'Atualizando…' : st.label}</span>
              </header>
              <dl>
                <div><dt>Última atualização</dt><dd>{ago(c.lastSyncAt)}</dd></div>
                <div><dt>Consentimento</dt><dd className={left !== null && left <= 30 ? 'warn' : ''}>{c.consentExpiresAt ? `até ${fmtDate(c.consentExpiresAt)}${left !== null && left <= 30 ? (left > 0 ? ` · vence em ${left} dia(s)` : ' · vencido') : ''}` : 'sem prazo informado'}</dd></div>
                <div><dt>Consulta ao provedor</dt><dd>a cada 6 horas; a atualização no banco depende da instituição e do plano</dd></div>
              </dl>
              {c.lastError && c.status !== 'active' && <p className="error">{c.lastError}</p>}
              <footer>
                <button className="btn small" disabled={busy || c.status === 'needs_reconnect' || c.status === 'expired'} onClick={() => sync.mutate(c.id)}><Icon name="clock" size={14} /> Atualizar agora</button>
                {(c.status === 'needs_reconnect' || c.status === 'expired' || (left !== null && left <= 30)) && <button className="btn small primary" disabled={busy} onClick={() => renew(c)}>Renovar consentimento</button>}
                <button className="btn small ghost danger-text" onClick={() => setModal({ type: 'revoke', conn: c })}>Revogar</button>
              </footer>
            </article>
          );
        })}
      </div>
      {revoked.length > 0 && <details className="revoked"><summary>{revoked.length} conexão(ões) revogada(s)</summary><ul>{revoked.map((c) => <li key={c.id}>{c.institution || 'Instituição'} — {c.accountCount} conta(s) mantida(s)</li>)}</ul></details>}

      <section className="panel how-it-works">
        <h3>Como a importação funciona</h3>
        <ul>
          <li><b>Sem duplicar:</b> cada movimentação do banco é registrada uma única vez, mesmo em várias atualizações. Se você apagar uma, ela não volta.</li>
          <li><b>Seus lançamentos são preservados:</b> se você já digitou uma compra e ela aparece no banco (mesmo valor, poucos dias de diferença), o Ninshiki apenas as vincula e confirma.</li>
          <li><b>Transferências entre suas contas</b> viram um único lançamento (não contam como receita nem despesa). Quando há dúvida, o Ninshiki não junta.</li>
          <li><b>Saldo:</b> o saldo informado pela instituição fica ao lado do saldo calculado; se divergirem, você vê o aviso na conta.</li>
        </ul>
      </section>

      {modal?.type === 'connect' && <ConsentModal overview={o} onClose={() => setModal(null)} onConnected={(m) => { setModal(null); setNotice(m); void q.refetch(); }} />}
      {modal?.type === 'revoke' && <RevokeModal conn={modal.conn} onClose={() => { setModal(null); void q.refetch(); }} />}
    </div>
  );
}
