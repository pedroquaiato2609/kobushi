import { z } from 'zod';

// Strip unrelated payload fields. Never fetch URLs supplied in a notification.
export const webhookSchema = z.object({
  eventId: z.string().min(1).max(200),
  event: z.string().min(1).max(100),
  itemId: z.string().min(1).max(200).optional(),
  transactionIds: z.array(z.string().min(1).max(200)).max(10000).optional(),
});
export type PluggyEvent = z.infer<typeof webhookSchema>;
export const supportedEvent = (event: string) => [
  'item/created', 'item/updated', 'item/error', 'item/deleted',
  'item/waiting_user_input', 'item/waiting_user_action', 'item/login_succeeded',
  'transactions/created', 'transactions/updated', 'transactions/deleted',
].includes(event);
