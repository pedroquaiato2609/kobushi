import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { DailyReview, ReadingOverview, Stats } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { addDaysIso, dayHeading, todayISO } from '../../lib/dates';
import { KIND_GROUP } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Stats'>;
const RANGES = [7, 30, 90];
const BAR_H = 100;

/** Gráfico de barras empilhadas feito com Views puras (sem lib de gráfico — recharts é só do app web,
 * não roda em React Native). Uma barra por dia, altura proporcional, cores min/ideal/máx/sem registro. */
function DayBars({ days }: { days: Stats['days'] }) {
  const max = Math.max(1, ...days.map((d) => d.applicable));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barsRow}>
      {days.map((d) => {
        const missed = Math.max(0, d.applicable - d.done);
        const scale = BAR_H / max;
        return (
          <View key={d.date} style={styles.barCol}>
            <View style={[styles.barStack, { height: d.applicable * scale || 2 }]}>
              {d.max > 0 && <View style={[styles.seg, { flexGrow: d.max, backgroundColor: colors.max }]} />}
              {d.ideal > 0 && <View style={[styles.seg, { flexGrow: d.ideal, backgroundColor: colors.ideal }]} />}
              {d.min > 0 && <View style={[styles.seg, { flexGrow: d.min, backgroundColor: colors.min }]} />}
              {missed > 0 && <View style={[styles.seg, { flexGrow: missed, backgroundColor: colors.line }]} />}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

export function StatsScreen({ navigation }: Props) {
  const [days, setDays] = useState(30);
  const today = todayISO();
  const from = addDaysIso(today, -(days - 1));

  const stats = useQuery({ queryKey: ['stats', from, today], queryFn: () => api.get<Stats>(`/stats?from=${from}&to=${today}`) });
  const reviews = useQuery({ queryKey: ['reviews', from, today], queryFn: () => api.get<DailyReview[]>(`/reviews?from=${from}&to=${today}`) });
  const reading = useQuery({ queryKey: ['reading-overview'], queryFn: () => api.get<ReadingOverview>('/reading/overview') });
  const [openReview, setOpenReview] = useState<string | null>(null);

  const s = stats.data;
  const meditationAvg = useMemo(() => {
    const list = s?.meditation ?? [];
    if (list.length === 0) return null;
    return Math.round(list.reduce((n, m) => n + m.durationMin, 0) / list.length);
  }, [s]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <TouchableOpacity key={r} style={[styles.rangeChip, days === r && styles.rangeChipOn]} onPress={() => setDays(r)}>
            <Text style={[styles.rangeChipText, days === r && styles.rangeChipTextOn]}>{r} dias</Text>
          </TouchableOpacity>
        ))}
      </View>

      {stats.isLoading && <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />}
      {stats.error && <QueryError error={stats.error} onRetry={() => void stats.refetch()} />}

      {s && (
        <>
          <View style={styles.block}>
            <Text style={styles.summaryLine}>
              {s.currentStreak > 0 ? `${s.currentStreak} ${s.currentStreak === 1 ? 'dia seguido' : 'dias seguidos'} com tudo registrado, ao menos no mínimo.` : 'Nenhuma sequência ativa. Um dia no mínimo já preserva a continuidade.'}
            </Text>
            <View style={styles.totalsRow}>
              <View style={styles.totTile}><Text style={[styles.totValue, { color: colors.min }]}>{s.totals.min}</Text><Text style={styles.totLabel}>Mínimo</Text></View>
              <View style={styles.totTile}><Text style={[styles.totValue, { color: colors.ideal }]}>{s.totals.ideal}</Text><Text style={styles.totLabel}>Ideal</Text></View>
              <View style={styles.totTile}><Text style={[styles.totValue, { color: colors.max }]}>{s.totals.max}</Text><Text style={styles.totLabel}>Máximo</Text></View>
              <View style={styles.totTile}><Text style={styles.totValue}>{s.totals.applicable - s.totals.done}</Text><Text style={styles.totLabel}>Sem registro</Text></View>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Execução por dia</Text>
            {s.days.length === 0 ? <Text style={styles.hint}>Sem dados no período.</Text> : <DayBars days={s.days} />}
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Por atividade</Text>
            {s.byActivity.length === 0 && <Text style={styles.hint}>Nenhuma atividade no período.</Text>}
            {s.byActivity.map((a) => {
              const total = a.min + a.ideal + a.max + a.missed || 1;
              return (
                <View key={a.activityId} style={styles.actRow}>
                  <View style={styles.actHead}><Text style={styles.actName}>{a.name}</Text><Text style={styles.hint}>{KIND_GROUP[a.kind]}</Text></View>
                  <View style={styles.stackBar}>
                    {a.min > 0 && <View style={{ flexGrow: a.min / total, backgroundColor: colors.min }} />}
                    {a.ideal > 0 && <View style={{ flexGrow: a.ideal / total, backgroundColor: colors.ideal }} />}
                    {a.max > 0 && <View style={{ flexGrow: a.max / total, backgroundColor: colors.max }} />}
                    {a.missed > 0 && <View style={{ flexGrow: a.missed / total, backgroundColor: colors.line }} />}
                  </View>
                  <Text style={styles.hint}>mín {a.min} · ideal {a.ideal} · máx {a.max} · sem registro {a.missed}</Text>
                </View>
              );
            })}
          </View>

          {reading.data && reading.data.totalBooks > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Leitura</Text>
              <View style={styles.totalsRow}>
                <View style={styles.totTile}><Text style={styles.totValue}>{reading.data.reading.length}</Text><Text style={styles.totLabel}>Lendo agora</Text></View>
                <View style={styles.totTile}><Text style={styles.totValue}>{reading.data.pagesThisMonth}</Text><Text style={styles.totLabel}>Páginas/mês</Text></View>
                <View style={styles.totTile}><Text style={styles.totValue}>{reading.data.finishedThisYear}</Text><Text style={styles.totLabel}>Terminados</Text></View>
                <View style={styles.totTile}><Text style={styles.totValue}>{reading.data.streak}</Text><Text style={styles.totLabel}>Sequência</Text></View>
              </View>
            </View>
          )}

          <View style={styles.block}>
            <View style={styles.sectionHead}>
              <Text style={styles.blockTitle}>Meditação</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('NewMeditation')}>
                <Icon name="plus" size={13} color="#fff" /><Text style={styles.addBtnText}>Registrar</Text>
              </TouchableOpacity>
            </View>
            {(s.meditation ?? []).length === 0 ? (
              <Text style={styles.hint}>Nenhuma sessão no período.</Text>
            ) : (
              <>
                <Text style={styles.hint}>{s.meditation.length} sessão(ões) · média {meditationAvg} min</Text>
                {s.meditation.slice(0, 8).map((m) => (
                  <View key={m.id} style={styles.medRow}>
                    <Text style={styles.medDate}>{m.date.slice(8, 10)}/{m.date.slice(5, 7)}</Text>
                    <Text style={styles.medText}>{m.durationMin} min{m.note ? ` · ${m.note}` : ''}</Text>
                  </View>
                ))}
              </>
            )}
          </View>

          <View style={styles.block}>
            <View style={styles.sectionHead}>
              <Text style={styles.blockTitle}>Revisão do dia</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('DailyReview', { date: today })}>
                <Icon name="edit" size={13} color="#fff" /><Text style={styles.addBtnText}>Hoje</Text>
              </TouchableOpacity>
            </View>
            {(reviews.data ?? []).length === 0 && <Text style={styles.hint}>Nenhuma revisão no período.</Text>}
            {(reviews.data ?? []).map((r) => (
              <TouchableOpacity key={r.date} style={styles.reviewRow} onPress={() => { setOpenReview(openReview === r.date ? null : r.date); }}>
                <View style={styles.reviewHead}>
                  <Text style={styles.reviewDate}>{dayHeading(r.date)}</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('DailyReview', { date: r.date })}><Icon name="edit" size={14} color={colors.accent} /></TouchableOpacity>
                </View>
                <Text style={styles.reviewPreview} numberOfLines={openReview === r.date ? undefined : 1}>
                  {r.learned || r.responsibilities || r.goals || r.state || '(sem texto)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  rangeRow: { flexDirection: 'row', gap: spacing.xs },
  rangeChip: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.surface },
  rangeChipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  rangeChipText: { fontSize: 13, color: colors.inkSoft, fontWeight: '600' },
  rangeChipTextOn: { color: colors.accent },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  blockTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 12, color: colors.inkSoft },
  summaryLine: { fontSize: 13, color: colors.ink },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  totTile: { alignItems: 'center', gap: 2 },
  totValue: { fontSize: 18, fontWeight: '700', color: colors.ink },
  totLabel: { fontSize: 10, color: colors.inkSoft },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: BAR_H + 4, paddingTop: 4 },
  barCol: { justifyContent: 'flex-end', height: BAR_H },
  barStack: { width: 8, borderRadius: 3, overflow: 'hidden', flexDirection: 'column-reverse' },
  seg: { width: '100%' },
  actRow: { marginTop: spacing.sm, gap: 4 },
  actHead: { flexDirection: 'row', justifyContent: 'space-between' },
  actName: { fontSize: 13, fontWeight: '700', color: colors.ink },
  stackBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surface2 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  medRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  medDate: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, width: 40 },
  medText: { fontSize: 12, color: colors.ink, flex: 1 },
  reviewRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.xs, marginTop: spacing.xs, gap: 2 },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewDate: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },
  reviewPreview: { fontSize: 13, color: colors.ink },
});
