import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { FinOverview } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { brl } from '../../lib/money';
import { colors, radius, spacing } from '../../theme';
import type { FinanceStackParamList } from '../../navigation/FinanceStack';

type Props = NativeStackScreenProps<FinanceStackParamList, 'Accounts'>;
const KIND_LABEL: Record<string, string> = { checking: 'Conta corrente', digital: 'Conta digital', savings: 'Reserva / poupança', cash: 'Dinheiro', credit_card: 'Cartão de crédito' };

export function AccountsScreen({ navigation }: Props) {
  const overview = useQuery({ queryKey: ['fin-overview'], queryFn: () => api.get<FinOverview>('/finance/overview') });

  if (overview.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (overview.error) return <QueryError error={overview.error} onRetry={() => void overview.refetch()} />;
  const accounts = (overview.data?.accounts ?? []).filter((a) => !a.archived);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('NewAccount')}>
        <Icon name="plus" size={15} color="#fff" /><Text style={styles.newBtnText}>Nova conta</Text>
      </TouchableOpacity>

      {accounts.length === 0 ? (
        <Text style={styles.empty}>Nenhuma conta cadastrada ainda.</Text>
      ) : (
        accounts.map((a) => (
          <TouchableOpacity key={a.id} style={styles.row} onPress={() => navigation.navigate('NewAccount', { accountId: a.id })}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName}>{a.name}</Text>
              <Text style={styles.rowSub}>{KIND_LABEL[a.kind] ?? a.kind}{a.numberMask ? ` · ${a.numberMask}` : ''}</Text>
            </View>
            <Text style={[styles.rowBalance, (a.balanceCents ?? 0) < 0 && { color: colors.danger }]}>{brl(a.balanceCents ?? a.initialBalanceCents)}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: radius, padding: spacing.md },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.inkSoft },
  rowBalance: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
