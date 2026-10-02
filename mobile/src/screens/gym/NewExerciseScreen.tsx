import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import { MUSCLES, type GymEquipment, type GymExerciseKind, type Muscle } from '../../api/types';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../../lib/gym';
import { colors, radius, spacing } from '../../theme';
import type { GymStackParamList } from '../../navigation/GymStack';

type Props = NativeStackScreenProps<GymStackParamList, 'NewExercise'>;
const STRENGTH_EQUIPMENT: GymEquipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'other'];
const CARDIO_EQUIPMENT: GymEquipment[] = ['treadmill', 'bike', 'stairs', 'rowing_machine', 'elliptical', 'jump_rope', 'pool'];

export function NewExerciseScreen({ navigation, route }: Props) {
  const exercise = route.params?.exercise;
  const qc = useQueryClient();
  const [name, setName] = useState(exercise?.name ?? '');
  const [kind, setKind] = useState<GymExerciseKind>(exercise?.kind ?? 'strength');
  const [primary, setPrimary] = useState<Muscle[]>(exercise?.primaryMuscles ?? []);
  const [equipment, setEquipment] = useState<GymEquipment>(exercise?.equipment ?? 'machine');
  const [singleSession, setSingleSession] = useState(exercise?.singleSession ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleMuscle(m: Muscle) {
    setPrimary((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : cur.length >= 4 ? cur : [...cur, m]));
  }

  async function submit() {
    if (!name.trim()) return setErr('Dê um nome ao exercício.');
    if (primary.length === 0) return setErr('Escolha ao menos um músculo principal.');
    setErr(null); setBusy(true);
    try {
      const body = { name: name.trim(), kind, primaryMuscles: primary, equipment, singleSession: kind === 'cardio' ? singleSession : undefined };
      if (exercise) await api.patch(`/gym/exercises/${exercise.id}`, body);
      else await api.post('/gym/exercises', body);
      await qc.invalidateQueries({ queryKey: ['gym-exercises'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!exercise) return;
    Alert.alert('Apagar exercício?', `"${exercise.name}" — se já tiver histórico ou estiver em algum treino, fica arquivado em vez de apagado (o histórico não se perde).`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!exercise) return;
    setBusy(true);
    try {
      await api.del(`/gym/exercises/${exercise.id}`);
      await qc.invalidateQueries({ queryKey: ['gym-exercises'] });
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  }

  const equipmentOptions = kind === 'strength' ? STRENGTH_EQUIPMENT : CARDIO_EQUIPMENT;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nome</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex.: Supino inclinado" autoFocus={!exercise} />

      <Text style={styles.label}>Tipo</Text>
      <View style={styles.seg}>
        <TouchableOpacity style={[styles.segBtn, kind === 'strength' && styles.segBtnOn]} onPress={() => { setKind('strength'); setEquipment('machine'); }}>
          <Text style={[styles.segText, kind === 'strength' && styles.segTextOn]}>Musculação</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segBtn, kind === 'cardio' && styles.segBtnOn]} onPress={() => { setKind('cardio'); setEquipment('treadmill'); }}>
          <Text style={[styles.segText, kind === 'cardio' && styles.segTextOn]}>Cardio</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Equipamento</Text>
      <View style={styles.chipRow}>
        {equipmentOptions.map((eq) => (
          <TouchableOpacity key={eq} style={[styles.chip, equipment === eq && styles.chipOn]} onPress={() => setEquipment(eq)}>
            <Text style={[styles.chipText, equipment === eq && styles.chipTextOn]}>{EQUIPMENT_LABEL[eq]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {kind === 'cardio' && (
        <TouchableOpacity style={styles.checkRow} onPress={() => setSingleSession((s) => !s)}>
          <View style={[styles.checkbox, singleSession && styles.checkboxOn]} />
          <Text style={styles.checkLabel}>Sessão única (feito uma vez só no treino, ex.: esteira contínua)</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.label}>Músculo(s) principal(is) — até 4</Text>
      <View style={styles.chipRow}>
        {MUSCLES.map((m) => (
          <TouchableOpacity key={m} style={[styles.chip, primary.includes(m) && styles.chipOn]} onPress={() => toggleMuscle(m)}>
            <Text style={[styles.chipText, primary.includes(m) && styles.chipTextOn]}>{MUSCLE_LABEL[m]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{exercise ? 'Salvar' : 'Criar exercício'}</Text>}
      </TouchableOpacity>
      {exercise && exercise.isCustom && (
        <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
          <Text style={styles.deleteBtnText}>Apagar exercício</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  seg: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segBtnOn: { backgroundColor: colors.surface },
  segText: { color: colors.inkSoft, fontWeight: '600' },
  segTextOn: { color: colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft },
  chipTextOn: { color: colors.accent, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.lineStrong },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkLabel: { fontSize: 12, color: colors.ink, flex: 1 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  deleteBtnText: { color: colors.danger, fontWeight: '600', fontSize: 13 },
});
