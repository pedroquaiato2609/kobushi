import type {
  NotificationLogRepository, NotificationRepository, NotificationSettingsRepository, PushSubscriptionRepository, ReminderRepository,
} from '../../application/ports';
import type { AppNotification, Reminder } from '../../domain/entities';
import type { Db } from '../db/pool';
import { localTs, mapRow, updateRow } from '../db/util';

const toReminder = (r: Record<string, any>): Reminder => ({
  id: r.id, title: r.title, body: r.body, remindAt: localTs(r.remind_at), repeat: r.repeat, channels: r.channels ?? [],
  activityId: r.activity_id, status: r.status, lastFiredAt: r.last_fired_at ? localTs(r.last_fired_at) : null, createdAt: r.created_at,
});

export class PgReminderRepository implements ReminderRepository {
  constructor(private db: Db) {}

  async list() {
    const { rows } = await this.db.query(`SELECT * FROM reminders ORDER BY status DESC, remind_at`);
    return rows.map(toReminder);
  }
  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM reminders WHERE id = $1', [id]);
    return rows[0] ? toReminder(rows[0]) : null;
  }
  async create(d: Parameters<ReminderRepository['create']>[0]) {
    const { rows } = await this.db.query(
      'INSERT INTO reminders (title, body, remind_at, repeat, channels, activity_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [d.title, d.body, d.remindAt, d.repeat, d.channels, d.activityId],
    );
    return toReminder(rows[0]);
  }
  async update(id: string, patch: Parameters<ReminderRepository['update']>[1]) {
    const row = await updateRow(this.db, 'reminders', 'id', id, patch, ['title', 'body', 'remindAt', 'repeat', 'channels', 'status', 'lastFiredAt'], { touch: false });
    return row ? toReminder(row) : null;
  }
  async delete(id: string) {
    const res = await this.db.query('DELETE FROM reminders WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
  async due(nowLocal: string) {
    const { rows } = await this.db.query(`SELECT * FROM reminders WHERE status = 'pending' AND remind_at <= $1::timestamp ORDER BY remind_at`, [nowLocal]);
    return rows.map(toReminder);
  }
}

export class PgNotificationRepository implements NotificationRepository {
  constructor(private db: Db) {}

  async create(d: { title: string; body: string; link: string | null; source: string }) {
    const { rows } = await this.db.query('INSERT INTO notifications (title, body, link, source) VALUES ($1,$2,$3,$4) RETURNING *', [d.title, d.body, d.link, d.source]);
    return mapRow<AppNotification>(rows[0]) as AppNotification;
  }
  async list(opts: { unreadOnly?: boolean; limit: number }) {
    const { rows } = await this.db.query(
      `SELECT * FROM notifications ${opts.unreadOnly ? 'WHERE read_at IS NULL' : ''} ORDER BY created_at DESC LIMIT $1`, [opts.limit],
    );
    return rows.map((r) => mapRow<AppNotification>(r) as AppNotification);
  }
  async unreadCount() {
    const { rows } = await this.db.query('SELECT count(*)::int AS n FROM notifications WHERE read_at IS NULL');
    return rows[0].n as number;
  }
  async markRead(id: string) { await this.db.query('UPDATE notifications SET read_at = now() WHERE id = $1 AND read_at IS NULL', [id]); }
  async markAllRead() { await this.db.query('UPDATE notifications SET read_at = now() WHERE read_at IS NULL'); }
}

export class PgNotificationLogRepository implements NotificationLogRepository {
  constructor(private db: Db) {}
  async claim(key: string) {
    const res = await this.db.query('INSERT INTO notification_log (key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
    return (res.rowCount ?? 0) > 0;
  }
}

export class PgPushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private db: Db) {}
  async upsert(s: { endpoint: string; p256dh: string; auth: string }) {
    await this.db.query(
      'INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ($1,$2,$3) ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth',
      [s.endpoint, s.p256dh, s.auth],
    );
  }
  async remove(endpoint: string) { await this.db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]); }
  async list() {
    const { rows } = await this.db.query('SELECT endpoint, p256dh, auth FROM push_subscriptions');
    return rows as { endpoint: string; p256dh: string; auth: string }[];
  }
}

export class PgNotificationSettingsRepository implements NotificationSettingsRepository {
  constructor(private db: Db) {}
  async get() {
    const { rows } = await this.db.query('SELECT whatsapp_to FROM notification_settings WHERE id = 1');
    return { whatsappTo: rows[0].whatsapp_to as string };
  }
  async update(patch: { whatsappTo?: string }) {
    if (patch.whatsappTo !== undefined) await this.db.query('UPDATE notification_settings SET whatsapp_to = $1 WHERE id = 1', [patch.whatsappTo]);
    return this.get();
  }
}
