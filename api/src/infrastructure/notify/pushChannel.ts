import type { NotificationChannel, OutgoingMessage } from '../../application/notifications';
import type { ExpoPushTokenRepository, PushSubscriptionRepository } from '../../application/ports';
import { features } from '../../config';

/**
 * Um canal "push" só, mas com dois jeitos de entrega: Web Push (PWA, usado pelo app web; exige chaves
 * VAPID) e Expo Push (app mobile nativo; não precisa de chave nenhuma, é só o token do aparelho). Os dois
 * chegam mesmo com o app fechado. `name` continua 'push' pros dois — do ponto de vista de quem configura
 * o lembrete, é um canal só ("notificação no celular"); a diferença de transporte é interna.
 */
export class PushChannel implements NotificationChannel {
  readonly name = 'push' as const;
  constructor(private subs: PushSubscriptionRepository, private expoTokens: ExpoPushTokenRepository) {}

  webPushConfigured() { return Boolean(features.vapidPublicKey && features.vapidPrivateKey); }

  async available() {
    const [webSubs, expo] = await Promise.all([this.webPushConfigured() ? this.subs.list() : Promise.resolve([]), this.expoTokens.list()]);
    return webSubs.length > 0 || expo.length > 0;
  }

  async send(m: OutgoingMessage) {
    await Promise.all([this.sendWebPush(m), this.sendExpo(m)]);
  }

  private async sendWebPush(m: OutgoingMessage) {
    if (!this.webPushConfigured()) return;
    const subs = await this.subs.list();
    if (subs.length === 0) return;
    const webpush: any = (await import('web-push')).default;
    webpush.setVapidDetails(features.vapidSubject, features.vapidPublicKey, features.vapidPrivateKey);
    const payload = JSON.stringify({ title: m.title, body: m.body, url: m.link ?? '/' });
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await this.subs.remove(s.endpoint); // aparelho não existe mais
        else throw e;
      }
    }
  }

  /** Expo Push: https://exp.host/--/api/v2/push/send, até 100 mensagens por chamada, sem chave nenhuma. */
  private async sendExpo(m: OutgoingMessage) {
    const tokens = await this.expoTokens.list();
    if (tokens.length === 0) return;
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i + 100);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk.map((to) => ({ to, title: m.title, body: m.body, data: { url: m.link ?? '/' } }))),
      });
      const json: any = await res.json().catch(() => null);
      const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
      await Promise.all(tickets.map((t, j) => {
        // token não existe mais (desinstalou o app, etc.) — limpa, senão toda notificação tenta de novo à toa
        if (t?.details?.error === 'DeviceNotRegistered') return this.expoTokens.remove(chunk[j]);
        return Promise.resolve();
      }));
    }
  }
}
