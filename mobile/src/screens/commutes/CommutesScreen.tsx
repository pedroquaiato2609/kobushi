import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Activity, Commute } from '../../api/types';
import { Icon } from '../../components/Icon';
import { DIRECTION_LABEL } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Commutes'>;

export function CommutesScreen({ navigation }: Props) {
  const commutes = useQuery({ queryKey: ['commutes'], queryFn: () => api.get<Commute[]>('/commutes') });
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const activityName = (id: string) => activities.data?.find((a) => a.id === id)?.name ?? '—';

  if (commutes.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  const list = commutes.data ?? [];
  const hasFixedActivity = (activities.data ?? []).some((a) => a.timeMode === 'fixed' && a.active);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {list.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum deslocamento ainda.</Text>
            {!hasFixedActivity && <Text style={styles.hint}>Um deslocamento precisa de uma atividade com horário definido pra se ancorar — crie uma em Atividades primeiro (ex.: "Academia", horário definido).</Text>}
          </View>
        )}
        {list.map((c) => (
          <TouchableOpacity key={c.id} style={[styles.card, !c.active && styles.cardArchived]} onPress={() => navigation.navigate('NewCommute', { commute: c })}>
            <View style={styles.cardHead}>
              <Icon name="car" size={18} color={colors.accent} />
              <Text style={styles.name}>{c.name}</Text>
            </View>
            <Text style={styles.sub}>{DIRECTION_LABEL[c.direction]} · {c.durationMin} min</Text>
            <Text style={styles.sub}>Ancorado em: {activityName(c.activityId)}</Text>
            {(c.remindTime || c.remindMinutes != null) && (
              <View style={styles.remindRow}>
                <Icon name="bell" size={12} color={colors.inkSoft} />
                <Text style={styles.remindText}>{c.remindTime ? `Aviso às ${c.remindTime}` : `Aviso ${c.remindMinutes} min antes`}</Text>
              </View>
            )}
            {!c.active && <Text style={styles.pausedTag}>Pausado</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewCommute', undefined)}>
        <Icon name="plus" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 3 },
  empty: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  emptyText: { color: colors.inkSoft, fontSize: 13 },
  hint: { color: colors.inkSoft, fontSize: 12, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4 },
  cardArchived: { opacity: 0.6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 12, color: colors.inkSoft },
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  remindText: { fontSize: 12, color: colors.inkSoft },
  pausedTag: { fontSize: 11, color: colors.danger, fontWeight: '700' },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 52, height: 52, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
