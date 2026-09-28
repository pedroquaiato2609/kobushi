// Casos de uso do Ninshiki. Tanto a API HTTP (telas) quanto o agente (tools) chamam estes serviços,
// então toda regra de negócio vive aqui — nunca nas rotas nem nas tools.
import { config } from '../config';
import { addDays, dateInTz, diffDays, eachDay, todayIn, weekdayOf } from '../domain/dates';
import { NotFoundError, ValidationError } from '../domain/errors';
import { sanitizeRichHtml } from './richText';
import type { Level } from '../domain/constants';
import type {
  Activity, ActivityStats, BoardFull, CalendarEvent, DayPlanItem, DayStats, MeditationSession,
  ActivityMatrixRow, NewActivity, ReviewFields, Stats, TimeBlock,
} from '../domain/entities';
import type {
  ActivityRepository, BoardRepository, EventRepository, ExecutionRepository, MeditationRepository, ReviewRepository,
} from './ports';
import type {
  ActivityCreateInput, ActivityUpdateInput, CardCreateInput, CardUpdateInput, EventCreateInput, EventUpdateInput,
  MeditationCreateInput,
} from './schemas';

const found = <T>(value: T | null, what: string): T => {
  if (value === null) throw new NotFoundError(what);
  return value;
};

// Atividades ---------------------------------------------------------------
export class ActivityService {
  constructor(private repo: ActivityRepository) {}

  list() { return this.repo.list(); }
  async get(id: string) { return found(await this.repo.get(id), 'Atividade'); }

  async create(input: ActivityCreateInput): Promise<Activity> {
    const data = this.normalize({
      name: input.name, kind: input.kind,
      timeMode: input.timeMode ?? 'free',
      period: input.period ?? null,
      blocks: (input.blocks ?? []).map((b) => ({ startTime: b.startTime, endTime: b.endTime ?? null })),
      weekdayBlocks: (input.weekdayBlocks ?? []).map((w) => ({ weekday: w.weekday, blocks: w.blocks.map((b) => ({ startTime: b.startTime, endTime: b.endTime ?? null })) })),
      notBefore: input.notBefore ?? null, notAfter: input.notAfter ?? null, durationMin: input.durationMin ?? 60,
      suggestedStart: null, suggestedReason: '',
      purpose: input.purpose ?? '',
      principle: input.principle ?? '',
      minDesc: input.minDesc ?? '', idealDesc: input.idealDesc ?? '', maxDesc: input.maxDesc ?? '',
      weekdays: input.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
      active: input.active ?? true,
      remindTime: input.remindTime ?? null,
      remindChannels: input.remindChannels ?? [],
    });
    return this.repo.create(data);
  }

  async update(id: string, patch: ActivityUpdateInput): Promise<Activity> {
    const current = await this.get(id);
    const clean = stripUndefined(patch) as Partial<NewActivity>;
    // valida a combinação final (atual + patch), mas grava só o patch
    const merged = this.normalize({ ...current, ...clean } as NewActivity);
    if (['timeMode', 'period', 'blocks', 'weekdays', 'weekdayBlocks'].some((k) => k in clean)) {
      // mantém os campos de horário coerentes com o modo escolhido
      clean.period = merged.period;
      clean.blocks = merged.blocks;
      clean.weekdayBlocks = merged.weekdayBlocks;
    }
    // mudou quando/onde a atividade pode cair: a sugestão da IA deixa de valer (editar outros campos não apaga)
    if (['timeMode', 'period', 'notBefore', 'notAfter', 'durationMin'].some((k) => k in clean)) {
      clean.notBefore = merged.notBefore; clean.notAfter = merged.notAfter;
      clean.suggestedStart = null; clean.suggestedReason = '';
    }
    return found(await this.repo.update(id, clean), 'Atividade');
  }

  async remove(id: string) {
    if (!(await this.repo.delete(id))) throw new NotFoundError('Atividade');
  }

  /** Um ou mais blocos do mesmo horário (padrão ou de um dia): fim depois do início, sem sobreposição entre eles. */
  private validateBlocks(blocks: TimeBlock[], label: string): TimeBlock[] {
    const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i];
      if (b.endTime && b.endTime <= b.startTime) throw new ValidationError(`Em "${label}", o horário de fim deve ser depois do início.`);
      const next = sorted[i + 1];
      if (next && !b.endTime) throw new ValidationError(`Em "${label}", todo bloco antes de outro precisa de um horário de fim.`);
      if (next && b.endTime! > next.startTime) throw new ValidationError(`Em "${label}", os blocos de horário não podem se sobrepor.`);
    }
    return sorted;
  }

  /** Regras do método: o modo de horário define quais campos de horário fazem sentido. */
  private normalize(a: NewActivity): NewActivity {
    if (a.timeMode === 'period' && !a.period) throw new ValidationError('Atividade com período definido precisa de "period" (morning, afternoon ou night).');
    if (a.timeMode !== 'fixed' && a.notBefore && a.notAfter && a.notAfter <= a.notBefore) throw new ValidationError('"Antes das" precisa ser depois de "depois das".');
    const flexible = a.timeMode !== 'fixed';
    // exceção por dia só faz sentido em horário definido, e só pros dias em que a atividade realmente ocorre
    const weekdaySet = new Set(a.weekdays);
    const seenDays = new Set<number>();
    const weekdayBlocks = flexible ? [] : a.weekdayBlocks.filter((w) => weekdaySet.has(w.weekday)).map((w) => {
      if (seenDays.has(w.weekday)) throw new ValidationError(`O dia ${w.weekday} tem mais de uma exceção em "weekdayBlocks".`);
      seenDays.add(w.weekday);
      return { weekday: w.weekday, blocks: this.validateBlocks(w.blocks, `weekdayBlocks (dia ${w.weekday})`) };
    });
    // horário padrão só é obrigatório se sobrar algum dia sem exceção própria (senão não tem pra que servir de fallback)
    const coveredDays = new Set(weekdayBlocks.map((w) => w.weekday));
    const needsDefault = a.timeMode === 'fixed' && a.weekdays.some((d) => !coveredDays.has(d));
    if (needsDefault && a.blocks.length === 0) throw new ValidationError('Atividade com horário definido precisa de um horário padrão (ou de uma exceção pra cada dia selecionado).');
    const blocks = flexible ? [] : this.validateBlocks(a.blocks, 'blocks');
    return {
      ...a,
      notBefore: flexible ? a.notBefore : null, notAfter: flexible ? a.notAfter : null,
      suggestedStart: flexible ? a.suggestedStart : null,
      period: a.timeMode === 'period' ? a.period : null,
      blocks, weekdayBlocks,
    };
  }
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// Execução diária (níveis mínimo / ideal / máximo) ---------------------------
export class ExecutionService {
  constructor(private executions: ExecutionRepository, private activities: ActivityRepository) {}

  async dayPlan(date: string): Promise<{ date: string; weekday: number; items: DayPlanItem[] }> {
    const weekday = weekdayOf(date);
    return { date, weekday, items: await this.executions.dayPlan(date, weekday) };
  }

  async set(activityId: string, date: string, level: Level, note?: string) {
    found(await this.activities.get(activityId), 'Atividade');
    return this.executions.upsert(activityId, date, level, note);
  }

  async clear(activityId: string, date: string) {
    await this.executions.clear(activityId, date);
  }

  list(from: string, to: string) { return this.executions.listRange(from, to); }
}

// Agenda ---------------------------------------------------------------------
export class EventService {
  constructor(private repo: EventRepository) {}

  list(from: string, to: string) { return this.repo.list(from, to); }
  async get(id: string) { return found(await this.repo.get(id), 'Evento'); }

  create(input: EventCreateInput): Promise<CalendarEvent> {
    if (input.end <= input.start) throw new ValidationError('O fim do evento deve ser depois do início.');
    return this.repo.create({
      title: input.title, description: input.description ?? '',
      start: input.start, end: input.end, activityId: input.activityId ?? null,
      location: input.location ?? '', remindMinutes: input.remindMinutes ?? null, remindChannels: input.remindChannels ?? [],
    });
  }

  async update(id: string, patch: EventUpdateInput): Promise<CalendarEvent> {
    const current = await this.get(id);
    const start = patch.start ?? current.start;
    const end = patch.end ?? current.end;
    if (end <= start) throw new ValidationError('O fim do evento deve ser depois do início.');
    return found(await this.repo.update(id, stripUndefined(patch)), 'Evento');
  }

  async remove(id: string) {
    if (!(await this.repo.delete(id))) throw new NotFoundError('Evento');
  }
}

// Kanban ---------------------------------------------------------------------
export class BoardService {
  constructor(private repo: BoardRepository) {}

  listBoards() { return this.repo.listBoards(); }

  /** Sem id, devolve o primeiro quadro. */
  async getBoard(id?: string): Promise<BoardFull> {
    if (id) return found(await this.repo.getBoard(id), 'Quadro');
    const [first] = await this.repo.listBoards();
    return found(first ? await this.repo.getBoard(first.id) : null, 'Quadro');
  }
  createBoard(name: string) { return this.repo.createBoard(name); }
  async renameBoard(id: string, name: string) { return found(await this.repo.renameBoard(id, name), 'Quadro'); }
  async deleteBoard(id: string) { if (!(await this.repo.deleteBoard(id))) throw new NotFoundError('Quadro'); }

  async createColumn(boardId: string, name: string) {
    found(await this.repo.getBoard(boardId), 'Quadro');
    return this.repo.createColumn(boardId, name);
  }
  async renameColumn(id: string, name: string) { return found(await this.repo.renameColumn(id, name), 'Coluna'); }
  async deleteColumn(id: string) { if (!(await this.repo.deleteColumn(id))) throw new NotFoundError('Coluna'); }

  async createCard(columnId: string, input: CardCreateInput) {
    found(await this.repo.getColumn(columnId), 'Coluna');
    return this.repo.createCard(columnId, {
      title: input.title, description: sanitizeRichHtml(input.description ?? ''),
      dueDate: input.dueDate ?? null, activityId: input.activityId ?? null,
    });
  }
  async updateCard(id: string, patch: CardUpdateInput) {
    const clean = { ...patch, ...(patch.description !== undefined ? { description: sanitizeRichHtml(patch.description) } : {}) };
    return found(await this.repo.updateCard(id, stripUndefined(clean)), 'Card');
  }
  async moveCard(id: string, columnId: string, position?: number) {
    found(await this.repo.getColumn(columnId), 'Coluna');
    return found(await this.repo.moveCard(id, columnId, position), 'Card');
  }
  async deleteCard(id: string) { if (!(await this.repo.deleteCard(id))) throw new NotFoundError('Card'); }
}

// Revisão diária -------------------------------------------------------------
export class ReviewService {
  constructor(private repo: ReviewRepository) {}
  get(date: string) { return this.repo.get(date); }
  save(date: string, fields: ReviewFields) {
    return this.repo.upsert(date, fields);
  }
  list(from: string, to: string) { return this.repo.list(from, to); }
}

// Meditação --------------------------------------------------------------------
export class MeditationService {
  constructor(private repo: MeditationRepository) {}
  list(from: string, to: string) { return this.repo.list(from, to); }
  log(input: MeditationCreateInput): Promise<MeditationSession> {
    return this.repo.create({
      date: input.date, durationMin: input.durationMin,
      attention: input.attention ?? null, spatial: input.spatial ?? null, sound: input.sound ?? null,
      imagery: input.imagery ?? null, afterState: input.afterState ?? null, note: input.note ?? '',
    });
  }
  async remove(id: string) { if (!(await this.repo.delete(id))) throw new NotFoundError('Sessão de meditação'); }
}

// Estatísticas (dashboard) -----------------------------------------------------
export class StatsService {
  constructor(
    private activities: ActivityRepository,
    private executions: ExecutionRepository,
    private meditation: MeditationRepository,
  ) {}

  async range(from: string, to: string): Promise<Stats> {
    if (from > to) throw new ValidationError('"from" deve ser anterior a "to".');
    const today = todayIn(config.timezone);
    const last = to > today ? today : to; // não conta dias futuros como "perdidos"
    if (diffDays(from, last) > 366) throw new ValidationError('Período máximo: 366 dias.');

    const [activities, executions, meditation] = await Promise.all([
      this.activities.list(),
      this.executions.listRange(from, last),
      this.meditation.list(from, last),
    ]);
    const levelOf = new Map(executions.map((e) => [`${e.activityId}|${e.date}`, e.level] as const));
    const createdOn = new Map(activities.map((a) => [a.id, dateInTz(a.createdAt, config.timezone)] as const));

    const perActivity = new Map<string, ActivityStats>();
    const days: DayStats[] = [];

    for (const date of last < from ? [] : eachDay(from, last)) {
      const weekday = weekdayOf(date);
      const day: DayStats = { date, applicable: 0, done: 0, min: 0, ideal: 0, max: 0 };
      for (const a of activities) {
        if (!a.active || !a.weekdays.includes(weekday) || (createdOn.get(a.id) ?? '') > date) continue;
        const stat = perActivity.get(a.id) ?? { activityId: a.id, name: a.name, kind: a.kind, applicable: 0, min: 0, ideal: 0, max: 0, missed: 0 };
        day.applicable++;
        stat.applicable++;
        const level = levelOf.get(`${a.id}|${date}`);
        if (level) { day[level]++; day.done++; stat[level]++; } else { stat.missed++; }
        perActivity.set(a.id, stat);
      }
      days.push(day);
    }

    const totals = days.reduce(
      (t, d) => ({ applicable: t.applicable + d.applicable, done: t.done + d.done, min: t.min + d.min, ideal: t.ideal + d.ideal, max: t.max + d.max }),
      { applicable: 0, done: 0, min: 0, ideal: 0, max: 0 },
    );

    // Sequência de continuidade: dias seguidos com tudo feito em pelo menos o nível mínimo.
    // O dia de hoje só quebra a sequência quando terminar; enquanto isso, é ignorado se incompleto.
    let currentStreak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (d.applicable === 0) continue;
      const complete = d.done === d.applicable;
      if (d.date === today && !complete) continue;
      if (!complete) break;
      currentStreak++;
    }

    return { from, to: last, days, byActivity: [...perActivity.values()], totals, currentStreak, meditation };
  }

  /** Últimos `days` dias por atividade: célula a célula (aplicável? qual nível?), sequência atual e contagens. */
  async activityMatrix(days: number): Promise<{ from: string; to: string; rows: ActivityMatrixRow[] }> {
    const to = todayIn(config.timezone);
    const from = addDays(to, -(Math.min(Math.max(days, 1), 366) - 1));
    const [activities, executions] = await Promise.all([this.activities.list(), this.executions.listRange(from, to)]);
    const levelOf = new Map(executions.map((e) => [`${e.activityId}|${e.date}`, e.level] as const));

    const rows = activities.map((a): ActivityMatrixRow => {
      const created = dateInTz(a.createdAt, config.timezone);
      const counts = { min: 0, ideal: 0, max: 0, missed: 0 };
      const cells = eachDay(from, to).map((date) => {
        const applicable = a.active && a.weekdays.includes(weekdayOf(date)) && created <= date;
        const level = applicable ? levelOf.get(`${a.id}|${date}`) ?? null : null;
        if (applicable) { if (level) counts[level]++; else if (date !== to) counts.missed++; }
        return { date, applicable, level };
      });
      // sequência: dias aplicáveis seguidos, do mais recente para trás; hoje só conta se já registrado
      let streak = 0;
      for (let i = cells.length - 1; i >= 0; i--) {
        const c = cells[i];
        if (!c.applicable) continue;
        if (c.level) streak++;
        else if (c.date === to) continue;
        else break;
      }
      return { activityId: a.id, name: a.name, kind: a.kind, cells, streak, counts };
    });
    return { from, to, rows };
  }
}
