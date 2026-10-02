// Notificações push de verdade (chegam com o app fechado), via Expo Push — não precisa de chave/conta
// nenhuma além do projectId do EAS que o app já tem. O servidor manda pra cá do mesmo jeito que já manda
// pro Web Push do app web (mesmo canal "push" dos lembretes/atividades/deslocamentos/eventos).
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../api/client';

// Enquanto o app está ABERTO, mostra a notificação na tela mesmo assim (por padrão o SO só mostra
// notificação de apps em segundo plano/fechados); fechado, quem decide é o sistema operacional.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let registeredToken: string | null = null;

/**
 * Pede permissão (se ainda não tiver) e registra o token deste aparelho no servidor. Chamado depois de
 * logar e também ao abrir o app já logado — não falha o fluxo de login se der errado (ex.: emulador sem
 * Google Play Services, ou o usuário negou a permissão): só fica sem notificação push, o resto do app
 * continua funcionando normal.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return; // emulador/simulador não recebe push de verdade

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Padrão', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lightColor: '#6a5cd6',
      });
    }

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (token === registeredToken) return; // já registrado nesta sessão do app, não manda de novo à toa
    await api.post('/push/expo-register', { token });
    registeredToken = token;
  } catch (e) {
    console.warn('[push] não consegui registrar notificações neste aparelho:', e);
  }
}

/** Chamado no logout: tira este aparelho da lista, pra não ficar recebendo notificação de uma conta que saiu. */
export async function unregisterPushNotifications(): Promise<void> {
  if (!registeredToken) return;
  try { await api.post('/push/expo-unregister', { token: registeredToken }); } catch { /* best-effort */ }
  registeredToken = null;
}
