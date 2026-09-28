import { api } from '../api/client';

const toBytes = (base64Url: string) => {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Registra este aparelho para receber notificações push (exige HTTPS ou localhost). */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('Este navegador não suporta notificações push. No iPhone, instale o app na tela inicial primeiro.');
  if (!window.isSecureContext) throw new Error('Notificações push exigem HTTPS (ou localhost). Acesse por um endereço seguro.');
  const { publicKey } = await api.get<{ publicKey: string | null }>('/push/key');
  if (!publicKey) throw new Error('O servidor ainda não tem chaves VAPID (veja o .env.example).');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Permissão de notificações negada no navegador.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) as BufferSource });
  const json = subscription.toJSON();
  await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
}
