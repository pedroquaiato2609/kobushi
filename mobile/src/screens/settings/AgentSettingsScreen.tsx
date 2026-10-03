import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { AgentSettings, AgentStatus } from '../../api/types';
import { QueryError } from '../../components/QueryError';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'AgentSettings'>;
const MODEL_PRESETS: Record<AgentSettings['provider'], string[]> = {
  anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
};

/** Modo/modelo de voz (Voz, no app web) não aparece aqui: o mobile ainda não tem ditado por voz, então
 * esses campos não têm o que configurar — ficam preservados como vieram, sem UI pra eles. */
export function AgentSettingsScreen(_: Props) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['agent-settings'], queryFn: () => api.get<AgentSettings>('/agent/settings') });
  const status = useQuery({ queryKey: ['agent-status'], queryFn: () => api.get<AgentStatus>('/agent/status') });
  const [f, setF] = useState<AgentSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => { if (q.data && !f) setF(q.data); }, [q.data, f]);

  function set<K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) {
    setF((p) => (p ? { ...p, [k]: v } : p));
  }
  function changeProvider(provider: AgentSettings['provider']) {
    setF((p) => (p ? { ...p, provider, model: MODEL_PRESETS[provider].includes(p.model) ? p.model : MODEL_PRESETS[provider][0] } : p));
  }

  async function save() {
    if (!f) return;
    setErr(null); setOk(false); setBusy(true);
    try {
      await api.put('/agent/settings', f);
      setOk(true);
      await qc.invalidateQueries({ queryKey: ['agent-settings'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading || status.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (q.error) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  if (!f || !status.data) return null;

  const keyOk = status.data.providers[f.provider];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Provedor de IA</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, f.provider === 'anthropic' && styles.chipOn]} onPress={() => changeProvider('anthropic')}>
          <Text style={[styles.chipText, f.provider === 'anthropic' && styles.chipTextOn]}>Anthropic (Claude)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.chip, f.provider === 'openai' && styles.chipOn]} onPress={() => changeProvider('openai')}>
          <Text style={[styles.chipText, f.provider === 'openai' && styles.chipTextOn]}>OpenAI</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Modelo</Text>
      <View style={styles.chipRow}>
        {MODEL_PRESETS[f.provider].map((m) => (
          <TouchableOpacity key={m} style={[styles.chip, f.model === m && styles.chipOn]} onPress={() => set('model', m)}>
            <Text style={[styles.chipText, f.model === m && styles.chipTextOn]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={keyOk ? styles.ok : styles.warn}>
        {keyOk ? 'Chave de API configurada.' : `Chave ausente: defina ${f.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} no servidor.`}
      </Text>

      <Text style={styles.label}>Idioma das respostas</Text>
      <TextInput style={styles.input} value={f.language} onChangeText={(v) => set('language', v)} />
      <Text style={styles.label}>Tom</Text>
      <TextInput style={styles.input} value={f.tone} onChangeText={(v) => set('tone', v)} placeholder="ex.: direto e acolhedor" />

      <Text style={styles.label}>Instruções permanentes</Text>
      <TextInput
        style={[styles.input, styles.textarea]} value={f.customInstructions} onChangeText={(v) => set('customInstructions', v)} multiline numberOfLines={4}
        placeholder="Ex.: Nunca sugira aumentar a carga em dias de baixa capacidade."
      />

      <TouchableOpacity style={styles.checkRow} onPress={() => set('includeRoutineContext', !f.includeRoutineContext)}>
        <View style={[styles.checkbox, f.includeRoutineContext && styles.checkboxOn]} />
        <Text style={styles.checkText}>Enviar minha rotina ao agente em toda mensagem (atividades, níveis e princípios)</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Máximo de passos por mensagem</Text>
      <TextInput style={styles.input} value={String(f.maxToolSteps)} onChangeText={(v) => set('maxToolSteps', Math.max(1, Math.min(20, Number(v) || 1)))} keyboardType="number-pad" />

      {err && <Text style={styles.error}>{err}</Text>}
      {ok && <Text style={styles.ok}>Salvo.</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void save()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar configurações'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  ok: { color: colors.ideal, fontSize: 12 },
  warn: { color: colors.danger, fontSize: 12 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkText: { fontSize: 12, color: colors.ink, flex: 1 },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
