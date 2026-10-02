// Portas: o que a camada de aplicação precisa do mundo externo.
// Os repositórios em infrastructure/ implementam estas interfaces.
import type { Level } from '../domain/constants';
import type {
  Activity, AppNotification, Board, BoardFull, CalendarEvent, Card, Column, Commute, DailyReview, DayPlanItem, Doc, DocListItem,
  Execution, Folder, MeditationSession, NewActivity, NewCard, NewCommute, NewDoc, NewEvent, NewMeditation, NewReminder, ReviewFields,
  Reminder, StoredProfileItem, PrincipleFolder, StoredPrinciple, PrincipleReminder,
} from '../domain/entities';
import type { ProfileLevel } from '../domain/constants';

export interface ActivityRepository {
  list(): Promise<Activity[]>;
  get(id: string): Promise<Activity | null>;
  create(data: NewActivity): Promise<Activity>;
  update(id: string, patch: Partial<NewActivity>): Promise<Activity | null>;
  delete(id: string): Promise<boolean>;
}

export interface ExecutionRepository {
  dayPlan(date: string, weekday: number): Promise<DayPlanItem[]>;
  upsert(activityId: string, date: string, level: Level, note?: string): Promise<Execution>;
  clear(activityId: string, date: string): Promise<boolean>;
  listRange(from: string, to: string): Promise<Execution[]>;
}

export interface EventRepository {
  list(from: string, to: string): Promise<CalendarEvent[]>;
  get(id: string): Promise<CalendarEvent | null>;
  create(data: NewEvent): Promise<CalendarEvent>;
  update(id: string, patch: Partial<NewEvent>): Promise<CalendarEvent | null>;
  delete(id: string): Promise<boolean>;
  /** Eventos com aviso configurado cujo horário de aviso já chegou e que ainda não começaram. */
  reminderDue(nowLocal: string): Promise<CalendarEvent[]>;
}

export interface BoardRepository {
  /** Cards com prazo vencido que ainda não estão na última coluna (concluídos). */
  overdueCards(today: string): Promise<{ id: string; title: string; dueDate: string }[]>;
  listBoards(): Promise<Board[]>;
  getBoard(id: string): Promise<BoardFull | null>;
  createBoard(name: string): Promise<Board>;
  renameBoard(id: string, name: string): Promise<Board | null>;
  deleteBoard(id: string): Promise<boolean>;

  getColumn(id: string): Promise<Column | null>;
  createColumn(boardId: string, name: string): Promise<Column>;
  renameColumn(id: string, name: string): Promise<Column | null>;
  deleteColumn(id: string): Promise<boolean>;

  getCard(id: string): Promise<Card | null>;
  createCard(columnId: string, data: NewCard): Promise<Card>;
  updateCard(id: string, patch: Partial<NewCard>): Promise<Card | null>;
  moveCard(id: string, columnId: string, position?: number): Promise<Card | null>;
  deleteCard(id: string): Promise<boolean>;
}

export interface ReviewRepository {
  get(date: string): Promise<DailyReview | null>;
  upsert(date: string, fields: ReviewFields): Promise<DailyReview>;
  list(from: string, to: string): Promise<DailyReview[]>;
}

export interface MeditationRepository {
  list(from: string, to: string): Promise<MeditationSession[]>;
  create(data: NewMeditation): Promise<MeditationSession>;
  delete(id: string): Promise<boolean>;
}

export interface ReminderRepository {
  list(): Promise<Reminder[]>;
  get(id: string): Promise<Reminder | null>;
  create(data: NewReminder): Promise<Reminder>;
  update(id: string, patch: Partial<Pick<Reminder, 'title' | 'body' | 'remindAt' | 'repeat' | 'channels' | 'status' | 'lastFiredAt'>>): Promise<Reminder | null>;
  delete(id: string): Promise<boolean>;
  due(nowLocal: string): Promise<Reminder[]>;
}

export interface CommuteRepository {
  list(): Promise<Commute[]>;
  get(id: string): Promise<Commute | null>;
  create(data: NewCommute): Promise<Commute>;
  update(id: string, patch: Partial<NewCommute>): Promise<Commute | null>;
  delete(id: string): Promise<boolean>;
}

export interface NotificationRepository {
  create(data: { title: string; body: string; link: string | null; source: string }): Promise<AppNotification>;
  list(opts: { unreadOnly?: boolean; limit: number }): Promise<AppNotification[]>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}
export interface NotificationLogRepository {
  /** true se esta chave ainda não tinha sido registrada (ou seja, pode disparar). */
  claim(key: string): Promise<boolean>;
}
/** Tokens de push do app mobile (Expo). Separado de PushSubscriptionRepository (Web Push) porque o
 * formato e o jeito de mandar são diferentes: aqui é só uma string de token, sem chaves de criptografia. */
export interface ExpoPushTokenRepository {
  upsert(token: string): Promise<void>;
  remove(token: string): Promise<void>;
  list(): Promise<string[]>;
}
export interface PushSubscriptionRepository {
  upsert(s: { endpoint: string; p256dh: string; auth: string }): Promise<void>;
  remove(endpoint: string): Promise<void>;
  list(): Promise<{ endpoint: string; p256dh: string; auth: string }[]>;
}
export interface NotificationSettingsRepository {
  get(): Promise<{ whatsappTo: string }>;
  update(patch: { whatsappTo?: string }): Promise<{ whatsappTo: string }>;
}

export interface VaultRepository {
  get(): Promise<{ salt: string; verifier: string } | null>;
  create(salt: string, verifier: string): Promise<void>;
  /** Troca salt/verificador e regrava os itens secretos (perfil e princípios), tudo numa transação. */
  rekey(salt: string, verifier: string, profileItems: { id: string; content: string }[], principleItems: { id: string; title: string; content: string }[]): Promise<void>;
  /** Apaga o cofre, os itens secretos do perfil e todos os princípios. */
  reset(): Promise<void>;
}
export interface ProfileRepository {
  list(): Promise<StoredProfileItem[]>;
  get(id: string): Promise<StoredProfileItem | null>;
  create(data: { title: string; content: string; level: ProfileLevel }): Promise<StoredProfileItem>;
  update(id: string, patch: { title?: string; content?: string; level?: ProfileLevel }): Promise<StoredProfileItem | null>;
  delete(id: string): Promise<boolean>;
}

export interface PrincipleRepository {
  listFolders(): Promise<PrincipleFolder[]>;
  createFolder(name: string): Promise<PrincipleFolder>;
  renameFolder(id: string, name: string): Promise<PrincipleFolder | null>;
  deleteFolder(id: string): Promise<boolean>;
  /** Lembrete da pasta (horário/dias/canais); null se a pasta não existe. */
  updateFolderReminder(id: string, patch: Partial<PrincipleReminder>): Promise<PrincipleFolder | null>;

  list(includeArchived?: boolean): Promise<StoredPrinciple[]>;
  get(id: string): Promise<StoredPrinciple | null>;
  create(data: { folderId: string | null; title: string; content: string }): Promise<StoredPrinciple>;
  update(id: string, patch: { folderId?: string | null; title?: string; content?: string; archived?: boolean }): Promise<StoredPrinciple | null>;
  delete(id: string): Promise<boolean>;
  /** Todos os princípios (título + conteúdo cifrados), pra recifrar numa troca de senha do cofre. */
  listForRekey(): Promise<{ id: string; title: string; content: string }[]>;
}

export interface FolderRepository {
  list(): Promise<Folder[]>;
  get(id: string): Promise<Folder | null>;
  create(name: string, parentId: string | null): Promise<Folder>;
  rename(id: string, name: string): Promise<Folder | null>;
  setAgentVisible(id: string, visible: boolean): Promise<Folder | null>;
  delete(id: string): Promise<boolean>;
}
export interface DocumentRepository {
  /** folderId: undefined = todas; 'root' = sem pasta. */
  list(opts: { folderId?: string; query?: string; limit: number }): Promise<DocListItem[]>;
  get(id: string): Promise<Doc | null>;
  create(data: NewDoc): Promise<Doc>;
  update(id: string, patch: Partial<Pick<Doc, 'title' | 'content' | 'summary' | 'folderId'>>): Promise<Doc | null>;
  delete(id: string): Promise<boolean>;
  /** Nomes dos arquivos em disco dos documentos dessas pastas. */
  storageNamesIn(folderIds: string[]): Promise<string[]>;
}
