import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Principle, PrincipleFolder } from '../../api/types';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NewPrinciple'>;

export function NewPrincipleScreen({ navigation, route }: Props) {
  const p = route.params?.principle;
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ['principles', 'folders'], queryFn: () => api.get<PrincipleFolder[]>('/principles/folders') });
  const [title, setTitle] = useState(p?.title ?? '');
  const [content, setContent] = useState(p?.content ?? '');
  const [folderId, setFolderId] = useState<string | null>(p?.folderId ?? route.params?.folderId ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) return setErr('Dê um título ao princípio.');
    setErr(null); setBusy(true);
    try {
      const payload = { title: title.trim(), content, folderId };
      if (p) await api.patch(`/principles/${p.id}`, payload);
      else await api.post('/principles', payload);
      await qc.invalidateQueries({ queryKey: ['principles'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!p) return;
    Alert.alert('Apagar princípio?', `Apagar "${p.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!p) return;
    setBusy(true);
    try { await api.del(`/principles/${p.id}`); await qc.invalidateQueries({ queryKey: ['principles'] }); navigation.goBack(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui apagar.'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Título</Text>
      <TextInput style={styles.input} value={title ?? ''} onChangeText={setTitle} placeholder="ex.: Eu cumpro o que prometo" autoFocus={!p} />

      <Text style={styles.label}>Conteúdo (opcional)</Text>
      <TextInput style={[styles.input, styles.textarea]} value={content ?? ''} onChangeText={setContent} multiline numberOfLines={5} placeholder="Desenvolva a ideia, se quiser…" />

      <Text style={styles.label}>Pasta</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, folderId === null && styles.chipOn]} onPress={() => setFolderId(null)}>
          <Text style={[styles.chipText, folderId === null && styles.chipTextOn]}>Sem pasta</Text>
        </TouchableOpacity>
        {(folders.data ?? []).map((f) => (
          <TouchableOpacity key={f.id} style={[styles.chip, folderId === f.id && styles.chipOn]} onPress={() => setFolderId(f.id)}>
            <Text style={[styles.chipText, folderId === f.id && styles.chipTextOn]}>{f.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar'}</Text>
      </TouchableOpacity>
      {p && (
        <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
          <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar princípio</Text>
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
  textarea: { minHeight: 100, textAlignVertical: 'top' },
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
