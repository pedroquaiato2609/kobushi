import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { NotificationSettings as Settings } from '../api/types';
import { enablePush, pushSupported } from '../lib/push';
import { Icon } from './Icon';
import { ErrorText, Field } from './ui';

/** Onde os avisos chegam: sino do app (sempre), celular (push) e WhatsApp. Cada canal tem botão de teste. */
export function NotificationSettings() {
  const q = useQuery({ queryKey: ['notification-settings'], queryFn: () => api.get<Settings>('/notification-settings') });
  const [number, setNumber] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const ok = (msg: string) => () => setOkMsg(msg);

  const test = useAction((channel: 'app' | 'push' | 'whatsapp') => api.post('/notifications/test', { channel }), ok('Teste enviado. Confira o canal escolhido.'));
  const activate = useAction(() => enablePush(), ok('Este aparelho agora recebe notificações.'));
  const saveNumber = useAction((whatsappTo: string) => api.put('/notification-settings', { whatsappTo }), ok('Número salvo.'));

  const s = q.data;
  const shown = number ?? s?.whatsappTo ?? '';
  const error = q.error ?? test.error ?? activate.error ?? saveNumber.error;

  return (
    <div className="notif-settings">
      <p className="banner soft">Todo aviso (atividade, evento ou lembrete) cai no <b>sino do app</b>. Você escolhe, em cada um, se também quer receber no celular ou no WhatsApp.</p>
      {okMsg && <p className="ok-msg" role="status">{okMsg}</p>}
      <ErrorText error={error} />

      <section className="panel channel">
        <header><span className="ch-ico"><Icon name="bell" size={20} /></span><div><h2>Sino do app</h2><p className="muted small">Sempre ativo. Funciona em qualquer aparelho, com o app aberto.</p></div><span className="tag ok">Ativo</span></header>
        <button className="btn small" onClick={() => { setOkMsg(null); test.mutate('app'); }}>Enviar teste</button>
      </section>

      <section className="panel channel">
        <header>
          <span className="ch-ico"><Icon name="bell" size={20} /></span>
          <div><h2>Celular (push)</h2><p className="muted small">Chega mesmo com o app fechado. Instale o Ninshiki na tela inicial do celular.</p></div>
          {s && <span className={`tag ${s.push.devices ? 'ok' : ''}`}>{s.push.devices ? `${s.push.devices} aparelho${s.push.devices > 1 ? 's' : ''}` : 'Nenhum aparelho'}</span>}
        </header>
        {s && !s.push.configured && <p className="hint warn">O servidor ainda não tem chaves VAPID. Gere com <code>docker compose exec api npx web-push generate-vapid-keys</code>, coloque no <code>.env</code> e reinicie a API.</p>}
        {!pushSupported() && <p className="hint warn">Este navegador não suporta push. No iPhone (iOS 16.4+), use “Compartilhar → Adicionar à Tela de Início” e abra por lá.</p>}
        <p className="hint">Exige HTTPS (ou localhost). Para usar no celular, exponha o app com um endereço seguro (ex.: Tailscale ou Cloudflare Tunnel).</p>
        <div className="btn-row">
          <button className="btn primary small" disabled={!s?.push.configured || !pushSupported() || activate.isPending} onClick={() => { setOkMsg(null); activate.mutate(undefined); }}>Ativar neste aparelho</button>
          <button className="btn small" disabled={!s?.push.devices} onClick={() => { setOkMsg(null); test.mutate('push'); }}>Enviar teste</button>
        </div>
      </section>

      <section className="panel channel">
        <header>
          <span className="ch-ico"><Icon name="send" size={20} /></span>
          <div><h2>WhatsApp</h2><p className="muted small">Envio via Twilio, para o seu número.</p></div>
          {s && <span className={`tag ${s.whatsapp.configured && s.whatsappTo ? 'ok' : ''}`}>{s.whatsapp.configured ? (s.whatsappTo ? 'Configurado' : 'Falta o número') : 'Sem credenciais'}</span>}
        </header>
        {s && !s.whatsapp.configured && <p className="hint warn">Defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM no <code>.env</code> e reinicie a API.</p>}
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); setOkMsg(null); saveNumber.mutate(shown); }}>
          <Field label="Seu número (com DDI e DDD)"><input value={shown} onChange={(e) => setNumber(e.target.value)} placeholder="+55 47 99999-9999" inputMode="tel" /></Field>
          <button className="btn small" disabled={saveNumber.isPending}>Salvar número</button>
          <button type="button" className="btn small" disabled={!s?.whatsapp.configured || !s.whatsappTo} onClick={() => { setOkMsg(null); test.mutate('whatsapp'); }}>Enviar teste</button>
        </form>
        <p className="hint">Regra do WhatsApp: fora da janela de 24 h desde a sua última mensagem, só chegam modelos aprovados. No sandbox da Twilio, envie primeiro o código “join …” do console deles. Se falhar, o aviso continua chegando no sino.</p>
      </section>
    </div>
  );
}
