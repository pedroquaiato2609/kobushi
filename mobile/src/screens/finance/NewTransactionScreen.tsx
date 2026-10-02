import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { FinRefs } from '../../api/types';
import { todayISO } from '../../lib/dates';
import { colors, radius, spacing } from '../../theme';
import type { FinanceStackParamList } from '../../navigation/FinanceStack';

type Props = NativeStackScreenProps<FinanceStackParamList, 'NewTransaction'>;
type Kind = 'expense' | 'income';

const parseMoney = (text: string): number | null => {
  const t = text.replace(/[^\d.,-]/g, '').trim();
  if (!t) return null;
  let clean = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function NewTransactionScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const refs = useQuery({ queryKey: ['fin-refs'], queryFn: () => api.get<FinRefs>('/finance/refs') });
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accounts = (refs.data?.accounts ?? []).filter((a) => !a.archived);
  const categories = (refs.data?.categories ?? []).filter((c) => c.kind === kind);
  const effectiveAccountId = accountId ?? accounts[0]?.id ?? null;

  async function submit() {
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return setErr('Informe um valor maior que zero.');
    if (!effectiveAccountId) return setErr('Crie uma conta no app web antes de lançar movimentações.');
    setErr(null); setBusy(true);
    try {
      await api.post('/finance/transactions', {
        accountId: effectiveAccountId, kind, amountCents: cents, occurredOn: todayISO(),
        description, categoryId: categoryId || null, status: 'confirmed',
      });
      await qc.invalidateQueries({ queryKey: ['fin-overview'] });
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
      <View style={styles.seg}>
        <TouchableOpacity style={[styles.segBtn, kind === 'expense' && styles.segBtnOn]} onPress={() => { setKind('expense'); setCategoryId(null); }}>
          <Text style={[styles.segText, kind === 'expense' && styles.segTextOn]}>Despesa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segBtn, kind === 'income' && styles.segBtnOn]} onPress={() => { setKind('income'); setCategoryId(null); }}>
          <Text style={[styles.segText, kind === 'income' && styles.segTextOn]}>Receita</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Valor (R$)</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" autoFocus />

      <Text style={styles.label}>Descrição</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder={kind === 'income' ? 'Ex.: Freela' : 'Ex.: Mercado'} />

      {accounts.length > 0 && (
        <>
          <Text style={styles.label}>Conta</Text>
          <View style={styles.chipRow}>
            {accounts.map((a) => (
              <TouchableOpacity key={a.id} style={[styles.chip, effectiveAccountId === a.id && styles.chipOn]} onPress={() => setAccountId(a.id)}>
                <Text style={[styles.chipText, effectiveAccountId === a.id && styles.chipTextOn]}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {categories.length > 0 && (
        <>
          <Text style={styles.label}>Categoria (opcional)</Text>
          <View style={styles.chipRow}>
            {categories.filter((c) => !c.parentId).map((c) => (
              <TouchableOpacity key={c.id} style={[styles.chip, categoryId === c.id && styles.chipOn]} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}>
                <Text style={[styles.chipText, categoryId === c.id && styles.chipTextOn]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

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
  seg: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segBtnOn: { backgroundColor: colors.surface },
  segText: { color: colors.inkSoft, fontWeight: '600' },
  segTextOn: { color: colors.ink },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft },
  chipTextOn: { color: colors.accent, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
