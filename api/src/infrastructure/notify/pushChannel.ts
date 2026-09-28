import type { NotificationChannel, OutgoingMessage } from '../../application/notifications';
import type { PushSubscriptionRepository } from '../../application/ports';
import { features } from '../../config';

/** Web Push (PWA): chega no celular mesmo com o app fechado. Exige chaves VAPID e HTTPS (ou localhost). */
export class PushChannel implements NotificationChannel {
  readonly name = 'push' as const;
  constructor(private subs: PushSubscriptionRepository) {}

  configured() { return Boolean(features.vapidPublicKey && features.vapidPrivateKey); }

  async available() {
    return this.configured() && (await this.subs.list()).length > 0;
  }

  async send(m: OutgoingMessage) {
    const webpush: any = (await import('web-push')).default;
    webpush.setVapidDetails(features.vapidSubject, features.vapidPublicKey, features.vapidPrivateKey);
    const payload = JSON.stringify({ title: m.title, body: m.body, url: m.link ?? '/' });
    for (const s of await this.subs.list()) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await this.subs.remove(s.endpoint); // aparelho não existe mais
        else throw e;
      }
    }
  }
}
