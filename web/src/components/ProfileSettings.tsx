import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { ProfileItem, ProfileLevel, VaultStatus } from '../api/types';
import { fmt } from '../lib/dates';
import { LEVEL_PROFILE } from '../lib/labels';
import { useConfirm } from './ConfirmProvider';
import { Icon } from './Icon';
import { ErrorText, Field, Modal } from './ui';

const LEVELS: ProfileLevel[] = ['general', 'private', 'secret'];

/** Cofre com senha: a senha nunca vai para a IA; segredos só abrem com o cofre desbloqueado. */
function VaultCard({ vault }: { vault: VaultStatus }) {
  const confirm = useConfirm();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const done = () => { setPw(''); setPw2(''); setCur(''); setNext(''); };
  const setup = useAction(() => api.post('/vault/setup', { password: pw }), done);
  const unlock = useAction(() => api.post('/vault/unlock', { password: pw }), done);
  const lock = useAction(() => api.post('/vault/lock'));
  const change = useAction(() => api.post('/vault/change', { current: cur, next }), done);
  const reset = useAction(() => api.post('/vault/reset', { confirm: true }), done);

  return (
    <section className="panel vault">
      <div className="vault-head">
        <span className={`vault-ico${vault.unlocked ? ' open' : ''}`}><Icon name="lock" size={20} /></span>
        <div>
          <h2>Cofre</h2>
          <p className="muted small">
            {!vault.configured ? 'Ainda não configurado. Crie uma senha para guardar informações secretas.'
              : vault.unlocked ? `Desbloqueado até ${fmt(new Date(vault.unlockedUntil as number), 'HH:mm')}. Depois disso, volta a bloquear sozinho.`
              : 'Bloqueado. Informações secretas ficam ocultas e a IA não consegue lê-las.'}
          </p>
        </div>
        {vault.unlocked && <button className="btn small" onClick={() => lock.mutate(undefined)}>Bloquear agora</button>}
      </div>

      {!vault.configured && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); setup.mutate(undefined); }}>
          <Field label="Senha do cofre (mín. 8 caracteres)"><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} /></Field>
          <Field label="Repita a senha"><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
          <button className="btn primary" disabled={setup.isPending || pw.length < 8 || pw !== pw2}>Criar cofre</button>
          <p className="hint warn">Não há como recuperar a senha. Se você esquecê-la, os itens secretos são perdidos (dá para reiniciar o cofre, apagando-os).</p>
          <ErrorText error={setup.error} />
        </form>
      )}

      {vault.configured && !vault.unlocked && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); unlock.mutate(undefined); }}>
          <Field label="Senha do cofre"><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
          <button className="btn primary" disabled={unlock.isPending || !pw}>Desbloquear</button>
          <ErrorText error={unlock.error} />
        </form>
      )}

      {vault.configured && (
        <details className="vault-more">
          <summary>Trocar senha ou reiniciar</summary>
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); change.mutate(undefined); }}>
            <Field label="Senha atual"><input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
            <Field label="Nova senha (mín. 8)"><input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
            <button className="btn" disabled={change.isPending || !cur || next.length < 8}>Trocar senha</button>
            <ErrorText error={change.error} />
          </form>
          <button className="btn danger small" onClick={async () => { if (await confirm('Reiniciar o cofre APAGA todos os itens secretos e remove a senha. Continuar?')) reset.mutate(undefined); }}>Esqueci a senha — reiniciar cofre</button>
        </details>
      )}
    </section>
  );
}

function ItemModal({ item, vault, onClose }: { item?: ProfileItem; vault: VaultStatus; onClose: () => void }) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(item?.title ?? '');
  const [content, setContent] = useState(item?.content ?? '');
  const [level, setLevel] = useState<ProfileLevel>(item?.level ?? 'general');
  const secretBlocked = !vault.unlocked; // criar/editar/converter para secreto exige o cofre aberto
  const needsVault = level === 'secret' || item?.level === 'secret';

  const save = useAction(
    (body: Record<string, unknown>) => (item ? api.patch(`/profile/${item.id}`, body) : api.post('/profile', body)),
    onClose,
  );
  const remove = useAction(() => api.del(`/profile/${item!.id}`), onClose);

  return (
    <Modal
      title={item ? 'Editar informação' : 'Nova informação'} onClose={onClose}
      onSubmit={() => save.mutate({ title: title.trim(), content, level })}
      footer={
        <>
          {item && <button type="button" className="btn danger" onClick={async () => { if (await confirm(`Apagar "${item.title}"?`)) remove.mutate(undefined); }}>Apagar</button>}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={save.isPending || !title.trim() || (needsVault && secretBlocked)}>Salvar</button>
        </>
      }
    >
      <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Alergias, Plano de saúde, Senha do Wi-Fi" autoFocus required /></Field>
      <Field label="Conteúdo"><textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
      <fieldset className="field">
        <legend className="field-label">Nível de confidencialidade</legend>
        <div className="level-cards">
          {LEVELS.map((l) => (
            <button key={l} type="button" className={`level-card lvl-${l}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
              <b>{LEVEL_PROFILE[l].name}</b><span>{LEVEL_PROFILE[l].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {needsVault && secretBlocked && <p className="hint warn">Informações secretas só podem ser criadas, lidas ou alteradas com o cofre desbloqueado.</p>}
      <ErrorText error={save.error ?? remove.error} />
    </Modal>
  );
}

export function ProfileSettings() {
  // Repolling curto: o cofre trava sozinho por TTL no servidor; sem isso, um item secreto já visto continuaria
  // exibido em texto plano na tela mesmo depois de o cofre travar de novo.
  const items = useQuery({ queryKey: ['profile'], queryFn: () => api.get<ProfileItem[]>('/profile'), refetchInterval: 20_000 });
  const vault = useQuery({ queryKey: ['vault'], queryFn: () => api.get<VaultStatus>('/vault/status'), refetchInterval: 20_000 });
  const [editing, setEditing] = useState<ProfileItem | 'new' | null>(null);
  const list = items.data ?? [];

  return (
    <div className="profile">
      <p className="banner soft">
        <b>Sobre a IA:</b> as informações <b>Gerais</b> vão para o provedor de IA (Anthropic ou OpenAI) em toda conversa, para o agente te conhecer.
        As <b>Privadas</b> e <b>Secretas</b> só são lidas se você aprovar cada vez — e, ao serem lidas, também passam pelo provedor.
      </p>

      {vault.data && <VaultCard vault={vault.data} />}

      <div className="section-head">
        <h2>Suas informações</h2>
        <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Adicionar</button>
      </div>
      <ErrorText error={items.error} />
      {list.length === 0 && <p className="empty">Nada ainda. Comece com o seu nome, alergias, rotina de trabalho ou preferências.</p>}

      <div className="profile-cols">
        {LEVELS.map((l) => {
          const group = list.filter((i) => i.level === l);
          return (
            <section key={l} className={`panel lvl-${l}`}>
              <h3>{LEVEL_PROFILE[l].name}</h3>
              <p className="hint">{LEVEL_PROFILE[l].hint}</p>
              {group.length === 0 && <p className="muted small">Nenhum item.</p>}
              <ul className="profile-list">
                {group.map((i) => (
                  <li key={i.id}>
                    <button onClick={() => setEditing(i)} disabled={i.locked} title={i.locked ? 'Desbloqueie o cofre para ver' : 'Editar'}>
                      <b>{i.locked && <Icon name="lock" size={13} />} {i.title}</b>
                      <span>{i.locked ? 'Bloqueado — desbloqueie o cofre' : (i.content ?? '').slice(0, 90) || '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {editing && vault.data && <ItemModal item={editing === 'new' ? undefined : editing} vault={vault.data} onClose={() => setEditing(null)} />}
    </div>
  );
}
