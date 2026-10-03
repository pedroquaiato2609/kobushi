import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Settings'>;

/**
 * Hub de configurações — o app web usa uma barra de abas horizontal (Agente, Assistente, Voz, Perfil,
 * Notificações, Permissões, Segurança, Histórico); aqui vira uma lista de atalhos, mais natural pro
 * celular. Voz/ditado fica de fora (o mobile não tem ditado por voz); todo o resto tem tela própria.
 */
const ITEMS: { to: keyof MoreStackParamList; icon: IconName; label: string; hint: string }[] = [
  { to: 'Account', icon: 'settings', label: 'Conta', hint: 'Seus dados, trocar senha, dispositivos conectados, exportar/apagar dados' },
  { to: 'VaultProfile', icon: 'lock', label: 'Cofre & Perfil', hint: 'O que a IA sabe sobre você, protegido pela senha do Cofre' },
  { to: 'NotificationsSettings', icon: 'bell', label: 'Notificações', hint: 'Sino do app, celular e WhatsApp' },
  { to: 'AgentSettings', icon: 'sparkles', label: 'Agente', hint: 'Provedor, modelo, instruções e idioma do assistente' },
  { to: 'AssistantProactive', icon: 'target', label: 'Assistente proativo', hint: 'Sugestões automáticas, silêncio e revisões' },
  { to: 'Permissions', icon: 'shield', label: 'Permissões', hint: 'O que o agente pode fazer sozinho, ferramenta por ferramenta' },
  { to: 'ActionHistory', icon: 'clock', label: 'Histórico de ações', hint: 'Tudo que o agente já executou' },
];

export function SettingsScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {ITEMS.map((it) => (
        <TouchableOpacity key={it.to} style={styles.row} onPress={() => navigation.navigate(it.to as never)}>
          <View style={styles.iconWrap}><Icon name={it.icon} size={20} color={colors.accent} /></View>
          <View style={styles.main}>
            <Text style={styles.label}>{it.label}</Text>
            <Text style={styles.hint}>{it.hint}</Text>
          </View>
          <Icon name="right" size={16} color={colors.inkSoft} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line },
  iconWrap: { width: 40, height: 40, borderRadius: 999, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 12, color: colors.inkSoft },
});
