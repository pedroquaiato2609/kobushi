import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { AgentAction, PermissionRow } from '../../api/types';
import { QueryError } from '../../components/QueryError';
import { humanizeTool, STATUS_LABEL } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'ActionHistory'>;
const STATUS_COLOR: Record<string, string> = { pending: colors.min, executed: colors.ideal, denied: colors.danger, rejected: colors.danger, error: colors.danger };

function fmt(iso: string) { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

export function ActionHistoryScreen(_: Props) {
  const actions = useQuery({ queryKey: ['actions'], queryFn: () => api.get<AgentAction[]>('/agent/actions?limit=50') });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermissionRow[]>('/agent/permissions') });
  const [open, setOpen] = useState<string | null>(null);
  const toolRows = new Map((permissions.data ?? []).map((p) => [p.tool, p] as const));

  if (actions.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (actions.error) return <QueryError error={actions.error} onRetry={() => void actions.refetch()} />;
  const list = actions.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {list.length === 0 && <Text style={styles.empty}>O agente ainda não executou nenhuma ação.</Text>}
      {list.map((a) => {
        const row = toolRows.get(a.tool);
        const title = row?.label || humanizeTool(a.tool);
        const isOpen = open === a.id;
        return (
          <TouchableOpacity key={a.id} style={styles.card} onPress={() => setOpen(isOpen ? null : a.id)}>
            <View style={styles.head}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[a.status] ?? colors.inkSoft }]} />
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <Text style={styles.date}>{fmt(a.createdAt)}</Text>
            </View>
            <Text style={styles.status}>{STATUS_LABEL[a.status] ?? a.status}</Text>
            {isOpen && (
              <Text style={styles.json}>{JSON.stringify({ args: a.args, result: a.result }, null, 2)}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  empty: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 13, fontWeight: '700', color: colors.ink, flex: 1 },
  date: { fontSize: 11, color: colors.inkSoft },
  status: { fontSize: 11, color: colors.inkSoft },
  json: { fontSize: 10, color: colors.inkSoft, fontFamily: 'monospace', marginTop: spacing.xs, backgroundColor: colors.surface2, borderRadius: 8, padding: spacing.sm },
});
