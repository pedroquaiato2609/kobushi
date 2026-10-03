import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { SessionInfo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Account'>;

const device = (ua: string) => {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'Aparelho';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /Ninshiki/.test(ua) ? 'App Ninshiki' : 'navegador';
  return `${br} em ${os}`;
};
const fmtDate = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function AccountScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<SessionInfo[]>('/auth/sessions') });

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function revoke(id: string) {
    await api.del(`/auth/sessions/${id}`);
    await qc.invalidateQueries({ queryKey: ['sessions'] });
  }
  function confirmRevoke(s: SessionInfo) {
    Alert.alert('Desconectar aparelho?', device(s.userAgent), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desconectar', style: 'destructive', onPress: () => void revoke(s.id) },
    ]);
  }

  async function changePassword() {
    if (next !== again) return setErr('As senhas novas não são iguais.');
    if (next.length < 10) return setErr('A nova senha precisa de pelo menos 10 caracteres.');
    setErr(null); setMsg(null); setBusy(true);
    try {
      await api.post('/auth/password', { current: cur, next });
      setCur(''); setNext(''); setAgain('');
      setMsg('Senha alterada. Os outros aparelhos foram desconectados.');
      await qc.invalidateQueries({ queryKey: ['sessions'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui trocar a senha.');
    } finally {
      setBusy(false);
    }
  }

  function confirmLogout() {
    Alert.alert('Sair deste aparelho?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Sua conta</Text>
        <Text style={styles.accountLine}>{user?.name} · {user?.email}</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
          <Icon name="logout" size={14} color={colors.danger} /><Text style={styles.logoutText}>Sair deste aparelho</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Dispositivos conectados</Text>
        <Text style={styles.hint}>Se não reconhece algum, desconecte-o e troque a senha.</Text>
        {sessions.isLoading && <Text style={styles.hint}>Carregando…</Text>}
        {sessions.error && <QueryError error={sessions.error} onRetry={() => void sessions.refetch()} />}
        {(sessions.data ?? []).map((s) => (
          <View key={s.id} style={styles.sessionRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.sessionHead}>
                <Text style={styles.sessionDevice}>{device(s.userAgent)}</Text>
                {s.current && <View style={styles.tag}><Text style={styles.tagText}>este aparelho</Text></View>}
              </View>
              <Text style={styles.sessionMeta}>IP {s.ip || '—'} · ativo {fmtDate(s.lastSeenAt)}</Text>
            </View>
            {!s.current && (
              <TouchableOpacity onPress={() => confirmRevoke(s)}><Icon name="x" size={16} color={colors.danger} /></TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Trocar senha</Text>
        <Text style={styles.label}>Senha atual</Text>
        <TextInput style={styles.input} value={cur} onChangeText={setCur} secureTextEntry autoComplete="current-password" />
        <Text style={styles.label}>Nova senha (mínimo de 10 caracteres)</Text>
        <TextInput style={styles.input} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
        <Text style={styles.label}>Repita a nova senha</Text>
        <TextInput style={styles.input} value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" />
        {err && <Text style={styles.error}>{err}</Text>}
        {msg && <Text style={styles.ok}>{msg}</Text>}
        <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void changePassword()}>
          <Text style={styles.submitText}>{busy ? 'Trocando…' : 'Trocar senha'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  blockTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  accountLine: { fontSize: 13, color: colors.inkSoft },
  hint: { fontSize: 12, color: colors.inkSoft },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: spacing.xs },
  logoutText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.xs },
  sessionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sessionDevice: { fontSize: 13, fontWeight: '600', color: colors.ink },
  sessionMeta: { fontSize: 11, color: colors.inkSoft },
  tag: { backgroundColor: colors.accentTint, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 6 },
  tagText: { fontSize: 10, color: colors.accent, fontWeight: '700' },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.paper },
  error: { color: colors.danger, fontSize: 12 },
  ok: { color: colors.ideal, fontSize: 12 },
  submit: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: spacing.xs },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700' },
});
