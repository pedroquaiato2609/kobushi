import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

// Espelho exato de web/src/components/Icon.tsx — mesmos traços finos (stroke, sem preenchimento),
// pra o app mobile ficar no mesmo padrão visual do app web em vez de usar emoji.
const PATHS: Record<string, ReactNode> = {
  home: <><Path d="M3 11l9-8 9 8" /><Path d="M5 10v10h14V10" /><Path d="M10 20v-6h4v6" /></>,
  calendar: <><Rect x="3" y="5" width="18" height="16" rx="3" /><Path d="M8 3v4M16 3v4M3 10h18" /></>,
  kanban: <><Rect x="3" y="4" width="5" height="16" rx="1.5" /><Rect x="10" y="4" width="5" height="10" rx="1.5" /><Rect x="17" y="4" width="4" height="13" rx="1.5" /></>,
  chart: <Path d="M5 20V11M12 20V5M19 20v-8" />,
  settings: <><Path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><Circle cx="16" cy="6" r="2" /><Circle cx="10" cy="12" r="2" /><Circle cx="18" cy="18" r="2" /></>,
  help: <><Circle cx="12" cy="12" r="9" /><Path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01" /></>,
  mic: <><Rect x="9" y="3" width="6" height="12" rx="3" /><Path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
  send: <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  left: <Path d="M15 6l-6 6 6 6" />,
  right: <Path d="M9 6l6 6-6 6" />,
  sparkles: <><Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><Path d="M19 16v4M17 18h4" /></>,
  trash: <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  edit: <Path d="M4 20h4L19 9l-4-4L4 16z" />,
  x: <Path d="M6 6l12 12M18 6L6 18" />,
  target: <><Circle cx="12" cy="12" r="9" /><Circle cx="12" cy="12" r="5" /><Circle cx="12" cy="12" r="1.2" /></>,
  dumbbell: <Path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  folder: <Path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  file: <><Path d="M6 3h8l5 5v13H6z" /><Path d="M14 3v5h5" /></>,
  note: <><Path d="M5 4h14v16H5z" /><Path d="M9 9h6M9 13h6M9 17h3" /></>,
  list: <><Path d="M9 6h11M9 12h11M9 18h11" /><Path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></>,
  upload: <Path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  search: <><Circle cx="11" cy="11" r="6.5" /><Path d="M16 16l4.5 4.5" /></>,
  bell: <><Path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><Path d="M10 21a2 2 0 004 0" /></>,
  lock: <><Rect x="5" y="11" width="14" height="10" rx="2.5" /><Path d="M8 11V8a4 4 0 018 0v3" /></>,
  eye: <><Path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" /><Circle cx="12" cy="12" r="2.8" /></>,
  eyeOff: <><Path d="M3 3l18 18" /><Path d="M10.5 6.2A9.6 9.6 0 0112 6c6.5 0 10 6 10 6a17 17 0 01-3.2 3.9M6.6 7.8A16.8 16.8 0 002 12s3.5 6 10 6a9.7 9.7 0 003.4-.6" /></>,
  wallet: <><Path d="M4 7a2 2 0 012-2h11v4" /><Rect x="3" y="7" width="18" height="13" rx="3" /><Path d="M16 13.5h2.5" /></>,
  shield: <Path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />,
  logout: <><Path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4" /><Path d="M15 8l4 4-4 4M19 12H9" /></>,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><Path d="M12 4l9 16H3z" /><Path d="M12 10v4M12 17.5h.01" /></>,
  more: <><Circle cx="5" cy="12" r="1.4" /><Circle cx="12" cy="12" r="1.4" /><Circle cx="19" cy="12" r="1.4" /></>,
  download: <Path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  clock: <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v5l3 2" /></>,
  pin: <><Path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" /><Circle cx="12" cy="9.5" r="2.5" /></>,
  book: <><Path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 16.5z" /><Path d="M4 16.5A2.5 2.5 0 016.5 14H20" /><Path d="M8 3v11" /></>,
  star: <Path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3-4.8-4.3 6.4-.6z" />,
  up: <Path d="M6 15l6-6 6 6" />,
  down: <Path d="M6 9l6 6 6-6" />,
  study: <><Path d="M12 3l10 5-10 5L2 8z" /><Path d="M6 10.5v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" /><Path d="M22 8v6" /></>,
  car: <><Path d="M4 16v-4l2-5h12l2 5v4" /><Path d="M4 16h16" /><Circle cx="7.5" cy="17.5" r="1.6" /><Circle cx="16.5" cy="17.5" r="1.6" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return (
    // pointerEvents="none": ícone é sempre decorativo — sem isso, no Android (e na web) o toque podia
    // ser "engolido" pelo próprio SVG em vez de chegar no botão que o envolve (foi a causa real da
    // navegação simplesmente não responder ao tocar bem em cima de um ícone, como os das abas).
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
      {PATHS[name]}
    </Svg>
  );
}
