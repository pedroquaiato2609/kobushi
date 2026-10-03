import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, ScrollView, ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { FinCategory, FinRefs } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { colors, radius, spacing } from '../../theme';
import type { FinanceStackParamList } from '../../navigation/FinanceStack';

type Props = NativeStackScreenProps<FinanceStackParamList, 'Categories'>;

export function CategoriesScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const refs = useQuery({ queryKey: ['fin-refs'], queryFn: () => api.get<FinRefs>('/finance/refs') });

  function confirmDelete(c: FinCategory, categories: FinCategory[]) {
    const kids = categories.filter((x) => x.parentId === c.id);
    const warn = kids.length > 0 ? ` As ${kids.length} subcategoria(s) somem junto.` : '';
    Alert.alert('Excluir categoria?', `"${c.name}"?${warn} Movimentações já lançadas ficam sem categoria.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void remove(c.id) },
    ]);
  }
  async function remove(id: string) {
    await api.del(`/finance/categories/${id}`);
    await qc.invalidateQueries({ queryKey: ['fin-refs'] });
  }

  if (refs.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (refs.error) return <QueryError error={refs.error} onRetry={() => void refs.refetch()} />;
  const categories = refs.data?.categories ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('NewCategory', {})}>
        <Icon name="plus" size={15} color="#fff" /><Text style={styles.newBtnText}>Nova categoria</Text>
      </TouchableOpacity>

      {(['expense', 'income'] as const).map((kind) => {
        const top = categories.filter((c) => c.kind === kind && !c.parentId);
        if (top.length === 0) return null;
        return (
          <View key={kind} style={styles.section}>
            <Text style={styles.sectionTitle}>{kind === 'expense' ? 'Despesas' : 'Receitas'}</Text>
            {top.map((p) => (
              <View key={p.id}>
                <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('NewCategory', { category: p })}>
                  <View style={[styles.dot, { backgroundColor: p.color }]} />
                  <Text style={styles.rowName}>{p.name}</Text>
                  <TouchableOpacity onPress={() => confirmDelete(p, categories)} style={styles.trashBtn}><Icon name="trash" size={14} color={colors.inkSoft} /></TouchableOpacity>
                </TouchableOpacity>
                {categories.filter((c) => c.parentId === p.id).map((c) => (
                  <TouchableOpacity key={c.id} style={[styles.row, styles.childRow]} onPress={() => navigation.navigate('NewCategory', { category: c })}>
                    <View style={[styles.dot, { backgroundColor: c.color }]} />
                    <Text style={styles.rowName}>{c.name}</Text>
                    <TouchableOpacity onPress={() => confirmDelete(c, categories)} style={styles.trashBtn}><Icon name="trash" size={14} color={colors.inkSoft} /></TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: radius, padding: spacing.md },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  section: { marginTop: spacing.sm, gap: 2 },
  sectionTitle: { fontSize: 11, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
  childRow: { paddingLeft: spacing.lg },
  dot: { width: 10, height: 10, borderRadius: 3 },
  rowName: { flex: 1, fontSize: 14, color: colors.ink },
  trashBtn: { padding: 4 },
});
