import type { FieldCrypto } from '../../application/fieldCrypto';
import type { PluggyEvent } from '../../application/openFinance/webhook';
import type { Db } from '../db/pool';

/** Persist before acknowledging; retry after restart, deduplicate by provider event id. */
export class PluggyWebhookQueue {
  private running = false;
  constructor(private db: Db, private crypto: FieldCrypto, private process: (event: PluggyEvent) => Promise<string>) {}
  async receive(event: PluggyEvent) {
    await this.db.query(`INSERT INTO of_webhook_events(event_id, event, payload_enc) VALUES ($1,$2,$3)
      ON CONFLICT (event_id) DO NOTHING`, [event.eventId, event.event, this.crypto.encrypt(JSON.stringify(event))]);
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (let i = 0; i < 10; i++) {
        // Atomic claim and lease; unfinished work becomes available again after a crash.
        const { rows } = await this.db.query(`UPDATE of_webhook_events SET attempts=attempts+1,
          next_attempt_at=now()+interval '30 minutes' WHERE event_id=(
            SELECT event_id FROM of_webhook_events WHERE processed_at IS NULL AND next_attempt_at<=now()
            ORDER BY received_at LIMIT 1 FOR UPDATE SKIP LOCKED
          ) RETURNING event_id, payload_enc, attempts`);
        const row = rows[0];
        if (!row) break;
        try {
          const outcome = await this.process(JSON.parse(this.crypto.decrypt(row.payload_enc)));
          await this.db.query('UPDATE of_webhook_events SET processed_at=now(), outcome=$2 WHERE event_id=$1', [row.event_id, outcome]);
        } catch {
          // No bank data, credentials or provider error bodies in logs/database errors.
          await this.db.query(`UPDATE of_webhook_events SET outcome='retry',
            next_attempt_at=now()+($2 * interval '1 minute') WHERE event_id=$1`, [row.event_id, Math.min(60, 2 ** Math.min(row.attempts, 6))]);
        }
      }
      await this.db.query("DELETE FROM of_webhook_events WHERE processed_at < now()-interval '30 days'");
    } finally { this.running = false; }
  }
}
