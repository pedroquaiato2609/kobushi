import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './components/AuthGate';
import { Icon, type IconName } from './components/Icon';
import { useActiveWorkout, useNow } from './components/gym/shared';
import { fmtClock } from './lib/gym';
import { Logo } from './components/Logo';
import { TOUR_KEY, Tour } from './components/Tour';
import ActivitiesPage from './pages/ActivitiesPage';
import AgendaPage from './pages/AgendaPage';
import CommutesPage from './pages/CommutesPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import FinancePage from './pages/FinancePage';
import GymPage from './pages/GymPage';
import HomePage from './pages/HomePage';
import KanbanPage from './pages/KanbanPage';
import PrincipiosPage from './pages/PrincipiosPage';
import ReadingPage from './pages/ReadingPage';
import RemindersPage from './pages/RemindersPage';
import SettingsPage from './pages/SettingsPage';

// Estudos carrega um editor de texto rico (TipTap) pesado: só baixa esse código pra quem realmente abre a aba.
const StudyPage = lazy(() => import('./pages/StudyPage'));
const StudyPrintPage = lazy(() => import('./pages/StudyPrintPage'));

type NavItem = { to: string; label: string; icon: IconName; tour: string; end?: boolean; primary?: boolean };

// `primary`: aparece na barra inferior do celular; os demais ficam no menu "Mais".
// Os grupos abaixo só organizam a barra lateral (desktop) — no mobile a navegação continua vindo de `primary`.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Principal',
    items: [
      { to: '/', label: 'Home', icon: 'home', tour: 'nav-home', end: true, primary: true },
      { to: '/agenda', label: 'Agenda', icon: 'calendar', tour: 'nav-agenda', primary: true },
      { to: '/atividades', label: 'Atividades', icon: 'target', tour: 'nav-activities', primary: true },
      { to: '/deslocamentos', label: 'Deslocamentos', icon: 'car', tour: 'nav-commutes' },
      { to: '/lembretes', label: 'Lembretes', icon: 'bell', tour: 'nav-reminders' },
      { to: '/principios', label: 'Princípios', icon: 'shield', tour: 'nav-principios' },
    ],
  },
  {
    label: 'Saúde & Estudo',
    items: [
      { to: '/academia', label: 'Academia', icon: 'dumbbell', tour: 'nav-gym' },
      { to: '/leitura', label: 'Leitura', icon: 'book', tour: 'nav-reading' },
      { to: '/estudos', label: 'Estudos', icon: 'study', tour: 'nav-study' },
    ],
  },
  {
    label: 'Organização',
    items: [
      { to: '/documentos', label: 'Documentos', icon: 'folder', tour: 'nav-documents' },
      { to: '/kanban', label: 'Kanban', icon: 'kanban', tour: 'nav-kanban' },
      { to: '/dashboard', label: 'Dashboard', icon: 'chart', tour: 'nav-dashboard' },
      { to: '/financas', label: 'Finanças', icon: 'wallet', tour: 'nav-finance', primary: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/configuracoes', label: 'Configurações', icon: 'settings', tour: 'nav-settings' },
    ],
  },
];
const MAIN = NAV_GROUPS.flatMap((g) => g.items);

const linkClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`;
const matchesRoute = (l: NavItem, pathname: string) => (l.end ? pathname === l.to : pathname.startsWith(l.to));

/** Acordeão de seleção única: só um grupo fica aberto por vez, e abrir a página de um grupo já abre esse grupo sozinho. */
function useOpenGroup(pathname: string) {
  const activeLabel = NAV_GROUPS.find((g) => g.items.some((l) => matchesRoute(l, pathname)))?.label ?? null;
  // undefined = sem escolha manual ainda (segue a rota atual); null = fechado manualmente; string = grupo aberto manualmente
  const [manual, setManual] = useState<string | null | undefined>(undefined);
  useEffect(() => setManual(undefined), [pathname]);
  const open = manual === undefined ? activeLabel : manual;
  const toggle = (label: string) => setManual(open === label ? null : label);
  return [open, toggle] as const;
}

/** Aviso fixo quando há um treino em andamento e o usuário está em outra tela. */
function WorkoutPill() {
  const location = useLocation();
  const active = useActiveWorkout();
  const now = useNow(1000);
  if (!active.data || location.pathname.startsWith('/academia')) return null;
  const elapsed = Math.floor((now - new Date(active.data.session.startedAt).getTime()) / 1000);
  return (
    <NavLink to="/academia" className="workout-pill" aria-label="Voltar ao treino em andamento">
      <Icon name="dumbbell" size={16} /> <span>Treino em andamento</span> <b>{fmtClock(elapsed)}</b>
    </NavLink>
  );
}

export default function App() {
  const [tourOpen, setTourOpen] = useState(() => !localStorage.getItem(TOUR_KEY));
  const [more, setMore] = useState(false);
  const location = useLocation();
  const [openGroup, toggleGroup] = useOpenGroup(location.pathname);
  const { logout } = useAuth();
  useEffect(() => setMore(false), [location.pathname]);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <Logo size={42} />
          <div>
            <b className="brand-name">Ninshiki</b>
            <span className="brand-tag">um dia de cada vez</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Principal">
          {NAV_GROUPS.map((g) => {
            const open = openGroup === g.label;
            return (
              <div key={g.label} className="side-group">
                <button type="button" className="side-label side-label-toggle" aria-expanded={open} onClick={() => toggleGroup(g.label)}>
                  <span>{g.label}</span>
                  <Icon name="down" size={13} />
                </button>
                <div className={`side-group-items${open ? '' : ' collapsed'}`}>
                  {g.items.map((l) => (
                    <NavLink key={l.to} to={l.to} end={l.end} className={(st) => `${linkClass(st)}${l.primary ? '' : ' secondary'}`} data-tour={l.tour}>
                      <Icon name={l.icon} /> <span>{l.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
          <button className="nav-link more-btn" onClick={() => setMore((m) => !m)} aria-expanded={more} aria-label="Mais opções">
            <Icon name="more" /> <span>Mais</span>
          </button>
        </nav>

        {more && (
          <>
            <div className="more-backdrop" onClick={() => setMore(false)} />
            <div className="more-sheet" role="menu">
              {MAIN.filter((l) => !l.primary).map((l) => <NavLink key={l.to} to={l.to} className={linkClass}><Icon name={l.icon} /> <span>{l.label}</span></NavLink>)}
              <button className="nav-link" onClick={() => { setMore(false); setTourOpen(true); }}><Icon name="help" /> <span>Tour guiado</span></button>
              <button className="nav-link" onClick={() => { setMore(false); logout(); }}><Icon name="logout" /> <span>Sair</span></button>
            </div>
          </>
        )}
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/atividades" element={<ActivitiesPage />} />
          <Route path="/deslocamentos" element={<CommutesPage />} />
          <Route path="/lembretes" element={<RemindersPage />} />
          <Route path="/documentos" element={<DocumentsPage />} />
          <Route path="/financas" element={<FinancePage />} />
          <Route path="/academia" element={<GymPage />} />
          <Route path="/leitura" element={<ReadingPage />} />
          <Route path="/estudos" element={<Suspense fallback={<p className="hint" style={{ padding: 20 }}>Carregando…</p>}><StudyPage /></Suspense>} />
          <Route path="/estudos/imprimir/:id" element={<Suspense fallback={null}><StudyPrintPage /></Suspense>} />
          <Route path="/kanban" element={<KanbanPage />} />
          <Route path="/principios" element={<PrincipiosPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/configuracoes" element={<SettingsPage />} />
        </Routes>
      </main>

      <WorkoutPill />
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
