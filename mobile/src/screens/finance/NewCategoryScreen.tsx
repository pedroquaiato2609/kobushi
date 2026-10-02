import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { FinRefs } from '../../api/types';
import { colors, radius, spacing } from '../../theme';
import type { FinanceStackParamList } from '../../navigation/FinanceStack';

type Props = NativeStackScreenProps<FinanceStackParamList, 'NewCategory'>;
const PALETTE = ['#F2B84B', '#5B8CFF', '#34C38F', '#E5657A', '#A78BFA', '#22B8CF', '#F08C5A', '#7C6CF0', '#8C94AD', '#FF6B9D', '#4ADE80', '#6B7391'];

export function NewCategoryScreen({ navigation, route }: Props) {
  const category = route.params?.category;
  const qc = useQueryClient();
  const refs = useQuery({ queryKey: ['fin-refs'], queryFn: () => api.get<FinRefs>('/finance/refs') });
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>(category?.kind ?? 'expense');
  const [parentId, setParentId] = useState<string | null>(category?.parentId ?? null);
  const [color, setColor] = useState(category?.color ?? PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const categories = refs.data?.categories ?? [];
  const hasChildren = categories.some((c) => c.parentId === category?.id);
  const parentOptions = categories.filter((c) => !c.parentId && c.kind === kind && c.id !== category?.id);

  async function submit() {
    if (!name.trim()) return setErr('Dê um nome à categoria.');
    setErr(null); setBusy(true);
    try {
      if (category) await api.patch(`/finance/categories/${category.id}`, { name: name.trim(), parentId, color });
      else await api.post('/finance/categories', { name: name.trim(), kind, parentId, color });
      await qc.invalidateQueries({ queryKey: ['fin-refs'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  if (refs.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nome</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex.: Pet, Academia…" autoFocus={!category} />

      {!category && (
        <>
          <Text style={styles.label}>Tipo</Text>
          <View style={styles.seg}>
            <TouchableOpacity style={[styles.segBtn, kind === 'expense' && styles.segBtnOn]} onPress={() => { setKind('expense'); setParentId(null); }}>
              <Text style={[styles.segText, kind === 'expense' && styles.segTextOn]}>Despesa</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segBtn, kind === 'income' && styles.segBtnOn]} onPress={() => { setKind('income'); setParentId(null); }}>
              <Text style={[styles.segText, kind === 'income' && styles.segTextOn]}>Receita</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {hasChildren ? (
        <Text style={styles.hint}>Esta categoria já tem subcategorias, por isso não pode virar subcategoria de outra.</Text>
      ) : parentOptions.length > 0 && (
        <>
          <Text style={styles.label}>Dentro de (opcional)</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity style={[styles.chip, parentId === null && styles.chipOn]} onPress={() => setParentId(null)}>
              <Text style={[styles.chipText, parentId === null && styles.chipTextOn]}>Categoria própria</Text>
            </TouchableOpacity>
            {parentOptions.map((p) => (
              <TouchableOpacity key={p.id} style={[styles.chip, parentId === p.id && styles.chipOn]} onPress={() => setParentId(p.id)}>
                <Text style={[styles.chipText, parentId === p.id && styles.chipTextOn]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={styles.label}>Cor</Text>
      <View style={styles.swatchRow}>
        {PALETTE.map((c) => (
          <TouchableOpacity key={c} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]} onPress={() => setColor(c)} />
        ))}
      </View>

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Salvar</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  seg: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segBtnOn: { backgroundColor: colors.surface },
  segText: { color: colors.inkSoft, fontWeight: '600' },
  segTextOn: { color: colors.ink },
  hint: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft },
  chipTextOn: { color: colors.accent, fontWeight: '700' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 32, height: 32, borderRadius: 999, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: colors.ink },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
