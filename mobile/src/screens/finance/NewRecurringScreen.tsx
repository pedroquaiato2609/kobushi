import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { FinRecurring, FinRefs } from '../../api/types';
import { todayISO } from '../../lib/dates';
import { centsToInput, parseMoney } from '../../lib/money';
import { colors, radius, spacing } from '../../theme';
import type { FinanceStackParamList } from '../../navigation/FinanceStack';

type Props = NativeStackScreenProps<FinanceStackParamList, 'NewRecurring'>;
type Freq = 'weekly' | 'monthly' | 'yearly';
const FREQS: { id: Freq; label: string }[] = [{ id: 'monthly', label: 'Todo mês' }, { id: 'weekly', label: 'Toda semana' }, { id: 'yearly', label: 'Todo ano' }];

export function NewRecurringScreen({ navigation, route }: Props) {
  const rec = route.params?.recurring;
  const isIncome = rec ? rec.kind === 'income' : route.params?.kind === 'income';
  const qc = useQueryClient();
  const refs = useQuery({ queryKey: ['fin-refs'], queryFn: () => api.get<FinRefs>('/finance/refs') });

  const [description, setDescription] = useState(rec?.description ?? '');
  const [amount, setAmount] = useState(rec ? centsToInput(rec.amountCents) : '');
  const [frequency, setFrequency] = useState<Freq>(rec?.frequency ?? 'monthly');
  const [nextDue, setNextDue] = useState(rec?.nextDue ?? todayISO());
  const [accountId, setAccountId] = useState<string | null>(rec?.accountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(rec?.categoryId ?? null);
  const [isSubscription, setIsSubscription] = useState(rec?.isSubscription ?? false);
  const [discount, setDiscount] = useState(rec?.discountPct != null ? String(rec.discountPct).replace('.', ',') : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accounts = (refs.data?.accounts ?? []).filter((a) => !a.archived);
  const categories = (refs.data?.categories ?? []).filter((c) => c.kind === (isIncome ? 'income' : 'expense'));
  const effectiveAccountId = accountId ?? accounts[0]?.id ?? null;
  const discountNum = discount.trim() === '' ? 0 : Number(discount.replace(',', '.'));

  async function submit() {
    if (!description.trim()) return setErr('Dê uma descrição.');
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return setErr('Informe um valor maior que zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) return setErr('Use a data no formato AAAA-MM-DD.');
    if (!effectiveAccountId) return setErr('Crie uma conta antes.');
    setErr(null); setBusy(true);
    try {
      const body: Record<string, unknown> = {
        description: description.trim(), amountCents: cents, kind: isIncome ? 'income' : 'expense', frequency, nextDue,
        accountId: effectiveAccountId, categoryId: categoryId || null,
        isSubscription: isIncome ? false : isSubscription, discountPct: !isIncome && discountNum > 0 ? discountNum : null,
      };
      if (rec) await api.patch(`/finance/recurring/${rec.id}`, body);
      else await api.post('/finance/recurring', body);
      await qc.invalidateQueries({ queryKey: ['fin-recurring'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!rec) return;
    Alert.alert('Excluir?', undefined, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: () => void remove() }]);
  }
  async function remove() {
    if (!rec) return;
    setBusy(true);
    try {
      await api.del(`/finance/recurring/${rec.id}`);
      await qc.invalidateQueries({ queryKey: ['fin-recurring'] });
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  }

  if (refs.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Descrição</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder={isIncome ? 'Ex.: Salário' : 'Ex.: Internet'} autoFocus={!rec} />

      <Text style={styles.label}>Valor (R$)</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />

      <Text style={styles.label}>Repete</Text>
      <View style={styles.chipRow}>
        {FREQS.map((f) => (
          <TouchableOpacity key={f.id} style={[styles.chip, frequency === f.id && styles.chipOn]} onPress={() => setFrequency(f.id)}>
            <Text style={[styles.chipText, frequency === f.id && styles.chipTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Próxima data (AAAA-MM-DD)</Text>
      <TextInput style={styles.input} value={nextDue} onChangeText={setNextDue} placeholder="2026-10-05" />

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

      {!isIncome && (
        <>
          <Text style={styles.label}>Desconto (%) — opcional</Text>
          <TextInput style={styles.input} value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" placeholder="Ex.: 10" />
          <TouchableOpacity style={styles.checkRow} onPress={() => setIsSubscription((s) => !s)}>
            <View style={[styles.checkbox, isSubscription && styles.checkboxOn]} />
            <Text style={styles.checkLabel}>É uma assinatura</Text>
          </TouchableOpacity>
        </>
      )}

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Salvar</Text>}
      </TouchableOpacity>
      {rec && (
        <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
          <Text style={styles.deleteBtnText}>Excluir</Text>
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
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.lineStrong },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkLabel: { fontSize: 13, color: colors.ink },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  deleteBtnText: { color: colors.danger, fontWeight: '600', fontSize: 13 },
});
