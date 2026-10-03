// Espelho (só o necessário por enquanto) de web/src/api/types.ts — mesmo formato que a API devolve.
export type AccountKind = 'checking' | 'digital' | 'savings' | 'cash' | 'credit_card';
export type TxKind = 'income' | 'expense' | 'transfer';

export interface FinAccount {
  id: string; name: string; kind: AccountKind; institution: string; numberMask: string | null; initialBalanceCents: number;
  creditLimitCents: number | null; closingDay: number | null; dueDay: number | null; invoiceRemindDays: number | null; source: 'manual' | 'import' | 'demo'; archived: boolean;
  balanceCents?: number; pendingCents?: number;
}
export interface FinCategory { id: string; name: string; parentId: string | null; kind: 'expense' | 'income'; color: string }
export interface FinRefs { accounts: FinAccount[]; categories: FinCategory[] }
export interface FinTransaction {
  id: string; accountId: string; kind: TxKind; amountCents: number; occurredOn: string; description: string; merchant: string; categoryId: string | null;
  status: 'pending' | 'confirmed'; transferAccountId: string | null; note: string; linkActivityId: string | null; remindDaysBefore: number | null; source: string;
}
export interface FinRecurring {
  id: string; description: string; amountCents: number; kind: 'expense' | 'income'; categoryId: string | null; accountId: string | null;
  frequency: 'weekly' | 'monthly' | 'yearly'; nextDue: string; active: boolean; isSubscription: boolean; usage: 'often' | 'sometimes' | 'rarely' | null;
  remindDaysBefore: number | null; source: string; discountPct: number | null;
}
export interface FinGoal { id: string; name: string; targetCents: number; currentCents: number; deadline: string | null; kanbanCardId: string | null; source?: string }
export interface CategorySlice { categoryId: string | null; name: string; color: string; cents: number; children: { categoryId: string | null; name: string; cents: number }[] }
export interface MonthSummary { month: string; incomeCents: number; expenseCents: number; netCents: number; pendingIncomeCents: number; pendingExpenseCents: number; byCategory: CategorySlice[] }
export interface Upcoming { key: string; date: string; kind: 'bill' | 'recurring' | 'invoice'; title: string; cents: number; direction: 'out' | 'in'; overdue: boolean; refId: string; accountId: string | null }
export interface BudgetStatus { budget: { id: string; categoryId: string | null; limitCents: number }; name: string; color: string; spentCents: number; pct: number; projectedCents: number; state: 'ok' | 'risk' | 'exceeded' }
export interface InsightAction { kind: 'open' | 'chat'; label: string; href?: string; prompt?: string }
export interface Insight { key: string; type: string; severity: 'info' | 'attention' | 'high'; title: string; summary: string; why: string[]; actions: InsightAction[] }
export interface FinOverview {
  today: string; month: string; hasDemo: boolean;
  totals: { liquidCents: number; cardDebtCents: number; netCents: number };
  accounts: FinAccount[]; summary: MonthSummary; previousSummary: MonthSummary;
  cashFlow: { month: string; incomeCents: number; expenseCents: number; netCents: number }[];
  patrimony: { month: string; netCents: number }[];
  upcoming: Upcoming[]; budgets: BudgetStatus[]; goals: FinGoal[]; insights: Insight[]; insightCount: number;
  commitment: { incomeCents: number; fixedCents: number; invoicesCents: number; committedCents: number; pct: number; basis: 'salary' | 'average' };
}

// ---- Leitura --------------------------------------------------------------------------------
export type BookStatus = 'quero_ler' | 'lendo' | 'pausado' | 'lido' | 'abandonado';
export interface Book {
  id: string; title: string; author: string; isbn: string | null; coverUrl: string | null; publisher: string;
  format: string; status: BookStatus; totalPages: number | null; currentPage: number; rating: number | null;
  notes: string; startedAt: string | null; finishedAt: string | null;
}
export interface ReadingSession { id: string; bookId: string; date: string; pages: number | null; minutes: number | null; note: string }
export interface BookOverview extends Book { pagesPerDay: number; daysToFinish: number | null; recentSessions: ReadingSession[] }
export interface ReadingOverview {
  reading: Book[]; wantToRead: Book[]; finishedThisYear: number; pagesThisMonth: number; minutesThisMonth: number;
  streak: number; totalBooks: number;
}

// ---- Academia ---------------------------------------------------------------------------------
export type Level = 'min' | 'ideal' | 'max';
export const MUSCLES = [
  'pectoral_major', 'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior', 'trapezius', 'latissimus_dorsi',
  'rhomboids', 'teres_major', 'rotator_cuff', 'erector_spinae', 'biceps_brachii', 'triceps_brachii', 'brachialis',
  'brachioradialis', 'wrist_flexors', 'wrist_extensors', 'rectus_abdominis', 'obliques', 'transverse_abdominis',
  'serratus_anterior', 'gluteus_maximus', 'gluteus_medius', 'hip_adductors', 'hip_flexors', 'quadriceps',
  'hamstrings', 'gastrocnemius', 'soleus',
] as const;
export type Muscle = (typeof MUSCLES)[number];
export type GymEquipment =
  | 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'other'
  | 'treadmill' | 'bike' | 'stairs' | 'rowing_machine' | 'elliptical' | 'jump_rope' | 'pool';
export type GymExerciseKind = 'strength' | 'cardio';
export interface GymExercise {
  id: string; name: string; primaryMuscles: Muscle[]; secondaryMuscles: Muscle[]; stabilizerMuscles: Muscle[]; equipment: GymEquipment;
  kind: GymExerciseKind; singleSession: boolean; instructions: string; tips: string; isCustom: boolean; imageMime: string | null; archived: boolean;
}
export interface GymLevelTarget { sets: number; reps: number; weight: number }
export interface GymCardioTarget { durationMin: number | null; distanceKm: number | null; speedKmh: number | null }
export type GymTargets = Partial<Record<Level, GymLevelTarget>>;
export type GymCardioTargets = Partial<Record<Level, GymCardioTarget>>;
export interface GymWorkoutItem { id: string; exerciseId: string; position: number; restSeconds: number; note: string; targets: GymTargets }
export interface GymWorkout { id: string; name: string; notes: string; weekdays: number[]; archived: boolean; items: GymWorkoutItem[] }
export interface GymSession { id: string; workoutId: string | null; name: string; startedAt: string; endedAt: string | null; note: string; level: Level | null }
export interface GymCardioSetDetails {
  caloriesKcal: number | null; avgSpeedKmh: number | null; maxSpeedKmh: number | null;
  avgPaceMinKm: number | null; maxPaceMinKm: number | null; avgHeartRate: number | null; maxHeartRate: number | null;
}
export interface GymSet extends GymCardioSetDetails {
  id: string; sessionId: string; exerciseId: string; setNumber: number; reps: number; weight: number;
  durationSeconds: number | null; distanceKm: number | null;
  level: Level | null; restSeconds: number | null; isPr: boolean; createdAt: string;
}
export interface GymSessionView {
  session: GymSession; durationSeconds: number; totalSets: number; volume: number; prs: number;
  exercises: { exercise: GymExercise; sets: GymSet[]; levelReached: Level | null }[]; suggestedLevel: Level | null;
}
export interface GymPlanItem {
  exercise: GymExercise; restSeconds: number; note: string; targets: GymTargets; planned: boolean;
  last: { reps: number; weight: number }[]; best: { weight: number; e1rm: number }; sets: GymSet[]; levelReached: Level | null;
}
export interface GymActive extends GymSessionView { plan: GymPlanItem[] }
export interface GymAddSetResult { set: GymSet; prs: ('weight' | 'e1rm')[]; e1rm: number }

// ---- Assistente (chat) ------------------------------------------------------------------------
export interface Conversation { id: string; title: string; createdAt: string; updatedAt: string }
export interface ToolCall { id: string; name: string; args: Record<string, unknown> }
export interface ChatMessage {
  id: string; conversationId: string; role: 'user' | 'assistant' | 'tool' | 'note'; content: string;
  toolCalls: ToolCall[] | null; toolCallId: string | null; toolName: string | null; createdAt: string;
}
export interface AgentAction {
  id: string; conversationId: string | null; tool: string; resource: string; action: string;
  args: Record<string, unknown>; result: unknown; status: 'pending' | 'executed' | 'denied' | 'rejected' | 'error';
  summary?: string; createdAt: string; resolvedAt: string | null;
}

// ---- Atividades / Agenda / Lembretes / Deslocamentos -----------------------------------------
export type ActivityKind = 'obligation' | 'goal' | 'special';
export type TimeMode = 'fixed' | 'period' | 'free';
export type Period = 'morning' | 'afternoon' | 'night';
export type NotifyChannel = 'push' | 'whatsapp';
export type Repeat = 'none' | 'daily' | 'weekly';

export interface TimeBlock { startTime: string; endTime: string | null }
export interface WeekdayBlocks { weekday: number; blocks: TimeBlock[] }
export interface Activity {
  id: string; name: string; kind: ActivityKind; timeMode: TimeMode; period: Period | null;
  blocks: TimeBlock[]; weekdayBlocks: WeekdayBlocks[]; notBefore: string | null; notAfter: string | null; durationMin: number;
  suggestedStart: string | null; suggestedReason: string; purpose: string; principle: string;
  minDesc: string; idealDesc: string; maxDesc: string; weekdays: number[]; active: boolean;
  remindTime: string | null; remindMinutes: 5 | 10 | 15 | 30 | 60 | null; remindChannels: NotifyChannel[]; createdAt: string;
}
export interface DayPlanItem extends Activity { executionLevel: Level | null; executionNote: string }
export interface DayPlan { date: string; weekday: number; items: DayPlanItem[] }
export interface ActivityMatrixRow {
  activityId: string; name: string; kind: ActivityKind;
  cells: { date: string; applicable: boolean; level: Level | null }[];
  streak: number; counts: { min: number; ideal: number; max: number; missed: number };
}
export interface ActivityMatrix { from: string; to: string; rows: ActivityMatrixRow[] }

export interface CalendarEvent {
  id: string; title: string; description: string; start: string; end: string; activityId: string | null;
  location: string; remindMinutes: number | null; remindChannels: NotifyChannel[];
}

export type CommuteDirection = 'before' | 'after';
export interface Commute {
  id: string; name: string; activityId: string; direction: CommuteDirection; durationMin: number; active: boolean;
  remindTime: string | null; remindMinutes: 5 | 10 | 15 | 30 | 60 | null; remindChannels: NotifyChannel[];
}

export interface Reminder {
  id: string; title: string; body: string; remindAt: string; repeat: Repeat; channels: NotifyChannel[];
  activityId: string | null; status: 'pending' | 'done'; lastFiredAt: string | null;
}

// ---- Kanban -------------------------------------------------------------------------------
export interface Card {
  id: string; columnId: string; title: string; description: string; position: number;
  dueDate: string | null; activityId: string | null;
}
export interface Column { id: string; boardId: string; name: string; position: number; cards: Card[] }
export interface Board { id: string; name: string }
export interface BoardFull extends Board { columns: Column[] }

// ---- Princípios (protegidos pela senha do Cofre) -----------------------------------------------
export interface VaultStatus { configured: boolean; unlocked: boolean; unlockedUntil: number | null }
export interface PrincipleReminder { enabled: boolean; times: string[]; weekdays: number[]; channels: NotifyChannel[] }
export interface PrincipleFolder { id: string; name: string; createdAt: string; reminder: PrincipleReminder }
export interface Principle { id: string; folderId: string | null; title: string | null; content: string | null; locked: boolean; updatedAt: string }

// ---- Estudos --------------------------------------------------------------------------------
export type LinkedType = 'book' | 'workout' | 'activity';
export interface StudyFolder { id: string; name: string; createdAt: string }
export interface StudyNoteBacklink { id: string; title: string }
export interface StudyNote {
  id: string; title: string; content: string; linkedType: LinkedType | null; linkedId: string | null;
  folderId: string | null; pinned: boolean; tags: string[];
  archived: boolean; createdAt: string; updatedAt: string;
}
export interface StudyNoteView extends StudyNote { linkedNoteIds: string[]; backlinks: StudyNoteBacklink[] }
export interface Lesson { id: string; title: string; description: string; done: boolean }
export interface StudyPlan { id: string; subject: string; title: string; lessons: Lesson[]; progressPct: number; archived: boolean; createdAt: string; updatedAt: string }

// ---- Documentos -------------------------------------------------------------------------------
export type DocKind = 'note' | 'list' | 'file';
export interface Folder { id: string; parentId: string | null; name: string; agentVisible: boolean }
export interface DocListItem {
  id: string; folderId: string | null; title: string; kind: DocKind; summary: string; mime: string | null;
  sizeBytes: number | null; createdAt: string; updatedAt: string; excerpt: string;
}
export interface Doc extends Omit<DocListItem, 'excerpt'> { content: string }

// ---- Configurações (conta, cofre/perfil, notificações, dispositivos) ---------------------------
export type ProfileLevel = 'general' | 'private' | 'secret';
export interface ProfileItem { id: string; title: string; content: string | null; level: ProfileLevel; locked: boolean; updatedAt: string }
export interface SessionInfo { id: string; userAgent: string; ip: string; createdAt: string; lastSeenAt: string; current: boolean }
export interface NotificationChannels { whatsappTo: string; push: { configured: boolean; devices: number }; whatsapp: { configured: boolean } }

// ---- Dashboard/estatísticas (revisão diária, meditação, gráficos) ------------------------------
export interface DailyReview { date: string; responsibilities: string; goals: string; state: string; learned: string }
export interface MeditationSession {
  id: string; date: string; durationMin: number; attention: number | null; spatial: number | null;
  sound: number | null; imagery: number | null; afterState: number | null; note: string;
}
export interface DayStats { date: string; applicable: number; done: number; min: number; ideal: number; max: number }
export interface ActivityStats {
  activityId: string; name: string; kind: ActivityKind; applicable: number; min: number; ideal: number; max: number; missed: number;
}
export interface Stats {
  from: string; to: string; days: DayStats[]; byActivity: ActivityStats[];
  totals: { applicable: number; done: number; min: number; ideal: number; max: number };
  currentStreak: number; meditation: MeditationSession[];
}

// ---- Configurações do agente (Agente, Permissões, Assistente proativo, Histórico) --------------
export interface AgentSettings {
  provider: 'anthropic' | 'openai'; model: string; customInstructions: string; tone: string; language: string;
  includeRoutineContext: boolean; maxToolSteps: number; sttMode: 'server' | 'browser'; sttModel: string;
}
export type PermissionMode = 'allow' | 'confirm' | 'deny';
export interface PermissionRow {
  tool: string; resource: string; action: 'read' | 'create' | 'update' | 'delete'; label: string; description: string;
  mode: PermissionMode; defaultMode: PermissionMode; locked?: boolean;
}
export interface AgentStatus { providers: { anthropic: boolean; openai: boolean }; timezone: string }
export type SuggestionType = 'agenda' | 'routine' | 'review' | 'finance';
export interface AssistantProactiveSettings {
  proactivity: 'off' | 'low' | 'normal'; types: SuggestionType[]; maxPerDay: number; quietStart: string; quietEnd: string;
  dailyReviewTime: string | null; weeklyReviewTime: string | null;
}
