import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import type { AgentAction, ChatMessage, Conversation } from '../../api/types';
import { ACTION_LABEL, RESOURCE_LABEL } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';

// Chat com o assistente. Usa o endpoint síncrono (não o de streaming por SSE) porque o React Native não
// tem um jeito confiável de ler uma resposta em pedaços — o turno inteiro chega de uma vez quando pronto
// (pode demorar alguns segundos se o assistente usar ferramentas). Ações que exigem confirmação (ex.:
// qualquer gravação em Finanças) aparecem como um cartão de Aprovar/Rejeitar, igual no app web.
export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => api.get<Conversation[]>('/conversations') });
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

  async function send() {
    const text = draft.trim();
    if (!text || !conversationId || sending) return;
    setDraft(''); setSending(true); setErr(null);
    try {
      await api.post<{ messages: ChatMessage[] }>(`/conversations/${conversationId}/messages`, { content: text });
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

  const visible = (messages.data ?? []).filter((m) => m.role !== 'tool' && (m.content || m.role === 'note'));

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Text style={styles.header}>Assistente</Text>

      {!conversationId || messages.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={styles.empty}>Pergunte alguma coisa — sobre seus treinos, finanças, leituras... O assistente sempre pede confirmação antes de gravar algo.</Text>}
          renderItem={({ item }) => {
            if (item.role === 'note') return <Text style={styles.note}>{item.content}</Text>;
            if (!item.content) return null;
            return (
              <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                <Text style={item.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText}>{item.content}</Text>
              </View>
            );
          }}
          ListFooterComponent={
            <>
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
          multiline onSubmitEditing={() => void send()}
        />
        <TouchableOpacity style={[styles.sendBtn, (sending || !draft.trim()) && styles.sendBtnDisabled]} disabled={sending || !draft.trim()} onPress={() => void send()}>
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendBtnText}>Enviar</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { fontSize: 22, fontWeight: '700', color: colors.ink, padding: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  empty: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.xl },
  note: { fontSize: 12, color: colors.inkSoft, fontStyle: 'italic', textAlign: 'center' },
  bubble: { borderRadius: radius, padding: spacing.md, maxWidth: '85%' },
  bubbleUser: { backgroundColor: colors.accent, alignSelf: 'flex-end' },
  bubbleAssistant: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignSelf: 'flex-start' },
  bubbleUserText: { color: '#fff', fontSize: 14 },
  bubbleAssistantText: { color: colors.ink, fontSize: 14 },
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
});
