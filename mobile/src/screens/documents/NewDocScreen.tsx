import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import { API_BASE_URL } from '../../config';
import type { Doc, Folder } from '../../api/types';
import { Icon } from '../../components/Icon';
import { parseList, serializeList, type ListLine } from '../../lib/checklist';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NewDoc'>;

const fmtSize = (n: number | null) => (n === null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function NewDocScreen({ navigation, route }: Props) {
  const { docId } = route.params ?? {};
  const qc = useQueryClient();
  const doc = useQuery({ queryKey: ['document', docId], queryFn: () => api.get<Doc>(`/documents/${docId}`), enabled: Boolean(docId) });
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.get<Folder[]>('/folders') });

  if (!docId || doc.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (!doc.data) return <View style={styles.center}><Text>Não encontrei este documento.</Text></View>;

  return <DocForm key={doc.data.id} doc={doc.data} folders={folders.data ?? []} onDone={() => navigation.goBack()} invalidate={() => qc.invalidateQueries({ queryKey: ['documents'] })} />;
}

function DocForm({ doc, folders, onDone, invalidate }: { doc: Doc; folders: Folder[]; onDone: () => void; invalidate: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [folderId, setFolderId] = useState(doc.folderId ?? '');
  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lines = parseList(content);
  const setLines = (next: ListLine[]) => setContent(serializeList(next));

  async function submit() {
    if (!title.trim()) return setErr('Dê um título ao documento.');
    setErr(null); setBusy(true);
    try {
      await api.patch(`/documents/${doc.id}`, { title: title.trim(), folderId: folderId || null, ...(doc.kind === 'file' ? {} : { content }) });
      invalidate();
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }
  function confirmDelete() {
    Alert.alert('Apagar documento?', `Apagar "${doc.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    setBusy(true);
    try { await api.del(`/documents/${doc.id}`); invalidate(); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui apagar.'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Título</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} autoFocus />

      <Text style={styles.label}>Pasta</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, !folderId && styles.chipOn]} onPress={() => setFolderId('')}>
          <Text style={[styles.chipText, !folderId && styles.chipTextOn]}>Sem pasta</Text>
        </TouchableOpacity>
        {folders.map((f) => (
          <TouchableOpacity key={f.id} style={[styles.chip, folderId === f.id && styles.chipOn]} onPress={() => setFolderId(f.id)}>
            <Text style={[styles.chipText, folderId === f.id && styles.chipTextOn]}>{f.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {doc.kind === 'note' && (
        <>
          <Text style={styles.label}>Conteúdo</Text>
          <TextInput style={[styles.input, styles.textarea]} value={content} onChangeText={setContent} multiline numberOfLines={10} />
        </>
      )}

      {doc.kind === 'list' && (
        <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
          <Text style={styles.label}>Itens</Text>
          {lines.map((l, i) => (
            <View key={i} style={styles.listRow}>
              {l.checked === null ? (
                <Text style={styles.listPlain}>{l.text}</Text>
              ) : (
                <TouchableOpacity style={styles.listCheck} onPress={() => setLines(lines.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}>
                  <Icon name={l.checked ? 'check' : 'x'} size={14} color={l.checked ? colors.ideal : colors.line} />
                  <Text style={[styles.listText, l.checked && styles.listTextDone]}>{l.text}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setLines(lines.filter((_, j) => j !== i))}><Icon name="x" size={14} color={colors.inkSoft} /></TouchableOpacity>
            </View>
          ))}
          <View style={styles.inlineRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]} value={newItem} onChangeText={setNewItem} placeholder="Adicionar item"
              onSubmitEditing={() => { if (newItem.trim()) { setLines([...lines, { checked: false, text: newItem.trim() }]); setNewItem(''); } }}
            />
          </View>
        </View>
      )}

      {doc.kind === 'file' && (
        <View style={styles.block}>
          <Text style={styles.hint}>{doc.mime ?? 'arquivo'} · {fmtSize(doc.sizeBytes)}</Text>
          <TouchableOpacity style={styles.openBtn} onPress={() => void Linking.openURL(`${API_BASE_URL}/documents/${doc.id}/file`)}>
            <Icon name="download" size={14} color={colors.accent} /><Text style={styles.openBtnText}>Abrir / baixar no navegador</Text>
          </TouchableOpacity>
          {doc.summary ? <Text style={styles.hint}>{doc.summary}</Text> : <Text style={styles.hint}>Sem resumo ainda.</Text>}
        </View>
      )}

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
        <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar documento</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  hint: { fontSize: 12, color: colors.inkSoft },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  textarea: { minHeight: 160, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  listCheck: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  listText: { fontSize: 14, color: colors.ink, flex: 1 },
  listTextDone: { textDecorationLine: 'line-through', color: colors.inkSoft },
  listPlain: { fontSize: 14, color: colors.inkSoft, flex: 1 },
  inlineRow: { flexDirection: 'row', gap: spacing.xs },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs, marginTop: spacing.sm },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  openBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md, paddingVertical: 10 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
