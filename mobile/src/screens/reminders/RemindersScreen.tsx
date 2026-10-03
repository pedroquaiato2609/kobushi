import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Activity, CalendarEvent, Commute, Reminder } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { addDaysIso, dayHeading, todayISO } from '../../lib/dates';
import { CHANNEL_LABEL } from '../../lib/labels';
import { type ReminderItem, type ReminderKind, upcomingReminders } from '../../lib/reminders';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Reminders'>;
type Filter = 'all' | ReminderKind | 'done';
const FILTERS: [Filter, string][] = [['all', 'Todos'], ['reminder', 'Avulsos'], ['activity', 'Atividades'], ['commute', 'Deslocamentos'], ['event', 'Eventos'], ['done', 'Já avisados']];
const KIND_TAG: Record<ReminderKind, string> = { reminder: 'Lembrete', activity: 'Atividade', commute: 'Deslocamento', event: 'Evento' };

export function RemindersScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const now = useMemo(() => new Date(), []);
  const reminders = useQuery({ queryKey: ['reminders'], queryFn: () => api.get<Reminder[]>('/reminders') });
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const commutes = useQuery({ queryKey: ['commutes'], queryFn: () => api.get<Commute[]>('/commutes') });
  const today = todayISO();
  const events = useQuery({ queryKey: ['events', '60d'], queryFn: () => api.get<CalendarEvent[]>(`/events?from=${today}T00:00&to=${addDaysIso(today, 60)}T23:59`) });

  const [filter, setFilter] = useState<Filter>('all');
  const loading = reminders.isLoading || activities.isLoading || commutes.isLoading;

  const all = useMemo(
    () => upcomingReminders(reminders.data ?? [], activities.data ?? [], events.data ?? [], commutes.data ?? [], now),
    [reminders.data, activities.data, events.data, commutes.data, now],
  );
  const list = all.filter((i) => (filter === 'all' ? !i.done : filter === 'done' ? i.done : !i.done && i.kind === filter));

  const todayStr = todayISO();
  const tomorrowStr = addDaysIso(todayStr, 1);
  const groups: { title: string; items: ReminderItem[] }[] = [];
  for (const item of list) {
    const d = item.at.slice(0, 10);
    const title = item.done ? 'Já avisados' : d === todayStr ? 'Hoje' : d === tomorrowStr ? 'Amanhã' : dayHeading(d);
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }

  async function toggleDone(id: string, done: boolean) {
    await api.patch(`/reminders/${id}`, { done });
    await qc.invalidateQueries({ queryKey: ['reminders'] });
  }
  function confirmDelete(i: ReminderItem) {
    Alert.alert('Apagar lembrete?', `Apagar "${i.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void (async () => { await api.del(`/reminders/${i.reminder!.id}`); await qc.invalidateQueries({ queryKey: ['reminders'] }); })() },
    ]);
  }

  function open(i: ReminderItem) {
    if (i.kind === 'reminder') navigation.navigate('NewReminder', { reminder: i.reminder });
    else if (i.kind === 'activity') navigation.navigate('NewActivity', { activity: i.activity });
    else if (i.kind === 'commute') navigation.navigate('NewCommute', { commute: i.commute });
    // eventos: edição ainda não existe no mobile (ver README) — toque não faz nada.
  }

  return (
    <View style={styles.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg }}>
        {FILTERS.map(([k, label]) => (
          <TouchableOpacity key={k} style={[styles.chip, filter === k && styles.chipOn]} onPress={() => setFilter(k)}>
            <Text style={[styles.chipText, filter === k && styles.chipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : reminders.error ?? activities.error ?? commutes.error ? (
        <QueryError error={reminders.error ?? activities.error ?? commutes.error} onRetry={() => { void reminders.refetch(); void activities.refetch(); void commutes.refetch(); }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {list.length === 0 && <Text style={styles.empty}>Nenhum lembrete por aqui.</Text>}
          {groups.map((g) => (
            <View key={g.title} style={{ gap: spacing.sm }}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              {g.items.map((i) => (
                <TouchableOpacity key={i.key} style={styles.row} onPress={() => open(i)} disabled={i.kind === 'event'}>
                  <Text style={styles.time}>{i.at.slice(11)}</Text>
                  <View style={styles.main}>
                    <Text style={styles.title}>{i.title}</Text>
                    <Text style={styles.detail} numberOfLines={1}>
                      {i.detail}{i.channels.length ? ` · ${i.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}` : ' · só no sino'}
                    </Text>
                  </View>
                  <View style={[styles.tag, styles[`tag_${i.kind}` as const]]}><Text style={styles.tagText}>{KIND_TAG[i.kind]}</Text></View>
                  {i.kind === 'reminder' && i.reminder && (
                    <View style={styles.actions}>
                      <TouchableOpacity onPress={() => void toggleDone(i.reminder!.id, i.reminder!.status !== 'done')}>
                        <Icon name={i.reminder.status === 'done' ? 'clock' : 'check'} size={16} color={colors.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmDelete(i)}><Icon name="trash" size={16} color={colors.danger} /></TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewReminder', undefined)}>
        <Icon name="plus" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterBar: { flexGrow: 0, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 3 },
  empty: { color: colors.inkSoft, fontSize: 13, textAlign: 'center', marginTop: spacing.lg },
  groupTitle: { fontSize: 13, fontWeight: '700', color: colors.ink, textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, gap: spacing.sm },
  time: { fontSize: 13, fontWeight: '700', color: colors.inkSoft, width: 40 },
  main: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700', color: colors.ink },
  detail: { fontSize: 11, color: colors.inkSoft },
  tag: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.xs, backgroundColor: colors.surface2 },
  tag_reminder: {}, tag_activity: { backgroundColor: colors.accentTint }, tag_commute: { backgroundColor: 'rgba(173,114,8,0.12)' }, tag_event: { backgroundColor: 'rgba(63,111,224,0.12)' },
  tagText: { fontSize: 10, fontWeight: '700', color: colors.ink },
  actions: { flexDirection: 'row', gap: spacing.sm },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 52, height: 52, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
