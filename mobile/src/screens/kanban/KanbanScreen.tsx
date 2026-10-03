import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Board, BoardFull } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'Kanban'>;

/**
 * Sem arrastar-e-soltar (não existe uma lib de drag-and-drop instalada, e não dá pra verificar uma nova
 * dependência nativa sem gerar um build). Mover um card de coluna é feito no detalhe do card
 * (CardDetailScreen), escolhendo a nova coluna — o mesmo caminho que o botão "Coluna" já oferece no app web.
 */
export function KanbanScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const [boardId, setBoardId] = useState<string | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newColOpen, setNewColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newCardFor, setNewCardFor] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');

  const boards = useQuery({ queryKey: ['boards'], queryFn: () => api.get<Board[]>('/boards') });
  const current = boards.data?.find((b) => b.id === boardId) ?? boards.data?.[0] ?? null;
  const board = useQuery({ queryKey: ['board', current?.id], queryFn: () => api.get<BoardFull>(`/boards/${current!.id}`), enabled: Boolean(current) });

  async function createBoard() {
    if (!newBoardName.trim()) return;
    const b = await api.post<Board>('/boards', { name: newBoardName.trim() });
    setNewBoardName(''); setNewBoardOpen(false); setBoardId(b.id);
    await qc.invalidateQueries({ queryKey: ['boards'] });
  }
  function confirmDeleteBoard() {
    if (!current) return;
    Alert.alert('Apagar quadro?', `Apagar "${current.name}" com todas as colunas e cards?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void (async () => { await api.del(`/boards/${current.id}`); setBoardId(null); await qc.invalidateQueries({ queryKey: ['boards'] }); })() },
    ]);
  }
  async function createColumn() {
    if (!newColName.trim() || !current) return;
    await api.post(`/boards/${current.id}/columns`, { name: newColName.trim() });
    setNewColName(''); setNewColOpen(false);
    await qc.invalidateQueries({ queryKey: ['board', current.id] });
  }
  function confirmDeleteColumn(id: string, name: string, count: number) {
    Alert.alert('Apagar coluna?', `Apagar "${name}" e seus ${count} card(s)?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void (async () => { await api.del(`/columns/${id}`); await qc.invalidateQueries({ queryKey: ['board', current!.id] }); })() },
    ]);
  }
  async function createCard(columnId: string) {
    if (!newCardTitle.trim()) return;
    await api.post(`/columns/${columnId}/cards`, { title: newCardTitle.trim() });
    setNewCardTitle(''); setNewCardFor(null);
    await qc.invalidateQueries({ queryKey: ['board', current!.id] });
  }

  if (boards.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (boards.error) return <QueryError error={boards.error} onRetry={() => void boards.refetch()} />;

  return (
    <View style={styles.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.boardBar} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg, alignItems: 'center' }}>
        {(boards.data ?? []).map((b) => (
          <TouchableOpacity key={b.id} style={[styles.chip, current?.id === b.id && styles.chipOn]} onPress={() => setBoardId(b.id)} onLongPress={() => current?.id === b.id && confirmDeleteBoard()}>
            <Text style={[styles.chipText, current?.id === b.id && styles.chipTextOn]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.roundBtn} onPress={() => setNewBoardOpen((v) => !v)}><Icon name="plus" size={14} color={colors.accent} /></TouchableOpacity>
      </ScrollView>
      {newBoardOpen && (
        <View style={styles.inlineRow}>
          <TextInput style={[styles.input, { flex: 1 }]} value={newBoardName} onChangeText={setNewBoardName} placeholder="Nome do quadro" autoFocus />
          <TouchableOpacity style={styles.smallBtn} onPress={() => void createBoard()}><Text style={styles.smallBtnText}>Criar</Text></TouchableOpacity>
        </View>
      )}

      {!current && !boards.isLoading && <Text style={styles.empty}>Nenhum quadro ainda. Crie o primeiro acima.</Text>}

      {board.data && (
        <ScrollView contentContainerStyle={styles.content}>
          {board.data.columns.map((col) => (
            <View key={col.id} style={styles.column}>
              <View style={styles.colHead}>
                <Text style={styles.colTitle}>{col.name}</Text>
                <Text style={styles.colCount}>{col.cards.length}</Text>
                <TouchableOpacity onPress={() => confirmDeleteColumn(col.id, col.name, col.cards.length)}><Icon name="trash" size={14} color={colors.inkSoft} /></TouchableOpacity>
              </View>
              {col.cards.map((card) => (
                <TouchableOpacity key={card.id} style={styles.card} onPress={() => navigation.navigate('CardDetail', { card, board: current! })}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  {card.dueDate && <Text style={styles.cardMeta}>até {card.dueDate.slice(8, 10)}/{card.dueDate.slice(5, 7)}</Text>}
                </TouchableOpacity>
              ))}
              {col.cards.length === 0 && <Text style={styles.colEmpty}>Sem cards</Text>}
              {newCardFor === col.id ? (
                <View style={styles.inlineRow}>
                  <TextInput style={[styles.input, { flex: 1 }]} value={newCardTitle} onChangeText={setNewCardTitle} placeholder="Título do card" autoFocus onSubmitEditing={() => void createCard(col.id)} />
                  <TouchableOpacity style={styles.smallBtn} onPress={() => void createCard(col.id)}><Text style={styles.smallBtnText}>+</Text></TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.addLink} onPress={() => { setNewCardFor(col.id); setNewCardTitle(''); }}>
                  <Icon name="plus" size={13} color={colors.accent} /><Text style={styles.addLinkText}>Adicionar card</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          <View style={styles.column}>
            {newColOpen ? (
              <View style={styles.inlineRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={newColName} onChangeText={setNewColName} placeholder="Nome da coluna" autoFocus onSubmitEditing={() => void createColumn()} />
                <TouchableOpacity style={styles.smallBtn} onPress={() => void createColumn()}><Text style={styles.smallBtnText}>+</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addLink} onPress={() => setNewColOpen(true)}>
                <Icon name="plus" size={13} color={colors.accent} /><Text style={styles.addLinkText}>Adicionar coluna</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  boardBar: { flexGrow: 0, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  roundBtn: { width: 28, height: 28, borderRadius: 999, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  inlineRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 14, color: colors.ink, backgroundColor: colors.surface },
  smallBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { color: colors.inkSoft, fontSize: 13, textAlign: 'center', marginTop: spacing.lg, padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  column: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, gap: spacing.xs },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: 4 },
  colTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, flex: 1 },
  colCount: { fontSize: 12, color: colors.inkSoft },
  colEmpty: { fontSize: 12, color: colors.inkSoft, padding: spacing.sm },
  card: { backgroundColor: colors.paper, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, gap: 2 },
  cardTitle: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  cardMeta: { fontSize: 11, color: colors.inkSoft },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: spacing.sm },
  addLinkText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
});
