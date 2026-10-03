import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ApiError, api } from '../../api/client';
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

  // LGPD: exportar/apagar dados, com reconfirmação de senha quando o servidor exigir.
  const [reauthPw, setReauthPw] = useState('');
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthErr, setReauthErr] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState<null | 'export' | 'finance' | 'everything'>(null);
  const [privacyErr, setPrivacyErr] = useState<string | null>(null);
  const [confirmFinance, setConfirmFinance] = useState('');
  const [confirmEverything, setConfirmEverything] = useState('');
  const [showDanger, setShowDanger] = useState(false);

  async function withReauth(fn: () => Promise<void>) {
    setPrivacyErr(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'reauth_required') {
        setReauthErr(null);
        setReauthPw('');
        setPendingAction(() => fn);
      } else {
        setPrivacyErr(e instanceof Error ? e.message : 'Não consegui concluir.');
      }
    }
  }

  async function confirmReauth() {
    if (!pendingAction) return;
    setReauthErr(null); setReauthBusy(true);
    try {
      await api.post('/auth/reauth', { password: reauthPw });
      const fn = pendingAction;
      setPendingAction(null);
      setReauthPw('');
      await fn();
    } catch (e) {
      setReauthErr(e instanceof Error ? e.message : 'Senha incorreta.');
    } finally {
      setReauthBusy(false);
    }
  }

  async function exportData() {
    setPrivacyBusy('export');
    try {
      const data = await api.get<Record<string, unknown>>('/privacy/export');
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'Meus dados — Ninshiki' });
    } finally {
      setPrivacyBusy(null);
    }
  }
  async function deleteFinance() {
    setPrivacyBusy('finance');
    try {
      await api.del('/privacy/finance', { confirm: 'EXCLUIR' });
      setConfirmFinance('');
      await qc.invalidateQueries();
    } finally {
      setPrivacyBusy(null);
    }
  }
  async function deleteEverything() {
    setPrivacyBusy('everything');
    try {
      await api.del('/privacy/everything', { confirm: 'EXCLUIR TUDO' });
      await logout();
    } finally {
      setPrivacyBusy(null);
    }
  }

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

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Seus dados (LGPD)</Text>
        <Text style={styles.hint}>Exportar ou apagar seus dados pede a sua senha de novo, por segurança.</Text>
        {privacyErr && <Text style={styles.error}>{privacyErr}</Text>}

        {pendingAction && (
          <View style={styles.reauthBox}>
            <Text style={styles.label}>Confirme sua senha para continuar</Text>
            <TextInput style={styles.input} value={reauthPw} onChangeText={setReauthPw} secureTextEntry autoComplete="current-password" autoFocus />
            {reauthErr && <Text style={styles.error}>{reauthErr}</Text>}
            <View style={styles.row2}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setPendingAction(null); setReauthPw(''); setReauthErr(null); }}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submit, { flex: 1 }, reauthBusy && styles.submitDisabled]} disabled={reauthBusy || !reauthPw} onPress={() => void confirmReauth()}>
                <Text style={styles.submitText}>{reauthBusy ? 'Confirmando…' : 'Confirmar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.secondaryBtn, privacyBusy !== null && styles.submitDisabled]}
          disabled={privacyBusy !== null}
          onPress={() => void withReauth(exportData)}
        >
          <Icon name="download" size={14} color={colors.ink} />
          <Text style={styles.secondaryBtnText}>{privacyBusy === 'export' ? 'Exportando…' : 'Exportar meus dados'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dangerToggle} onPress={() => setShowDanger((v) => !v)}>
          <Text style={styles.dangerToggleText}>{showDanger ? 'Esconder zona de risco' : 'Zona de risco'}</Text>
        </TouchableOpacity>

        {showDanger && (
          <View style={styles.dangerBox}>
            <Text style={styles.label}>Apagar dados financeiros</Text>
            <Text style={styles.hint}>Apaga contas, transações, categorias e recorrências. Não pode ser desfeito. Digite EXCLUIR para confirmar.</Text>
            <TextInput style={styles.input} value={confirmFinance} onChangeText={setConfirmFinance} autoCapitalize="characters" placeholder="EXCLUIR" />
            <TouchableOpacity
              style={[styles.dangerBtn, (confirmFinance !== 'EXCLUIR' || privacyBusy !== null) && styles.submitDisabled]}
              disabled={confirmFinance !== 'EXCLUIR' || privacyBusy !== null}
              onPress={() => void withReauth(deleteFinance)}
            >
              <Text style={styles.dangerBtnText}>{privacyBusy === 'finance' ? 'Apagando…' : 'Apagar dados financeiros'}</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { marginTop: spacing.md }]}>Apagar tudo e reiniciar</Text>
            <Text style={styles.hint}>Apaga toda a sua conta e todos os dados do Ninshiki, sem volta. Você será desconectado. Digite EXCLUIR TUDO para confirmar.</Text>
            <TextInput style={styles.input} value={confirmEverything} onChangeText={setConfirmEverything} autoCapitalize="characters" placeholder="EXCLUIR TUDO" />
            <TouchableOpacity
              style={[styles.dangerBtn, (confirmEverything !== 'EXCLUIR TUDO' || privacyBusy !== null) && styles.submitDisabled]}
              disabled={confirmEverything !== 'EXCLUIR TUDO' || privacyBusy !== null}
              onPress={() => void withReauth(deleteEverything)}
            >
              <Text style={styles.dangerBtnText}>{privacyBusy === 'everything' ? 'Apagando…' : 'Apagar tudo e reiniciar'}</Text>
            </TouchableOpacity>
          </View>
        )}
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
  row2: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  reauthBox: { backgroundColor: colors.surface2, borderRadius: 10, padding: spacing.sm, gap: 4, marginTop: spacing.xs },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.surface },
  cancelBtnText: { color: colors.inkSoft, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10, paddingHorizontal: spacing.md, justifyContent: 'center', marginTop: spacing.xs },
  secondaryBtnText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  dangerToggle: { alignSelf: 'flex-start', marginTop: spacing.sm },
  dangerToggleText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  dangerBox: { borderWidth: 1, borderColor: colors.danger, borderRadius: 10, padding: spacing.sm, gap: 4, marginTop: spacing.xs },
  dangerBtn: { backgroundColor: colors.danger, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: spacing.xs },
  dangerBtnText: { color: '#fff', fontWeight: '700' },
});
