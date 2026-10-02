import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { AccountKind, FinOverview } from '../../api/types';
import { centsToInput, parseMoney } from '../../lib/money';
import { colors, radius, spacing } from '../../theme';
import type { FinanceStackParamList } from '../../navigation/FinanceStack';

type Props = NativeStackScreenProps<FinanceStackParamList, 'NewAccount'>;
const KINDS: { id: AccountKind; label: string }[] = [
  { id: 'checking', label: 'Conta corrente' }, { id: 'digital', label: 'Conta digital' }, { id: 'savings', label: 'Reserva' },
  { id: 'cash', label: 'Dinheiro' }, { id: 'credit_card', label: 'Cartão de crédito' },
];

export function NewAccountScreen({ navigation, route }: Props) {
  const accountId = route.params?.accountId;
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: ['fin-overview'], queryFn: () => api.get<FinOverview>('/finance/overview') });
  const existing = accountId ? overview.data?.accounts.find((a) => a.id === accountId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(existing?.kind ?? 'checking');
  const [initialBalance, setInitialBalance] = useState(existing ? centsToInput(existing.initialBalanceCents) : '');
  const [closingDay, setClosingDay] = useState(existing?.closingDay != null ? String(existing.closingDay) : '');
  const [dueDay, setDueDay] = useState(existing?.dueDay != null ? String(existing.dueDay) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setErr('Dê um nome à conta.');
    if (kind === 'credit_card' && (!closingDay || !dueDay)) return setErr('Informe o dia de fechamento e o de vencimento da fatura.');
    setErr(null); setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(), kind,
        initialBalanceCents: initialBalance.trim() === '' ? 0 : (parseMoney(initialBalance) ?? 0),
        closingDay: kind === 'credit_card' ? Number(closingDay) : null,
        dueDay: kind === 'credit_card' ? Number(dueDay) : null,
      };
      if (accountId) await api.patch(`/finance/accounts/${accountId}`, body);
      else await api.post('/finance/accounts', body);
      await qc.invalidateQueries({ queryKey: ['fin-overview'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!accountId) return;
    setBusy(true);
    try {
      await api.patch(`/finance/accounts/${accountId}`, { archived: true });
      await qc.invalidateQueries({ queryKey: ['fin-overview'] });
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  }

  if (accountId && overview.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nome</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex.: Nubank" autoFocus={!accountId} />

      <Text style={styles.label}>Tipo</Text>
      <View style={styles.chipRow}>
        {KINDS.map((k) => (
          <TouchableOpacity key={k.id} style={[styles.chip, kind === k.id && styles.chipOn]} onPress={() => setKind(k.id)}>
            <Text style={[styles.chipText, kind === k.id && styles.chipTextOn]}>{k.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {kind === 'credit_card' ? (
        <View style={styles.formRow}>
          <View style={styles.formField}>
            <Text style={styles.label}>Dia de fechamento</Text>
            <TextInput style={styles.input} value={closingDay} onChangeText={setClosingDay} keyboardType="number-pad" placeholder="1-31" />
          </View>
          <View style={styles.formField}>
            <Text style={styles.label}>Dia de vencimento</Text>
            <TextInput style={styles.input} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="1-31" />
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Saldo inicial (R$)</Text>
          <TextInput style={styles.input} value={initialBalance} onChangeText={setInitialBalance} keyboardType="decimal-pad" placeholder="0,00" />
        </>
      )}

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Salvar</Text>}
      </TouchableOpacity>
      {accountId && (
        <TouchableOpacity style={styles.archiveBtn} disabled={busy} onPress={() => void archive()}>
          <Text style={styles.archiveBtnText}>Arquivar conta</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft },
  chipTextOn: { color: colors.accent, fontWeight: '700' },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  formField: { flex: 1 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  archiveBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  archiveBtnText: { color: colors.danger, fontWeight: '600', fontSize: 13 },
});
