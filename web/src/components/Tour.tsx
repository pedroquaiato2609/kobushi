import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

export const TOUR_KEY = 'ninshiki.tour.done';

interface Step { title: string; body: ReactNode; target?: string; route?: string }
interface Rect { left: number; top: number; width: number; height: number; right: number }

const STEPS: Step[] = [
  {
    title: 'Bem-vindo ao Ninshiki',
    body: (
      <>
        <p>Um jeito de organizar o dia sem se cobrar além da conta. A ideia central cabe em três níveis:</p>
        <div className="tour-levels">
          <div className="tour-level"><i style={{ background: 'var(--min)' }} /><div><b>Mínimo</b><span>O suficiente para manter a continuidade num dia difícil.</span></div></div>
          <div className="tour-level"><i style={{ background: 'var(--ideal)' }} /><div><b>Ideal</b><span>O seu padrão normal.</span></div></div>
          <div className="tour-level"><i style={{ background: 'var(--max)' }} /><div><b>Máximo</b><span>Quando sobra energia. É bônus, nunca obrigação.</span></div></div>
        </div>
      </>
    ),
  },
  {
    title: 'Obrigações e objetivos',
    body: (
      <p>
        <strong>Obrigações</strong> são compromissos com outras pessoas, como o trabalho. <strong>Objetivos</strong> são o que você quer
        desenvolver: leitura, academia, meditação. Cada atividade tem os três níveis e, se quiser, um <em>princípio</em>: como você quer
        se comportar ao fazê-la. No fim do dia você só registra o nível que cumpriu.
      </p>
    ),
  },
  {
    title: 'Home: converse com o agente',
    target: 'nav-home', route: '/',
    body: <p>Peça em linguagem natural: “marque que li 10 páginas hoje”, “me lembre de ligar para o banco às 10h” ou “como faço um bolo de chocolate?” — o agente ainda sugere atalhos, como montar a lista de compras. Use <strong>Ditar</strong> para falar em vez de digitar. Ações sensíveis, como apagar, esperam a sua aprovação.</p>,
  },
  {
    title: 'Agenda: o dia em dois lados',
    target: 'nav-agenda', route: '/agenda',
    body: <p>Seus eventos <em>e</em> as atividades da rotina aparecem juntos no calendário. <strong>Toque num dia</strong> para entrar nele. À direita: a <strong>rotina do dia</strong> (toque em Mínimo, Ideal ou Máximo), os próximos eventos e os <strong>lembretes</strong>.</p>,
  },
  {
    title: 'Atividades: a sua rotina completa',
    target: 'nav-activities', route: '/atividades',
    body: <p>Cada atividade com seus níveis, princípio, dias da semana, histórico dos últimos dias, sequência e um <strong>aviso diário</strong> no horário que você escolher — no sino do app, no celular ou no WhatsApp.</p>,
  },
  {
    title: 'Lembretes: tudo o que vai te avisar',
    target: 'nav-reminders', route: '/lembretes',
    body: <p>Uma página só com o que está agendado: lembretes avulsos, o aviso diário de cada atividade e o aviso antes de cada evento. Crie, edite e veja o <strong>próximo aviso</strong> de relance.</p>,
  },
  {
    title: 'Documentos: seu mini data center',
    target: 'nav-documents', route: '/documentos',
    body: <p>Notas, listas de compras, exames e arquivos, em pastas. O agente lê, cria, edita e resume — e você pode <strong>ocultar</strong> qualquer pasta dele (ótimo para dados de saúde).</p>,
  },
  {
    title: 'Kanban: tarefas e projetos',
    target: 'nav-kanban', route: '/kanban',
    body: <p>Organize o que não tem hora marcada em colunas. Arraste os cards entre elas ou toque num card para editar, dar prazo ou ligar a uma atividade.</p>,
  },
  {
    title: 'Dashboard: continuidade, sem notas',
    target: 'nav-dashboard', route: '/dashboard',
    body: <p>Veja quantos dias seguidos você manteve a rotina (o mínimo já conta), como cada atividade foi e sua meditação. Aqui também ficam a <strong>revisão do dia</strong> e o registro de meditação.</p>,
  },
  {
    title: 'Configurações: a IA e seus limites',
    target: 'nav-settings', route: '/configuracoes',
    body: <p>Escolha Claude ou OpenAI e o tom. Em <strong>Perfil</strong>, conte quem você é em três níveis de sigilo (o secreto fica sob senha). Em <strong>Notificações</strong>, ative o celular e o WhatsApp. Em Permissões, decida ferramenta por ferramenta o que o agente pode fazer.</p>,
  },
  {
    title: 'Pronto! Por onde começar?',
    body: null,
  },
];

const FIRST_STEPS: { icon: IconName; label: string; to: string }[] = [
  { icon: 'settings', label: '1. Configurar a chave da IA', to: '/configuracoes' },
  { icon: 'target', label: '2. Ajustar suas atividades', to: '/atividades' },
  { icon: 'sparkles', label: '3. Pedir algo ao agente', to: '/' },
];

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const navigate = useNavigate();
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const finish = () => {
    localStorage.setItem(TOUR_KEY, '1');
    onClose();
  };

  useEffect(() => { if (open) setI(0); }, [open]);
  useEffect(() => { if (open && step.route) navigate(step.route); }, [open, i]);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      const r = el?.getBoundingClientRect();
      if (!r || r.width === 0) return setRect(null); // item escondido (ex.: menu "Mais" no celular)
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.right });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' && !last) setI((n) => n + 1);
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, last]);

  if (!open) return null;

  const wide = window.innerWidth > 820;
  let cardStyle: CSSProperties | undefined;
  if (rect && wide) cardStyle = { left: rect.right + 22, top: Math.min(Math.max(rect.top - 30, 16), window.innerHeight - 380) };
  else if (rect) cardStyle = { left: '50%', transform: 'translateX(-50%)', bottom: 96 };

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Tour guiado">
      <div className="tour-block" />
      {rect ? (
        <div className="tour-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />
      ) : (
        <div className="tour-dim" />
      )}

      <div className={`tour-card${rect ? '' : ' center'}`} style={cardStyle}>
        {i === 0 && <div className="tour-mark" lang="ja">認識</div>}
        {i > 0 && <span className="tour-step">Passo {i + 1} de {STEPS.length}</span>}
        <h2>{step.title}</h2>
        {step.body}

        {last && (
          <div className="tour-actions">
            <p>Três passos para começar. Você pode rever este tour quando quiser, pelo botão “Tour guiado” do menu.</p>
            {FIRST_STEPS.map((s) => (
              <button key={s.to} className="btn" onClick={() => { navigate(s.to); finish(); }}>
                <Icon name={s.icon} size={16} /> {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">{STEPS.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
          {!last && <button className="btn ghost" onClick={finish}>Pular</button>}
          {i > 0 && <button className="btn ghost" onClick={() => setI(i - 1)}>Voltar</button>}
          <button className="btn primary" onClick={() => (last ? finish() : setI(i + 1))}>{last ? 'Concluir' : i === 0 ? 'Começar' : 'Próximo'}</button>
        </div>
      </div>
    </div>
  );
}
