// Ferramentas do assistente para a Academia. Leituras são livres; criar/alterar treinos e exercícios sempre passa pela
// confirmação do usuário, mostrando exatamente o que será gravado. O assistente NÃO registra séries: isso é feito no modo treino.
import { z } from 'zod';
import type { GymService } from '../application/gym/service';
import type { Exercise } from '../application/gym/ports';
import { exerciseCreateSchema, targetsSchema, workoutCreateSchema } from '../application/gym/schemas';
import { id } from '../application/schemas';
import { ValidationError } from '../domain/errors';
import { paragraphsToHtml, textFromHtml } from '../domain/richText';
import { MUSCLES, type CardioTargets, type ExerciseKind, type LevelTarget, type Targets } from '../domain/gym';
import { tool, type ToolDefinition } from './toolTypes';

const R = { resource: 'gym' as const, group: 'gym' as const, action: 'read' as const };
const fmtT = (t?: LevelTarget) => (t ? `${t.sets}×${t.reps}${t.weight ? ` @ ${t.weight} kg` : ''}` : '—');
const fmtCardioT = (t?: CardioTargets['min']) =>
  (t ? [t.durationMin ? `${t.durationMin} min` : null, t.distanceKm ? `${t.distanceKm} km` : null].filter(Boolean).join(' · ') || '—' : '—');
const fmtTargets = (t: Targets | CardioTargets, kind: ExerciseKind) => (kind === 'cardio'
  ? `mín ${fmtCardioT((t as CardioTargets).min)} · ideal ${fmtCardioT((t as CardioTargets).ideal)} · máx ${fmtCardioT((t as CardioTargets).max)}`
  : `mín ${fmtT((t as Targets).min)} · ideal ${fmtT((t as Targets).ideal)} · máx ${fmtT((t as Targets).max)}`);
const fmtSet = (s: { reps: number; weight: number; durationSeconds?: number | null; distanceKm?: number | null }, kind: ExerciseKind) => (kind === 'cardio'
  ? [s.durationSeconds ? `${Math.round(s.durationSeconds / 60)} min` : null, s.distanceKm ? `${s.distanceKm} km` : null].filter(Boolean).join(' · ') || '—'
  : `${s.reps}×${s.weight}kg`);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const WEEKDAY_LABEL = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const fmtDays = (days: number[]) => days.map((d) => WEEKDAY_LABEL[d]).join(', ');

const aiItem = z.object({
  exercise: z.string().min(1).max(100).describe('nome (ou id) do exercício cadastrado; se não existir, crie antes com gym_create_exercise'),
  restSeconds: z.number().int().min(0).max(900).optional().describe('descanso entre séries em segundos (padrão 90); irrelevante em exercício de cardio, pode omitir'),
  note: z.string().max(300).optional().describe('observação livre (ex.: intensidade, ritmo, inclinação)'),
  targets: targetsSchema.optional().describe('metas mín/ideal/máx: séries×reps×carga se o exercício for de musculação, ou duração (min) e/ou distância (km) se for de cardio — depende do "kind" do exercício, não deste item'),
});
const CARDIO_HINT = 'Cardio/condicionamento (esteira, bike, escada, remo, corrida etc.) tem os mesmos passos, com duas diferenças: (1) ao criar o exercício com gym_create_exercise, mande kind="cardio"; (2) as metas (targets) desse exercício são duração em minutos e/ou distância em km por nível, não séries/reps/carga. Músculos continuam reais (ex.: esteira/corrida → principal quadríceps e isquiotibiais, secundário gastrocnêmio e glúteos), NUNCA deixe o principal vazio.';

export function buildGymTools(g: GymService): ToolDefinition[] {
  /**
   * Resolve TODOS os itens de uma vez (nunca para no primeiro problema) e não bloqueia o treino pelos que não
   * encontrar: usa o que resolveu (priorizando o que já está na biblioteca) e devolve à parte o que ficou faltando,
   * para o modelo tratar como uma pergunta secundária ("quer que eu crie os que faltam?") em vez de travar tudo.
   */
  const resolveItems = async (items: z.infer<typeof aiItem>[]) => {
    const resolved: { ex: Exercise; item: { exerciseId: string; restSeconds: number; note: string; targets: Targets | CardioTargets } }[] = [];
    const missing: string[] = [];
    for (const it of items) {
      try {
        const ex = await g.resolveExercise(it.exercise);
        resolved.push({ ex, item: { exerciseId: ex.id, restSeconds: it.restSeconds ?? 90, note: it.note ?? '', targets: (it.targets ?? {}) as Targets | CardioTargets } });
      } catch (e) {
        missing.push(`"${it.exercise}" — ${errorMessage(e)}`);
      }
    }
    if (resolved.length === 0) {
      throw new ValidationError(
        `Nenhum dos ${items.length} exercício(s) foi encontrado na biblioteca:\n${missing.map((p) => `• ${p}`).join('\n')}`
        + '\nCrie os que faltam com gym_create_exercise (pode ser numa pergunta separada) ou ajuste os nomes antes de montar o treino.',
      );
    }
    return { resolved, missing };
  };
  const lines = (r: { ex: Exercise; item: { restSeconds: number; targets: Targets | CardioTargets } }[]) => r.map(({ ex, item }) => `• ${ex.name} — descanso ${item.restSeconds}s — ${fmtTargets(item.targets, ex.kind)}`);
  const missingLines = (missing: string[]) => (missing.length
    ? ['', 'Não entraram (não encontrados na biblioteca):', ...missing.map((m) => `• ${m}`), 'Posso criar esses depois, se você quiser — é só confirmar.']
    : []);
  const conflictLines = (conflicts: { name: string; days: number[] }[]) => (conflicts.length
    ? ['', '⚠ Mesmo dia de outro treino:', ...conflicts.map((c) => `• "${c.name}" também cai em ${fmtDays(c.days)}`), 'Os dois vão aparecer como "sugerido" no mesmo dia. Tudo bem assim, ou prefere outros dias?']
    : []);

  return [
    tool({ name: 'gym_list_workouts', ...R, label: 'os treinos da academia',
      description: 'Lista os treinos montados (nome, dias sugeridos e exercícios com metas mínimo/ideal/máximo e descanso).',
      schema: z.object({}),
      run: async () => {
        const byId = new Map((await g.listExercises()).map((e) => [e.id, e]));
        return (await g.listWorkouts()).map((w) => ({
          id: w.id, nome: w.name, diasSugeridos: w.weekdays, notas: w.notes ? textFromHtml(w.notes) || undefined : undefined,
          exercicios: w.items.map((i) => ({ exercicio: byId.get(i.exerciseId)?.name, descansoSegundos: i.restSeconds, metas: fmtTargets(i.targets, byId.get(i.exerciseId)?.kind ?? 'strength'), nota: i.note || undefined })),
        }));
      } }),
    tool({ name: 'gym_list_exercises', ...R, label: 'os exercícios',
      description: 'Pesquisa a biblioteca de exercícios (pré-cadastrados e do usuário) por nome e/ou grupo muscular. Máximo 40.',
      schema: z.object({ q: z.string().max(100).optional(), muscle: z.enum(MUSCLES).optional() }),
      run: async (a) => (await g.listExercises(a)).slice(0, 40).map((e) => ({ id: e.id, nome: e.name, principal: e.primaryMuscles, secundarios: e.secondaryMuscles, estabilizadores: e.stabilizerMuscles, equipamento: e.equipment, doUsuario: e.isCustom || undefined })) }),
    tool({ name: 'gym_exercise_history', ...R, label: 'o histórico de um exercício',
      description: 'Recordes (maior carga, 1RM estimado, mais repetições, maior volume) e as últimas sessões de um exercício: carga e repetições de cada série. Use para sugerir progressão de carga.',
      schema: z.object({ exercise: z.string().min(1).max(100).describe('nome ou id') }),
      run: async ({ exercise }) => {
        const ex = await g.resolveExercise(exercise);
        const s = await g.exerciseStats(ex.id);
        return {
          exercicio: ex.name, tipo: ex.kind, totalSessoes: s.totalSessions, recordes: s.records,
          ultimasSessoes: s.sessions.slice(0, 6).map((x) => ({
            data: x.date, series: x.sets.map((y) => `${fmtSet(y, ex.kind)}${y.isPr ? ' (PR)' : ''}`),
            ...(ex.kind === 'strength' ? { volume: x.volume, melhor1RMEstimado: x.bestE1rm } : {}),
          })),
        };
      } }),
    tool({ name: 'gym_recent_sessions', ...R, label: 'os últimos treinos',
      description: 'Últimos treinos realizados: data, duração, volume total, séries, recordes batidos e o nível (mínimo/ideal/máximo).',
      schema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
      run: async ({ limit }) => (await g.listSessions(limit ?? 8)).map((v) => ({
        id: v.session.id, treino: v.session.name, inicio: v.session.startedAt, finalizado: Boolean(v.session.endedAt), duracaoMin: Math.round(v.durationSeconds / 60),
        series: v.totalSets, volumeKg: v.volume, recordes: v.prs, nivel: v.session.level ?? undefined,
        exercicios: v.exercises.map((e) => ({ nome: e.exercise.name, series: e.sets.map((s) => fmtSet(s, e.exercise.kind)), nivel: e.levelReached ?? undefined })),
      })) }),
    tool({ name: 'gym_records', ...R, label: 'os recordes (PR)',
      description: 'Recorde pessoal (PR) de cada exercício já treinado: maior carga e maior 1RM estimado, com data.',
      schema: z.object({}),
      run: async () => (await g.records()).map((r) => ({ exercicio: r.exercise.name, maiorCarga: `${r.maxWeight.weight} kg × ${r.maxWeight.reps} (${r.maxWeight.date})`, melho1RMEstimado: `${r.maxE1rm.e1rm} kg (${r.maxE1rm.date})`, totalSeries: r.totalSets })) }),
    tool({ name: 'gym_overview', ...R, label: 'o panorama da academia',
      description: 'Recuperação por grupo muscular (dias desde o último treino), volume por músculo nos últimos 30 dias, volume semanal e frequência. Use para sugerir o que treinar hoje.',
      schema: z.object({}),
      run: async () => {
        const o = await g.overview();
        return {
          diasDesdeUltimoTreino: o.daysSinceLast, treinosUltimos30Dias: o.sessionsLast30,
          recuperacao: o.recovery.map((r) => ({ musculo: r.muscle, recuperadoPct: r.recoveryPct, horasDesdeOTreino: r.hoursSince ?? 'nunca treinado' })),
          volume30Dias: o.muscleVolume.map((m) => ({ musculo: m.muscle, series: m.sets, volumeKg: m.volume })),
          volumeSemanal: o.weekly.slice(-6),
        };
      } }),

    tool({ name: 'gym_create_exercise', resource: 'gym', group: 'gym', action: 'create', label: 'um exercício', defaultMode: 'confirm',
      description: `Cadastra um exercício novo na biblioteca, com anatomia correta: músculo principal (motor do movimento), secundários (participam ativamente) e estabilizadores (seguram postura/tronco, não movem a articulação-alvo). Use nomes específicos (ex.: "deltoide anterior", "peitoral maior"), nunca genéricos como "ombros" ou "pernas". O mapa muscular é gerado a partir da classificação. ${CARDIO_HINT}`,
      schema: exerciseCreateSchema,
      prepare: async (a) => ({ args: a, summary: [
        `Exercício: ${a.name}${a.kind === 'cardio' ? ' (cardio)' : ''}`, `Principal: ${a.primaryMuscles.join(', ')}`,
        ...(a.secondaryMuscles?.length ? [`Secundários: ${a.secondaryMuscles.join(', ')}`] : []),
        ...(a.stabilizerMuscles?.length ? [`Estabilizadores: ${a.stabilizerMuscles.join(', ')}`] : []),
        `Equipamento: ${a.equipment ?? 'other'}`,
        ...(a.kind === 'cardio' ? [a.singleSession === false ? 'Em várias séries (tiros, circuito...)' : 'Sessão única (feito uma vez só)'] : []),
      ] }),
      run: async (a) => { const e = await g.createExercise(exerciseCreateSchema.parse(a)); return { ok: true, id: e.id, nome: e.name }; } }),
    tool({ name: 'gym_create_workout', resource: 'gym', group: 'gym', action: 'create', label: 'um treino', defaultMode: 'confirm',
      description: `Monta um treino com exercícios da biblioteca. Cada exercício pode ter descanso e metas mínimo/ideal/máximo (séries, repetições, carga). Use gym_exercise_history para sugerir cargas realistas. Se faltar informação (objetivo, dias, equipamento), PERGUNTE antes. PRIORIZE o que já está na biblioteca — a resolução de nomes já é tolerante a variações; se ainda assim algum exercício não for encontrado, o treino é criado normalmente com os demais e o que faltou aparece à parte no resumo: NÃO trave a criação do treino por causa disso, e só pergunte ao usuário (ou crie com gym_create_exercise) como um passo separado, depois. Ao criar VÁRIOS treinos (um "split" semanal), dê a cada um dias da semana DIFERENTES dos outros — dois treinos no mesmo dia os dois aparecem como "sugerido para hoje" ao mesmo tempo, o que confunde; use gym_list_workouts para ver os dias já ocupados antes de escolher, e se o resumo desta ferramenta avisar de colisão, corrija os dias antes de confirmar. ${CARDIO_HINT}`,
      schema: z.object({ name: z.string().min(1).max(100), notes: z.string().max(1000).optional(), weekdays: z.array(z.number().int().min(0).max(6)).optional(), items: z.array(aiItem).min(1).max(20) }),
      prepare: async (a) => {
        const { resolved, missing } = await resolveItems(a.items);
        const conflicts = await g.weekdayConflicts(a.weekdays ?? []);
        return {
          args: { name: a.name, notes: a.notes ? paragraphsToHtml(a.notes) : '', weekdays: a.weekdays ?? [], items: resolved.map((x) => x.item) },
          summary: [`Treino: ${a.name}`, ...(a.notes ? [a.notes] : []), ...lines(resolved), ...missingLines(missing), ...conflictLines(conflicts)],
        };
      },
      run: async (a) => { const w = await g.createWorkout(workoutCreateSchema.parse(a)); return { ok: true, id: w.id, nome: w.name }; } }),
    tool({ name: 'gym_update_workout', resource: 'gym', group: 'gym', action: 'update', label: 'um treino', defaultMode: 'confirm',
      description: `Altera um treino existente. Se enviar "items", a lista de exercícios é SUBSTITUÍDA pela nova (envie a lista completa). Consulte gym_list_workouts para o id. PRIORIZE o que já está na biblioteca; se algum exercício não for encontrado, os demais são salvos normalmente e o que faltou aparece à parte no resumo — não trave a alteração por isso. Se mudar os dias da semana, evite repetir dia com outro treino (o resumo avisa se colidir). ${CARDIO_HINT}`,
      schema: z.object({ id, name: z.string().min(1).max(100).optional(), notes: z.string().max(1000).optional(), weekdays: z.array(z.number().int().min(0).max(6)).optional(), items: z.array(aiItem).min(1).max(20).optional() }),
      prepare: async (a) => {
        const cur = await g.getWorkout(a.id);
        const r = a.items ? await resolveItems(a.items) : null;
        const conflicts = a.weekdays ? await g.weekdayConflicts(a.weekdays, a.id) : [];
        return {
          args: { id: a.id, name: a.name, notes: a.notes !== undefined ? paragraphsToHtml(a.notes) : undefined, weekdays: a.weekdays, items: r?.resolved.map((x) => x.item) },
          summary: [`Alterar o treino "${cur.name}"`, ...(a.name ? [`Novo nome: ${a.name}`] : []), ...(a.notes !== undefined ? [`Notas: ${a.notes || '(vazio)'}`] : []), ...(r ? ['Novos exercícios:', ...lines(r.resolved), ...missingLines(r.missing)] : []), ...conflictLines(conflicts)],
        };
      },
      run: async ({ id: wid, ...patch }) => { const w = await g.updateWorkout(wid, workoutCreateSchema.partial().parse(patch)); return { ok: true, id: w.id }; } }),
  ];
}
