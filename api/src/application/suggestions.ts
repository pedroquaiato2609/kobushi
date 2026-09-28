// Assistente proativo: transforma sinais reais (prazos, conflitos, atrasos, mudanças de padrão) em sugestões moderadas.
import { addDays, toMinutes, weekdayOf } from '../domain/dates';
import { blocksLabel, effectiveBlocks } from '../domain/schedule';
import type { Proactivity, Severity, SuggestionType } from '../domain/constants';
import type { Activity, CalendarEvent, Execution } from '../domain/entities';
import type { Insight, InsightAction } from './finance/types';

export interface AssistantSettings {
  proactivity: Proactivity; types: SuggestionType[]; maxPerDay: number; quietStart: string; quietEnd: string;
  dailyReviewTime: string | null; weeklyReviewTime: string | null;
}
export type SuggestionStatus = 'open' | 'accepted' | 'dismissed' | 'snoozed' | 'expired';
export interface Candidate { key: string; type: SuggestionType; severity: Severity; title: string; reason: string; data: string[]; actions: InsightAction[]; expiresAt: Date | null }
export interface Suggestion extends Omit<Candidate, 'expiresAt'> { id: string; userId: string; status: SuggestionStatus; snoozeUntil: Date | null; createdAt: Date; resolvedAt: Date | null; expiresAt: Date | null }

export interface SuggestionRepository {
  getSettings(userId: string): Promise<AssistantSettings>;
  updateSettings(userId: string, patch: Partial<AssistantSettings>): Promise<AssistantSettings>;
  list(userId: string): Promise<Suggestion[]>;
  create(userId: string, c: Candidate): Promise<Suggestion>;
  setStatus(userId: string, id: string, status: SuggestionStatus, snoozeUntil?: Date | null): Promise<Suggestion | null>;
}

/** Retrato do momento: tudo o que os detectores consultam. */
export interface Signals {
  today: string; nowMinutes: number; activities: Activity[]; executions: Execution[]; events: CalendarEvent[];
  reviewDoneToday: boolean; overdueCards: { id: string; title: string; dueDate: string }[]; financeInsights: Insight[];
}
export interface SignalSource { collect(userId: string, now: Date): Promise<Signals> }

const SEV = { high: 0, attention: 1, info: 2 } as const;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const endOfDay = (date: string) => new Date(`${date}T23:59:59`);
const br = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

function unionMinutes(intervals: [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0; let cur: [number, number] | null = null;
  for (const [s, e] of sorted) {
    if (!cur || s > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [s, e]; } else cur[1] = Math.max(cur[1], e);
  }
  return total + (cur ? cur[1] - cur[0] : 0);
}
const clip = (s: number, e: number, from: number, to: number): [number, number] | null => (Math.min(e, to) > Math.max(s, from) ? [Math.max(s, from), Math.min(e, to)] : null);
const minutesOf = (ts: string) => toMinutes(ts.slice(11, 16));

/** Regras de detecção. Cada candidato tem um `key` estável por sinal: o mesmo sinal nunca gera duas sugestões. */
export function detect(s: Signals): Candidate[] {
  const out: Candidate[] = [];
  const tomorrow = addDays(s.today, 1);
  const applies = (a: Activity, date: string) => a.active && a.weekdays.includes(weekdayOf(date));

  // 1) Obrigação de amanhã sem lembrete (só à tarde/noite, quando "amanhã" é relevante)
  if (s.nowMinutes >= 16 * 60) {
    for (const a of s.activities.filter((x) => applies(x, tomorrow) && x.kind === 'obligation' && x.timeMode === 'fixed' && !x.remindTime)) {
      const blocks = effectiveBlocks(a, weekdayOf(tomorrow));
      if (blocks.length === 0) continue;
      const label = blocksLabel(blocks);
      const early = hhmm(Math.max(0, toMinutes(blocks[0].startTime) - 30));
      out.push({
        key: `remind:${a.id}:${tomorrow}`, type: 'routine', severity: 'attention', expiresAt: endOfDay(tomorrow),
        title: `Você tem "${a.name}" amanhã às ${label}`,
        reason: 'Essa obrigação não tem lembrete. Quer receber um aviso antes?',
        data: [`Obrigação: ${a.name}, amanhã (${br(tomorrow)}) às ${label}`, 'Lembrete diário: não configurado'],
        actions: [{ kind: 'chat', label: 'Criar lembrete', prompt: `Crie um lembrete diário para "${a.name}" às ${early} (30 minutos antes do primeiro horário), no sino e no celular.` }],
      });
    }
  }

  // 2) Agenda concentrada à tarde (hoje de manhã; amanhã à noite), com objetivos flexíveis que poderiam ser movidos
  const target = s.nowMinutes < 12 * 60 ? s.today : s.nowMinutes >= 17 * 60 ? tomorrow : null;
  if (target) {
    const busy: [number, number][] = [];
    for (const e of s.events) if (e.start.slice(0, 10) === target) busy.push([minutesOf(e.start), e.end.slice(0, 10) === target ? minutesOf(e.end) : 24 * 60]);
    for (const a of s.activities) if (applies(a, target) && a.timeMode === 'fixed') for (const b of effectiveBlocks(a, weekdayOf(target))) if (b.endTime) busy.push([toMinutes(b.startTime), toMinutes(b.endTime)]);
    const total = unionMinutes(busy.map(([a, b]) => [a, b] as [number, number]));
    const afternoon = unionMinutes(busy.map(([a, b]) => clip(a, b, 12 * 60, 18 * 60)).filter((x): x is [number, number] => x !== null));
    const flexible = s.activities.filter((a) => applies(a, target) && a.timeMode !== 'fixed' && a.kind !== 'obligation');
    if (afternoon >= 240 && total > 0 && afternoon / total >= 0.6 && flexible.length > 0) {
      out.push({
        key: `concentration:${target}`, type: 'agenda', severity: 'attention', expiresAt: endOfDay(target),
        title: `Sua agenda de ${target === s.today ? 'hoje' : 'amanhã'} está concentrada à tarde`,
        reason: `São ${Math.round(afternoon / 60)}h ocupadas entre 12h e 18h. Posso reorganizar os objetivos sem horário fixo?`,
        data: [`Ocupado à tarde: ${Math.round(afternoon / 60)}h de ${Math.round(total / 60)}h no dia`, `Objetivos flexíveis: ${flexible.map((a) => a.name).join(', ')}`],
        actions: [{ kind: 'chat', label: 'Reorganizar', prompt: `Minha agenda de ${target === s.today ? 'hoje' : 'amanhã'} está concentrada à tarde. Proponha onde encaixar ${flexible.map((a) => `"${a.name}"`).join(', ')} em horários livres, e me mostre antes de agendar.` }, { kind: 'open', label: 'Abrir agenda', href: '/agenda' }],
      });
    }
  }

  // 3) Objetivo adiado 3 ou mais dias seguidos
  const done = new Set(s.executions.map((e) => `${e.activityId}|${e.date}`));
  for (const a of s.activities.filter((x) => x.active && x.kind !== 'obligation')) {
    const missed: string[] = [];
    for (let i = 1; i <= 14 && missed.length < 7; i++) {
      const day = addDays(s.today, -i);
      if (!a.weekdays.includes(weekdayOf(day))) continue;
      if (done.has(`${a.id}|${day}`)) break;
      missed.push(day);
    }
    if (missed.length < 3 || done.has(`${a.id}|${s.today}`)) continue;
    const monday = addDays(s.today, -((weekdayOf(s.today) + 6) % 7));
    out.push({
      key: `postponed:${a.id}:${monday}`, type: 'routine', severity: 'attention', expiresAt: endOfDay(addDays(monday, 6)),
      title: `"${a.name}" foi adiado ${missed.length} vezes seguidas`,
      reason: `Quer reduzi-lo temporariamente ao nível mínimo${a.minDesc ? ` (${a.minDesc})` : ''} para retomar o ritmo?`,
      data: [`Dias sem registro: ${missed.slice().reverse().map(br).join(', ')}`, a.minDesc ? `Nível mínimo: ${a.minDesc}` : 'Sem nível mínimo definido'],
      actions: [{ kind: 'chat', label: 'Retomar pelo mínimo', prompt: `Quero retomar "${a.name}" pelo nível mínimo por alguns dias. Sugira um plano curto e, se fizer sentido, um lembrete diário.` }, { kind: 'open', label: 'Ver atividade', href: '/atividades' }],
    });
  }

  // 4) Conflitos de agenda nos próximos 3 dias
  const evs = [...s.events].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) {
    const a = evs[i]; const b = evs[j];
    if (b.start >= a.end) break;
    if (a.start.slice(0, 10) !== b.start.slice(0, 10)) continue;
    const near = a.start.slice(0, 10) <= tomorrow;
    out.push({
      key: `conflict:${[a.id, b.id].sort().join(':')}`, type: 'agenda', severity: near ? 'high' : 'attention', expiresAt: new Date(`${a.end}:00`),
      title: `Conflito de horário: ${a.title} e ${b.title}`,
      reason: 'Os dois eventos se sobrepõem. Quer resolver isso agora?',
      data: [`${a.title}: ${br(a.start.slice(0, 10))} ${a.start.slice(11)}–${a.end.slice(11)}`, `${b.title}: ${br(b.start.slice(0, 10))} ${b.start.slice(11)}–${b.end.slice(11)}`],
      actions: [{ kind: 'chat', label: 'Ajudar a resolver', prompt: `Os eventos "${a.title}" e "${b.title}" estão em conflito. Sugira como resolver, sem alterar nada antes de eu aprovar.` }, { kind: 'open', label: 'Abrir agenda', href: '/agenda' }],
    });
  }

  // 5) Revisão do dia ainda não feita
  if (s.nowMinutes >= 20 * 60 + 30 && !s.reviewDoneToday) {
    out.push({
      key: `review:${s.today}`, type: 'review', severity: 'info', expiresAt: endOfDay(s.today),
      title: 'Você ainda não fez a revisão do dia', reason: 'É uma boa hora: leva poucos minutos e ajuda a ajustar amanhã.',
      data: [`Nenhuma revisão registrada em ${br(s.today)}`],
      actions: [{ kind: 'chat', label: 'Fazer a revisão agora', prompt: 'Vamos fazer a revisão do meu dia. Me faça as perguntas, uma de cada vez.' }],
    });
  }

  // 6) Cards atrasados no kanban
  for (const c of s.overdueCards.slice(0, 3)) {
    out.push({
      key: `card:${c.id}:${c.dueDate}`, type: 'agenda', severity: 'attention', expiresAt: null,
      title: `O card "${c.title}" está atrasado`, reason: `O prazo era ${br(c.dueDate)}. Quer replanejar ou concluir?`,
      data: [`Card: ${c.title}`, `Prazo: ${c.dueDate}`],
      actions: [{ kind: 'open', label: 'Abrir kanban', href: '/kanban' }, { kind: 'chat', label: 'Replanejar', prompt: `O card "${c.title}" está atrasado. Sugira um novo prazo e me mostre antes de alterar.` }],
    });
  }

  // 7) Finanças: só os insights que pedem atenção
  for (const i of s.financeInsights.filter((x) => x.severity !== 'info')) {
    out.push({ key: `fin:${i.key}`, type: 'finance', severity: i.severity, title: i.title, reason: i.summary, data: i.why, actions: i.actions, expiresAt: null });
  }
  return out;
}

const rank = (c: Candidate) => SEV[c.severity] * 10 + ['agenda', 'routine', 'finance', 'review'].indexOf(c.type);
const inQuiet = (nowMin: number, start: string, end: string) => { const s = toMinutes(start); const e = toMinutes(end); return s > e ? nowMin >= s || nowMin < e : nowMin >= s && nowMin < e; };

export class SuggestionService {
  constructor(
    private repo: SuggestionRepository, private source: SignalSource,
    private onCreated: (userId: string, s: Suggestion) => Promise<void> = async () => undefined,
    private now: () => Date = () => new Date(),
    private localDate: (d: Date) => string = (d) => d.toISOString().slice(0, 10),
  ) {}

  settings(userId: string) { return this.repo.getSettings(userId); }
  updateSettings(userId: string, patch: Partial<AssistantSettings>) { return this.repo.updateSettings(userId, patch); }

  /** Sugestões abertas (as adiadas voltam quando o prazo vence; as vencidas somem). */
  async open(userId: string): Promise<Suggestion[]> {
    const now = this.now();
    const all = await this.repo.list(userId);
    const out: Suggestion[] = [];
    for (const s of all) {
      if (s.status === 'snoozed' && s.snoozeUntil && s.snoozeUntil <= now) { await this.repo.setStatus(userId, s.id, 'open', null); s.status = 'open'; }
      if (s.status === 'open' && s.expiresAt && s.expiresAt <= now) { await this.repo.setStatus(userId, s.id, 'expired'); continue; }
      if (s.status === 'open') out.push(s);
    }
    return out.sort((a, b) => SEV[a.severity] - SEV[b.severity] || b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Procura novos sinais e cria no máximo o que os limites permitem: tipos e frequência escolhidos pelo usuário,
   * horário de silêncio, teto por dia e teto de sugestões abertas. Sinais já vistos (mesmo dispensados) não voltam.
   */
  async refresh(userId: string): Promise<Suggestion[]> {
    const settings = await this.repo.getSettings(userId);
    if (settings.proactivity === 'off') return [];
    const now = this.now();
    const signals = await this.source.collect(userId, now);
    if (inQuiet(signals.nowMinutes, settings.quietStart, settings.quietEnd)) return [];

    const existing = await this.repo.list(userId);
    const seen = new Set(existing.map((s) => s.key));
    const open = await this.open(userId);
    const createdToday = existing.filter((s) => this.localDate(s.createdAt) === signals.today).length;
    const maxOpen = settings.proactivity === 'low' ? 2 : 5;
    let room = Math.min(settings.maxPerDay - createdToday, maxOpen - open.length);
    if (room <= 0) return [];

    const minSeverity = settings.proactivity === 'low' ? SEV.attention : SEV.info;
    const fresh = detect(signals)
      .filter((c) => settings.types.includes(c.type) && SEV[c.severity] <= minSeverity && !seen.has(c.key))
      .sort((a, b) => rank(a) - rank(b));

    const created: Suggestion[] = [];
    for (const c of fresh) {
      if (room-- <= 0) break;
      const s = await this.repo.create(userId, c);
      created.push(s);
      await this.onCreated(userId, s);
    }
    return created;
  }

  async resolve(userId: string, id: string, status: 'accepted' | 'dismissed' | 'snoozed', days = 1) {
    const until = status === 'snoozed' ? new Date(this.now().getTime() + days * 86_400_000) : null;
    return this.repo.setStatus(userId, id, status, until);
  }
}
