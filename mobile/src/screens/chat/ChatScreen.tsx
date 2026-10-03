import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import type { AgentAction, AgentSettings, AgentStatus, ChatMessage, Conversation } from '../../api/types';
import { Icon } from '../../components/Icon';
import { ACTION_LABEL, RESOURCE_LABEL } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';

// Chat com o assistente. Usa o endpoint síncrono (não o de streaming por SSE) porque o React Native não
// tem um jeito confiável de ler uma resposta em pedaços — o turno inteiro chega de uma vez quando pronto
// (pode demorar alguns segundos se o assistente usar ferramentas). Por isso também não há "efeito
// máquina de escrever" aqui (isso é só cosmético no streaming da web). Ações que exigem confirmação
// (ex.: qualquer gravação em Finanças) aparecem como um cartão de Aprovar/Rejeitar, igual no app web.
const SUGGESTIONS = [
  'O que tenho para hoje?',
  'Crie um evento amanhã às 14h: dentista, e me avise 1 hora antes',
  'Me lembre de tomar água todo dia às 15h',
];

function fmtConvDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toolStatus(content: string | undefined): 'ok' | 'error' | 'pending' {
  if (!content) return 'ok';
  try {
    const r = JSON.parse(content);
    if (r?.status === 'pending_user_confirmation') return 'pending';
    if (r?.error) return 'error';
  } catch { /* resultado não é JSON */ }
  return 'ok';
}

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [convListOpen, setConvListOpen] = useState(false);
  const listRef = useRef<FlatList>(null);

  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => api.get<Conversation[]>('/conversations') });
  const settings = useQuery({ queryKey: ['agent-settings'], queryFn: () => api.get<AgentSettings>('/agent/settings') });
  const status = useQuery({ queryKey: ['agent-status'], queryFn: () => api.get<AgentStatus>('/agent/status') });
  useEffect(() => {
    if (conversationId || !conversations.data) return;
    if (conversations.data.length > 0) { setConversationId(conversations.data[0].id); return; }
    void api.post<Conversation>('/conversations').then((c) => { setConversationId(c.id); void qc.invalidateQueries({ queryKey: ['conversations'] }); });
  }, [conversations.data, conversationId, qc]);

  const messages = useQuery({
    queryKey: ['messages', conversationId], enabled: !!conversationId,
    queryFn: () => api.get<ChatMessage[]>(`/conversations/${conversationId}/messages`),
  });
  const pending = useQuery({ queryKey: ['pending-actions'], queryFn: () => api.get<AgentAction[]>('/agent/actions?status=pending') });

  async function newConversation() {
    setConvListOpen(false);
    const c = await api.post<Conversation>('/conversations');
    setConversationId(c.id);
    await qc.invalidateQueries({ queryKey: ['conversations'] });
  }
  async function deleteConversation(id: string) {
    await api.del(`/conversations/${id}`);
    await qc.invalidateQueries({ queryKey: ['conversations'] });
    if (id === conversationId) setConversationId(null);
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || !conversationId || sending) return;
    setDraft(''); setSending(true); setErr(null);
    try {
      await api.post<{ messages: ChatMessage[] }>(`/conversations/${conversationId}/messages`, { content: t });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui falar com o assistente.');
    } finally {
      // sempre reconsulta, falhando ou não: se o turno chegou a salvar algo (sua mensagem, uma ação
      // pendente) antes de dar erro no meio do caminho, a tela não pode ficar desatualizada.
      await qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      await qc.invalidateQueries({ queryKey: ['pending-actions'] });
      setSending(false);
    }
  }

  async function resolveAction(id: string, approve: boolean) {
    try {
      await api.post(`/agent/actions/${id}/${approve ? 'approve' : 'reject'}`);
    } finally {
      await qc.invalidateQueries({ queryKey: ['pending-actions'] });
      if (conversationId) await qc.invalidateQueries({ queryKey: ['messages', conversationId] });
    }
  }

  const all = messages.data ?? [];
  const results = new Map(all.filter((m) => m.role === 'tool').map((m) => [m.toolCallId, m.content] as const));
  const visible = all.filter((m) => m.role !== 'tool' && (m.content || (m.toolCalls?.length ?? 0) > 0 || m.role === 'note'));
  const missingKey = status.data && settings.data && !status.data.providers[settings.data.provider];

  // botões de resposta rápida do último turno (offer_options), só enquanto não respondido. offer_links
  // (atalhos clicáveis pra outra página) existe na web, mas as rotas lá não batem 1:1 com as telas do
  // app — nesta versão o atalho não é mostrado no mobile, só o texto da resposta já fala o que fazer.
  let offers: string[] = [];
  if (!sending) {
    const lastUser = all.map((m) => m.role).lastIndexOf('user');
    for (const m of all.slice(lastUser + 1)) {
      for (const c of m.toolCalls ?? []) {
        if (c.name === 'offer_options') offers = ((c.args as { options?: string[] }).options ?? []).slice(0, 4);
      }
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Assistente</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setConvListOpen(true)}><Icon name="list" size={18} color={colors.accent} /></TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => void newConversation()}><Icon name="plus" size={18} color={colors.accent} /></TouchableOpacity>
        </View>
      </View>

      {missingKey && (
        <Text style={styles.banner}>
          Chave de API do provedor {settings.data!.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} não configurada no servidor.
        </Text>
      )}

      {!conversationId || messages.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View>
              <Text style={styles.empty}>Peça em linguagem natural. Eu leio e altero atividades, agenda, lembretes, documentos, kanban e revisões — dentro das permissões que você definir.</Text>
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <TouchableOpacity key={s} style={styles.suggestion} onPress={() => setDraft(s)}>
                    <Icon name="sparkles" size={14} color={colors.accent} /><Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            if (item.role === 'note') return <Text style={styles.note}>{item.content}</Text>;
            const calls = (item.toolCalls ?? []).filter((c: { name: string }) => c.name !== 'offer_options' && c.name !== 'offer_links');
            return (
              <View style={item.role === 'user' ? styles.bubbleUserWrap : styles.bubbleAssistantWrap}>
                {!!item.content && (
                  <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                    <Text style={item.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText}>{item.content}</Text>
                  </View>
                )}
                {calls.length > 0 && (
                  <View style={styles.toolChips}>
                    {calls.map((c: { id: string; name: string }) => {
                      const st = toolStatus(results.get(c.id));
                      const label = `${ACTION_LABEL[c.name.split('_')[0]] ?? ''} ${RESOURCE_LABEL[c.name.replace(/^(create|update|delete|list)_/, '')] ?? c.name.replace(/_/g, ' ')}`.trim();
                      return (
                        <View key={c.id} style={[styles.toolChip, st === 'error' && styles.toolChipError, st === 'pending' && styles.toolChipPending]}>
                          <Text style={styles.toolChipText}>{label}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          }}
          ListFooterComponent={
            <>
              {offers.length > 0 && (
                <View style={styles.offers}>
                  {offers.map((o) => <TouchableOpacity key={o} style={styles.offer} onPress={() => void send(o)}><Text style={styles.offerText}>{o}</Text></TouchableOpacity>)}
                </View>
              )}
              {(pending.data ?? []).map((a) => (
                <View key={a.id} style={styles.approval}>
                  <Text style={styles.approvalTitle}>{ACTION_LABEL[a.action] ?? a.action} em {RESOURCE_LABEL[a.resource] ?? a.resource}?</Text>
                  {a.summary && a.summary.split('\n').map((line, i) => <Text key={i} style={styles.approvalLine}>• {line}</Text>)}
                  <View style={styles.approvalActions}>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => void resolveAction(a.id, true)}><Text style={styles.approveBtnText}>Aprovar</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => void resolveAction(a.id, false)}><Text style={styles.rejectBtnText}>Rejeitar</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              {sending && <View style={styles.typing}><ActivityIndicator size="small" color={colors.inkSoft} /><Text style={styles.typingText}>Pensando…</Text></View>}
            </>
          }
        />
      )}

      {err && <Text style={styles.error}>{err}</Text>}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input} value={draft} onChangeText={setDraft} placeholder="Escreva uma mensagem…"
          multiline onSubmitEditing={() => void send(draft)}
        />
        <TouchableOpacity style={[styles.sendBtn, (sending || !draft.trim()) && styles.sendBtnDisabled]} disabled={sending || !draft.trim()} onPress={() => void send(draft)}>
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendBtnText}>Enviar</Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={convListOpen} animationType="slide" transparent onRequestClose={() => setConvListOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setConvListOpen(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Conversas</Text>
            <FlatList
              data={conversations.data ?? []}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 360 }}
              ListEmptyComponent={<Text style={styles.empty}>Suas conversas aparecem aqui.</Text>}
              renderItem={({ item }) => (
                <View style={styles.convRow}>
                  <TouchableOpacity style={styles.convMain} onPress={() => { setConversationId(item.id); setConvListOpen(false); }}>
                    <Text style={[styles.convTitle, item.id === conversationId && styles.convTitleActive]} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.convDate}>{fmtConvDate(item.updatedAt)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void deleteConversation(item.id)}><Icon name="trash" size={16} color={colors.danger} /></TouchableOpacity>
                </View>
              )}
            />
            <TouchableOpacity style={styles.newConvBtn} onPress={() => void newConversation()}>
              <Icon name="plus" size={14} color="#fff" /><Text style={styles.newConvBtnText}>Nova conversa</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, paddingBottom: spacing.sm },
  header: { fontSize: 22, fontWeight: '700', color: colors.ink },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: { width: 34, height: 34, borderRadius: 999, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  banner: { fontSize: 11, color: colors.danger, backgroundColor: colors.surface2, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.sm, borderRadius: 8 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  empty: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.xl },
  suggestions: { gap: spacing.xs, marginTop: spacing.md },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  suggestionText: { fontSize: 12, color: colors.ink, flex: 1 },
  note: { fontSize: 12, color: colors.inkSoft, fontStyle: 'italic', textAlign: 'center' },
  bubbleUserWrap: { alignItems: 'flex-end', gap: 4 },
  bubbleAssistantWrap: { alignItems: 'flex-start', gap: 4 },
  bubble: { borderRadius: radius, padding: spacing.md, maxWidth: '85%' },
  bubbleUser: { backgroundColor: colors.accent },
  bubbleAssistant: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  bubbleUserText: { color: '#fff', fontSize: 14 },
  bubbleAssistantText: { color: colors.ink, fontSize: 14 },
  toolChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toolChip: { backgroundColor: colors.surface2, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  toolChipError: { backgroundColor: '#fde2e2' },
  toolChipPending: { backgroundColor: colors.accentTint },
  toolChipText: { fontSize: 11, color: colors.inkSoft, fontWeight: '600' },
  offers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  offer: { borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: spacing.md },
  offerText: { fontSize: 12, color: colors.accent, fontWeight: '700' },
  approval: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.accent, padding: spacing.md, gap: 4, marginTop: spacing.sm },
  approvalTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  approvalLine: { fontSize: 12, color: colors.inkSoft },
  approvalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  approveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  rejectBtnText: { color: colors.inkSoft, fontWeight: '700', fontSize: 13 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  typingText: { fontSize: 12, color: colors.inkSoft },
  error: { color: colors.danger, fontSize: 12, paddingHorizontal: spacing.lg },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface2, maxHeight: 100 },
  sendBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg, gap: spacing.sm, maxHeight: '70%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  convRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  convMain: { flex: 1 },
  convTitle: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  convTitleActive: { color: colors.accent },
  convDate: { fontSize: 11, color: colors.inkSoft },
  newConvBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, marginTop: spacing.xs },
  newConvBtnText: { color: '#fff', fontWeight: '700' },
});
