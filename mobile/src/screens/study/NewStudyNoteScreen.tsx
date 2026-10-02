import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { StudyFolder } from '../../api/types';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NewStudyNote'>;

/**
 * Conteúdo em texto simples: o app web usa um editor rico (TipTap, que guarda HTML) — essa dependência
 * ainda não existe no mobile. Uma nota criada/editada aqui fica sem formatação; abrir ela depois no app
 * web mostra o texto puro em vez de formatado.
 */
export function NewStudyNoteScreen({ navigation, route }: Props) {
  const n = route.params?.note;
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ['study', 'folders'], queryFn: () => api.get<StudyFolder[]>('/study/folders') });
  const [title, setTitle] = useState(n?.title ?? '');
  const [content, setContent] = useState(n?.content ?? '');
  const [folderId, setFolderId] = useState<string | null>(n?.folderId ?? route.params?.folderId ?? null);
  const [tags, setTags] = useState((n?.tags ?? []).join(', '));
  const [pinned, setPinned] = useState(n?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) return setErr('Dê um título à nota.');
    setErr(null); setBusy(true);
    try {
      const payload = { title: title.trim(), content, folderId, pinned, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) };
      if (n) await api.patch(`/study/notes/${n.id}`, payload);
      else await api.post('/study/notes', payload);
      await qc.invalidateQueries({ queryKey: ['study', 'notes'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!n) return;
    Alert.alert('Apagar nota?', `Apagar "${n.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!n) return;
    setBusy(true);
    try { await api.del(`/study/notes/${n.id}`); await qc.invalidateQueries({ queryKey: ['study', 'notes'] }); navigation.goBack(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui apagar.'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Título</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} autoFocus={!n} />

      <Text style={styles.label}>Conteúdo</Text>
      <TextInput style={[styles.input, styles.textarea]} value={content} onChangeText={setContent} multiline numberOfLines={10} />

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

      <Text style={styles.label}>Tags (separadas por vírgula)</Text>
      <TextInput style={styles.input} value={tags} onChangeText={setTags} placeholder="ex.: cálculo, prova2" />

      <TouchableOpacity style={styles.checkRow} onPress={() => setPinned((v) => !v)}>
        <Icon name="pin" size={16} color={pinned ? colors.accent : colors.inkSoft} />
        <Text style={styles.checkText}>Fixar no topo</Text>
      </TouchableOpacity>

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar'}</Text>
      </TouchableOpacity>
      {n && (
        <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
          <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar nota</Text>
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
  textarea: { minHeight: 140, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  checkText: { fontSize: 13, color: colors.ink },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md, paddingVertical: 10 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
