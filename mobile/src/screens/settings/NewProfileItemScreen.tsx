import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { ProfileLevel } from '../../api/types';
import { Icon } from '../../components/Icon';
import { LEVEL_PROFILE } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NewProfileItem'>;
const LEVELS: ProfileLevel[] = ['general', 'private', 'secret'];

export function NewProfileItemScreen({ navigation, route }: Props) {
  const item = route.params?.item;
  const qc = useQueryClient();
  const [title, setTitle] = useState(item?.title ?? '');
  const [content, setContent] = useState(item?.content ?? '');
  const [level, setLevel] = useState<ProfileLevel>(item?.level ?? 'general');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) return setErr('Dê um título.');
    setErr(null); setBusy(true);
    try {
      const payload = { title: title.trim(), content, level };
      if (item) await api.patch(`/profile/${item.id}`, payload);
      else await api.post('/profile', payload);
      await qc.invalidateQueries({ queryKey: ['profile'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!item) return;
    Alert.alert('Apagar informação?', `Apagar "${item.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!item) return;
    setBusy(true);
    try { await api.del(`/profile/${item.id}`); await qc.invalidateQueries({ queryKey: ['profile'] }); navigation.goBack(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui apagar.'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Título</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="ex.: Alergias, Plano de saúde, Senha do Wi-Fi" autoFocus={!item} />

      <Text style={styles.label}>Conteúdo</Text>
      <TextInput style={[styles.input, styles.textarea]} value={content} onChangeText={setContent} multiline numberOfLines={5} />

      <Text style={styles.fieldLegend}>Nível de confidencialidade</Text>
      <View style={{ gap: spacing.xs }}>
        {LEVELS.map((l) => (
          <TouchableOpacity key={l} style={[styles.levelCard, level === l && styles.levelCardOn]} onPress={() => setLevel(l)}>
            <Text style={[styles.levelName, level === l && styles.levelNameOn]}>{LEVEL_PROFILE[l].name}</Text>
            <Text style={[styles.levelHint, level === l && styles.levelHintOn]}>{LEVEL_PROFILE[l].hint}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar'}</Text>
      </TouchableOpacity>
      {item && (
        <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
          <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  fieldLegend: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  levelCard: { borderWidth: 1, borderColor: colors.line, borderRadius: radius, padding: spacing.md, backgroundColor: colors.surface },
  levelCardOn: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  levelName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  levelNameOn: { color: colors.accent },
  levelHint: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  levelHintOn: { color: colors.ink },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md, paddingVertical: 10 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
