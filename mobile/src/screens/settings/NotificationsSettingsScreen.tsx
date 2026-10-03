import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { NotificationChannels } from '../../api/types';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { registerForPushNotifications } from '../../lib/notifications';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NotificationsSettings'>;

export function NotificationsSettingsScreen(_: Props) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notification-settings'], queryFn: () => api.get<NotificationChannels>('/notification-settings') });
  const [number, setNumber] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const s = q.data;
  const shown = number ?? s?.whatsappTo ?? '';

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setErr(null); setOkMsg(null); setBusy(key);
    try { await fn(); if (ok) setOkMsg(ok); await qc.invalidateQueries({ queryKey: ['notification-settings'] }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui.'); }
    finally { setBusy(null); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.banner}>Todo aviso (atividade, evento ou lembrete) cai no sino do app. Você escolhe, em cada um, se também quer receber no celular ou no WhatsApp.</Text>
      {okMsg && <Text style={styles.ok}>{okMsg}</Text>}
      {err && <Text style={styles.error}>{err}</Text>}
      {q.error && <QueryError error={q.error} onRetry={() => void q.refetch()} />}

      <View style={styles.block}>
        <View style={styles.rowHead}>
          <Icon name="bell" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}><Text style={styles.blockTitle}>Sino do app</Text><Text style={styles.hint}>Sempre ativo, com o app aberto.</Text></View>
          <View style={styles.tagOn}><Text style={styles.tagOnText}>Ativo</Text></View>
        </View>
        <TouchableOpacity style={styles.smallBtn} onPress={() => void run('app', () => api.post('/notifications/test', { channel: 'app' }), 'Teste enviado.')}>
          {busy === 'app' ? <Text style={styles.smallBtnText}>…</Text> : <Text style={styles.smallBtnText}>Enviar teste</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.block}>
        <View style={styles.rowHead}>
          <Icon name="bell" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}><Text style={styles.blockTitle}>Celular (push)</Text><Text style={styles.hint}>Chega mesmo com o app fechado.</Text></View>
          {s && <View style={s.push.devices ? styles.tagOn : styles.tag}><Text style={s.push.devices ? styles.tagOnText : styles.tagText}>{s.push.devices ? `${s.push.devices} aparelho${s.push.devices > 1 ? 's' : ''}` : 'Nenhum aparelho'}</Text></View>}
        </View>
        {!s?.push.devices && (
          <Text style={styles.warnHint}>Este aparelho ainda não está registrado. Confirme que você permitiu notificações quando o app pediu.</Text>
        )}
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.smallBtn} onPress={() => void run('reg', () => registerForPushNotifications(), 'Registro tentado — confira acima se apareceu um aparelho.')}>
            {busy === 'reg' ? <Text style={styles.smallBtnText}>…</Text> : <Text style={styles.smallBtnText}>Registrar este aparelho</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallBtn, !s?.push.devices && styles.btnDisabled]} disabled={!s?.push.devices} onPress={() => void run('push', () => api.post('/notifications/test', { channel: 'push' }), 'Teste enviado.')}>
            <Text style={styles.smallBtnText}>Enviar teste</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.rowHead}>
          <Icon name="send" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}><Text style={styles.blockTitle}>WhatsApp</Text><Text style={styles.hint}>Envio via Twilio, para o seu número.</Text></View>
          {s && <View style={s.whatsapp.configured && s.whatsappTo ? styles.tagOn : styles.tag}><Text style={s.whatsapp.configured && s.whatsappTo ? styles.tagOnText : styles.tagText}>{s.whatsapp.configured ? (s.whatsappTo ? 'Configurado' : 'Falta o número') : 'Sem credenciais'}</Text></View>}
        </View>
        <Text style={styles.label}>Seu número (com DDI e DDD)</Text>
        <TextInput style={styles.input} value={shown} onChangeText={setNumber} placeholder="+55 47 99999-9999" keyboardType="phone-pad" />
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.smallBtn} onPress={() => void run('num', () => api.put('/notification-settings', { whatsappTo: shown }), 'Número salvo.')}>
            {busy === 'num' ? <Text style={styles.smallBtnText}>…</Text> : <Text style={styles.smallBtnText}>Salvar número</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallBtn, !(s?.whatsapp.configured && s.whatsappTo) && styles.btnDisabled]} disabled={!(s?.whatsapp.configured && s.whatsappTo)} onPress={() => void run('wa', () => api.post('/notifications/test', { channel: 'whatsapp' }), 'Teste enviado.')}>
            <Text style={styles.smallBtnText}>Enviar teste</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Fora da janela de 24h desde sua última mensagem, só chegam modelos aprovados pelo WhatsApp. Se falhar, o aviso continua chegando no sino.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  banner: { fontSize: 12, color: colors.inkSoft, backgroundColor: colors.accentTint, borderRadius: radius, padding: spacing.sm },
  ok: { color: colors.ideal, fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
  warnHint: { color: colors.danger, fontSize: 11 },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  blockTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 12, color: colors.inkSoft },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.paper },
  btnRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  smallBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: spacing.sm, alignSelf: 'flex-start' },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnDisabled: { opacity: 0.4 },
  tag: { backgroundColor: colors.surface2, borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm },
  tagText: { fontSize: 11, color: colors.inkSoft, fontWeight: '700' },
  tagOn: { backgroundColor: 'rgba(26,143,99,0.15)', borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm },
  tagOnText: { fontSize: 11, color: colors.ideal, fontWeight: '700' },
});
