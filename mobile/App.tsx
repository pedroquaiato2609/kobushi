import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ApiError } from './src/api/client';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Uma chamada que já estourou os 15s de timeout (ver REQUEST_TIMEOUT_MS em api/client.ts) ou que
      // nem conseguiu conectar não tem por que tentar de novo na hora — só dobra a espera (15s + 15s)
      // antes de mostrar o erro pro usuário, que é exatamente o "fica girando pra sempre" que motivou
      // isso aqui. Pra erros de verdade da API (4xx/5xx, que respondem rápido), continua tentando 1 vez.
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status === 0),
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
