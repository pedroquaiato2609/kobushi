import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Activity, ActivityKind, DayPlan, Level } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { KIND_LABEL, LEVEL_LABEL, LEVELS, WEEKDAY_SHORT, timeLabel } from '../../lib/labels';
import { todayISO } from '../../lib/dates';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Activities'>;
type Filter = 'all' | ActivityKind;
const FILTERS: [Filter, string][] = [['all', 'Todas'], ['obligation', 'Obrigações'], ['goal', 'Objetivos'], ['special', 'Meditação']];

function LevelPicker({ activity, value, onChange }: { activity: Pick<Activity, 'minDesc' | 'idealDesc' | 'maxDesc'>; value: Level | null; onChange: (l: Level | null) => void }) {
  const desc: Record<Level, string> = { min: activity.minDesc, ideal: activity.idealDesc, max: activity.maxDesc };
  return (
    <View style={styles.levelRow}>
      {LEVELS.map((l) => (
        <TouchableOpacity key={l} style={[styles.levelBtn, styles[`level_${l}` as const], value === l && styles.levelBtnOn]} onPress={() => onChange(value === l ? null : l)}>
          <Text style={[styles.levelName, value === l && styles.levelNameOn]}>{LEVEL_LABEL[l]}</Text>
          {!!desc[l] && <Text style={[styles.levelDesc, value === l && styles.levelNameOn]} numberOfLines={1}>{desc[l]}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function ActivitiesScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const today = todayISO();
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const plan = useQuery({ queryKey: ['day', today], queryFn: () => api.get<DayPlan>(`/day?date=${today}`) });
  const [filter, setFilter] = useState<Filter>('all');
  const [archived, setArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const todayLevel = useMemo(() => new Map((plan.data?.items ?? []).map((i) => [i.id, i.executionLevel] as const)), [plan.data]);
  const all = activities.data ?? [];
  const list = all
    .filter((a) => (archived ? true : a.active))
    .filter((a) => filter === 'all' || a.kind === filter);

  async function setLevel(activityId: string, level: Level | null) {
    setBusyId(activityId);
    try {
      if (level) await api.put('/executions', { activityId, date: today, level });
      else await api.del(`/executions?activityId=${activityId}&date=${today}`);
      await qc.invalidateQueries({ queryKey: ['day', today] });
      await qc.invalidateQueries({ queryKey: ['activity-matrix'] });
    } finally {
      setBusyId(null);
    }
  }

  if (activities.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (activities.error) return <QueryError title="Não consegui carregar as atividades" error={activities.error} onRetry={() => void activities.refetch()} />;

  return (
    <View style={styles.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg }}>
        {FILTERS.map(([k, label]) => (
          <TouchableOpacity key={k} style={[styles.chip, filter === k && styles.chipOn]} onPress={() => setFilter(k)}>
            <Text style={[styles.chipText, filter === k && styles.chipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.chip, archived && styles.chipOn]} onPress={() => setArchived((v) => !v)}>
          <Text style={[styles.chipText, archived && styles.chipTextOn]}>Arquivadas</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        {list.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{all.length === 0 ? 'Você ainda não tem atividades.' : 'Nenhuma atividade com esse filtro.'}</Text>
          </View>
        )}
        {list.map((a) => {
          const appliesToday = todayLevel.has(a.id);
          return (
            <View key={a.id} style={[styles.card, !a.active && styles.cardArchived]}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{a.name}</Text>
                  <Text style={styles.cardSub}>{timeLabel(a)}</Text>
                </View>
                <View style={[styles.tag, styles[`tag_${a.kind}` as const]]}><Text style={styles.tagText}>{KIND_LABEL[a.kind].split(' (')[0]}</Text></View>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAY_SHORT.map((w, d) => (
                  <View key={d} style={[styles.weekDot, a.weekdays.includes(d) && styles.weekDotOn]}>
                    <Text style={[styles.weekDotText, a.weekdays.includes(d) && styles.weekDotTextOn]}>{w[0]}</Text>
                  </View>
                ))}
              </View>

              {!!a.purpose && <Text style={styles.purpose}>{a.purpose}</Text>}
              {!!a.principle && <Text style={styles.principle}>“{a.principle}”</Text>}

              {(a.remindTime || a.remindMinutes != null) && (
                <View style={styles.remindRow}>
                  <Icon name="bell" size={13} color={colors.inkSoft} />
                  <Text style={styles.remindText}>{a.remindTime ? `Aviso às ${a.remindTime}` : `Aviso ${a.remindMinutes} min antes`}</Text>
                </View>
              )}

              {a.active && appliesToday && (
                <LevelPicker activity={a} value={todayLevel.get(a.id) ?? null} onChange={(l) => void setLevel(a.id, l)} />
              )}
              {busyId === a.id && <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: spacing.xs }} />}

              <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('NewActivity', { activity: a })}>
                <Icon name="edit" size={14} color={colors.accent} /><Text style={styles.editText}>Editar</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewActivity', undefined)}>
        <Icon name="plus" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterBar: { flexGrow: 0, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 3 },
  empty: { padding: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.inkSoft, fontSize: 13 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  card: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  cardArchived: { opacity: 0.6 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardSub: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  tag: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm, backgroundColor: colors.surface2 },
  tag_obligation: { backgroundColor: 'rgba(207, 53, 98, 0.12)' },
  tag_goal: { backgroundColor: colors.accentTint },
  tag_special: { backgroundColor: 'rgba(26, 143, 99, 0.12)' },
  tagText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekDot: { width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  weekDotOn: { backgroundColor: colors.accent },
  weekDotText: { fontSize: 10, color: colors.inkSoft, fontWeight: '700' },
  weekDotTextOn: { color: '#fff' },
  purpose: { fontSize: 13, color: colors.ink },
  principle: { fontSize: 12, color: colors.inkSoft, fontStyle: 'italic' },
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  remindText: { fontSize: 12, color: colors.inkSoft },
  levelRow: { flexDirection: 'row', gap: spacing.xs },
  levelBtn: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 },
  levelBtnOn: { borderColor: colors.ink, backgroundColor: colors.ink },
  level_min: {}, level_ideal: {}, level_max: {},
  levelName: { fontSize: 12, fontWeight: '700', color: colors.ink },
  levelDesc: { fontSize: 10, color: colors.inkSoft },
  levelNameOn: { color: '#fff' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  editText: { fontSize: 12, color: colors.accent, fontWeight: '700' },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 52, height: 52, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
