import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { PermissionMode, PermissionRow } from '../../api/types';
import { QueryError } from '../../components/QueryError';
import { humanizeTool, RESOURCE_LABEL } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Permissions'>;
const MODES: PermissionMode[] = ['allow', 'confirm', 'deny'];
const MODE_LABEL: Record<PermissionMode, string> = { allow: 'Permitir', confirm: 'Perguntar', deny: 'Negar' };

export function PermissionsScreen(_: Props) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermissionRow[]>('/agent/permissions') });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setMode(tool: string, mode: PermissionMode) {
    setErr(null); setBusy(true);
    try {
      await api.put('/agent/permissions', { entries: [{ tool, mode }] });
      await qc.invalidateQueries({ queryKey: ['permissions'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui.');
    } finally {
      setBusy(false);
    }
  }
  async function preset(fn: (r: PermissionRow) => PermissionMode) {
    if (!q.data) return;
    setErr(null); setBusy(true);
    try {
      await api.put('/agent/permissions', { entries: q.data.map((r) => ({ tool: r.tool, mode: fn(r) })) });
      await qc.invalidateQueries({ queryKey: ['permissions'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui.');
    } finally {
      setBusy(false);
    }
  }
  const readMode = (r: PermissionRow): PermissionMode => (r.defaultMode === 'confirm' ? 'confirm' : 'allow');

  if (q.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (q.error) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;

  const rows = q.data ?? [];
  const grouped = Object.keys(RESOURCE_LABEL)
    .map((resource) => ({ resource, list: rows.filter((r) => r.resource === resource) }))
    .filter((g) => g.list.length > 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        Defina, ferramenta por ferramenta, o que o agente pode fazer. <Text style={{ fontWeight: '700' }}>Perguntar</Text> pausa a ação até você aprovar;{' '}
        <Text style={{ fontWeight: '700' }}>Negar</Text> esconde a ferramenta do agente.
      </Text>
      <View style={styles.presetRow}>
        <TouchableOpacity style={styles.presetBtn} disabled={busy} onPress={() => void preset((r) => r.defaultMode)}><Text style={styles.presetBtnText}>Padrão</Text></TouchableOpacity>
        <TouchableOpacity style={styles.presetBtn} disabled={busy} onPress={() => void preset((r) => (r.action === 'read' ? readMode(r) : 'confirm'))}><Text style={styles.presetBtnText}>Perguntar antes de alterar</Text></TouchableOpacity>
        <TouchableOpacity style={styles.presetBtn} disabled={busy} onPress={() => void preset((r) => (r.action === 'read' ? readMode(r) : 'deny'))}><Text style={styles.presetBtnText}>Somente leitura</Text></TouchableOpacity>
      </View>
      {err && <Text style={styles.error}>{err}</Text>}

      {grouped.map((g) => (
        <View key={g.resource} style={styles.block}>
          <Text style={styles.blockTitle}>{RESOURCE_LABEL[g.resource]}</Text>
          {g.list.map((r) => (
            <View key={r.tool} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolTitle}>{r.label || humanizeTool(r.tool)}</Text>
                <Text style={styles.toolDesc}>{r.description}</Text>
              </View>
              <View style={styles.seg}>
                {MODES.map((m) => (
                  <TouchableOpacity
                    key={m} style={[styles.segBtn, r.mode === m && styles.segBtnOn, r.locked && m === 'allow' && styles.segBtnDisabled]}
                    disabled={busy || (r.locked === true && m === 'allow')} onPress={() => void setMode(r.tool, m)}
                  >
                    <Text style={[styles.segText, r.mode === m && styles.segTextOn]}>{MODE_LABEL[m]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  hint: { fontSize: 12, color: colors.inkSoft },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  presetBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  presetBtnText: { fontSize: 11, color: colors.inkSoft, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 12 },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  blockTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  row: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.xs },
  toolTitle: { fontSize: 13, fontWeight: '600', color: colors.ink },
  toolDesc: { fontSize: 11, color: colors.inkSoft },
  seg: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 8, padding: 2 },
  segBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  segBtnOn: { backgroundColor: colors.ink },
  segBtnDisabled: { opacity: 0.4 },
  segText: { fontSize: 11, color: colors.inkSoft, fontWeight: '700' },
  segTextOn: { color: '#fff' },
});
