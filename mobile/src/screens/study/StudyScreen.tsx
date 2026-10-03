import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { StudyFolder, StudyNote, StudyPlan } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Study'>;
type Tab = 'notas' | 'planos';

function fmtDate(iso: string) { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }

export function StudyScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('notas');
  const [sel, setSel] = useState<'all' | string>('all');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [planSubject, setPlanSubject] = useState('');
  const [planTitle, setPlanTitle] = useState('');

  const folders = useQuery({ queryKey: ['study', 'folders'], queryFn: () => api.get<StudyFolder[]>('/study/folders') });
  const notes = useQuery({ queryKey: ['study', 'notes', sel], queryFn: () => api.get<StudyNote[]>(`/study/notes${sel !== 'all' ? `?folderId=${sel}` : ''}`) });
  const plans = useQuery({ queryKey: ['study', 'plans'], queryFn: () => api.get<StudyPlan[]>('/study/plans') });

  async function createFolder() {
    if (!newFolderName.trim()) return;
    const f = await api.post<StudyFolder>('/study/folders', { name: newFolderName.trim() });
    setNewFolderName(''); setNewFolderOpen(false); setSel(f.id);
    await qc.invalidateQueries({ queryKey: ['study', 'folders'] });
  }
  async function createPlan() {
    if (!planSubject.trim() || !planTitle.trim()) return;
    const p = await api.post<StudyPlan>('/study/plans', {
      subject: planSubject.trim(), title: planTitle.trim(),
      lessons: [{ id: `l0-${Date.now()}`, title: 'Aula 1', description: '' }],
    });
    setPlanSubject(''); setPlanTitle(''); setNewPlanOpen(false);
    await qc.invalidateQueries({ queryKey: ['study', 'plans'] });
    navigation.navigate('StudyPlanDetail', { plan: p });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'notas' && styles.tabBtnOn]} onPress={() => setTab('notas')}><Text style={[styles.tabText, tab === 'notas' && styles.tabTextOn]}>Notas</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'planos' && styles.tabBtnOn]} onPress={() => setTab('planos')}><Text style={[styles.tabText, tab === 'planos' && styles.tabTextOn]}>Planos de estudo</Text></TouchableOpacity>
      </View>

      {tab === 'notas' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg, alignItems: 'center' }}>
            <TouchableOpacity style={[styles.chip, sel === 'all' && styles.chipOn]} onPress={() => setSel('all')}><Text style={[styles.chipText, sel === 'all' && styles.chipTextOn]}>Todas</Text></TouchableOpacity>
            {(folders.data ?? []).map((f) => (
              <TouchableOpacity key={f.id} style={[styles.chip, sel === f.id && styles.chipOn]} onPress={() => setSel(f.id)}>
                <Text style={[styles.chipText, sel === f.id && styles.chipTextOn]}>{f.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.roundBtn} onPress={() => setNewFolderOpen((v) => !v)}><Icon name="plus" size={14} color={colors.accent} /></TouchableOpacity>
          </ScrollView>
          {newFolderOpen && (
            <View style={styles.inlineRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={newFolderName} onChangeText={setNewFolderName} placeholder="Nome da pasta" autoFocus />
              <TouchableOpacity style={styles.smallBtn} onPress={() => void createFolder()}><Text style={styles.smallBtnText}>Criar</Text></TouchableOpacity>
            </View>
          )}
          {notes.isLoading ? <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.lg }} /> : notes.error ? (
            <QueryError error={notes.error} onRetry={() => void notes.refetch()} />
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              {(notes.data ?? []).length === 0 && <Text style={styles.empty}>Nenhuma nota ainda.</Text>}
              {(notes.data ?? []).map((n) => (
                <TouchableOpacity key={n.id} style={styles.card} onPress={() => navigation.navigate('NewStudyNote', { note: { ...n, linkedNoteIds: [], backlinks: [] }, folderId: sel !== 'all' ? sel : null })}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{n.title}</Text>
                    <View style={styles.tagRow}>{n.tags.map((t) => <Text key={t} style={styles.tagChip}>{t}</Text>)}</View>
                    <Text style={styles.cardDate}>{fmtDate(n.updatedAt)}</Text>
                  </View>
                  {n.pinned && <Icon name="pin" size={14} color={colors.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewStudyNote', { folderId: sel !== 'all' ? sel : null })}>
            <Icon name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        </>
      ) : (
        <>
          {newPlanOpen ? (
            <View style={styles.planForm}>
              <TextInput style={styles.input} value={planSubject} onChangeText={setPlanSubject} placeholder="Assunto (ex.: Álgebra Linear)" autoFocus />
              <TextInput style={styles.input} value={planTitle} onChangeText={setPlanTitle} placeholder="Título do plano" />
              <View style={styles.inlineRow}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => void createPlan()}><Text style={styles.smallBtnText}>Criar</Text></TouchableOpacity>
                <TouchableOpacity style={styles.smallBtnGhost} onPress={() => setNewPlanOpen(false)}><Text style={styles.smallBtnGhostText}>Cancelar</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addPlanBtn} onPress={() => setNewPlanOpen(true)}>
              <Icon name="plus" size={14} color={colors.accent} /><Text style={styles.addPlanBtnText}>Novo plano de estudo</Text>
            </TouchableOpacity>
          )}
          {plans.isLoading ? <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.lg }} /> : plans.error ? (
            <QueryError error={plans.error} onRetry={() => void plans.refetch()} />
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              {(plans.data ?? []).length === 0 && <Text style={styles.empty}>Nenhum plano ainda.</Text>}
              {(plans.data ?? []).map((p) => (
                <TouchableOpacity key={p.id} style={styles.card} onPress={() => navigation.navigate('StudyPlanDetail', { plan: p })}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{p.title}</Text>
                    <Text style={styles.cardDate}>{p.subject} · {p.lessons.filter((l) => l.done).length}/{p.lessons.length} aulas</Text>
                    <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${p.progressPct}%` }]} /></View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnOn: { borderBottomColor: colors.accent },
  tabText: { fontSize: 13, color: colors.inkSoft, fontWeight: '600' },
  tabTextOn: { color: colors.accent },
  filterBar: { flexGrow: 0, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  roundBtn: { width: 28, height: 28, borderRadius: 999, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  inlineRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 14, color: colors.ink, backgroundColor: colors.surface },
  smallBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  smallBtnGhost: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  smallBtnGhostText: { color: colors.inkSoft, fontWeight: '600', fontSize: 13 },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 3 },
  empty: { color: colors.inkSoft, fontSize: 13, textAlign: 'center', marginTop: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  cardDate: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tagChip: { fontSize: 10, color: colors.accent, backgroundColor: colors.accentTint, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 6 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: colors.surface2, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.accent },
  addPlanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  addPlanBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  planForm: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line, padding: spacing.md, gap: spacing.xs },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 52, height: 52, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
