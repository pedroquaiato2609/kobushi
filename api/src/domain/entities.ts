import type { ActivityKind, DocKind, Level, NotifyChannel, Period, ProfileLevel, Repeat, TimeMode } from './constants';

export interface Activity {
  id: string;
  name: string;
  kind: ActivityKind;
  timeMode: TimeMode;
  period: Period | null;
  startTime: string | null; // 'HH:mm'
  endTime: string | null;
  notBefore: string | null; // 'HH:mm' — "depois das" (objetivos sem horário fixo)
  notAfter: string | null; // 'HH:mm' — "antes das"
  durationMin: number; // quanto tempo o bloco ocupa no calendário
  suggestedStart: string | null; // horário escolhido pela IA
  suggestedReason: string;
  purpose: string; // A3: toda atividade relevante tem uma finalidade
  principle: string; // como quero me comportar ao realizar
  minDesc: string;
  idealDesc: string;
  maxDesc: string;
  weekdays: number[]; // 0 = domingo
  active: boolean;
  remindTime: string | null; // 'HH:mm' — lembrete diário (some se já registrou o dia)
  remindChannels: NotifyChannel[];
  createdAt: Date;
  updatedAt: Date;
}
export type NewActivity = Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>;

export interface Execution {
  id: string;
  activityId: string;
  date: string;
  level: Level;
  note: string;
}

export interface DayPlanItem extends Activity {
  executionLevel: Level | null;
  executionNote: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string; // 'YYYY-MM-DDTHH:mm' (hora local do app)
  end: string;
  activityId: string | null;
  location: string;
  remindMinutes: number | null;
  remindChannels: NotifyChannel[];
  createdAt: Date;
}
export interface NewEvent {
  title: string;
  description: string;
  start: string;
  end: string;
  activityId: string | null;
  location: string;
  remindMinutes: number | null;
  remindChannels: NotifyChannel[];
}

export interface Board { id: string; name: string; createdAt: Date }
export interface Column { id: string; boardId: string; name: string; position: number }
export interface Card {
  id: string;
  columnId: string;
  title: string;
  description: string;
  position: number;
  dueDate: string | null;
  activityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface NewCard { title: string; description: string; dueDate: string | null; activityId: string | null }
export interface BoardFull extends Board { columns: (Column & { cards: Card[] })[] }

export interface DailyReview {
  date: string;
  responsibilities: string; // Cumpri minhas responsabilidades?
  goals: string; // Mantive meus objetivos?
  state: string; // Como estava meu estado mental, físico e espiritual?
  learned: string; // O que aprendi sobre mim hoje?
  updatedAt: Date;
}
export type ReviewFields = Partial<Pick<DailyReview, 'responsibilities' | 'goals' | 'state' | 'learned'>>;

export interface MeditationSession {
  id: string;
  date: string;
  durationMin: number;
  attention: number | null; // 0-10
  spatial: number | null;
  sound: number | null;
  imagery: number | null;
  afterState: number | null;
  note: string;
  createdAt: Date;
}
export type NewMeditation = Omit<MeditationSession, 'id' | 'createdAt'>;

export interface DayStats { date: string; applicable: number; done: number; min: number; ideal: number; max: number }
export interface ActivityStats {
  activityId: string; name: string; kind: ActivityKind;
  applicable: number; min: number; ideal: number; max: number; missed: number;
}
export interface Stats {
  from: string;
  to: string;
  days: DayStats[];
  byActivity: ActivityStats[];
  totals: { applicable: number; done: number; min: number; ideal: number; max: number };
  currentStreak: number;
  meditation: MeditationSession[];
}

export interface Reminder {
  id: string;
  title: string;
  body: string;
  remindAt: string; // próxima ocorrência, 'YYYY-MM-DDTHH:mm'
  repeat: Repeat;
  channels: NotifyChannel[];
  activityId: string | null;
  status: 'pending' | 'done';
  lastFiredAt: string | null;
  createdAt: Date;
}
export type NewReminder = Pick<Reminder, 'title' | 'body' | 'remindAt' | 'repeat' | 'channels' | 'activityId'>;

export interface AppNotification {
  id: string; title: string; body: string; link: string | null; source: string; createdAt: Date; readAt: Date | null;
}

export interface Folder { id: string; parentId: string | null; name: string; agentVisible: boolean; createdAt: Date }
export interface Doc {
  id: string; folderId: string | null; title: string; kind: DocKind; content: string; summary: string;
  mime: string | null; sizeBytes: number | null; storageName: string | null; createdAt: Date; updatedAt: Date;
}
export type DocListItem = Omit<Doc, 'content' | 'storageName'> & { excerpt: string };
export type NewDoc = Pick<Doc, 'title' | 'kind' | 'content' | 'folderId'> & Partial<Pick<Doc, 'mime' | 'sizeBytes' | 'storageName'>>;

export interface StoredProfileItem { id: string; title: string; content: string; level: ProfileLevel; createdAt: Date; updatedAt: Date }
/** content = null quando é secreto e o cofre está bloqueado. */
export interface ProfileItem { id: string; title: string; content: string | null; level: ProfileLevel; locked: boolean; updatedAt: Date }

// Princípios: título e conteúdo sempre cifrados com a chave do Cofre — nunca em texto plano no banco.
// Lembrete é por pasta/categoria: cada uma tem seu próprio horário, dias e canais.
export interface PrincipleReminder { enabled: boolean; times: string[]; weekdays: number[]; channels: NotifyChannel[] }
export interface PrincipleFolder { id: string; name: string; createdAt: Date; reminder: PrincipleReminder }
export interface StoredPrinciple { id: string; folderId: string | null; title: string; content: string; archived: boolean; createdAt: Date; updatedAt: Date }
/** title/content = null quando o cofre está bloqueado (nem o título aparece). */
export interface Principle { id: string; folderId: string | null; title: string | null; content: string | null; locked: boolean; updatedAt: Date }

export interface ActivityMatrixRow {
  activityId: string; name: string; kind: ActivityKind;
  cells: { date: string; applicable: boolean; level: Level | null }[];
  streak: number;
  counts: { min: number; ideal: number; max: number; missed: number };
}
