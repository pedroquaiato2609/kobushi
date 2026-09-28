import { addDays, nowLocalTs, toMinutes } from '../domain/dates';
import type { Insight } from './finance/types';
import type { ActivityRepository, BoardRepository, EventRepository, ExecutionRepository, ReviewRepository } from './ports';
import type { SignalSource, Signals } from './suggestions';

/** Reúne os sinais reais do momento a partir dos mesmos repositórios que a interface e o agente usam. */
export class LiveSignalSource implements SignalSource {
  constructor(private d: {
    activities: ActivityRepository; executions: ExecutionRepository; events: EventRepository; reviews: ReviewRepository;
    boards: BoardRepository; financeInsights: (userId: string) => Promise<Insight[]>; timezone: string;
  }) {}

  async collect(userId: string, now: Date): Promise<Signals> {
    const local = nowLocalTs(this.d.timezone, now);
    const today = local.slice(0, 10);
    const [activities, executions, events, review, overdueCards, financeInsights] = await Promise.all([
      this.d.activities.list(), this.d.executions.listRange(addDays(today, -14), today), this.d.events.list(`${today}T00:00`, `${addDays(today, 4)}T00:00`),
      this.d.reviews.get(today), this.d.boards.overdueCards(today), this.d.financeInsights(userId).catch(() => [] as Insight[]),
    ]);
    return { today, nowMinutes: toMinutes(local.slice(11)), activities, executions, events, reviewDoneToday: Boolean(review), overdueCards, financeInsights };
  }
}
