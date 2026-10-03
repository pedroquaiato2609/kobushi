import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { FinTransaction } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { dm } from '../../lib/dates';
import { brl } from '../../lib/money';
import { colors, radius, spacing } from '../../theme';
import type { FinanceStackParamList } from '../../navigation/FinanceStack';

type Props = NativeStackScreenProps<FinanceStackParamList, 'Transactions'>;

const monthLabel = (m: string) => {
  const names = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const name = names[Number(m.slice(5, 7)) - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${m.slice(0, 4)}`;
};
const shiftMonth = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function TransactionsScreen({ navigation }: Props) {
  const [month, setMonth] = useState(thisMonth());
  const txs = useQuery({ queryKey: ['fin-transactions', month], queryFn: () => api.get<FinTransaction[]>(`/finance/transactions?month=${month}`) });

  return (
    <View style={styles.screen}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} style={styles.navBtn}><Icon name="left" size={16} color={colors.accent} /></TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <TouchableOpacity onPress={() => setMonth(shiftMonth(month, 1))} style={styles.navBtn}><Icon name="right" size={16} color={colors.accent} /></TouchableOpacity>
      </View>

      {txs.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : txs.error ? (
        <QueryError error={txs.error} onRetry={() => void txs.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {(txs.data ?? []).length === 0 ? (
            <Text style={styles.empty}>Nada lançado neste mês.</Text>
          ) : (
            (txs.data ?? []).map((t) => (
              <TouchableOpacity key={t.id} style={styles.row} onPress={() => navigation.navigate('NewTransaction', { transaction: t })}>
                <Text style={styles.rowDate}>{dm(t.occurredOn)}</Text>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{t.description || t.merchant || '(sem descrição)'}</Text>
                  <Text style={styles.rowSub}>{t.kind === 'transfer' ? 'Transferência' : t.status === 'pending' ? 'Pendente' : 'Confirmada'}</Text>
                </View>
                <Text style={[styles.rowValue, t.kind === 'income' && { color: colors.ideal }]}>
                  {t.kind === 'income' ? '+ ' : t.kind === 'expense' ? '− ' : ''}{brl(t.amountCents)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  navBtn: { padding: 6 },
  monthLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  empty: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
  rowDate: { fontSize: 12, color: colors.inkSoft, width: 36 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 11, color: colors.inkSoft },
  rowValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
