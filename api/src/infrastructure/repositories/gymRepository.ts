import type { CardioSetDetails, Exercise, ExerciseInput, GymRepository, GymSession, GymSet, HistorySet, SetInput, Workout, WorkoutInput, WorkoutItem, WorkoutItemInput } from '../../application/gym/ports';
import type { Level } from '../../domain/constants';
import type { Muscle, SetLike } from '../../domain/gym';
import { withTx, type Db } from '../db/pool';
import { mapRow, updateRow } from '../db/util';

const toExercise = (r: Record<string, any>): Exercise => {
  const e = mapRow<any>(r);
  return {
    id: e.id, name: e.name, primaryMuscles: e.primaryMuscles, secondaryMuscles: e.secondaryMuscles, stabilizerMuscles: e.stabilizerMuscles ?? [], equipment: e.equipment,
    kind: e.kind, instructions: e.instructions, tips: e.tips, isCustom: e.isCustom, imageMime: e.imageStorage ? e.imageMime : null, archived: e.archived, createdAt: e.createdAt,
  };
};
const toItem = (r: Record<string, any>): WorkoutItem => ({ id: r.id, exerciseId: r.exercise_id, position: r.position, restSeconds: r.rest_seconds, note: r.note, targets: r.targets ?? {} });
const toSession = (r: Record<string, any>): GymSession => ({ id: r.id, workoutId: r.workout_id, name: r.name, startedAt: r.started_at, endedAt: r.ended_at, note: r.note, level: r.level });
const toSet = (r: Record<string, any>): GymSet => ({
  id: r.id, sessionId: r.session_id, exerciseId: r.exercise_id, setNumber: r.set_number, reps: r.reps, weight: r.weight,
  durationSeconds: r.duration_seconds, distanceKm: r.distance_km,
  caloriesKcal: r.calories_kcal, avgSpeedKmh: r.avg_speed_kmh, maxSpeedKmh: r.max_speed_kmh,
  avgPaceMinKm: r.avg_pace_min_km, maxPaceMinKm: r.max_pace_min_km, avgHeartRate: r.avg_heart_rate, maxHeartRate: r.max_heart_rate,
  level: r.level, restSeconds: r.rest_seconds, isPr: r.is_pr, createdAt: r.created_at,
});
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export class PgGymRepository implements GymRepository {
  constructor(private db: Db) {}

  // ---- exercícios
  async listExercises(f: { q?: string; muscle?: Muscle; includeArchived?: boolean }) {
    const where: string[] = []; const params: unknown[] = [];
    if (!f.includeArchived) where.push('archived = false');
    if (f.q) { params.push(like(f.q)); where.push(`name ILIKE $${params.length}`); }
    if (f.muscle) { params.push(f.muscle); where.push(`($${params.length} = ANY(primary_muscles) OR $${params.length} = ANY(secondary_muscles))`); }
    const { rows } = await this.db.query(`SELECT * FROM gym_exercises ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name`, params);
    return rows.map(toExercise);
  }
  async getExercise(id: string) { const { rows } = await this.db.query('SELECT * FROM gym_exercises WHERE id = $1', [id]); return rows[0] ? toExercise(rows[0]) : null; }
  async getExercises(ids: string[]) {
    if (!ids.length) return [];
    const { rows } = await this.db.query('SELECT * FROM gym_exercises WHERE id = ANY($1::uuid[])', [ids]);
    return rows.map(toExercise);
  }
  async createExercise(d: ExerciseInput & { isCustom: boolean }) {
    const { rows } = await this.db.query(
      `INSERT INTO gym_exercises (name, primary_muscles, secondary_muscles, stabilizer_muscles, equipment, kind, instructions, tips, is_custom) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [d.name, d.primaryMuscles, d.secondaryMuscles, d.stabilizerMuscles, d.equipment, d.kind, d.instructions, d.tips, d.isCustom],
    );
    return toExercise(rows[0]);
  }
  async upsertCatalog(items: (ExerciseInput & { name: string })[]) {
    let created = 0, updated = 0;
    for (const d of items) {
      // O índice único é em lower(name); só exercícios do catálogo (is_custom = false) colidem por nome com o catálogo,
      // já que um exercício do usuário com o mesmo nome já teria sido recusado na criação. Seguro atualizar sem checar is_custom.
      const r = await this.db.query(
        `INSERT INTO gym_exercises (name, primary_muscles, secondary_muscles, stabilizer_muscles, equipment, kind, instructions, tips, is_custom)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)
         ON CONFLICT ((lower(name))) DO UPDATE SET
           primary_muscles = EXCLUDED.primary_muscles, secondary_muscles = EXCLUDED.secondary_muscles, stabilizer_muscles = EXCLUDED.stabilizer_muscles,
           equipment = EXCLUDED.equipment, kind = EXCLUDED.kind, instructions = EXCLUDED.instructions, tips = EXCLUDED.tips, updated_at = now()
         WHERE gym_exercises.primary_muscles IS DISTINCT FROM EXCLUDED.primary_muscles
            OR gym_exercises.secondary_muscles IS DISTINCT FROM EXCLUDED.secondary_muscles
            OR gym_exercises.stabilizer_muscles IS DISTINCT FROM EXCLUDED.stabilizer_muscles
            OR gym_exercises.equipment IS DISTINCT FROM EXCLUDED.equipment
            OR gym_exercises.kind IS DISTINCT FROM EXCLUDED.kind
            OR gym_exercises.instructions IS DISTINCT FROM EXCLUDED.instructions
            OR gym_exercises.tips IS DISTINCT FROM EXCLUDED.tips
         RETURNING (xmax = 0) AS inserted`,
        [d.name, d.primaryMuscles, d.secondaryMuscles, d.stabilizerMuscles, d.equipment, d.kind, d.instructions, d.tips],
      );
      if (r.rows[0]?.inserted) created++; else if (r.rowCount) updated++;
    }
    return { created, updated };
  }
  async updateExercise(id: string, patch: Partial<ExerciseInput>) {
    const row = await updateRow(this.db, 'gym_exercises', 'id', id, patch, ['name', 'primaryMuscles', 'secondaryMuscles', 'stabilizerMuscles', 'equipment', 'kind', 'instructions', 'tips']);
    return row ? toExercise(row) : null;
  }
  async removeExercise(id: string) {
    const used = await this.db.query('SELECT (EXISTS (SELECT 1 FROM gym_sets WHERE exercise_id = $1) OR EXISTS (SELECT 1 FROM gym_workout_exercises WHERE exercise_id = $1)) AS used', [id]);
    if (used.rows[0].used) { const r = await this.db.query('UPDATE gym_exercises SET archived = true, updated_at = now() WHERE id = $1', [id]); return r.rowCount ? 'archived' : 'missing'; }
    const r = await this.db.query('DELETE FROM gym_exercises WHERE id = $1', [id]);
    return r.rowCount ? 'deleted' : 'missing';
  }
  async imageOf(id: string) {
    const { rows } = await this.db.query('SELECT image_storage, image_mime FROM gym_exercises WHERE id = $1', [id]);
    return rows[0]?.image_storage ? { storage: rows[0].image_storage, mime: rows[0].image_mime } : null;
  }
  async setImage(id: string, img: { storage: string; mime: string } | null) {
    await this.db.query('UPDATE gym_exercises SET image_storage = $2, image_mime = $3, updated_at = now() WHERE id = $1', [id, img?.storage ?? null, img?.mime ?? null]);
  }

  // ---- treinos
  private async withItems(rows: Record<string, any>[]): Promise<Workout[]> {
    if (!rows.length) return [];
    const { rows: items } = await this.db.query('SELECT * FROM gym_workout_exercises WHERE workout_id = ANY($1::uuid[]) ORDER BY position', [rows.map((r) => r.id)]);
    return rows.map((r) => ({
      id: r.id, name: r.name, notes: r.notes, weekdays: r.weekdays, archived: r.archived, createdAt: r.created_at,
      items: items.filter((i) => i.workout_id === r.id).map(toItem),
    }));
  }
  async listWorkouts(includeArchived = false) {
    const { rows } = await this.db.query(`SELECT * FROM gym_workouts ${includeArchived ? '' : 'WHERE archived = false'} ORDER BY created_at`);
    return this.withItems(rows);
  }
  async getWorkout(id: string) { const { rows } = await this.db.query('SELECT * FROM gym_workouts WHERE id = $1', [id]); return (await this.withItems(rows))[0] ?? null; }
  private async putItems(db: Db, workoutId: string, items: WorkoutItemInput[]) {
    await db.query('DELETE FROM gym_workout_exercises WHERE workout_id = $1', [workoutId]);
    for (const [i, it] of items.entries()) {
      await db.query('INSERT INTO gym_workout_exercises (workout_id, exercise_id, position, rest_seconds, note, targets) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
        [workoutId, it.exerciseId, i, it.restSeconds, it.note, JSON.stringify(it.targets)]);
    }
  }
  async createWorkout(w: WorkoutInput, items: WorkoutItemInput[]) {
    const id = await withTx(async (tx) => {
      const { rows } = await tx.query('INSERT INTO gym_workouts (name, notes, weekdays) VALUES ($1,$2,$3) RETURNING id', [w.name, w.notes, w.weekdays]);
      await this.putItems(tx, rows[0].id, items);
      return rows[0].id as string;
    });
    return (await this.getWorkout(id)) as Workout;
  }
  async updateWorkout(id: string, patch: Partial<WorkoutInput & { archived: boolean }>, items?: WorkoutItemInput[]) {
    const ok = await withTx(async (tx) => {
      const row = await updateRow(tx, 'gym_workouts', 'id', id, patch, ['name', 'notes', 'weekdays', 'archived']);
      if (!row) return false;
      if (items) await this.putItems(tx, id, items);
      return true;
    });
    return ok ? this.getWorkout(id) : null;
  }
  async deleteWorkout(id: string) { const r = await this.db.query('DELETE FROM gym_workouts WHERE id = $1', [id]); return (r.rowCount ?? 0) > 0; }

  // ---- sessões e séries
  async activeSession() { const { rows } = await this.db.query('SELECT * FROM gym_sessions WHERE ended_at IS NULL LIMIT 1'); return rows[0] ? toSession(rows[0]) : null; }
  async createSession(d: { workoutId: string | null; name: string }) {
    const { rows } = await this.db.query('INSERT INTO gym_sessions (workout_id, name) VALUES ($1,$2) RETURNING *', [d.workoutId, d.name]);
    return toSession(rows[0]);
  }
  async getSession(id: string) { const { rows } = await this.db.query('SELECT * FROM gym_sessions WHERE id = $1', [id]); return rows[0] ? toSession(rows[0]) : null; }
  async listSessions(limit: number, offset: number) {
    const { rows } = await this.db.query('SELECT * FROM gym_sessions ORDER BY started_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows.map(toSession);
  }
  async finishSession(id: string, d: { note?: string; level?: Level | null }) {
    const { rows } = await this.db.query(
      'UPDATE gym_sessions SET ended_at = now(), note = COALESCE($2, note), level = $3 WHERE id = $1 AND ended_at IS NULL RETURNING *',
      [id, d.note ?? null, d.level ?? null],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }
  async deleteSession(id: string) { const r = await this.db.query('DELETE FROM gym_sessions WHERE id = $1', [id]); return (r.rowCount ?? 0) > 0; }
  async setsOf(sessionIds: string[]) {
    if (!sessionIds.length) return [];
    const { rows } = await this.db.query('SELECT * FROM gym_sets WHERE session_id = ANY($1::uuid[]) ORDER BY created_at', [sessionIds]);
    return rows.map(toSet);
  }
  async getSet(id: string) { const { rows } = await this.db.query('SELECT * FROM gym_sets WHERE id = $1', [id]); return rows[0] ? toSet(rows[0]) : null; }
  async addSet(sessionId: string, s: SetInput, isPr: boolean) {
    const { rows } = await this.db.query(
      `INSERT INTO gym_sets (session_id, exercise_id, set_number, reps, weight, duration_seconds, distance_km, level, rest_seconds, is_pr)
       VALUES ($1,$2,(SELECT COALESCE(max(set_number), 0) + 1 FROM gym_sets WHERE session_id = $1 AND exercise_id = $2),$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [sessionId, s.exerciseId, s.reps, s.weight, s.durationSeconds ?? null, s.distanceKm ?? null, s.level, s.restSeconds, isPr],
    );
    return toSet(rows[0]);
  }
  async updateSet(id: string, patch: Partial<Pick<SetInput, 'reps' | 'weight' | 'durationSeconds' | 'distanceKm' | 'level' | 'restSeconds'> & CardioSetDetails>, isPr: boolean) {
    const row = await updateRow(this.db, 'gym_sets', 'id', id, { ...patch, isPr }, [
      'reps', 'weight', 'durationSeconds', 'distanceKm', 'level', 'restSeconds', 'isPr',
      'caloriesKcal', 'avgSpeedKmh', 'maxSpeedKmh', 'avgPaceMinKm', 'maxPaceMinKm', 'avgHeartRate', 'maxHeartRate',
    ], { touch: false });
    return row ? toSet(row) : null;
  }
  async deleteSet(id: string) { const r = await this.db.query('DELETE FROM gym_sets WHERE id = $1', [id]); return (r.rowCount ?? 0) > 0; }

  async previousSets(exerciseId: string, before: Date | null, excludeSetId: string | null): Promise<SetLike[]> {
    const { rows } = await this.db.query(
      `SELECT reps, weight FROM gym_sets WHERE exercise_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2) AND ($3::uuid IS NULL OR id <> $3)`,
      [exerciseId, before, excludeSetId],
    );
    return rows;
  }
  async history(exerciseId: string, timezone: string, limitSessions: number): Promise<HistorySet[]> {
    const { rows } = await this.db.query(
      `WITH recent AS (
         SELECT DISTINCT s.session_id, ss.started_at FROM gym_sets s JOIN gym_sessions ss ON ss.id = s.session_id
          WHERE s.exercise_id = $1 ORDER BY ss.started_at DESC LIMIT $3)
       SELECT s.session_id, to_char(r.started_at AT TIME ZONE $2, 'YYYY-MM-DD') AS date, s.created_at, s.reps, s.weight, s.duration_seconds, s.distance_km, s.is_pr, s.level
         FROM gym_sets s JOIN recent r ON r.session_id = s.session_id WHERE s.exercise_id = $1 ORDER BY r.started_at DESC, s.created_at`,
      [exerciseId, timezone, limitSessions],
    );
    return rows.map((r) => ({ sessionId: r.session_id, date: r.date, createdAt: r.created_at, reps: r.reps, weight: r.weight, durationSeconds: r.duration_seconds, distanceKm: r.distance_km, isPr: r.is_pr, level: r.level }));
  }
  async lastPerformance(exerciseId: string, excludeSessionId: string | null): Promise<SetLike[]> {
    const { rows } = await this.db.query(
      `SELECT s.reps, s.weight FROM gym_sets s WHERE s.exercise_id = $1 AND s.session_id = (
         SELECT s2.session_id FROM gym_sets s2 JOIN gym_sessions ss ON ss.id = s2.session_id
          WHERE s2.exercise_id = $1 AND ($2::uuid IS NULL OR s2.session_id <> $2) ORDER BY ss.started_at DESC LIMIT 1) ORDER BY s.created_at`,
      [exerciseId, excludeSessionId],
    );
    return rows;
  }
  async lastTrainedByMuscle() {
    const { rows } = await this.db.query(
      `SELECT m AS muscle, max(s.created_at) AS at FROM gym_sets s JOIN gym_exercises e ON e.id = s.exercise_id, unnest(e.primary_muscles) AS m GROUP BY m`);
    return Object.fromEntries(rows.map((r) => [r.muscle, new Date(r.at).toISOString()])) as Partial<Record<Muscle, string>>;
  }
  async muscleVolume(sinceDays: number) {
    const { rows } = await this.db.query(
      `SELECT m AS muscle, count(*)::int AS sets, COALESCE(sum(s.weight * s.reps), 0) AS volume
         FROM gym_sets s JOIN gym_exercises e ON e.id = s.exercise_id, unnest(e.primary_muscles) AS m
        WHERE s.created_at > now() - make_interval(days => $1) GROUP BY m ORDER BY volume DESC`, [sinceDays]);
    return rows.map((r) => ({ muscle: r.muscle as Muscle, sets: r.sets, volume: Math.round(r.volume) }));
  }
  async weeklyVolume(weeks: number, timezone: string) {
    const { rows } = await this.db.query(
      `SELECT to_char(date_trunc('week', ss.started_at AT TIME ZONE $2), 'YYYY-MM-DD') AS week,
              count(DISTINCT ss.id)::int AS sessions, count(s.id)::int AS sets, COALESCE(sum(s.weight * s.reps), 0) AS volume
         FROM gym_sessions ss LEFT JOIN gym_sets s ON s.session_id = ss.id
        WHERE ss.started_at > now() - make_interval(weeks => $1) GROUP BY 1 ORDER BY 1`, [weeks, timezone]);
    return rows.map((r) => ({ week: r.week, sessions: r.sessions, sets: r.sets, volume: Math.round(r.volume) }));
  }
  async allSets(timezone: string) {
    const { rows } = await this.db.query(
      `SELECT s.exercise_id, s.reps, s.weight, to_char(ss.started_at AT TIME ZONE $1, 'YYYY-MM-DD') AS date FROM gym_sets s JOIN gym_sessions ss ON ss.id = s.session_id WHERE s.reps > 0`, [timezone]);
    return rows.map((r) => ({ exerciseId: r.exercise_id as string, reps: r.reps as number, weight: r.weight as number, date: r.date as string }));
  }
  async sessionDates(sinceDays: number, timezone: string) {
    const { rows } = await this.db.query(
      `SELECT DISTINCT to_char(started_at AT TIME ZONE $2, 'YYYY-MM-DD') AS d FROM gym_sessions WHERE started_at > now() - make_interval(days => $1) ORDER BY 1`, [sinceDays, timezone]);
    return rows.map((r) => r.d as string);
  }
}
