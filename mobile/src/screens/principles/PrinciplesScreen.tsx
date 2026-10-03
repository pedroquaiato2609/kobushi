import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Principle, PrincipleFolder, VaultStatus } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Principles'>;

function fmtDate(iso: string) { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }

/** Mesma trava de senha do Cofre que o app web; sem cripto no cliente — o servidor guarda o desbloqueio por um tempo. */
function VaultGate({ vault, children }: { vault: VaultStatus; children: React.ReactNode }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!vault.configured) {
    return (
      <View style={styles.gateCard}>
        <Icon name="lock" size={28} color={colors.inkSoft} />
        <Text style={styles.gateTitle}>O Cofre ainda não foi configurado</Text>
        <Text style={styles.gateText}>Princípios usam a mesma senha do Cofre. Configure uma senha em Configurações → Perfil → Cofre no app web, depois volte aqui.</Text>
      </View>
    );
  }
  if (!vault.unlocked) {
    async function unlock() {
      setErr(null); setBusy(true);
      try { await api.post('/vault/unlock', { password }); setPassword(''); await qc.invalidateQueries({ queryKey: ['vault'] }); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Senha incorreta.'); }
      finally { setBusy(false); }
    }
    return (
      <View style={styles.gateCard}>
        <Icon name="lock" size={28} color={colors.inkSoft} />
        <Text style={styles.gateTitle}>Protegido pela senha do Cofre</Text>
        <Text style={styles.gateText}>Digite a senha do Cofre para ver e organizar seus princípios.</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Senha do Cofre" secureTextEntry autoFocus />
        {err && <Text style={styles.error}>{err}</Text>}
        <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy || !password} onPress={() => void unlock()}>
          <Text style={styles.submitText}>{busy ? 'Desbloqueando…' : 'Desbloquear'}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <>{children}</>;
}

export function PrinciplesScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const vault = useQuery({ queryKey: ['vault'], queryFn: () => api.get<VaultStatus>('/vault/status'), refetchInterval: 20_000 });
  const folders = useQuery({ queryKey: ['principles', 'folders'], queryFn: () => api.get<PrincipleFolder[]>('/principles/folders'), enabled: vault.data?.unlocked });
  const principles = useQuery({ queryKey: ['principles'], queryFn: () => api.get<Principle[]>('/principles'), enabled: vault.data?.unlocked });
  const [sel, setSel] = useState<'all' | string>('all');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  async function createFolder() {
    if (!newFolderName.trim()) return;
    const f = await api.post<PrincipleFolder>('/principles/folders', { name: newFolderName.trim() });
    setNewFolderName(''); setNewFolderOpen(false); setSel(f.id);
    await qc.invalidateQueries({ queryKey: ['principles', 'folders'] });
  }
  function confirmDeleteFolder(f: PrincipleFolder) {
    Alert.alert('Apagar pasta?', `Os princípios continuam existindo, só perdem a pasta "${f.name}".`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void (async () => { await api.del(`/principles/folders/${f.id}`); setSel('all'); await qc.invalidateQueries({ queryKey: ['principles', 'folders'] }); })() },
    ]);
  }

  if (vault.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (vault.error) return <QueryError error={vault.error} onRetry={() => void vault.refetch()} />;
  if (!vault.data) return null;

  return (
    <VaultGate vault={vault.data}>
      <View style={styles.screen}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg, alignItems: 'center' }}>
          <TouchableOpacity style={[styles.chip, sel === 'all' && styles.chipOn]} onPress={() => setSel('all')}><Text style={[styles.chipText, sel === 'all' && styles.chipTextOn]}>Todos</Text></TouchableOpacity>
          {(folders.data ?? []).map((f) => (
            <TouchableOpacity key={f.id} style={[styles.chip, sel === f.id && styles.chipOn]} onPress={() => setSel(f.id)} onLongPress={() => confirmDeleteFolder(f)}>
              <Text style={[styles.chipText, sel === f.id && styles.chipTextOn]}>{f.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.roundBtn} onPress={() => setNewFolderOpen((v) => !v)}><Icon name="plus" size={14} color={colors.accent} /></TouchableOpacity>
        </ScrollView>

        {newFolderOpen && (
          <View style={styles.newFolderRow}>
            <TextInput style={[styles.input, { flex: 1 }]} value={newFolderName} onChangeText={setNewFolderName} placeholder="Nome da pasta" autoFocus />
            <TouchableOpacity style={styles.smallBtn} onPress={() => void createFolder()}><Text style={styles.smallBtnText}>Criar</Text></TouchableOpacity>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content}>
          {principles.isLoading && <ActivityIndicator size="large" color={colors.accent} />}
          {principles.error && <QueryError error={principles.error} onRetry={() => void principles.refetch()} />}
          {principles.isSuccess && (principles.data ?? []).filter((p) => sel === 'all' || p.folderId === sel).length === 0 && (
            <View style={styles.empty}>
              <Icon name="shield" size={28} color={colors.inkSoft} />
              <Text style={styles.emptyTitle}>Nenhum princípio ainda</Text>
              <Text style={styles.gateText}>Frases curtas que te lembrem quem você é e quer ser.</Text>
            </View>
          )}
          {(principles.data ?? []).filter((p) => sel === 'all' || p.folderId === sel).map((p) => (
            <TouchableOpacity key={p.id} style={styles.card} onPress={() => navigation.navigate('NewPrinciple', { principle: p, folderId: sel !== 'all' ? sel : null })}>
              <Text style={styles.cardTitle}>{p.locked ? '●●●●●●' : p.title}</Text>
              {!p.locked && !!p.content && <Text style={styles.cardPreview} numberOfLines={2}>{p.content}</Text>}
              <Text style={styles.cardDate}>{fmtDate(p.updatedAt)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewPrinciple', { folderId: sel !== 'all' ? sel : null })}>
          <Icon name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </VaultGate>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gateCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  gateTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  gateText: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface, width: '100%' },
  error: { color: colors.danger, fontSize: 13 },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 12, paddingHorizontal: spacing.xl, alignItems: 'center' },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  filterBar: { flexGrow: 0, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  roundBtn: { width: 28, height: 28, borderRadius: 999, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  newFolderRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  smallBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 3 },
  empty: { alignItems: 'center', gap: spacing.xs, padding: spacing.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardPreview: { fontSize: 13, color: colors.inkSoft },
  cardDate: { fontSize: 11, color: colors.inkSoft },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 52, height: 52, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
