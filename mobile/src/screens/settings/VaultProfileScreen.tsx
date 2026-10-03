import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { ProfileItem, ProfileLevel, VaultStatus } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { LEVEL_PROFILE } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'VaultProfile'>;
const LEVELS: ProfileLevel[] = ['general', 'private', 'secret'];
const fmtHour = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** Cofre com senha: a senha nunca vai para a IA; segredos só abrem com o cofre desbloqueado. */
function VaultCard({ vault, onChanged }: { vault: VaultStatus; onChanged: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setErr(null); setBusy(true);
    try { await fn(); setPw(''); setPw2(''); setCur(''); setNext(''); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui.'); }
    finally { setBusy(false); }
  }

  function confirmReset() {
    Alert.alert('Reiniciar o cofre?', 'Isso APAGA todos os itens secretos e remove a senha. Não dá pra desfazer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reiniciar', style: 'destructive', onPress: () => void run(() => api.post('/vault/reset', { confirm: true })) },
    ]);
  }

  return (
    <View style={styles.block}>
      <View style={styles.vaultHead}>
        <Icon name="lock" size={20} color={vault.unlocked ? colors.ideal : colors.inkSoft} />
        <View style={{ flex: 1 }}>
          <Text style={styles.blockTitle}>Cofre</Text>
          <Text style={styles.hint}>
            {!vault.configured ? 'Ainda não configurado. Crie uma senha para guardar informações secretas.'
              : vault.unlocked ? `Desbloqueado até ${fmtHour(vault.unlockedUntil as number)}. Depois disso, volta a bloquear sozinho.`
              : 'Bloqueado. Informações secretas ficam ocultas e a IA não consegue lê-las.'}
          </Text>
        </View>
        {vault.unlocked && (
          <TouchableOpacity style={styles.smallBtn} onPress={() => void run(() => api.post('/vault/lock'))}><Text style={styles.smallBtnText}>Bloquear</Text></TouchableOpacity>
        )}
      </View>

      {!vault.configured && (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Senha do cofre (mín. 8 caracteres)</Text>
          <TextInput style={styles.input} value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
          <Text style={styles.label}>Repita a senha</Text>
          <TextInput style={styles.input} value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" />
          <Text style={styles.warnHint}>Não há como recuperar a senha. Se esquecer, os itens secretos são perdidos (dá pra reiniciar o cofre, apagando-os).</Text>
          <TouchableOpacity
            style={[styles.submit, (busy || pw.length < 8 || pw !== pw2) && styles.submitDisabled]} disabled={busy || pw.length < 8 || pw !== pw2}
            onPress={() => void run(() => api.post('/vault/setup', { password: pw }))}
          >
            <Text style={styles.submitText}>Criar cofre</Text>
          </TouchableOpacity>
        </View>
      )}

      {vault.configured && !vault.unlocked && (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Senha do cofre</Text>
          <TextInput style={styles.input} value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" />
          <TouchableOpacity style={[styles.submit, (busy || !pw) && styles.submitDisabled]} disabled={busy || !pw} onPress={() => void run(() => api.post('/vault/unlock', { password: pw }))}>
            <Text style={styles.submitText}>Desbloquear</Text>
          </TouchableOpacity>
        </View>
      )}

      {vault.configured && (
        <View>
          <TouchableOpacity onPress={() => setMoreOpen((v) => !v)}><Text style={styles.linkText}>Trocar senha ou reiniciar</Text></TouchableOpacity>
          {moreOpen && (
            <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
              <Text style={styles.label}>Senha atual</Text>
              <TextInput style={styles.input} value={cur} onChangeText={setCur} secureTextEntry />
              <Text style={styles.label}>Nova senha (mín. 8)</Text>
              <TextInput style={styles.input} value={next} onChangeText={setNext} secureTextEntry />
              <TouchableOpacity style={[styles.smallBtn, (busy || !cur || next.length < 8) && styles.submitDisabled]} disabled={busy || !cur || next.length < 8} onPress={() => void run(() => api.post('/vault/change', { current: cur, next }))}>
                <Text style={styles.smallBtnText}>Trocar senha</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerBtn} onPress={confirmReset}>
                <Text style={styles.dangerBtnText}>Esqueci a senha — reiniciar cofre</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      {err && <Text style={styles.error}>{err}</Text>}
    </View>
  );
}

export function VaultProfileScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const items = useQuery({ queryKey: ['profile'], queryFn: () => api.get<ProfileItem[]>('/profile'), refetchInterval: 20_000 });
  const vault = useQuery({ queryKey: ['vault'], queryFn: () => api.get<VaultStatus>('/vault/status'), refetchInterval: 20_000 });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['vault'] }); void qc.invalidateQueries({ queryKey: ['profile'] }); };

  const list = items.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.banner}>
        <Text style={{ fontWeight: '700' }}>Sobre a IA: </Text>
        as informações <Text style={{ fontWeight: '700' }}>Gerais</Text> vão para o provedor de IA em toda conversa. As <Text style={{ fontWeight: '700' }}>Privadas</Text> e <Text style={{ fontWeight: '700' }}>Secretas</Text> só são lidas se você aprovar cada vez.
      </Text>

      {vault.isLoading && <Text style={styles.hint}>Carregando…</Text>}
      {vault.error && <QueryError error={vault.error} onRetry={() => void vault.refetch()} />}
      {vault.data && <VaultCard vault={vault.data} onChanged={refresh} />}

      <View style={styles.sectionHead}>
        <Text style={styles.blockTitle}>Suas informações</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('NewProfileItem', undefined)}>
          <Icon name="plus" size={14} color="#fff" /><Text style={styles.addBtnText}>Adicionar</Text>
        </TouchableOpacity>
      </View>
      {items.error && <QueryError error={items.error} onRetry={() => void items.refetch()} />}
      {items.isSuccess && list.length === 0 && <Text style={styles.hint}>Nada ainda. Comece com o seu nome, alergias, rotina de trabalho ou preferências.</Text>}

      {LEVELS.map((l) => {
        const group = list.filter((i) => i.level === l);
        return (
          <View key={l} style={styles.block}>
            <Text style={styles.blockTitle}>{LEVEL_PROFILE[l].name}</Text>
            <Text style={styles.hint}>{LEVEL_PROFILE[l].hint}</Text>
            {group.length === 0 && <Text style={styles.emptySmall}>Nenhum item.</Text>}
            {group.map((i) => (
              <TouchableOpacity key={i.id} style={styles.itemRow} disabled={i.locked} onPress={() => navigation.navigate('NewProfileItem', { item: i })}>
                <View style={{ flex: 1 }}>
                  <View style={styles.itemHead}>
                    {i.locked && <Icon name="lock" size={12} color={colors.inkSoft} />}
                    <Text style={styles.itemTitle}>{i.title}</Text>
                  </View>
                  <Text style={styles.itemContent} numberOfLines={1}>{i.locked ? 'Bloqueado — desbloqueie o cofre' : (i.content ?? '').slice(0, 90) || '—'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  banner: { fontSize: 12, color: colors.inkSoft, backgroundColor: colors.accentTint, borderRadius: radius, padding: spacing.sm },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  blockTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 12, color: colors.inkSoft },
  warnHint: { fontSize: 11, color: colors.danger },
  vaultHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.paper },
  error: { color: colors.danger, fontSize: 12 },
  submit: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: spacing.xs },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700' },
  smallBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: spacing.sm, alignSelf: 'flex-start' },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  linkText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  dangerBtn: { alignSelf: 'flex-start', marginTop: spacing.xs },
  dangerBtnText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  emptySmall: { fontSize: 12, color: colors.inkSoft },
  itemRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.xs, marginTop: spacing.xs },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  itemContent: { fontSize: 12, color: colors.inkSoft },
});
