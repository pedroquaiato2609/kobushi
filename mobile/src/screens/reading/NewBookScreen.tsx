import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { api } from '../../api/client';
import { colors, radius, spacing } from '../../theme';
import type { ReadingStackParamList } from '../../navigation/ReadingStack';

type Props = NativeStackScreenProps<ReadingStackParamList, 'NewBook'>;

export function NewBookScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) return setErr('Dê um título ao livro.');
    setErr(null); setBusy(true);
    try {
      const pages = totalPages.trim() === '' ? undefined : Number(totalPages);
      await api.post('/reading/books', { title: title.trim(), author: author.trim() || undefined, totalPages: pages && Number.isFinite(pages) ? pages : undefined });
      await qc.invalidateQueries({ queryKey: ['reading-overview'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Título</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex.: Clean Code" autoFocus />
      <Text style={styles.label}>Autor (opcional)</Text>
      <TextInput style={styles.input} value={author} onChangeText={setAuthor} placeholder="Ex.: Robert C. Martin" />
      <Text style={styles.label}>Total de páginas (opcional)</Text>
      <TextInput style={styles.input} value={totalPages} onChangeText={setTotalPages} keyboardType="number-pad" placeholder="Ex.: 464" />
      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Adicionar à estante</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
