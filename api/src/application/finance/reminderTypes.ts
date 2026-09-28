import type { UserRepository } from '../authPorts';
import type { NotificationLogRepository, ReviewRepository } from '../ports';
import type { Notifier } from '../notifications';
import type { SuggestionService } from '../suggestions';
import type { FinanceService } from './service';

export interface AuthCtx {
  users: UserRepository; finance: FinanceService; log: NotificationLogRepository; notifier: Notifier;
  suggestions: SuggestionService; reviews: ReviewRepository; timezone: string;
}
