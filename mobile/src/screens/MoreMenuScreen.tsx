import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import type { MoreStackParamList } from '../navigation/MoreStack';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'MoreMenu'>;

const ITEMS: { to: keyof MoreStackParamList; icon: IconName; label: string; hint: string }[] = [
  { to: 'Stats', icon: 'chart', label: 'Dashboard', hint: 'Como seus dias têm sido, meditação e revisão do dia' },
  { to: 'Agenda', icon: 'calendar', label: 'Agenda', hint: 'O que tem pra hoje: atividades, eventos e deslocamentos' },
  { to: 'Activities', icon: 'target', label: 'Atividades', hint: 'Sua rotina: obrigações, objetivos e níveis' },
  { to: 'Reminders', icon: 'bell', label: 'Lembretes', hint: 'Tudo o que vai te avisar' },
  { to: 'Commutes', icon: 'car', label: 'Deslocamentos', hint: 'Trajetos ligados a uma atividade com horário' },
  { to: 'Principles', icon: 'shield', label: 'Princípios', hint: 'Protegidos pela senha do Cofre' },
  { to: 'Study', icon: 'study', label: 'Estudos', hint: 'Notas e planos de estudo' },
  { to: 'Kanban', icon: 'kanban', label: 'Kanban', hint: 'Tarefas e projetos sem hora marcada' },
  { to: 'Documents', icon: 'folder', label: 'Documentos', hint: 'Notas, listas e arquivos em pastas' },
  { to: 'Settings', icon: 'settings', label: 'Configurações', hint: 'Conta, Cofre & Perfil, notificações' },
];

export function MoreMenuScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
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
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line },
  iconWrap: { width: 40, height: 40, borderRadius: 999, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 12, color: colors.inkSoft },
});
