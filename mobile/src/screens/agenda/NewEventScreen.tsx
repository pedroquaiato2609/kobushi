import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Activity, NotifyChannel } from '../../api/types';
import { ChannelChecks } from '../../components/ChannelChecks';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NewEvent'>;
const REMIND_OPTIONS: [number, string][] = [[5, '5 minutos antes'], [10, '10 minutos antes'], [15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 dia antes']];

function defaultStart(): string {
  const d = new Date(Date.now() + 3600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`;
}
function plusHour(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  d.setHours(d.getHours() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function NewEventScreen({ navigation, route }: Props) {
  const event = route.params?.event;
  const initial = event?.start ?? route.params?.initialStart ?? defaultStart();
  const qc = useQueryClient();
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });

  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [start, setStart] = useState(initial);
  const [end, setEnd] = useState(event?.end ?? plusHour(initial));
  const [activityId, setActivityId] = useState(event?.activityId ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [remind, setRemind] = useState<string>(event?.remindMinutes != null ? String(event.remindMinutes) : '');
  const [channels, setChannels] = useState<NotifyChannel[]>(event?.remindChannels ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !start || !end) return setErr('Preencha o título, o início e o fim.');
    setErr(null); setBusy(true);
    try {
      const payload = {
        title: title.trim(), description, start, end, activityId: activityId || null,
        location: location.trim(), remindMinutes: remind === '' ? null : Number(remind), remindChannels: remind === '' ? [] : channels,
      };
      if (event) await api.patch(`/events/${event.id}`, payload);
      else await api.post('/events', payload);
      await qc.invalidateQueries({ queryKey: ['events'] });
      await qc.invalidateQueries({ queryKey: ['day'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!event) return;
    Alert.alert('Apagar evento?', `Apagar "${event.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!event) return;
    setBusy(true);
    try { await api.del(`/events/${event.id}`); await qc.invalidateQueries({ queryKey: ['events'] }); navigation.goBack(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui apagar.'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Título</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} autoFocus={!event} />

      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Início (AAAA-MM-DD HH:MM)</Text>
          <TextInput style={styles.input} value={start.replace('T', ' ')} onChangeText={(v) => setStart(v.replace(' ', 'T'))} placeholder="2026-10-05 15:00" />
        </View>
      </View>
      <Text style={styles.label}>Fim (AAAA-MM-DD HH:MM)</Text>
      <TextInput style={styles.input} value={end.replace('T', ' ')} onChangeText={(v) => setEnd(v.replace(' ', 'T'))} placeholder="2026-10-05 16:00" />

      <Text style={styles.label}>Local (opcional)</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="ex.: Farmácia, Mercado, Clínica…" />

      <Text style={styles.label}>Avisar</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, remind === '' && styles.chipOn]} onPress={() => setRemind('')}>
          <Text style={[styles.chipText, remind === '' && styles.chipTextOn]}>Sem aviso</Text>
        </TouchableOpacity>
        {REMIND_OPTIONS.map(([m, label]) => (
          <TouchableOpacity key={m} style={[styles.chip, remind === String(m) && styles.chipOn]} onPress={() => setRemind(String(m))}>
            <Text style={[styles.chipText, remind === String(m) && styles.chipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {remind !== '' && <ChannelChecks value={channels} onChange={setChannels} />}

      <Text style={styles.label}>Atividade relacionada (opcional)</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, !activityId && styles.chipOn]} onPress={() => setActivityId('')}>
          <Text style={[styles.chipText, !activityId && styles.chipTextOn]}>Nenhuma</Text>
        </TouchableOpacity>
        {(activities.data ?? []).map((a) => (
          <TouchableOpacity key={a.id} style={[styles.chip, activityId === a.id && styles.chipOn]} onPress={() => setActivityId(a.id)}>
            <Text style={[styles.chipText, activityId === a.id && styles.chipTextOn]}>{a.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Descrição</Text>
      <TextInput style={[styles.input, styles.textarea]} value={description} onChangeText={setDescription} multiline numberOfLines={3} />

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar'}</Text>
      </TouchableOpacity>
      {event && (
        <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
          <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar evento</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md, paddingVertical: 10 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
