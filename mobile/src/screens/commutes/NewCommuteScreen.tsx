import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Activity, CommuteDirection, NotifyChannel } from '../../api/types';
import { ChannelChecks } from '../../components/ChannelChecks';
import { Icon } from '../../components/Icon';
import { DIRECTION_LABEL, WEEKDAY_SHORT } from '../../lib/labels';
import { commuteBlock } from '../../lib/schedule';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NewCommute'>;
type RemindMode = 'none' | 'fixed' | 'before';
const REMIND_BEFORE_OPTIONS = [5, 10, 15, 30, 60] as const;

export function NewCommuteScreen({ navigation, route }: Props) {
  const c = route.params?.commute;
  const qc = useQueryClient();
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const fixedActivities = (activities.data ?? []).filter((a) => a.timeMode === 'fixed' && a.active);

  const [name, setName] = useState(c?.name ?? '');
  const [activityId, setActivityId] = useState(c?.activityId ?? '');
  const [direction, setDirection] = useState<CommuteDirection>(c?.direction ?? 'before');
  const [durationMin, setDurationMin] = useState(String(c?.durationMin ?? 30));
  const [active, setActive] = useState(c?.active ?? true);
  const [remindMode, setRemindMode] = useState<RemindMode>(c?.remindMinutes != null ? 'before' : c?.remindTime ? 'fixed' : 'none');
  const [remindTime, setRemindTime] = useState(c?.remindTime ?? '');
  const [remindBeforeMin, setRemindBeforeMin] = useState<(typeof REMIND_BEFORE_OPTIONS)[number]>(c?.remindMinutes ?? 15);
  const [remindChannels, setRemindChannels] = useState<NotifyChannel[]>(c?.remindChannels ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const activity = (activities.data ?? []).find((a) => a.id === activityId);
  const preview = useMemo(() => {
    if (!activity) return [];
    return activity.weekdays.map((d) => ({ d, block: commuteBlock(activity, d, direction, Number(durationMin) || 0) }));
  }, [activity, direction, durationMin]);

  async function submit() {
    if (!name.trim() || !activityId) return setErr('Dê um nome e escolha uma atividade âncora.');
    setErr(null); setBusy(true);
    const payload = {
      name: name.trim(), activityId, direction, durationMin: Number(durationMin) || 30, active,
      remindTime: remindMode === 'fixed' ? (remindTime || null) : null,
      remindMinutes: remindMode === 'before' ? remindBeforeMin : null,
      remindChannels: remindMode !== 'none' ? remindChannels : [],
    };
    try {
      if (c) await api.patch(`/commutes/${c.id}`, payload);
      else await api.post('/commutes', payload);
      await qc.invalidateQueries({ queryKey: ['commutes'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!c) return;
    Alert.alert('Apagar deslocamento?', `Apagar "${c.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!c) return;
    setBusy(true);
    try { await api.del(`/commutes/${c.id}`); await qc.invalidateQueries({ queryKey: ['commutes'] }); navigation.goBack(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui apagar.'); }
    finally { setBusy(false); }
  }

  if (activities.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nome</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="ex.: Ida à academia" autoFocus={!c} />

      <Text style={styles.label}>Atividade âncora</Text>
      {fixedActivities.length === 0 ? (
        <Text style={styles.hint}>Nenhuma atividade com horário definido ainda. Crie uma em Atividades primeiro e volte aqui.</Text>
      ) : (
        <View style={styles.chipRow}>
          {fixedActivities.map((a) => (
            <TouchableOpacity key={a.id} style={[styles.chip, activityId === a.id && styles.chipOn]} onPress={() => setActivityId(a.id)}>
              <Text style={[styles.chipText, activityId === a.id && styles.chipTextOn]}>{a.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Direção</Text>
          <View style={styles.chipRow}>
            {(Object.keys(DIRECTION_LABEL) as CommuteDirection[]).map((d) => (
              <TouchableOpacity key={d} style={[styles.chip, direction === d && styles.chipOn]} onPress={() => setDirection(d)}>
                <Text style={[styles.chipText, direction === d && styles.chipTextOn]}>{d === 'before' ? 'Ida' : 'Volta'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.label}>Duração (min)</Text>
      <TextInput style={styles.input} value={durationMin} onChangeText={setDurationMin} keyboardType="number-pad" />

      <TouchableOpacity style={styles.checkRow} onPress={() => setActive((v) => !v)}>
        <Icon name={active ? 'check' : 'x'} size={16} color={active ? colors.ideal : colors.inkSoft} />
        <Text style={styles.checkText}>Ativo (desmarque para pausar sem apagar)</Text>
      </TouchableOpacity>

      {preview.length > 0 && (
        <Text style={styles.hint}>
          Prévia: {preview.map(({ d, block }) => `${WEEKDAY_SHORT[d]} ${block ? `${block.startTime}–${block.endTime}` : 'sem horário'}`).join(', ')}
        </Text>
      )}

      <View style={styles.block}>
        <Text style={styles.fieldLegend}>Lembrete</Text>
        <Text style={styles.hint}>Só avisa quando o deslocamento se aplica naquele dia.</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity style={[styles.chip, remindMode === 'none' && styles.chipOn]} onPress={() => setRemindMode('none')}><Text style={[styles.chipText, remindMode === 'none' && styles.chipTextOn]}>Sem lembrete</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.chip, remindMode === 'fixed' && styles.chipOn]} onPress={() => setRemindMode('fixed')}><Text style={[styles.chipText, remindMode === 'fixed' && styles.chipTextOn]}>Horário fixo</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.chip, remindMode === 'before' && styles.chipOn]} onPress={() => setRemindMode('before')}><Text style={[styles.chipText, remindMode === 'before' && styles.chipTextOn]}>Antes do horário</Text></TouchableOpacity>
        </View>
        {remindMode === 'fixed' && (
          <>
            <Text style={styles.label}>Avisar às</Text>
            <TextInput style={styles.input} value={remindTime} onChangeText={setRemindTime} placeholder="HH:MM" />
          </>
        )}
        {remindMode === 'before' && (
          <View style={styles.chipRow}>
            {REMIND_BEFORE_OPTIONS.map((m) => (
              <TouchableOpacity key={m} style={[styles.chip, remindBeforeMin === m && styles.chipOn]} onPress={() => setRemindBeforeMin(m)}>
                <Text style={[styles.chipText, remindBeforeMin === m && styles.chipTextOn]}>{m < 60 ? `${m} min antes` : '1 h antes'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {remindMode !== 'none' && <ChannelChecks value={remindChannels} onChange={setRemindChannels} />}
      </View>

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar'}</Text>
      </TouchableOpacity>
      {c && (
        <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
          <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar deslocamento</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  hint: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.xs },
  fieldLegend: { fontSize: 13, fontWeight: '700', color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  row2: { flexDirection: 'row', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  checkText: { fontSize: 13, color: colors.ink, flex: 1 },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginTop: spacing.md, gap: spacing.xs },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md, paddingVertical: 10 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
