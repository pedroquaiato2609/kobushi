import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Activity, BoardFull } from '../../api/types';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'CardDetail'>;

/** Descrição em texto simples (o app web usa um editor rico; aqui ainda não há essa dependência instalada). */
export function CardDetailScreen({ navigation, route }: Props) {
  const { card, board: boardRef } = route.params;
  const qc = useQueryClient();
  const board = useQuery({ queryKey: ['board', boardRef.id], queryFn: () => api.get<BoardFull>(`/boards/${boardRef.id}`) });
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [dueDate, setDueDate] = useState(card.dueDate ?? '');
  const [activityId, setActivityId] = useState(card.activityId ?? '');
  const [columnId, setColumnId] = useState(card.columnId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) return setErr('Dê um título ao card.');
    setErr(null); setBusy(true);
    try {
      await api.patch(`/cards/${card.id}`, { title: title.trim(), description, dueDate: dueDate || null, activityId: activityId || null });
      if (columnId !== card.columnId) await api.post(`/cards/${card.id}/move`, { columnId });
      await qc.invalidateQueries({ queryKey: ['board', boardRef.id] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Apagar card?', `Apagar "${card.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    setBusy(true);
    try { await api.del(`/cards/${card.id}`); await qc.invalidateQueries({ queryKey: ['board', boardRef.id] }); navigation.goBack(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui apagar.'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Título</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} autoFocus />

      <Text style={styles.label}>Descrição</Text>
      <TextInput style={[styles.input, styles.textarea]} value={description} onChangeText={setDescription} multiline numberOfLines={5} />

      <Text style={styles.label}>Coluna</Text>
      <View style={styles.chipRow}>
        {(board.data?.columns ?? []).map((c) => (
          <TouchableOpacity key={c.id} style={[styles.chip, columnId === c.id && styles.chipOn]} onPress={() => setColumnId(c.id)}>
            <Text style={[styles.chipText, columnId === c.id && styles.chipTextOn]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Prazo (AAAA-MM-DD, opcional)</Text>
      <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="2026-10-15" />

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

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
        <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar card</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
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
