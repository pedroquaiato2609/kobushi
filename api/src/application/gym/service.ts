import type { z } from 'zod';
import type { Level } from '../../domain/constants';
import { NotFoundError, ValidationError } from '../../domain/errors';
import {
  bestOf, cardioLevelReached, detectPr, estimate1rm, levelReached, normalizeName, recoveryOf, volumeOf,
  type Best, type CardioTargets, type Muscle, type PrKind, type SetLike, type Targets,
} from '../../domain/gym';
import type { FileStore } from '../library';
import { sanitizeRichHtml } from '../richText';
import { CATALOG } from './catalog';
import type { Exercise, GymRepository, GymSession, GymSet, HistorySet, Workout, WorkoutItem, WorkoutItemInput } from './ports';
import type { exerciseCreateSchema, exerciseUpdateSchema, sessionFinishSchema, sessionStartSchema, setCreateSchema, setUpdateSchema, workoutCreateSchema, workoutUpdateSchema } from './schemas';

const RANK: Record<Level, number> = { min: 1, ideal: 2, max: 3 };
const LEVELS_ASC: Level[] = ['min', 'ideal', 'max'];
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']); // nunca SVG/HTML: são servidos na mesma origem do app

export interface PlanItem {
  exercise: Exercise; restSeconds: number; note: string; targets: Targets | CardioTargets; planned: boolean;
  last: SetLike[]; best: Best; sets: GymSet[]; levelReached: Level | null;
}
export interface SessionView {
  session: GymSession; durationSeconds: number; totalSets: number; volume: number; prs: number;
  exercises: { exercise: Exercise; sets: GymSet[]; levelReached: Level | null }[]; suggestedLevel: Level | null;
}
export interface ActiveView extends SessionView { plan: PlanItem[] }

/** Confere os primeiros bytes: o tipo declarado pelo navegador não é confiável. */
const looksLike = (mime: string, d: Buffer) =>
  (mime === 'image/png' && d.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])))
  || (mime === 'image/jpeg' && d.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
  || (mime === 'image/webp' && d.subarray(0, 4).toString('latin1') === 'RIFF' && d.subarray(8, 12).toString('latin1') === 'WEBP');

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';

// Palavras sem valor de busca (preposições/artigos comuns em nomes de exercício: "com", "de", "na", "em pé"...).
const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'e', 'ou', 'a', 'o', 'as', 'os', 'um', 'uma']);
const keywordsOf = (normalized: string): string[] => normalized.split(' ').filter((w) => w.length >= 3 && !STOPWORDS.has(w));
const overlap = (a: string[], b: string[]): number => a.filter((w) => b.includes(w)).length;

export class GymService {
  constructor(
    private repo: GymRepository, private files: FileStore, private timezone: string,
    private now: () => Date = () => new Date(),
    private onFinished: (view: SessionView) => Promise<void> = async () => undefined,
  ) {}

  /**
   * Cria os exercícios do catálogo que faltam e corrige a classificação/instruções dos que já existem (por nome).
   * É assim que uma revisão do catálogo (como esta) chega a bancos que já tinham os exercícios antigos.
   */
  syncCatalog() {
    return this.repo.upsertCatalog(CATALOG.map((c) => ({
      name: c.name, primaryMuscles: c.primary, secondaryMuscles: c.secondary, stabilizerMuscles: c.stabilizer,
      equipment: c.equipment, kind: c.kind, instructions: c.instructions, tips: c.tips,
    })));
  }

  // ---- exercícios ----------------------------------------------------------------
  listExercises(f: { q?: string; muscle?: Muscle } = {}) { return this.repo.listExercises(f); }
  async getExercise(id: string) { const e = await this.repo.getExercise(id); if (!e) throw new NotFoundError('Exercício'); return e; }

  /** Um músculo só entra na categoria de maior destaque: principal > secundário > estabilizador. */
  private classify(primaryIn: Muscle[], secondaryIn: Muscle[], stabilizerIn: Muscle[]) {
    const primaryMuscles = [...new Set(primaryIn)];
    const secondaryMuscles = [...new Set(secondaryIn)].filter((m) => !primaryMuscles.includes(m));
    const stabilizerMuscles = [...new Set(stabilizerIn)].filter((m) => !primaryMuscles.includes(m) && !secondaryMuscles.includes(m));
    return { primaryMuscles, secondaryMuscles, stabilizerMuscles };
  }

  async createExercise(input: z.output<typeof exerciseCreateSchema>) {
    const classified = this.classify(input.primaryMuscles, input.secondaryMuscles ?? [], input.stabilizerMuscles ?? []);
    try {
      return await this.repo.createExercise({
        name: input.name, equipment: input.equipment ?? 'other', kind: input.kind ?? 'strength',
        instructions: input.instructions ?? '', tips: input.tips ?? '', isCustom: true, ...classified,
      });
    } catch (e) { if (isUniqueViolation(e)) throw new ValidationError('Já existe um exercício com esse nome.'); throw e; }
  }
  async updateExercise(id: string, patch: z.output<typeof exerciseUpdateSchema>) {
    const cur = await this.getExercise(id);
    const touchesMuscles = patch.primaryMuscles || patch.secondaryMuscles || patch.stabilizerMuscles;
    const classified = touchesMuscles
      ? this.classify(patch.primaryMuscles ?? cur.primaryMuscles, patch.secondaryMuscles ?? cur.secondaryMuscles, patch.stabilizerMuscles ?? cur.stabilizerMuscles)
      : {};
    try { return (await this.repo.updateExercise(id, { ...patch, ...classified })) as Exercise; }
    catch (e) { if (isUniqueViolation(e)) throw new ValidationError('Já existe um exercício com esse nome.'); throw e; }
  }
  async removeExercise(id: string) {
    const r = await this.repo.removeExercise(id);
    if (r === 'missing') throw new NotFoundError('Exercício');
    return r; // 'archived' quando já tem histórico ou está em um treino: o histórico é preservado
  }
  /**
   * Aceita id ou nome (para o assistente). Prioriza usar o que já está cadastrado: além do nome exato e de uma busca
   * mais curta/mais detalhada que o cadastro, resolve também por palavras-chave em comum (ex.: "pulldown na polia" ->
   * "Puxada na frente (pulldown)") quando isso aponta para um único exercício, sem precisar perguntar.
   * Só quando fica genuinamente ambíguo ou sem nada parecido é que lança erro (com as opções mais relevantes),
   * para o modelo resolver numa pergunta em vez de tentar variações às cegas chamando esta ferramenta de novo.
   */
  async resolveExercise(nameOrId: string): Promise<Exercise> {
    if (/^[0-9a-f-]{36}$/i.test(nameOrId)) { const e = await this.repo.getExercise(nameOrId); if (e) return e; }
    const all = await this.repo.listExercises({});
    const want = normalizeName(nameOrId);
    const exact = all.filter((e) => normalizeName(e.name) === want);
    if (exact.length === 1) return exact[0];
    // inclusão nos dois sentidos: cobre tanto uma busca curta ("supino") quanto um nome com detalhes a mais
    // que o cadastrado ("rosca martelo com halteres" -> "Rosca martelo").
    const partial = all.filter((e) => { const n = normalizeName(e.name); return n.includes(want) || want.includes(n); });
    if (partial.length === 1) return partial[0];
    if (partial.length === 0) {
      // palavras-chave em comum (ignorando conectivos): quando um único exercício é o mais parecido, usa ele direto.
      const wantWords = keywordsOf(want);
      if (wantWords.length) {
        const scored = all.map((e) => ({ e, score: overlap(wantWords, keywordsOf(normalizeName(e.name))) })).filter((s) => s.score > 0);
        const max = Math.max(0, ...scored.map((s) => s.score));
        const top = scored.filter((s) => s.score === max);
        if (top.length === 1) return top[0].e;
        if (top.length > 1) throw new ValidationError(`Mais de um exercício parece com "${nameOrId}": ${top.slice(0, 5).map((s) => s.e.name).join('; ')}. Pergunte ao usuário qual, uma única vez.`);
      }
      throw new ValidationError(`Não achei o exercício "${nameOrId}" e não há nada parecido na biblioteca. Não invente variações chamando de novo: crie com gym_create_exercise (pode ser numa pergunta separada, sem travar o resto do treino) ou pergunte ao usuário.`);
    }
    throw new ValidationError(`Mais de um exercício combina com "${nameOrId}": ${partial.slice(0, 8).map((e) => e.name).join('; ')}. Pergunte ao usuário qual, uma única vez.`);
  }

  // ---- foto de referência ----------------------------------------------------------
  async setImage(id: string, data: Buffer, mime: string) {
    await this.getExercise(id);
    if (!IMAGE_TYPES.has(mime)) throw new ValidationError('Envie uma imagem PNG, JPEG ou WebP.');
    if (!looksLike(mime, data)) throw new ValidationError('O arquivo não parece ser uma imagem válida.');
    if (data.length === 0 || data.length > 5 * 1024 * 1024) throw new ValidationError('A imagem precisa ter até 5 MB.');
    const old = await this.repo.imageOf(id);
    const storage = crypto.randomUUID();
    await this.files.save(storage, data);
    await this.repo.setImage(id, { storage, mime });
    if (old) await this.files.remove(old.storage);
  }
  async removeImage(id: string) {
    const old = await this.repo.imageOf(id);
    await this.repo.setImage(id, null);
    if (old) await this.files.remove(old.storage);
  }
  async imageInfo(id: string) {
    const img = await this.repo.imageOf(id);
    if (!img) throw new NotFoundError('Imagem');
    return { path: this.files.path(img.storage), mime: img.mime };
  }

  // ---- treinos -----------------------------------------------------------------------
  listWorkouts() { return this.repo.listWorkouts(); }
  async getWorkout(id: string) { const w = await this.repo.getWorkout(id); if (!w) throw new NotFoundError('Treino'); return w; }

  private async checkItems(items: { exerciseId: string }[]) {
    const ids = [...new Set(items.map((i) => i.exerciseId))];
    const found = await this.repo.getExercises(ids);
    const missing = ids.filter((i) => !found.some((f) => f.id === i));
    if (missing.length) throw new ValidationError('Um dos exercícios do treino não existe mais.');
  }
  async createWorkout(input: z.output<typeof workoutCreateSchema>) {
    const items = input.items ?? [];
    await this.checkItems(items);
    // o Zod valida cada meta (por nível) como musculação OU cardio individualmente; o formato exato depende
    // do "kind" do exercício, checado no serviço, não no schema — daqui pra frente é WorkoutItemInput mesmo.
    return this.repo.createWorkout({ name: input.name, notes: sanitizeRichHtml(input.notes ?? ''), weekdays: [...new Set(input.weekdays ?? [])].sort() }, items as unknown as WorkoutItemInput[]);
  }
  async updateWorkout(id: string, patch: z.output<typeof workoutUpdateSchema>) {
    await this.getWorkout(id);
    if (patch.items) await this.checkItems(patch.items);
    const { items, ...rest } = patch;
    if (rest.notes !== undefined) rest.notes = sanitizeRichHtml(rest.notes);
    return (await this.repo.updateWorkout(id, { ...rest, ...(rest.weekdays ? { weekdays: [...new Set(rest.weekdays)].sort() } : {}) }, items as unknown as WorkoutItemInput[] | undefined)) as Workout;
  }
  /**
   * Outros treinos ativos que caem no(s) mesmo(s) dia(s) — não impede nada (a pessoa pode querer mais de um treino
   * no mesmo dia), mas dá pra avisar antes de salvar, para não repetir "Sugerido para hoje" em dois treinos sem querer.
   */
  async weekdayConflicts(weekdays: number[], excludeWorkoutId?: string): Promise<{ name: string; days: number[] }[]> {
    if (!weekdays.length) return [];
    const all = await this.repo.listWorkouts();
    return all.flatMap((w) => {
      if (w.id === excludeWorkoutId) return [];
      const shared = w.weekdays.filter((d) => weekdays.includes(d));
      return shared.length ? [{ name: w.name, days: shared.sort() }] : [];
    });
  }
  async removeWorkout(id: string) { if (!(await this.repo.deleteWorkout(id))) throw new NotFoundError('Treino'); }

  // ---- sessões -----------------------------------------------------------------------
  private durationOf(s: GymSession) { return Math.max(0, Math.round(((s.endedAt ?? this.now()).getTime() - s.startedAt.getTime()) / 1000)); }

  /** Nível de UMA série, no formato certo pro tipo do exercício (musculação: carga×reps; cardio: duração/distância). */
  private setLevelReached(kind: 'strength' | 'cardio', set: GymSet, targets: Targets | CardioTargets): Level | null {
    return kind === 'cardio'
      ? cardioLevelReached({ durationSeconds: set.durationSeconds ?? 0, distanceKm: set.distanceKm ?? 0 }, targets as CardioTargets)
      : levelReached(set, targets as Targets);
  }

  /** Nível da SESSÃO nesse exercício: musculação exige o nº de séries da meta; cardio (sem "séries") basta cumprir uma vez. */
  private levelFor(sets: GymSet[], targets: Targets | CardioTargets, kind: 'strength' | 'cardio'): Level | null {
    let out: Level | null = null;
    for (const l of LEVELS_ASC) {
      const t = targets[l];
      if (!t) continue;
      if (kind === 'cardio') { if (sets.some((s) => this.setLevelReached('cardio', s, { [l]: t }) === l)) out = l; continue; }
      const ok = sets.filter((s) => this.setLevelReached('strength', s, { [l]: t }) === l).length;
      if (ok >= (t as { sets: number }).sets) out = l;
    }
    return out;
  }

  /** Monta a visão de uma sessão: séries por exercício, volume, recordes e o nível sugerido (o menor entre os exercícios planejados). */
  private async view(session: GymSession, workout: Workout | null): Promise<SessionView> {
    const sets = await this.repo.setsOf([session.id]);
    const ids = [...new Set(sets.map((s) => s.exerciseId))];
    const exercises = await this.repo.getExercises(ids);
    const byId = new Map(exercises.map((e) => [e.id, e]));
    const items = new Map((workout?.items ?? []).map((i) => [i.exerciseId, i]));
    const groups = ids.map((id) => {
      const ex = byId.get(id) as Exercise;
      const mine = sets.filter((s) => s.exerciseId === id);
      const targets = items.get(id)?.targets ?? {};
      return { exercise: ex, sets: mine, levelReached: this.levelFor(mine, targets, ex.kind) };
    });
    const planned = (workout?.items ?? []).filter((i) => Object.keys(i.targets).length > 0);
    const levels = planned.map((i) => groups.find((g) => g.exercise.id === i.exerciseId)?.levelReached ?? null);
    const suggestedLevel = planned.length && levels.every((l) => l) ? (levels as Level[]).reduce((a, b) => (RANK[a] <= RANK[b] ? a : b)) : null;
    return {
      session, durationSeconds: this.durationOf(session), totalSets: sets.length, volume: volumeOf(sets),
      prs: sets.filter((s) => s.isPr).length, exercises: groups, suggestedLevel,
    };
  }

  async start(input: z.output<typeof sessionStartSchema>): Promise<ActiveView> {
    if (await this.repo.activeSession()) throw new ValidationError('Já existe um treino em andamento. Finalize-o antes de começar outro.');
    const workout = input.workoutId ? await this.getWorkout(input.workoutId) : null;
    const name = input.name ?? workout?.name ?? 'Treino livre';
    try { await this.repo.createSession({ workoutId: workout?.id ?? null, name }); }
    catch (e) { if (isUniqueViolation(e)) throw new ValidationError('Já existe um treino em andamento.'); throw e; }
    return (await this.active()) as ActiveView;
  }

  async active(): Promise<ActiveView | null> {
    const session = await this.repo.activeSession();
    return session ? this.activeView(session) : null;
  }

  private async activeView(session: GymSession): Promise<ActiveView> {
    const workout = session.workoutId ? await this.repo.getWorkout(session.workoutId) : null;
    const base = await this.view(session, workout);
    const planItems: { item: WorkoutItem | null; exerciseId: string }[] = [
      ...(workout?.items ?? []).map((item) => ({ item, exerciseId: item.exerciseId })),
      ...base.exercises.filter((g) => !workout?.items.some((i) => i.exerciseId === g.exercise.id)).map((g) => ({ item: null, exerciseId: g.exercise.id })),
    ];
    const exercises = new Map((await this.repo.getExercises(planItems.map((p) => p.exerciseId))).map((e) => [e.id, e]));
    const plan: PlanItem[] = [];
    for (const p of planItems) {
      const exercise = exercises.get(p.exerciseId);
      if (!exercise) continue;
      const g = base.exercises.find((x) => x.exercise.id === p.exerciseId);
      const [last, all] = await Promise.all([this.repo.lastPerformance(p.exerciseId, session.id), this.repo.previousSets(p.exerciseId, null, null)]);
      plan.push({
        exercise, restSeconds: p.item?.restSeconds ?? 90, note: p.item?.note ?? '', targets: p.item?.targets ?? {}, planned: Boolean(p.item),
        last, best: bestOf(all), sets: g?.sets ?? [], levelReached: g?.levelReached ?? null,
      });
    }
    return { ...base, plan };
  }

  async session(id: string): Promise<SessionView> {
    const session = await this.repo.getSession(id);
    if (!session) throw new NotFoundError('Treino');
    return this.view(session, session.workoutId ? await this.repo.getWorkout(session.workoutId) : null);
  }

  async listSessions(limit = 30, offset = 0) {
    const sessions = await this.repo.listSessions(limit, offset);
    return Promise.all(sessions.map(async (s) => this.view(s, s.workoutId ? await this.repo.getWorkout(s.workoutId) : null)));
  }
  async removeSession(id: string) { if (!(await this.repo.deleteSession(id))) throw new NotFoundError('Treino'); }

  private async requireActive(sessionId: string) {
    const s = await this.repo.getSession(sessionId);
    if (!s) throw new NotFoundError('Treino');
    if (s.endedAt) throw new ValidationError('Este treino já foi finalizado.');
    return s;
  }

  async addSet(sessionId: string, input: z.output<typeof setCreateSchema>): Promise<{ set: GymSet; prs: PrKind[]; e1rm: number }> {
    const session = await this.requireActive(sessionId);
    const exercise = await this.getExercise(input.exerciseId);
    const cardio = exercise.kind === 'cardio';
    // recordes (maior carga/1RM) só fazem sentido pra musculação: cardio sempre tem reps=weight=0, então detectPr já
    // devolveria [] sozinho, mas evita a consulta à toa
    const prs = cardio ? [] : detectPr(await this.repo.previousSets(input.exerciseId, null, null), input);
    const workout = session.workoutId ? await this.repo.getWorkout(session.workoutId) : null;
    const targets = workout?.items.find((i) => i.exerciseId === input.exerciseId)?.targets ?? {};
    const durationSeconds = input.durationSeconds ?? null;
    const distanceKm = input.distanceKm ?? null;
    const level = input.level ?? this.setLevelReached(exercise.kind, { ...input, durationSeconds, distanceKm } as GymSet, targets);
    const set = await this.repo.addSet(sessionId, {
      exerciseId: input.exerciseId, reps: input.reps, weight: input.weight, durationSeconds, distanceKm, level, restSeconds: input.restSeconds ?? null,
    }, prs.length > 0);
    return { set, prs, e1rm: cardio ? 0 : estimate1rm(input.weight, input.reps) };
  }

  async updateSet(id: string, patch: z.output<typeof setUpdateSchema>) {
    const cur = await this.repo.getSet(id);
    if (!cur) throw new NotFoundError('Série');
    const exercise = await this.getExercise(cur.exerciseId);
    const cardio = exercise.kind === 'cardio';
    const next = {
      reps: patch.reps ?? cur.reps, weight: patch.weight ?? cur.weight,
      durationSeconds: patch.durationSeconds !== undefined ? patch.durationSeconds : cur.durationSeconds,
      distanceKm: patch.distanceKm !== undefined ? patch.distanceKm : cur.distanceKm,
    };
    const prs = cardio ? [] : detectPr(await this.repo.previousSets(cur.exerciseId, cur.createdAt, id), next);
    // mudou o desempenho sem escolher o nível: recalcula pelo que o treino planejava para o exercício
    let level = patch.level;
    const changedPerformance = cardio ? (patch.durationSeconds !== undefined || patch.distanceKm !== undefined) : (patch.reps !== undefined || patch.weight !== undefined);
    if (level === undefined && changedPerformance) {
      const session = await this.repo.getSession(cur.sessionId);
      const workout = session?.workoutId ? await this.repo.getWorkout(session.workoutId) : null;
      const targets = workout?.items.find((i) => i.exerciseId === cur.exerciseId)?.targets ?? {};
      level = this.setLevelReached(exercise.kind, next as GymSet, targets);
    }
    return (await this.repo.updateSet(id, { ...patch, ...(level !== undefined ? { level } : {}) }, prs.length > 0)) as GymSet;
  }
  async deleteSet(id: string) { if (!(await this.repo.deleteSet(id))) throw new NotFoundError('Série'); }

  async finish(sessionId: string, input: z.output<typeof sessionFinishSchema>): Promise<SessionView> {
    const session = await this.requireActive(sessionId);
    const before = await this.session(sessionId);
    if (before.totalSets === 0) throw new ValidationError('Registre pelo menos uma série antes de finalizar (ou descarte o treino).');
    const level = input.level === undefined ? before.suggestedLevel : input.level;
    await this.repo.finishSession(session.id, { note: input.note, level });
    const view = await this.session(sessionId);
    await this.onFinished(view).catch(() => undefined); // integrar com a rotina nunca impede de encerrar o treino
    return view;
  }

  // ---- relatórios ----------------------------------------------------------------------
  private groupHistory(rows: HistorySet[]) {
    const map = new Map<string, { sessionId: string; date: string; sets: HistorySet[] }>();
    for (const r of rows) { const g = map.get(r.sessionId) ?? { sessionId: r.sessionId, date: r.date, sets: [] }; g.sets.push(r); map.set(r.sessionId, g); }
    return [...map.values()].map((g) => {
      const best = bestOf(g.sets);
      const top = g.sets.reduce((a, s) => (s.weight > a.weight || (s.weight === a.weight && s.reps > a.reps) ? s : a), g.sets[0]);
      return { sessionId: g.sessionId, date: g.date, sets: g.sets.map((s) => ({ reps: s.reps, weight: s.weight, durationSeconds: s.durationSeconds, distanceKm: s.distanceKm, isPr: s.isPr, level: s.level })), volume: volumeOf(g.sets), topSet: { reps: top.reps, weight: top.weight }, bestE1rm: best.e1rm, hadPr: g.sets.some((s) => s.isPr) };
    });
  }

  async exerciseStats(id: string) {
    const exercise = await this.getExercise(id);
    const rows = await this.repo.history(id, this.timezone, 500);
    const sessions = this.groupHistory(rows); // mais recente primeiro
    const flat = rows.filter((r) => r.reps > 0);
    const pick = <T>(list: HistorySet[], score: (s: HistorySet) => number, out: (s: HistorySet) => T) => { const b = list.reduce<HistorySet | null>((a, s) => (!a || score(s) > score(a) ? s : a), null); return b && score(b) > 0 ? out(b) : null; };
    const records = {
      maxWeight: pick(flat, (s) => s.weight, (s) => ({ weight: s.weight, reps: s.reps, date: s.date })),
      maxE1rm: pick(flat, (s) => estimate1rm(s.weight, s.reps), (s) => ({ e1rm: estimate1rm(s.weight, s.reps), weight: s.weight, reps: s.reps, date: s.date })),
      maxReps: pick(flat, (s) => s.reps, (s) => ({ reps: s.reps, weight: s.weight, date: s.date })),
      maxVolume: sessions.length ? (() => { const b = sessions.reduce((a, s) => (s.volume > a.volume ? s : a)); return b.volume > 0 ? { volume: b.volume, date: b.date } : null; })() : null,
      // cardio: maior duração e maior distância já registradas (recorde de musculação não se aplica aqui)
      maxDuration: pick(rows, (s) => s.durationSeconds ?? 0, (s) => ({ durationSeconds: s.durationSeconds ?? 0, date: s.date })),
      maxDistance: pick(rows, (s) => s.distanceKm ?? 0, (s) => ({ distanceKm: s.distanceKm ?? 0, date: s.date })),
    };
    const progression = [...sessions].reverse().map((s) => ({ date: s.date, e1rm: s.bestE1rm, topWeight: s.topSet.weight, volume: s.volume }));
    return { exercise, records, sessions: sessions.slice(0, 30), progression, totalSessions: sessions.length, totalSets: rows.length };
  }

  /** Recorde de cada exercício já treinado: maior carga e maior 1RM estimado, com a data. */
  async records() {
    const sets = await this.repo.allSets(this.timezone);
    const byEx = new Map<string, typeof sets>();
    for (const s of sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
    const exercises = new Map((await this.repo.getExercises([...byEx.keys()])).map((e) => [e.id, e]));
    const out = [...byEx.entries()].flatMap(([id, list]) => {
      const exercise = exercises.get(id);
      if (!exercise) return [];
      const heavy = list.reduce((a, s) => (s.weight > a.weight || (s.weight === a.weight && s.reps > a.reps) ? s : a));
      const e1 = list.reduce((a, s) => (estimate1rm(s.weight, s.reps) > estimate1rm(a.weight, a.reps) ? s : a));
      const lastDate = list.reduce((d, s) => (s.date > d ? s.date : d), '');
      return [{ exercise, maxWeight: { weight: heavy.weight, reps: heavy.reps, date: heavy.date }, maxE1rm: { e1rm: estimate1rm(e1.weight, e1.reps), weight: e1.weight, reps: e1.reps, date: e1.date }, totalSets: list.length, lastDate }];
    });
    return out.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }

  async overview() {
    const now = this.now();
    const [last, weekly, muscleVolume, dates] = await Promise.all([
      this.repo.lastTrainedByMuscle(), this.repo.weeklyVolume(12, this.timezone), this.repo.muscleVolume(30), this.repo.sessionDates(365, this.timezone),
    ]);
    const recovery = recoveryOf(last, now);
    const lastDate = dates.at(-1) ?? null;
    const today = now.toLocaleDateString('en-CA', { timeZone: this.timezone });
    const daysSinceLast = lastDate ? Math.round((Date.parse(today) - Date.parse(lastDate)) / 86_400_000) : null;
    const since30 = new Date(now.getTime() - 30 * 86_400_000).toLocaleDateString('en-CA', { timeZone: this.timezone });
    return {
      recovery, freshMuscles: recovery.filter((r) => r.ready).length, daysSinceLast,
      sessionsLast30: dates.filter((d) => d >= since30).length, weekly, muscleVolume,
    };
  }
}
