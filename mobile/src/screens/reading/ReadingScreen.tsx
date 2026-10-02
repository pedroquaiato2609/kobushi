import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Book, ReadingOverview } from '../../api/types';
import { progressPct } from '../../lib/reading';
import { colors, radius, spacing } from '../../theme';
import type { ReadingStackParamList } from '../../navigation/ReadingStack';

type Props = NativeStackScreenProps<ReadingStackParamList, 'ReadingHome'>;

function BookRow({ book, onPress }: { book: Book; onPress: () => void }) {
  const pct = progressPct(book);
  return (
    <TouchableOpacity style={styles.bookRow} onPress={onPress}>
      <View style={styles.bookMain}>
        <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>{book.author || 'Autor desconhecido'}</Text>
        {pct !== null && (
          <View style={styles.bookBarTrack}><View style={[styles.bookBarFill, { width: `${pct}%` }]} /></View>
        )}
      </View>
      {pct !== null && <Text style={styles.bookPct}>{pct}%</Text>}
    </TouchableOpacity>
  );
}

export function ReadingScreen({ navigation }: Props) {
  const overview = useQuery({ queryKey: ['reading-overview'], queryFn: () => api.get<ReadingOverview>('/reading/overview') });

  if (overview.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (overview.error || !overview.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Não consegui carregar sua estante</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void overview.refetch()}><Text style={styles.retryText}>Tentar de novo</Text></TouchableOpacity>
      </View>
    );
  }

  const d = overview.data;
  const openBook = (id: string) => navigation.navigate('BookDetail', { bookId: id });

  return (
    <ScrollView
      style={styles.screen} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={overview.isFetching} onRefresh={() => void overview.refetch()} tintColor={colors.accent} />}
    >
      <Text style={styles.header}>Leitura</Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}><Text style={styles.statValue}>{d.streak}</Text><Text style={styles.statLabel}>dias seguidos</Text></View>
        <View style={styles.statBox}><Text style={styles.statValue}>{d.pagesThisMonth}</Text><Text style={styles.statLabel}>páginas no mês</Text></View>
        <View style={styles.statBox}><Text style={styles.statValue}>{d.finishedThisYear}</Text><Text style={styles.statLabel}>lidos no ano</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Lendo agora</Text>
      {d.reading.length === 0 ? (
        <Text style={styles.empty}>Nenhum livro em andamento.</Text>
      ) : (
        <View style={styles.panel}>{d.reading.map((b) => <BookRow key={b.id} book={b} onPress={() => openBook(b.id)} />)}</View>
      )}

      <Text style={styles.sectionTitle}>Quero ler</Text>
      {d.wantToRead.length === 0 ? (
        <Text style={styles.empty}>Nada na fila ainda.</Text>
      ) : (
        <View style={styles.panel}>{d.wantToRead.map((b) => <BookRow key={b.id} book={b} onPress={() => openBook(b.id)} />)}</View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.sm },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  errorTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  retryBtn: { marginTop: spacing.sm, backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: spacing.lg, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  header: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.accent },
  statLabel: { fontSize: 11, color: colors.inkSoft, textAlign: 'center', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: spacing.sm },
  empty: { fontSize: 13, color: colors.inkSoft },
  panel: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  bookRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, gap: spacing.sm },
  bookMain: { flex: 1, gap: 3 },
  bookTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  bookAuthor: { fontSize: 12, color: colors.inkSoft },
  bookBarTrack: { height: 5, borderRadius: 999, backgroundColor: colors.sunken, overflow: 'hidden', marginTop: 2 },
  bookBarFill: { height: '100%', borderRadius: 999, backgroundColor: colors.accent },
  bookPct: { fontSize: 12, fontWeight: '700', color: colors.accent },
});
