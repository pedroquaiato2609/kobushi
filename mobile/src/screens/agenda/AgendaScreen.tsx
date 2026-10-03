import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { CalendarEvent, Commute, DayPlan, DayPlanItem, Level } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { addDaysIso, dayHeading, todayISO } from '../../lib/dates';
import { KIND_LABEL, LEVEL_LABEL, LEVELS } from '../../lib/labels';
import { PERIOD_WINDOW, commuteBlock, effectiveBlocks, toMin } from '../../lib/schedule';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Agenda'>;

interface Row { key: string; sortKey: number; time: string | null; title: string; detail: string; kind: 'activity' | 'commute' | 'event'; activity?: DayPlanItem; event?: CalendarEvent }

/**
 * Agenda do dia em formato de lista (não a grade visual de horários do app web — essa exigiria um
 * componente de calendário próprio pra tela pequena do celular). Mostra, em ordem cronológica, as
 * atividades aplicáveis ao dia, os deslocamentos derivados e os eventos marcados.
 */
export function AgendaScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const weekday = useMemo(() => new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))).getDay(), [date]);

  const plan = useQuery({ queryKey: ['day', date], queryFn: () => api.get<DayPlan>(`/day?date=${date}`) });
  const events = useQuery({
    queryKey: ['events', date],
    queryFn: () => api.get<CalendarEvent[]>(`/events?from=${date}T00:00&to=${date}T23:59`),
  });
  const commutes = useQuery({ queryKey: ['commutes'], queryFn: () => api.get<Commute[]>('/commutes') });

  const items = plan.data?.items ?? [];
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const it of items) {
      let sortKey = 1440 + 600; // sem horário: no fim da lista
      let time: string | null = null;
      if (it.timeMode === 'fixed') {
        const b = effectiveBlocks(it, weekday)[0];
        if (b) { time = b.startTime; sortKey = toMin(b.startTime); }
      } else if (it.timeMode === 'period' && it.period) {
        sortKey = PERIOD_WINDOW[it.period][0];
      }
      out.push({ key: `a-${it.id}`, sortKey, time, title: it.name, detail: KIND_LABEL[it.kind].split(' (')[0], kind: 'activity', activity: it });
    }
    for (const c of commutes.data ?? []) {
      if (!c.active) continue;
      const anchor = itemsById.get(c.activityId);
      if (!anchor) continue;
      const block = commuteBlock(anchor, weekday, c.direction, c.durationMin);
      if (!block) continue;
      out.push({ key: `c-${c.id}`, sortKey: toMin(block.startTime), time: block.startTime, title: c.name, detail: `Deslocamento · ${block.startTime}–${block.endTime}`, kind: 'commute' });
    }
    for (const e of events.data ?? []) {
      const time = e.start.slice(11, 16);
      out.push({ key: `e-${e.id}`, sortKey: toMin(time), time, title: e.title, detail: e.location ? `Evento · ${e.location}` : 'Evento', kind: 'event', event: e });
    }
    return out.sort((a, b) => a.sortKey - b.sortKey);
  }, [items, itemsById, commutes.data, events.data, weekday]);

  async function setLevel(activityId: string, level: Level | null) {
    if (level) await api.put('/executions', { activityId, date, level });
    else await api.del(`/executions?activityId=${activityId}&date=${date}`);
    await qc.invalidateQueries({ queryKey: ['day', date] });
  }

  const loading = plan.isLoading;

  return (
    <View style={styles.screen}>
      <View style={styles.dateBar}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setDate((d) => addDaysIso(d, -1))}><Icon name="left" size={16} color={colors.accent} /></TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setDate(todayISO())}>
          <Text style={styles.dateLabel}>{dayHeading(date)}</Text>
          {date === todayISO() && <Text style={styles.dateToday}>Hoje</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => setDate((d) => addDaysIso(d, 1))}><Icon name="right" size={16} color={colors.accent} /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : plan.error ? (
        <QueryError error={plan.error} onRetry={() => void plan.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {rows.length === 0 && <Text style={styles.empty}>Nada marcado para este dia.</Text>}
          {rows.map((r) => {
            const Wrap = r.kind === 'event' ? TouchableOpacity : View;
            return (
              <Wrap key={r.key} style={styles.row} {...(r.kind === 'event' ? { onPress: () => navigation.navigate('NewEvent', { event: r.event }) } : {})}>
                <View style={styles.timeCol}><Text style={styles.timeText}>{r.time ?? '—'}</Text></View>
                <View style={[styles.bar, r.kind === 'commute' && styles.barCommute, r.kind === 'event' && styles.barEvent]} />
                <View style={styles.main}>
                  <Text style={styles.title}>{r.title}</Text>
                  <Text style={styles.detail}>{r.detail}</Text>
                  {r.kind === 'activity' && r.activity && r.activity.active && (
                    <View style={styles.levelRow}>
                      {LEVELS.map((l) => (
                        <TouchableOpacity key={l} style={[styles.levelChip, r.activity!.executionLevel === l && styles.levelChipOn]} onPress={() => void setLevel(r.activity!.id, r.activity!.executionLevel === l ? null : l)}>
                          <Text style={[styles.levelChipText, r.activity!.executionLevel === l && styles.levelChipTextOn]}>{LEVEL_LABEL[l]}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                {r.kind === 'event' && <Icon name="right" size={14} color={colors.inkSoft} />}
              </Wrap>
            );
          })}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Activities')}>
        <Text style={styles.linkText}>Ver/editar todas as atividades →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewEvent', { initialStart: `${date}T09:00` })}>
        <Icon name="plus" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dateBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  navBtn: { padding: spacing.sm },
  dateLabel: { fontSize: 14, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  dateToday: { fontSize: 11, color: colors.accent, textAlign: 'center', fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  empty: { color: colors.inkSoft, fontSize: 13, textAlign: 'center', marginTop: spacing.lg },
  row: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, gap: spacing.sm, alignItems: 'stretch' },
  timeCol: { width: 44, alignItems: 'center', justifyContent: 'center' },
  timeText: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },
  bar: { width: 3, borderRadius: 3, backgroundColor: colors.accent },
  barCommute: { backgroundColor: colors.min },
  barEvent: { backgroundColor: colors.accent2 },
  main: { flex: 1, gap: 2, paddingVertical: 2 },
  title: { fontSize: 14, fontWeight: '700', color: colors.ink },
  detail: { fontSize: 12, color: colors.inkSoft },
  levelRow: { flexDirection: 'row', gap: 4, marginTop: spacing.xs },
  levelChip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 4, paddingHorizontal: spacing.sm, backgroundColor: colors.surface2 },
  levelChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  levelChipText: { fontSize: 11, fontWeight: '700', color: colors.inkSoft },
  levelChipTextOn: { color: '#fff' },
  linkBtn: { padding: spacing.md, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  linkText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.xl * 2, width: 52, height: 52, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
