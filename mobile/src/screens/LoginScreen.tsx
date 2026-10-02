import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, radius, spacing } from '../theme';

export function LoginScreen() {
  const { login, busy, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.logo}>Ninshiki</Text>
        <Text style={styles.subtitle}>um dia de cada vez</Text>

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input} value={email} onChangeText={setEmail}
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username"
        />
        <Text style={styles.label}>Senha</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]} disabled={busy}
          onPress={() => void login(email.trim(), password)}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius, padding: spacing.xl, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  logo: { fontSize: 28, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginBottom: spacing.md },
  label: { fontSize: 13, color: colors.inkSoft, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: 16, color: colors.ink, backgroundColor: colors.surface2,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
