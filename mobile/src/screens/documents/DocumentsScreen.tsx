import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { DocKind, DocListItem, Folder } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Documents'>;
const KIND_ICON: Record<DocKind, 'note' | 'list' | 'file'> = { note: 'note', list: 'list', file: 'file' };
const KIND_NAME: Record<DocKind, string> = { note: 'Nota', list: 'Lista', file: 'Arquivo' };

const preview = (d: DocListItem) =>
  d.summary || d.excerpt.replace(/^\s*[-*] \[[xX]\] /gm, '✓ ').replace(/^\s*[-*] \[ \] /gm, '').replace(/[#*>]/g, '').replace(/\s*\n\s*/g, ' · ').trim() || (d.kind === 'file' ? 'Sem texto extraído' : 'Vazio');

/** Sem envio de arquivo nesta versão: precisaria de expo-document-picker (dependência nativa nova, ainda
 * sem build pra testar). Arquivos já enviados pelo app web aparecem e dá pra abrir/ver no navegador. */
export function DocumentsScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<'all' | 'root' | string>('all');
  const [q, setQ] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.get<Folder[]>('/folders') });
  const docs = useQuery({
    queryKey: ['documents', sel, q],
    queryFn: () => {
      const p = new URLSearchParams();
      if (sel !== 'all' && sel !== 'root') p.set('folderId', sel);
      if (q.trim()) p.set('query', q.trim());
      return api.get<DocListItem[]>(`/documents?${p}`);
    },
  });

  async function createFolder() {
    if (!newFolderName.trim()) return;
    const f = await api.post<Folder>('/folders', { name: newFolderName.trim(), parentId: null });
    setNewFolderName(''); setNewFolderOpen(false); setSel(f.id);
    await qc.invalidateQueries({ queryKey: ['folders'] });
  }
  async function createDoc(kind: 'note' | 'list') {
    const d = await api.post<{ id: string }>('/documents', { title: kind === 'note' ? 'Nova nota' : 'Nova lista', kind, content: '', folderId: sel !== 'all' && sel !== 'root' ? sel : null });
    navigation.navigate('NewDoc', { docId: d.id });
  }

  const list = docs.data ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg, alignItems: 'center' }}>
        <TouchableOpacity style={[styles.chip, sel === 'all' && styles.chipOn]} onPress={() => setSel('all')}><Text style={[styles.chipText, sel === 'all' && styles.chipTextOn]}>Todos</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.chip, sel === 'root' && styles.chipOn]} onPress={() => setSel('root')}><Text style={[styles.chipText, sel === 'root' && styles.chipTextOn]}>Sem pasta</Text></TouchableOpacity>
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

      <View style={styles.searchRow}>
        <Icon name="search" size={16} color={colors.inkSoft} />
        <TextInput style={styles.searchInput} value={q} onChangeText={setQ} placeholder="Buscar no título e no conteúdo" />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => void createDoc('note')}><Icon name="note" size={14} color="#fff" /><Text style={styles.actionBtnText}>Nova nota</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnGhost} onPress={() => void createDoc('list')}><Icon name="list" size={14} color={colors.accent} /><Text style={styles.actionBtnGhostText}>Nova lista</Text></TouchableOpacity>
      </View>

      {docs.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : docs.error ? (
        <QueryError error={docs.error} onRetry={() => void docs.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {list.length === 0 && <Text style={styles.empty}>{q ? 'Nada encontrado.' : 'Nada aqui ainda.'}</Text>}
          {list.map((d) => (
            <TouchableOpacity key={d.id} style={styles.card} onPress={() => navigation.navigate('NewDoc', { docId: d.id })}>
              <Icon name={KIND_ICON[d.kind]} size={16} color={colors.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.cardTitle}>{d.title}</Text>
                <Text style={styles.cardPreview} numberOfLines={2}>{preview(d)}</Text>
                <Text style={styles.cardMeta}>{KIND_NAME[d.kind]}{d.summary ? ' · resumo' : ''}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
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
  roundBtn: { width: 28, height: 28, borderRadius: 999, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  inlineRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 14, color: colors.ink, backgroundColor: colors.surface },
  smallBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink },
  actionRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: spacing.md },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionBtnGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: spacing.md },
  actionBtnGhostText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  empty: { color: colors.inkSoft, fontSize: 13, textAlign: 'center', marginTop: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  cardPreview: { fontSize: 12, color: colors.inkSoft },
  cardMeta: { fontSize: 11, color: colors.inkSoft },
});
