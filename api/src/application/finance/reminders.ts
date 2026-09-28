// Avisos financeiros e revisões: rodam em segundo plano, respeitam o dia/hora locais e nunca repetem (claim único por aviso).
import { addDays, nowLocalTs, toMinutes, weekdayOf } from '../../domain/dates';
import { brl } from '../../domain/money';
import type { AuthCtx } from './reminderTypes';
import { budgetStatus, cardInvoices, ym } from './analytics';

export class FinanceReminders {
  constructor(private d: AuthCtx) {}

  async run(now = new Date()) {
    const local = nowLocalTs(this.d.timezone, now);
    const today = local.slice(0, 10);
    const minutes = toMinutes(local.slice(11));
    for (const user of await this.d.users.list()) {
      await this.forUser(user.id, today, minutes).catch((e) => console.error('[finance reminders]', e));
    }
  }

  private async forUser(userId: string, today: string, minutes: number) {
    const { finance, log, notifier, suggestions, reviews } = this.d;
    const claim = (key: string) => log.claim(`${key}`);
    if (await claim(`fin-materialize:${userId}:${today}`)) await finance.materializeRecurring(userId);

    // Avisos financeiros: a partir das 9h, uma vez por item
    if (minutes >= 9 * 60) {
      const data = await finance.load(userId);
      const ch = (c: string[]) => c as ('push' | 'whatsapp')[];
      for (const t of data.txs) {
        if (t.status !== 'pending' || t.remindDaysBefore === null || t.kind === 'transfer') continue;
        const from = addDays(t.occurredOn, -t.remindDaysBefore);
        if (today < from || today > t.occurredOn || !(await claim(`finbill:${t.id}:${from}`))) continue;
        const left = Math.round((Date.parse(t.occurredOn) - Date.parse(today)) / 86_400_000);
        await notifier.notify({ title: `${t.kind === 'income' ? 'Entra' : 'Vence'} ${left === 0 ? 'hoje' : left === 1 ? 'amanhã' : `em ${left} dias`}: ${t.description || t.merchant || 'movimentação'}`, body: `${brl(t.amountCents)} · ${t.occurredOn.slice(8)}/${t.occurredOn.slice(5, 7)}`, link: '/financas?tab=visao', source: 'finance', channels: ch(t.remindChannels) });
      }
      for (const a of data.accounts) {
        if (a.archived || a.invoiceRemindDays === null) continue;
        const inv = cardInvoices(a, data);
        const closed = inv?.closed;
        if (!closed || closed.remainingCents <= 0) continue;
        const from = addDays(closed.due, -a.invoiceRemindDays);
        if (today < from || today > closed.due || !(await claim(`fininv:${a.id}:${closed.due}`))) continue;
        await notifier.notify({ title: `Fatura ${a.name} vence ${closed.due === today ? 'hoje' : `dia ${closed.due.slice(8)}/${closed.due.slice(5, 7)}`}`, body: `Valor a pagar: ${brl(closed.remainingCents)}`, link: '/financas?tab=movimentacoes', source: 'finance', channels: ch(a.invoiceRemindChannels) });
      }
      for (const r of data.recurring) {
        if (!r.active || r.remindDaysBefore === null) continue;
        const from = addDays(r.nextDue, -r.remindDaysBefore);
        if (today < from || today > r.nextDue || !(await claim(`finrec:${r.id}:${r.nextDue}`))) continue;
        await notifier.notify({ title: `${r.description} vence em breve`, body: `${brl(r.amountCents)} · ${r.nextDue.slice(8)}/${r.nextDue.slice(5, 7)}`, link: '/financas?tab=recorrentes', source: 'finance', channels: ch(r.remindChannels) });
      }
      for (const b of budgetStatus(data, ym(today))) {
        const level = b.state === 'exceeded' ? 100 : b.pct >= 80 ? 80 : 0;
        if (!level || !(await claim(`finbudget:${b.budget.id}:${ym(today)}:${level}`))) continue;
        await notifier.notify({ title: level === 100 ? `Orçamento de ${b.name} estourou` : `Orçamento de ${b.name} em ${b.pct}%`, body: `${brl(b.spentCents)} de ${brl(b.budget.limitCents)} neste mês.`, link: '/financas?tab=orcamentos', source: 'finance', channels: [] });
      }
    }

    // Revisões diária e semanal (horários definidos em Configurações → Assistente)
    const settings = await suggestions.settings(userId);
    if (settings.dailyReviewTime) {
      const at = toMinutes(settings.dailyReviewTime);
      if (minutes >= at && minutes - at <= 120 && !(await reviews.get(today)) && (await claim(`review-daily:${userId}:${today}`))) {
        await notifier.notify({ title: 'Hora da revisão do dia', body: 'Leva poucos minutos e ajuda a ajustar amanhã.', link: '/', source: 'review', channels: [] });
      }
    }
    if (settings.weeklyReviewTime && weekdayOf(today) === 0) {
      const at = toMinutes(settings.weeklyReviewTime);
      if (minutes >= at && minutes - at <= 180 && (await claim(`review-weekly:${userId}:${today}`))) {
        await notifier.notify({ title: 'Revisão da semana', body: 'Veja como foi a semana no painel e defina o foco da próxima.', link: '/painel', source: 'review', channels: [] });
      }
    }
  }
}
