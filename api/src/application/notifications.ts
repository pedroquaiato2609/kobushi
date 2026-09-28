// Lembretes e notificações: serviço de lembretes avulsos, despacho por canais e o agendador que os dispara.
import type { NotifyChannel } from '../domain/constants';
import { nextOccurrence, nowLocalTs, toMinutes, weekdayOf } from '../domain/dates';
import { NotFoundError } from '../domain/errors';
import type { AppNotification, Reminder } from '../domain/entities';
import type {
  ActivityRepository, EventRepository, ExecutionRepository, NotificationLogRepository, NotificationRepository, ReminderRepository,
} from './ports';
import type { ReminderCreateInput, ReminderUpdateInput } from './schemas';

export interface OutgoingMessage { title: string; body: string; link?: string }
export interface NotificationChannel {
  readonly name: NotifyChannel;
  available(): Promise<boolean>;
  send(message: OutgoingMessage): Promise<void>;
}

export class ReminderService {
  constructor(private repo: ReminderRepository, private activities: ActivityRepository) {}

  list() { return this.repo.list(); }

  async create(input: ReminderCreateInput): Promise<Reminder> {
    if (input.activityId && !(await this.activities.get(input.activityId))) throw new NotFoundError('Atividade');
    return this.repo.create({
      title: input.title, body: input.body ?? '', remindAt: input.at, repeat: input.repeat ?? 'none',
      channels: input.channels ?? [], activityId: input.activityId ?? null,
    });
  }

  /** Mudar a data reativa o lembrete (ele volta a ser avisado). */
  async update(id: string, patch: ReminderUpdateInput): Promise<Reminder> {
    const status = patch.done === undefined ? (patch.at !== undefined ? 'pending' : undefined) : patch.done ? 'done' : 'pending';
    const row = await this.repo.update(id, {
      title: patch.title, body: patch.body, remindAt: patch.at, repeat: patch.repeat, channels: patch.channels, status,
    });
    if (!row) throw new NotFoundError('Lembrete');
    return row;
  }

  async remove(id: string) {
    if (!(await this.repo.delete(id))) throw new NotFoundError('Lembrete');
  }
}

/** Grava na caixa de entrada do app (sempre) e envia pelos canais extras pedidos, sem deixar um canal falho derrubar os outros. */
export class Notifier {
  constructor(private inbox: NotificationRepository, private channels: NotificationChannel[], private onError: (msg: string, e: unknown) => void = console.error) {}

  async notify(m: OutgoingMessage & { source: string; channels: NotifyChannel[] }): Promise<AppNotification> {
    const saved = await this.inbox.create({ title: m.title, body: m.body, link: m.link ?? null, source: m.source });
    for (const name of m.channels) {
      const channel = this.channels.find((c) => c.name === name);
      if (!channel) continue;
      try {
        if (await channel.available()) await channel.send(m);
      } catch (e) {
        this.onError(`[notify] falha no canal ${name}`, e);
      }
    }
    return saved;
  }

  async sendTo(name: NotifyChannel, m: OutgoingMessage): Promise<void> {
    const channel = this.channels.find((c) => c.name === name);
    if (!channel || !(await channel.available())) throw new Error('Canal não configurado.');
    await channel.send(m);
  }
}

/**
 * Verifica a cada ciclo o que precisa avisar: lembretes avulsos vencidos, atividades com horário de aviso
 * (só se o dia ainda não foi registrado) e eventos com aviso antecipado. Cada aviso é reivindicado numa
 * tabela de log, então nunca dispara duas vezes mesmo com reinícios ou vários ciclos.
 */
export class ReminderScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private jobs: { name: string; everyMs: number; run: (now: Date) => Promise<void>; last: number }[] = [];

  constructor(private deps: {
    reminders: ReminderRepository; activities: ActivityRepository; executions: ExecutionRepository;
    events: EventRepository; log: NotificationLogRepository; notifier: Notifier; timezone: string;
    onError?: (msg: string, e: unknown) => void;
  }) {}

  start(intervalMs = 30_000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((e) => (this.deps.onError ?? console.error)('[scheduler]', e)), intervalMs);
    (this.timer as { unref?: () => void }).unref?.(); // não impede o processo de encerrar
  }
  /** Tarefa periódica extra (ex.: avisos financeiros), executada dentro do mesmo ciclo. */
  addJob(name: string, everyMs: number, run: (now: Date) => Promise<void>) { this.jobs.push({ name, everyMs, run, last: 0 }); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async tick(now = new Date()): Promise<void> {
    const { reminders, activities, executions, events, log, notifier, timezone } = this.deps;
    const local = nowLocalTs(timezone, now); // 'YYYY-MM-DDTHH:mm'
    const today = local.slice(0, 10);
    const minutes = toMinutes(local.slice(11));

    // 1) lembretes avulsos
    for (const r of await reminders.due(local)) {
      if (!(await log.claim(`reminder:${r.id}:${r.remindAt}`))) continue;
      await notifier.notify({ title: r.title, body: r.body, link: '/agenda', source: 'reminder', channels: r.channels });
      if (r.repeat === 'none') await reminders.update(r.id, { status: 'done', lastFiredAt: local });
      else await reminders.update(r.id, { remindAt: nextOccurrence(r.remindAt, r.repeat, local), lastFiredAt: local });
    }

    // 2) atividades com horário de aviso: só se hoje se aplica, ainda não foi registrada e a janela (2 h) não passou
    const due = (await activities.list()).filter((a) => a.active && a.remindTime && a.weekdays.includes(weekdayOf(today)));
    if (due.length > 0) {
      const done = new Set((await executions.listRange(today, today)).map((e) => e.activityId));
      for (const a of due) {
        const at = toMinutes(a.remindTime as string);
        if (minutes < at || minutes - at > 120 || done.has(a.id)) continue;
        if (!(await log.claim(`activity:${a.id}:${today}`))) continue;
        await notifier.notify({
          title: `Hora de: ${a.name}`,
          body: a.minDesc ? `Se o dia estiver pesado, o mínimo já conta: ${a.minDesc}.` : 'Se o dia estiver pesado, o mínimo já conta.',
          link: '/atividades', source: 'activity', channels: a.remindChannels,
        });
      }
    }

    // extras
    for (const job of this.jobs) {
      if (now.getTime() - job.last < job.everyMs) continue;
      job.last = now.getTime();
      await job.run(now).catch((e) => (this.deps.onError ?? console.error)(`[scheduler:${job.name}]`, e));
    }

    // 3) eventos com aviso antecipado
    for (const ev of await events.reminderDue(local)) {
      if (!(await log.claim(`event:${ev.id}:${ev.start}`))) continue;
      await notifier.notify({
        title: ev.title,
        body: `Começa às ${ev.start.slice(11)}${ev.location ? ` · ${ev.location}` : ''}`,
        link: '/agenda', source: 'event', channels: ev.remindChannels,
      });
    }
  }
}
