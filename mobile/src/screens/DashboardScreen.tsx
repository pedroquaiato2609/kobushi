import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api/client';
import type { FinOverview, Upcoming } from '../api/types';
import { Icon } from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import { colors, radius, spacing } from '../theme';
import { brl } from '../lib/money';
import type { FinanceStackParamList } from '../navigation/FinanceStack';

type Props = NativeStackScreenProps<FinanceStackParamList, 'Dashboard'>;

const UPCOMING_KIND_LABEL: Record<Upcoming['kind'], string> = { bill: 'Conta', recurring: 'Recorrente', invoice: 'Fatura de cartão' };
const dm = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <View style={[styles.tile, tone === 'good' && styles.tileGood, tone === 'bad' && styles.tileBad]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      {sub && <Text style={styles.tileSub}>{sub}</Text>}
    </View>
  );
}

function ProgressBar({ pct, tone }: { pct: number; tone: 'ok' | 'risk' | 'exceeded' }) {
  const color = tone === 'exceeded' ? colors.danger : tone === 'risk' ? colors.min : colors.ideal;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

export function DashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const overview = useQuery({ queryKey: ['fin-overview'], queryFn: () => api.get<FinOverview>('/finance/overview') });

  if (overview.isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }
  if (overview.error || !overview.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Não consegui carregar suas finanças</Text>
        <Text style={styles.errorMsg}>{(overview.error as Error | undefined)?.message}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void overview.refetch()}><Text style={styles.retryText}>Tentar de novo</Text></TouchableOpacity>
      </View>
    );
  }

  const d = overview.data;
  const s = d.summary;
  const commit = d.commitment;
  const leftover = commit.incomeCents - commit.committedCents;
  const tone = commit.pct >= 90 ? 'exceeded' : commit.pct >= 70 ? 'risk' : 'ok';
  const incomeOf = commit.basis === 'salary' ? 'do salário' : 'da renda média';
  const committedAdj = commit.basis === 'salary' ? 'comprometido' : 'comprometida';

  return (
    <ScrollView
      style={styles.screen} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={overview.isFetching} onRefresh={() => void overview.refetch()} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {user?.name?.split(' ')[0]}</Text>
          <Text style={styles.greetingSub}>Visão geral das suas finanças</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('NewTransaction')}>
            <Icon name="plus" size={13} color="#fff" /><Text style={styles.newBtnText}>Nova</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void logout()}><Text style={styles.logout}>Sair</Text></TouchableOpacity>
        </View>
      </View>

      {d.hasDemo && (
        <View style={styles.demoBanner}><Text style={styles.demoText}>Dados de demonstração — não vêm de nenhum banco.</Text></View>
      )}

      <View style={styles.tilesGrid}>
        <Tile label="Saldo em contas" value={brl(d.totals.liquidCents)} />
        <Tile label="Receitas no mês" value={brl(s.incomeCents)} tone="good" />
        <Tile label="Despesas no mês" value={brl(s.expenseCents)} />
        <Tile label="Resultado do mês" value={brl(s.netCents)} tone={s.netCents >= 0 ? 'good' : 'bad'} />
        {commit.incomeCents > 0 && (
          <Tile label="Gastos fixos (recorrências + faturas)" value={brl(commit.committedCents)} sub={`${commit.pct}% ${incomeOf}`} />
        )}
      </View>

      {commit.incomeCents > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Quanto sobra {incomeOf}</Text>
          <Text style={[styles.leftoverValue, { color: leftover < 0 ? colors.danger : colors.ideal }]}>{brl(leftover)}</Text>
          <Text style={styles.panelNote}>
            {leftover >= 0 ? `livre por mês depois de tirar recorrências e faturas (${commit.pct}% ${committedAdj})` : `faltando — suas recorrências e faturas já passam ${incomeOf}`}
          </Text>
          <ProgressBar pct={commit.pct} tone={tone} />
        </View>
      )}

      {d.upcoming.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Próximos vencimentos</Text>
          {d.upcoming.slice(0, 8).map((u) => (
            <View key={u.key} style={styles.row}>
              <Text style={[styles.rowDate, u.overdue && { color: colors.danger }]}>{dm(u.date)}</Text>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>{u.title}</Text>
                <Text style={styles.rowSub}>{UPCOMING_KIND_LABEL[u.kind]}{u.overdue ? ' · atrasado' : ''}</Text>
              </View>
              <Text style={[styles.rowValue, u.direction === 'in' && { color: colors.ideal }]}>{u.direction === 'in' ? '+ ' : '− '}{brl(u.cents)}</Text>
            </View>
          ))}
        </View>
      )}

      {d.insights.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Insights</Text>
          {d.insights.slice(0, 3).map((i) => (
            <View key={i.key} style={styles.insightCard}>
              <Text style={styles.insightTitle}>{i.title}</Text>
              <Text style={styles.insightSummary}>{i.summary}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  errorTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  errorMsg: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  retryBtn: { marginTop: spacing.sm, backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: spacing.lg, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.ink },
  greetingSub: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 6, paddingHorizontal: spacing.sm },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  logout: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  demoBanner: { backgroundColor: '#fff4df', borderRadius: 10, padding: spacing.sm, borderWidth: 1, borderColor: '#f2d9ad' },
  demoText: { fontSize: 12, color: '#8a5a0a' },
  tilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderLeftColor: colors.line, gap: 2 },
  tileGood: { borderLeftColor: colors.ideal },
  tileBad: { borderLeftColor: colors.danger },
  tileLabel: { fontSize: 11, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.3 },
  tileValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  tileSub: { fontSize: 11, color: colors.inkSoft },
  panel: { backgroundColor: colors.surface, borderRadius: radius, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, gap: spacing.xs },
  panelTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  panelNote: { fontSize: 12, color: colors.inkSoft },
  leftoverValue: { fontSize: 26, fontWeight: '700' },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: colors.sunken, overflow: 'hidden', marginTop: spacing.sm },
  barFill: { height: '100%', borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowDate: { fontSize: 12, color: colors.inkSoft, width: 36 },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 11, color: colors.inkSoft },
  rowValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
  insightCard: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: spacing.sm, paddingVertical: spacing.xs },
  insightTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  insightSummary: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
});
