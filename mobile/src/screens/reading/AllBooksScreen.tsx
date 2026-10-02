import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Book, BookStatus } from '../../api/types';
import { progressPct, STATUS_LABEL, STATUS_ORDER } from '../../lib/reading';
import { colors, radius, spacing } from '../../theme';
import type { ReadingStackParamList } from '../../navigation/ReadingStack';

type Props = NativeStackScreenProps<ReadingStackParamList, 'AllBooks'>;
type Filter = 'todos' | BookStatus;

export function AllBooksScreen({ navigation }: Props) {
  const [filter, setFilter] = useState<Filter>('todos');
  const books = useQuery({
    queryKey: ['books', filter], queryFn: () => api.get<Book[]>(`/reading/books${filter === 'todos' ? '' : `?status=${filter}`}`),
  });

  return (
    <View style={styles.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity style={[styles.chip, filter === 'todos' && styles.chipOn]} onPress={() => setFilter('todos')}>
          <Text style={[styles.chipText, filter === 'todos' && styles.chipTextOn]}>Todos</Text>
        </TouchableOpacity>
        {STATUS_ORDER.map((s) => (
          <TouchableOpacity key={s} style={[styles.chip, filter === s && styles.chipOn]} onPress={() => setFilter(s)}>
            <Text style={[styles.chipText, filter === s && styles.chipTextOn]}>{STATUS_LABEL[s]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {books.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {(books.data ?? []).length === 0 ? (
            <Text style={styles.empty}>Nenhum livro aqui.</Text>
          ) : (
            (books.data ?? []).map((b) => {
              const pct = progressPct(b);
              return (
                <TouchableOpacity key={b.id} style={styles.row} onPress={() => navigation.navigate('BookDetail', { bookId: b.id })}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{b.title}</Text>
                    <Text style={styles.rowAuthor} numberOfLines={1}>{b.author || 'Autor desconhecido'} · {STATUS_LABEL[b.status]}</Text>
                  </View>
                  {pct !== null && <Text style={styles.rowPct}>{pct}%</Text>}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft },
  chipTextOn: { color: colors.accent, fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  empty: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowAuthor: { fontSize: 12, color: colors.inkSoft },
  rowPct: { fontSize: 13, fontWeight: '700', color: colors.accent },
});
