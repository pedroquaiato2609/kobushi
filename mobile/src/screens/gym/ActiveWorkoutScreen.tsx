import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { GymActive, GymExercise, GymPlanItem } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { estimate1rm, EQUIPMENT_LABEL, fmtClock, fmtKg, MUSCLE_LABEL } from '../../lib/gym';
import { colors, radius, spacing } from '../../theme';
import type { GymStackParamList } from '../../navigation/GymStack';

type Props = NativeStackScreenProps<GymStackParamList, 'ActiveWorkout'>;

// Cronômetro isolado: o tick de 1s em 1s fica só aqui, não no componente de cima — senão a tela
// inteira (todos os cards de exercício, inputs em edição etc.) re-renderizaria a cada segundo.
function ElapsedClock({ startedAt, totalSets, prs }: { startedAt: string; totalSets: number; prs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return <Text style={styles.topBarStats}>{fmtClock(elapsed)} · {totalSets} série(s){prs > 0 ? ` · 🏆 ${prs}` : ''}</Text>;
}

const toNum = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

// Uma série de musculação: carga + repetições. Semente: última série logada nesta sessão → melhor
// desempenho histórico → meta (ideal, senão mín./máx.) → 0 — mesma ordem do app web.
function StrengthSets({ item, sessionId, onLogged }: { item: GymPlanItem; sessionId: string; onLogged: () => void }) {
  const target = item.targets.ideal ?? item.targets.min ?? item.targets.max ?? null;
  const seed = item.last.at(-1) ?? (item.best.weight > 0 ? { weight: item.best.weight, reps: target?.reps ?? 10 } : null) ?? target;
  const [weight, setWeight] = useState(String(seed?.weight ?? 0).replace('.', ','));
  const [reps, setReps] = useState(String(seed?.reps ?? 10));
  const [busy, setBusy] = useState(false);

  async function submit() {
    const w = toNum(weight); const r = toNum(reps);
    if (!Number.isFinite(w) || w < 0 || !Number.isFinite(r) || r < 1) return;
    setBusy(true);
    try {
      await api.post(`/gym/sessions/${sessionId}/sets`, { exerciseId: item.exercise.id, weight: w, reps: Math.round(r), restSeconds: item.restSeconds });
      onLogged();
    } finally { setBusy(false); }
  }

  return (
    <>
      {item.sets.length > 0 && (
        <View style={styles.setList}>
          {item.sets.map((s) => (
            <View key={s.id} style={styles.setRow}>
              <Text style={styles.setN}>{s.setNumber}</Text>
              <Text style={styles.setMain}>{fmtKg(s.weight)} × {s.reps}</Text>
              <Text style={styles.setSub}>1RM {fmtKg(estimate1rm(s.weight, s.reps))}</Text>
              {s.isPr && <Text style={styles.prBadge}>🏆 PR</Text>}
            </View>
          ))}
        </View>
      )}
      <View style={styles.logRow}>
        <View style={styles.logField}>
          <Text style={styles.logLabel}>Carga (kg)</Text>
          <TextInput style={styles.logInput} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
        </View>
        <View style={styles.logField}>
          <Text style={styles.logLabel}>Repetições</Text>
          <TextInput style={styles.logInput} value={reps} onChangeText={setReps} keyboardType="number-pad" />
        </View>
        <TouchableOpacity style={[styles.logBtn, busy && styles.logBtnDisabled]} disabled={busy} onPress={() => void submit()}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.logBtnText}>Concluir série {item.sets.length + 1}</Text>}
        </TouchableOpacity>
      </View>
    </>
  );
}

// Cardio: sessão única (esteira contínua etc., feito uma vez) ou em várias séries (tiros, circuito...).
function CardioSets({ item, sessionId, onLogged }: { item: GymPlanItem; sessionId: string; onLogged: () => void }) {
  const singleSession = item.exercise.singleSession;
  const done = singleSession && item.sets.length >= 1;
  const [minutes, setMinutes] = useState('20');
  const [km, setKm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const min = toNum(minutes);
    if (!Number.isFinite(min) || min <= 0) return;
    const distance = km.trim() === '' ? undefined : toNum(km);
    setBusy(true);
    try {
      await api.post(`/gym/sessions/${sessionId}/sets`, {
        exerciseId: item.exercise.id, durationSeconds: Math.round(min * 60),
        distanceKm: distance !== undefined && Number.isFinite(distance) && distance > 0 ? distance : undefined,
        restSeconds: item.restSeconds,
      });
      onLogged();
    } finally { setBusy(false); }
  }

  return (
    <>
      {item.sets.length > 0 && (
        <View style={styles.setList}>
          {item.sets.map((s) => (
            <View key={s.id} style={styles.setRow}>
              <Text style={styles.setN}>{s.setNumber}</Text>
              <Text style={styles.setMain}>{Math.round((s.durationSeconds ?? 0) / 60)} min{s.distanceKm ? ` · ${s.distanceKm} km` : ''}</Text>
            </View>
          ))}
        </View>
      )}
      {done ? (
        <Text style={styles.hint}>Sessão registrada — apague a série acima pra refazer.</Text>
      ) : (
        <View style={styles.logRow}>
          <View style={styles.logField}>
            <Text style={styles.logLabel}>Minutos</Text>
            <TextInput style={styles.logInput} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
          </View>
          <View style={styles.logField}>
            <Text style={styles.logLabel}>Km (opcional)</Text>
            <TextInput style={styles.logInput} value={km} onChangeText={setKm} keyboardType="decimal-pad" />
          </View>
          <TouchableOpacity style={[styles.logBtn, busy && styles.logBtnDisabled]} disabled={busy} onPress={() => void submit()}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.logBtnText}>{singleSession ? 'Concluir treino' : `Concluir série ${item.sets.length + 1}`}</Text>}
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const ExerciseCard = memo(function ExerciseCard({ item, sessionId, onLogged, onRemoveExtra }: { item: GymPlanItem; sessionId: string; onLogged: () => void; onRemoveExtra?: () => void }) {
  const cardio = item.exercise.kind === 'cardio';
  const singleSession = cardio && item.exercise.singleSession;
  const done = singleSession && item.sets.length >= 1;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.exercise.name}</Text>
          <Text style={styles.cardSub}>{item.exercise.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} · {EQUIPMENT_LABEL[item.exercise.equipment]}</Text>
        </View>
        {singleSession ? (
          done
            ? <View style={styles.doneRow}><Icon name="check" size={13} color={colors.ideal} /><Text style={styles.countBadgeDone}>feito</Text></View>
            : <Text style={styles.countBadge}>pendente</Text>
        ) : (
          <Text style={styles.countBadge}>{item.sets.length} série(s)</Text>
        )}
        {onRemoveExtra && item.sets.length === 0 && (
          <TouchableOpacity onPress={onRemoveExtra} style={styles.removeBtn}><Icon name="x" size={14} color={colors.inkSoft} /></TouchableOpacity>
        )}
      </View>
      {cardio
        ? <CardioSets item={item} sessionId={sessionId} onLogged={onLogged} />
        : <StrengthSets item={item} sessionId={sessionId} onLogged={onLogged} />}
    </View>
  );
});

export function ActiveWorkoutScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const active = useQuery({ queryKey: ['gym-active'], queryFn: () => api.get<GymActive | null>('/gym/sessions/active'), refetchInterval: false });
  const [extras, setExtras] = useState<GymExercise[]>([]);

  if (active.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (active.error) return <QueryError error={active.error} onRetry={() => void active.refetch()} />;
  if (!active.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardSub}>Nenhum treino em andamento.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.popToTop()}><Text style={styles.backBtnText}>Voltar</Text></TouchableOpacity>
      </View>
    );
  }

  const d = active.data;
  const planIds = new Set(d.plan.map((p) => p.exercise.id));
  const extraItems: GymPlanItem[] = extras.filter((e) => !planIds.has(e.id)).map((e) => ({
    exercise: e, restSeconds: 90, note: '', targets: {}, planned: false, last: [], best: { weight: 0, e1rm: 0 }, sets: [], levelReached: null,
  }));
  const items = [...d.plan, ...extraItems];

  const onLogged = useCallback(() => { void qc.invalidateQueries({ queryKey: ['gym-active'] }); }, [qc]);

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarName}>{d.session.name}</Text>
          <ElapsedClock startedAt={d.session.startedAt} totalSets={d.totalSets} prs={d.prs} />
        </View>
        <TouchableOpacity style={styles.finishBtn} onPress={() => navigation.navigate('FinishWorkout', { active: d })}>
          <Text style={styles.finishBtnText}>Finalizar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {items.length === 0 && <Text style={styles.hint}>Treino livre: escolha o primeiro exercício para começar.</Text>}
        {items.map((item) => (
          <ExerciseCard
            key={item.exercise.id} item={item} sessionId={d.session.id} onLogged={onLogged}
            onRemoveExtra={!item.planned && item.sets.length === 0 ? () => setExtras((l) => l.filter((x) => x.id !== item.exercise.id)) : undefined}
          />
        ))}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('ExercisePicker', { exclude: items.map((i) => i.exercise.id), onPick: (e) => setExtras((l) => [...l, e]) })}
        >
          <Icon name="plus" size={15} color={colors.accent} /><Text style={styles.addBtnText}>Adicionar exercício</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  backBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: spacing.lg },
  backBtnText: { color: '#fff', fontWeight: '700' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  topBarName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  topBarStats: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  finishBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: spacing.lg },
  finishBtnText: { color: '#fff', fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  hint: { fontSize: 13, color: colors.inkSoft },
  card: { backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardSub: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  countBadge: { fontSize: 11, color: colors.inkSoft, fontWeight: '700' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  countBadgeDone: { fontSize: 11, color: colors.ideal, fontWeight: '700' },
  removeBtn: { padding: 4 },
  setList: { gap: 4 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  setN: { fontSize: 11, color: colors.inkSoft, width: 16 },
  setMain: { fontSize: 13, fontWeight: '700', color: colors.ink },
  setSub: { fontSize: 11, color: colors.inkSoft, flex: 1 },
  prBadge: { fontSize: 11 },
  logRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  logField: { flex: 1, gap: 4 },
  logLabel: { fontSize: 11, color: colors.inkSoft },
  logInput: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 8, fontSize: 15, color: colors.ink, backgroundColor: colors.surface2 },
  logBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: spacing.sm, minWidth: 100, alignItems: 'center' },
  logBtnDisabled: { opacity: 0.7 },
  logBtnText: { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.accent, borderRadius: radius, padding: spacing.md },
  addBtnText: { color: colors.accent, fontWeight: '700' },
});
