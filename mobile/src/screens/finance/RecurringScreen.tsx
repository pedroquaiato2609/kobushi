import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { FinRecurring } from '../../api/types';
import { Icon } from '../../components/Icon';
import { dm } from '../../lib/dates';
import { brl } from '../../lib/money';
import { colors, radius, spacing } from '../../theme';
import type { FinanceStackParamList } from '../../navigation/FinanceStack';

type Props = NativeStackScreenProps<FinanceStackParamList, 'Recurring'>;
const FREQ_LABEL = { weekly: 'toda semana', monthly: 'todo mês', yearly: 'todo ano' } as const;
const netCents = (r: FinRecurring) => (r.discountPct ? Math.round(r.amountCents * (1 - r.discountPct / 100)) : r.amountCents);

function Section({ title, items, kind, onEdit, onNew, onToggle }: {
  title: string; items: FinRecurring[]; kind: 'income' | 'expense';
  onEdit: (r: FinRecurring) => void; onNew: () => void; onToggle: (r: FinRecurring) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity style={styles.newBtn} onPress={onNew}><Icon name="plus" size={13} color="#fff" /></TouchableOpacity>
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>Nada cadastrado ainda.</Text>
      ) : (
        items.map((r) => (
          <TouchableOpacity key={r.id} style={[styles.row, !r.active && styles.rowOff]} onPress={() => onEdit(r)}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{r.description}{r.discountPct ? ` · ${r.discountPct}% off` : ''}</Text>
              <Text style={styles.rowSub}>{FREQ_LABEL[r.frequency]} · próximo em {dm(r.nextDue)}</Text>
            </View>
            <Text style={[styles.rowValue, kind === 'income' && { color: colors.ideal }]}>{brl(netCents(r))}</Text>
            <TouchableOpacity onPress={() => onToggle(r)} style={styles.toggleBtn}>
              <Text style={styles.toggleBtnText}>{r.active ? 'Pausar' : 'Ativar'}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

export function RecurringScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['fin-recurring'], queryFn: () => api.get<FinRecurring[]>('/finance/recurring') });

  async function toggle(r: FinRecurring) {
    await api.patch(`/finance/recurring/${r.id}`, { active: !r.active });
    await qc.invalidateQueries({ queryKey: ['fin-recurring'] });
  }

  if (list.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  const incomes = (list.data ?? []).filter((r) => r.kind === 'income');
  const expenses = (list.data ?? []).filter((r) => r.kind === 'expense');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Section
        title="Minha renda" items={incomes} kind="income"
        onEdit={(r) => navigation.navigate('NewRecurring', { recurring: r })}
        onNew={() => navigation.navigate('NewRecurring', { kind: 'income' })}
        onToggle={(r) => void toggle(r)}
      />
      <Section
        title="Recorrências e assinaturas" items={expenses} kind="expense"
        onEdit={(r) => navigation.navigate('NewRecurring', { recurring: r })}
        onNew={() => navigation.navigate('NewRecurring', { kind: 'expense' })}
        onToggle={(r) => void toggle(r)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  newBtn: { backgroundColor: colors.accent, borderRadius: 999, padding: 6 },
  empty: { fontSize: 13, color: colors.inkSoft },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
  rowOff: { opacity: 0.5 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 11, color: colors.inkSoft },
  rowValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
  toggleBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 8 },
  toggleBtnText: { fontSize: 11, color: colors.inkSoft, fontWeight: '600' },
});
