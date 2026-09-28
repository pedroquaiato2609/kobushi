import type { NotificationChannel, OutgoingMessage } from '../../application/notifications';
import type { NotificationSettingsRepository } from '../../application/ports';
import { features } from '../../config';

const e164 = (v: string) => `+${v.replace(/\D/g, '')}`;

/**
 * WhatsApp via Twilio. Limitação do WhatsApp: mensagens iniciadas por você fora da janela de 24 h desde a última
 * mensagem do usuário exigem modelos aprovados. No sandbox da Twilio, é preciso enviar o código "join" antes.
 */
export class WhatsAppChannel implements NotificationChannel {
  readonly name = 'whatsapp' as const;
  constructor(private settings: NotificationSettingsRepository) {}

  configured() { return Boolean(features.twilioSid && features.twilioToken && features.twilioWhatsappFrom); }

  async available() {
    return this.configured() && Boolean((await this.settings.get()).whatsappTo.replace(/\D/g, ''));
  }

  async send(m: OutgoingMessage) {
    const to = (await this.settings.get()).whatsappTo;
    const auth = Buffer.from(`${features.twilioSid}:${features.twilioToken}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${features.twilioSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        From: `whatsapp:${e164(features.twilioWhatsappFrom as string)}`,
        To: `whatsapp:${e164(to)}`,
        Body: `*${m.title}*${m.body ? `\n${m.body}` : ''}`,
      }),
    });
    if (!res.ok) {
      const data: any = await res.json().catch(() => null);
      throw new Error(`Twilio: ${data?.message ?? res.statusText}`);
    }
  }
}
