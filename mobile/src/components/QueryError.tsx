import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing } from '../theme';

/**
 * Pra quando uma consulta falha (ou estoura o tempo limite — ver REQUEST_TIMEOUT_MS em api/client.ts):
 * mostra o erro de verdade na tela, com botão de tentar de novo, em vez de deixar a tela girando pra
 * sempre sem dizer por quê (foi exatamente isso que aconteceu num aparelho real e motivou isso aqui).
 */
export function QueryError({ title = 'Não consegui carregar', error, onRetry }: { title?: string; error: unknown; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {error instanceof Error && <Text style={styles.detail}>{error.message}</Text>}
      <TouchableOpacity style={styles.btn} onPress={onRetry}><Text style={styles.btnText}>Tentar de novo</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  detail: { fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
  btn: { marginTop: spacing.sm, backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: spacing.lg, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
});
