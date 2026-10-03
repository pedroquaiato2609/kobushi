import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Activity, ActivityKind, NotifyChannel, Period, TimeMode } from '../../api/types';
import { ChannelChecks } from '../../components/ChannelChecks';
import { Icon } from '../../components/Icon';
import { KIND_LABEL, PERIOD_LABEL, WEEKDAY_SHORT } from '../../lib/labels';
import { toHHmm, windowFor } from '../../lib/schedule';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NewActivity'>;
type BlockRow = { startTime: string; endTime: string };
type RemindMode = 'none' | 'fixed' | 'before';
const REMIND_BEFORE_OPTIONS = [5, 10, 15, 30, 60] as const;
const toRow = (b: { startTime: string; endTime: string | null }): BlockRow => ({ startTime: b.startTime, endTime: b.endTime ?? '' });

export function NewActivityScreen({ navigation, route }: Props) {
  const a = route.params?.activity;
  const qc = useQueryClient();

  const [name, setName] = useState(a?.name ?? '');
  const [kind, setKind] = useState<ActivityKind>(a?.kind ?? 'goal');
  const [timeMode, setTimeMode] = useState<TimeMode>(a?.timeMode ?? 'free');
  const [period, setPeriod] = useState<Period>(a?.period ?? 'morning');
  const [blocks, setBlocks] = useState<BlockRow[]>(a?.blocks.length ? a.blocks.map(toRow) : [{ startTime: '08:00', endTime: '' }]);
  const [perDay, setPerDay] = useState((a?.weekdayBlocks.length ?? 0) > 0);
  const [dayBlocks, setDayBlocks] = useState<Record<number, BlockRow[]>>(
    Object.fromEntries((a?.weekdayBlocks ?? []).map((w) => [w.weekday, w.blocks.map(toRow)])),
  );
  const [weekdays, setWeekdays] = useState<number[]>(a?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [purpose, setPurpose] = useState(a?.purpose ?? '');
  const [principle, setPrinciple] = useState(a?.principle ?? '');
  const [minDesc, setMinDesc] = useState(a?.minDesc ?? '');
  const [idealDesc, setIdealDesc] = useState(a?.idealDesc ?? '');
  const [maxDesc, setMaxDesc] = useState(a?.maxDesc ?? '');
  const [notBefore, setNotBefore] = useState(a?.notBefore ?? '');
  const [notAfter, setNotAfter] = useState(a?.notAfter ?? '');
  const [durationMin, setDurationMin] = useState(String(a?.durationMin ?? 60));
  const [remindMode, setRemindMode] = useState<RemindMode>(a?.remindMinutes != null ? 'before' : a?.remindTime ? 'fixed' : 'none');
  const [remindTime, setRemindTime] = useState(a?.remindTime ?? '');
  const [remindBeforeMin, setRemindBeforeMin] = useState<(typeof REMIND_BEFORE_OPTIONS)[number]>(a?.remindMinutes ?? 15);
  const [remindChannels, setRemindChannels] = useState<NotifyChannel[]>(a?.remindChannels ?? []);
  const [active, setActive] = useState(a?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<{ start: string; reason: string } | null>(
    a?.suggestedStart ? { start: a.suggestedStart, reason: a.suggestedReason } : null,
  );

  const toggleDay = (d: number) => setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  const setBlock = (i: number, patch: Partial<BlockRow>) => setBlocks((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const addBlock = () => setBlocks((prev) => [...prev, { startTime: '', endTime: '' }]);
  const removeBlock = (i: number) => setBlocks((prev) => prev.filter((_, j) => j !== i));
  const flexible = timeMode !== 'fixed';

  const dayBlocksFor = (d: number) => dayBlocks[d] ?? blocks;
  const setDayBlock = (d: number, i: number, patch: Partial<BlockRow>) =>
    setDayBlocks((prev) => ({ ...prev, [d]: (prev[d] ?? blocks).map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const addDayBlock = (d: number) => setDayBlocks((prev) => ({ ...prev, [d]: [...(prev[d] ?? blocks), { startTime: '', endTime: '' }] }));
  const removeDayBlock = (d: number, i: number) => setDayBlocks((prev) => ({ ...prev, [d]: (prev[d] ?? blocks).filter((_, j) => j !== i) }));
  // se todo dia selecionado já tem horário próprio, o padrão não serve de reserva pra ninguém
  const allDaysOverridden = perDay && weekdays.length > 0 && weekdays.every((d) => d in dayBlocks);

  const toBlocks = (rows: BlockRow[]) => rows.filter((r) => r.startTime).map((r) => ({ startTime: r.startTime, endTime: r.endTime || null }));
  function buildPayload() {
    return {
      name: name.trim(), kind, timeMode,
      period: timeMode === 'period' ? period : null,
      blocks: timeMode === 'fixed' ? toBlocks(blocks) : [],
      weekdayBlocks: timeMode === 'fixed' && perDay ? weekdays.map((d) => ({ weekday: d, blocks: toBlocks(dayBlocksFor(d)) })) : [],
      purpose, principle, minDesc, idealDesc, maxDesc, weekdays, active,
      remindTime: remindMode === 'fixed' ? (remindTime || null) : null,
      remindMinutes: remindMode === 'before' ? remindBeforeMin : null,
      remindChannels: remindMode !== 'none' ? remindChannels : [],
      notBefore: flexible && notBefore ? notBefore : null,
      notAfter: flexible && notAfter ? notAfter : null,
      durationMin: Number(durationMin) || 60,
    };
  }

  async function submit() {
    if (!name.trim()) return setErr('Dê um nome à atividade.');
    if (weekdays.length === 0) return setErr('Escolha pelo menos um dia da semana.');
    setErr(null); setBusy(true);
    try {
      if (a) await api.patch(`/activities/${a.id}`, buildPayload());
      else await api.post('/activities', buildPayload());
      await qc.invalidateQueries({ queryKey: ['activities'] });
      await qc.invalidateQueries({ queryKey: ['day'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  // Salva o que está na tela e pede o horário à IA, para a sugestão refletir o período e as restrições atuais.
  async function suggestTime() {
    if (!a) return;
    setErr(null); setSuggestBusy(true);
    try {
      await api.patch<Activity>(`/activities/${a.id}`, buildPayload());
      const updated = await api.post<Activity>(`/activities/${a.id}/suggest-time`, {});
      setSuggestion(updated.suggestedStart ? { start: updated.suggestedStart, reason: updated.suggestedReason } : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui pedir a sugestão.');
    } finally {
      setSuggestBusy(false);
    }
  }
  const slot = windowFor({ period: timeMode === 'period' ? period : null, notBefore: notBefore || null, notAfter: notAfter || null, durationMin: Number(durationMin) || 60 });

  function confirmDelete() {
    if (!a) return;
    Alert.alert('Apagar atividade?', `Remove "${a.name}" e todo o seu histórico. Não dá para desfazer.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!a) return;
    setBusy(true);
    try {
      await api.del(`/activities/${a.id}`);
      await qc.invalidateQueries({ queryKey: ['activities'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui apagar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nome</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="ex.: Ler, Academia, Água" autoFocus={!a} />

      <Text style={styles.label}>Tipo</Text>
      <View style={styles.chipRow}>
        {(Object.keys(KIND_LABEL) as ActivityKind[]).map((k) => (
          <TouchableOpacity key={k} style={[styles.chip, kind === k && styles.chipOn]} onPress={() => setKind(k)}>
            <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>{KIND_LABEL[k].split(' (')[0]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Quando</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, timeMode === 'free' && styles.chipOn]} onPress={() => setTimeMode('free')}><Text style={[styles.chipText, timeMode === 'free' && styles.chipTextOn]}>Horário livre</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.chip, timeMode === 'period' && styles.chipOn]} onPress={() => setTimeMode('period')}><Text style={[styles.chipText, timeMode === 'period' && styles.chipTextOn]}>Período definido</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.chip, timeMode === 'fixed' && styles.chipOn]} onPress={() => setTimeMode('fixed')}><Text style={[styles.chipText, timeMode === 'fixed' && styles.chipTextOn]}>Horário definido</Text></TouchableOpacity>
      </View>

      {timeMode === 'period' && (
        <View style={styles.chipRow}>
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <TouchableOpacity key={p} style={[styles.chip, period === p && styles.chipOn]} onPress={() => setPeriod(p)}>
              <Text style={[styles.chipText, period === p && styles.chipTextOn]}>{PERIOD_LABEL[p]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {timeMode === 'fixed' && (
        <>
          <View style={styles.block}>
            <Text style={styles.fieldLegend}>{perDay ? 'Horário padrão' : 'Horário'}</Text>
            {blocks.map((b, i) => (
              <View key={i} style={styles.blockRow}>
                <TextInput style={[styles.input, styles.timeInput]} value={b.startTime} onChangeText={(v) => setBlock(i, { startTime: v })} placeholder="08:00" />
                <Text style={styles.dash}>–</Text>
                <TextInput style={[styles.input, styles.timeInput]} value={b.endTime} onChangeText={(v) => setBlock(i, { endTime: v })} placeholder="fim (opc.)" />
                <TouchableOpacity disabled={blocks.length === 1} onPress={() => removeBlock(i)} style={styles.removeBtn}>
                  <Icon name="trash" size={14} color={blocks.length === 1 ? colors.line : colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addBtn} onPress={addBlock}>
              <Icon name="plus" size={14} color={colors.accent} /><Text style={styles.addBtnText}>Adicionar bloco (ex.: manhã e tarde)</Text>
            </TouchableOpacity>
            {allDaysOverridden && <Text style={styles.hint}>Todo dia selecionado já tem horário próprio abaixo — o padrão não é usado, pode deixar em branco.</Text>}
          </View>

          <TouchableOpacity style={styles.checkRow} onPress={() => setPerDay((v) => !v)}>
            <Icon name={perDay ? 'check' : 'x'} size={16} color={perDay ? colors.ideal : colors.inkSoft} />
            <Text style={styles.checkText}>Horário diferente em algum dia (ex.: academia só de manhã no fim de semana)</Text>
          </TouchableOpacity>

          {perDay && (
            <View style={styles.block}>
              <Text style={styles.fieldLegend}>Horário de cada dia</Text>
              {weekdays.map((d) => (
                <View key={d} style={styles.dayBlockGroup}>
                  <Text style={styles.dayBlockLabel}>{WEEKDAY_SHORT[d]}</Text>
                  <View style={{ flex: 1 }}>
                    {dayBlocksFor(d).map((b, i) => (
                      <View key={i} style={styles.blockRow}>
                        <TextInput style={[styles.input, styles.timeInput]} value={b.startTime} onChangeText={(v) => setDayBlock(d, i, { startTime: v })} placeholder="08:00" />
                        <Text style={styles.dash}>–</Text>
                        <TextInput style={[styles.input, styles.timeInput]} value={b.endTime} onChangeText={(v) => setDayBlock(d, i, { endTime: v })} placeholder="fim (opc.)" />
                        <TouchableOpacity disabled={dayBlocksFor(d).length === 1} onPress={() => removeDayBlock(d, i)} style={styles.removeBtn}>
                          <Icon name="trash" size={14} color={dayBlocksFor(d).length === 1 ? colors.line : colors.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={styles.addBtn} onPress={() => addDayBlock(d)}>
                      <Icon name="plus" size={14} color={colors.accent} /><Text style={styles.addBtnText}>Bloco</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <Text style={styles.hint}>Cada dia selecionado abaixo tem seus próprios blocos; mude os dias ali que a lista se ajusta.</Text>
            </View>
          )}
        </>
      )}

      {flexible && (
        <View style={styles.block}>
          <Text style={styles.fieldLegend}>Horário no calendário</Text>
          <Text style={styles.hint}>
            {timeMode === 'period' ? 'O calendário encaixa este objetivo dentro do período escolhido' : 'O calendário encaixa este objetivo em um horário livre do dia'}, sem sobrepor obrigações e eventos.
          </Text>
          <Text style={styles.label}>Duração (min)</Text>
          <TextInput style={styles.input} value={durationMin} onChangeText={setDurationMin} keyboardType="number-pad" />
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Depois das</Text>
              <TextInput style={styles.input} value={notBefore} onChangeText={setNotBefore} placeholder="opcional" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Antes das</Text>
              <TextInput style={styles.input} value={notAfter} onChangeText={setNotAfter} placeholder="opcional" />
            </View>
          </View>
          {!slot && <Text style={styles.error}>Não cabe: confira o período, "depois das" e "antes das".</Text>}
          {slot && <Text style={styles.hint}>Pode começar entre {toHHmm(slot[0])} e {toHHmm(Math.max(slot[0], slot[1] - (Number(durationMin) || 60)))}.</Text>}
          {suggestion && (
            <View style={styles.suggestionBox}>
              <Icon name="sparkles" size={14} color={colors.accent} />
              <Text style={styles.suggestionText}>A IA sugere <Text style={{ fontWeight: '700' }}>{suggestion.start}</Text>{suggestion.reason ? `. ${suggestion.reason}` : ''}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.secondaryBtn, (!a || !slot || suggestBusy || busy) && styles.submitDisabled]}
            disabled={!a || !slot || suggestBusy || busy}
            onPress={() => void suggestTime()}
          >
            {suggestBusy ? <ActivityIndicator size="small" color={colors.accent} /> : <Icon name="sparkles" size={14} color={colors.accent} />}
            <Text style={styles.secondaryBtnText}>{suggestBusy ? 'Consultando a IA…' : suggestion ? 'Sugerir outro horário com IA' : 'Sugerir melhor horário com IA'}</Text>
          </TouchableOpacity>
          {!a && <Text style={styles.hint}>Salve a atividade primeiro para usar a IA.</Text>}
        </View>
      )}

      <Text style={styles.fieldLegend}>Dias da semana</Text>
      <View style={styles.weekRow}>
        {WEEKDAY_SHORT.map((w, d) => (
          <TouchableOpacity key={d} style={[styles.weekChip, weekdays.includes(d) && styles.weekChipOn]} onPress={() => toggleDay(d)}>
            <Text style={[styles.weekChipText, weekdays.includes(d) && styles.weekChipTextOn]}>{w}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Finalidade</Text>
      <TextInput style={styles.input} value={purpose} onChangeText={setPurpose} placeholder="Para que existe esta atividade?" />
      <Text style={styles.label}>Princípio comportamental</Text>
      <TextInput style={styles.input} value={principle} onChangeText={setPrinciple} placeholder="Como quero me comportar ao realizá-la?" />

      <Text style={styles.fieldLegend}>Níveis</Text>
      <Text style={styles.label}>Mínimo</Text>
      <TextInput style={styles.input} value={minDesc} onChangeText={setMinDesc} placeholder="ex.: 5 páginas" />
      <Text style={styles.label}>Ideal</Text>
      <TextInput style={styles.input} value={idealDesc} onChangeText={setIdealDesc} placeholder="ex.: 20 páginas" />
      <Text style={styles.label}>Máximo</Text>
      <TextInput style={styles.input} value={maxDesc} onChangeText={setMaxDesc} placeholder="ex.: 40 páginas" />

      <View style={styles.block}>
        <Text style={styles.fieldLegend}>Lembrete diário</Text>
        <Text style={styles.hint}>Só avisa nos dias em que a atividade se aplica e se você ainda não registrou o dia.</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity style={[styles.chip, remindMode === 'none' && styles.chipOn]} onPress={() => setRemindMode('none')}><Text style={[styles.chipText, remindMode === 'none' && styles.chipTextOn]}>Sem lembrete</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.chip, remindMode === 'fixed' && styles.chipOn]} onPress={() => setRemindMode('fixed')}><Text style={[styles.chipText, remindMode === 'fixed' && styles.chipTextOn]}>Horário fixo</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.chip, remindMode === 'before' && styles.chipOn]} onPress={() => setRemindMode('before')}><Text style={[styles.chipText, remindMode === 'before' && styles.chipTextOn]}>Antes do horário</Text></TouchableOpacity>
        </View>
        {remindMode === 'fixed' && (
          <>
            <Text style={styles.label}>Avisar às</Text>
            <TextInput style={styles.input} value={remindTime} onChangeText={setRemindTime} placeholder="HH:MM" />
          </>
        )}
        {remindMode === 'before' && (
          <View style={styles.chipRow}>
            {REMIND_BEFORE_OPTIONS.map((m) => (
              <TouchableOpacity key={m} style={[styles.chip, remindBeforeMin === m && styles.chipOn]} onPress={() => setRemindBeforeMin(m)}>
                <Text style={[styles.chipText, remindBeforeMin === m && styles.chipTextOn]}>{m < 60 ? `${m} min antes` : '1 h antes'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {remindMode !== 'none' && <ChannelChecks value={remindChannels} onChange={setRemindChannels} />}
      </View>

      <TouchableOpacity style={styles.checkRow} onPress={() => setActive((v) => !v)}>
        <Icon name={active ? 'check' : 'x'} size={16} color={active ? colors.ideal : colors.inkSoft} />
        <Text style={styles.checkText}>Ativa (desmarque para arquivar sem apagar o histórico)</Text>
      </TouchableOpacity>

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar'}</Text>
      </TouchableOpacity>
      {a && (
        <TouchableOpacity style={styles.deleteBtn} disabled={busy} onPress={confirmDelete}>
          <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar atividade</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  fieldLegend: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: spacing.md },
  hint: { fontSize: 12, color: colors.inkSoft },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  timeInput: { flex: 1, textAlign: 'center' },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginTop: spacing.sm, gap: spacing.xs },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dash: { color: colors.inkSoft },
  removeBtn: { padding: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  addBtnText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  row2: { flexDirection: 'row', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekChip: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  weekChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  weekChipText: { fontSize: 11, fontWeight: '700', color: colors.inkSoft },
  weekChipTextOn: { color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  checkText: { fontSize: 13, color: colors.ink, flex: 1 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md, paddingVertical: 10 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
  dayBlockGroup: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.xs },
  dayBlockLabel: { fontSize: 11, fontWeight: '700', color: colors.inkSoft, minWidth: 30, paddingTop: 10 },
  suggestionBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentTint, borderRadius: 10, padding: spacing.sm, marginTop: spacing.xs },
  suggestionText: { fontSize: 12, color: colors.ink, flex: 1 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.accent, borderRadius: 10, paddingVertical: 10, marginTop: spacing.sm },
  secondaryBtnText: { fontSize: 13, color: colors.accent, fontWeight: '700' },
});
