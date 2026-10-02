import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { NotifyChannel, Repeat } from '../../api/types';
import { ChannelChecks } from '../../components/ChannelChecks';
import { Icon } from '../../components/Icon';
import { REPEAT_LABEL } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NewReminder'>;

function defaultAt(): string {
  const d = new Date(Date.now() + 3600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function NewReminderScreen({ navigation, route }: Props) {
  const r = route.params?.reminder;
  const qc = useQueryClient();
  const [title, setTitle] = useState(r?.title ?? '');
  const [body, setBody] = useState(r?.body ?? '');
  const [at, setAt] = useState(r?.remindAt ?? defaultAt());
  const [repeat, setRepeat] = useState<Repeat>(r?.repeat ?? 'none');
  const [channels, setChannels] = useState<NotifyChannel[]>(r?.channels ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !at) return setErr('Preencha o título e a data/hora.');
    setErr(null); setBusy(true);
    try {
      const payload = { title: title.trim(), body, at, repeat, channels };
      if (r) await api.patch(`/reminders/${r.id}`, payload);
      else await api.post('/reminders', payload);
      await qc.invalidateQueries({ queryKey: ['reminders'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!r) return;
    Alert.alert('Apagar lembrete?', `Apagar "${r.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!r) return;
    setBusy(true);
    try { await api.del(`/reminders/${r.id}`); await qc.invalidateQueries({ queryKey: ['reminders'] }); navigation.goBack(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui apagar.'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Me lembre de</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="ex.: ligar para o banco" autoFocus={!r} />

      <Text style={styles.label}>Quando (AAAA-MM-DD HH:MM)</Text>
      <TextInput style={styles.input} value={at.replace('T', ' ')} onChangeText={(v) => setAt(v.replace(' ', 'T'))} placeholder="2026-10-05 15:00" />

      <Text style={styles.label}>Repetir</Text>
      <View style={styles.chipRow}>
        {(Object.keys(REPEAT_LABEL) as Repeat[]).map((rp) => (
          <TouchableOpacity key={rp} style={[styles.chip, repeat === rp && styles.chipOn]} onPress={() => setRepeat(rp)}>
            <Text style={[styles.chipText, repeat === rp && styles.chipTextOn]}>{REPEAT_LABEL[rp]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Detalhe (opcional)</Text>
      <TextInput style={[styles.input, styles.textarea]} value={body} onChangeText={setBody} multiline numberOfLines={3} />

      <Text style={styles.label}>Onde avisar</Text>
      <ChannelChecks value={channels} onChange={setChannels} />

      {r?.status === 'done' && <Text style={styles.hint}>Este lembrete já foi avisado. Salvar com uma nova data o reativa.</Text>}
      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar'}</Text>
      </TouchableOpacity>
      {r && (
        <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
          <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar lembrete</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  hint: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
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
