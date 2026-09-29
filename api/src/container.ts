// Composition root: único lugar que conhece as implementações concretas.
import { AgentOrchestrator } from './agent/orchestrator';
import { PermissionPolicy } from './agent/policy';
import { ToolRunner } from './agent/runner';
import { buildTools } from './agent/tools';
import { AuditService, AuthService } from './application/auth';
import { FieldCrypto } from './application/fieldCrypto';
import { FinanceReminders } from './application/finance/reminders';
import { FinanceService } from './application/finance/service';
import { DemoOpenFinanceProvider } from './application/openFinance/demoProvider';
import { OpenFinanceService } from './application/openFinance/service';
import { PluggyProvider } from './infrastructure/openFinance/pluggyProvider';
import { PluggyWebhookQueue } from './infrastructure/openFinance/webhookQueue';
import { PgOpenFinanceRepository } from './infrastructure/repositories/openFinanceRepository';
import { ActivitySchedulingService } from './application/scheduling';
import { GymService } from './application/gym/service';
import { PgGymRepository } from './infrastructure/repositories/gymRepository';
import { FallbackBookLookup, FallbackBookSearch, GoogleBooksLookup, GoogleBooksSearch, OpenLibraryLookup, OpenLibrarySearch } from './application/reading/bookLookup';
import { ReadingService } from './application/reading/service';
import { PgReadingRepository } from './infrastructure/repositories/readingRepository';
import { pagesGoalOf } from './domain/reading';
import { StudyService } from './application/study/service';
import { PgStudyRepository } from './infrastructure/repositories/studyRepository';
import type { Level } from './domain/constants';
import { LiveSignalSource } from './application/signalSource';
import { SuggestionService } from './application/suggestions';
import { DocumentService } from './application/library';
import { Notifier, ReminderScheduler, ReminderService } from './application/notifications';
import { PrinciplesService, ProfileService, VaultService } from './application/security';
import {
  ActivityService, BoardService, CommuteService, EventService, ExecutionService, MeditationService, ReviewService, StatsService,
} from './application/services';
import { config, features } from './config';
import { dateInTz, nowLocalTs, todayIn, toMinutes, weekdayOf } from './domain/dates';
import { pool } from './infrastructure/db/pool';
import { loadDataKey } from './infrastructure/security/dataKey';
import { PgAuditRepository, PgSessionRepository, PgUserRepository } from './infrastructure/repositories/authRepositories';
import { PgExportRepository } from './infrastructure/repositories/exportRepository';
import { PgFinanceRepository } from './infrastructure/repositories/financeRepository';
import { PgSuggestionRepository } from './infrastructure/repositories/suggestionRepository';
import { DiskFileStore } from './infrastructure/files/diskFileStore';
import { extractText } from './infrastructure/files/extractText';
import { PushChannel } from './infrastructure/notify/pushChannel';
import { WhatsAppChannel } from './infrastructure/notify/whatsappChannel';
import { PgActivityRepository } from './infrastructure/repositories/activityRepository';
import { PgCommuteRepository } from './infrastructure/repositories/commuteRepository';
import {
  PgAgentActionRepository, PgAgentSettingsRepository, PgConversationRepository, PgPermissionRepository,
} from './infrastructure/repositories/agentRepositories';
import { PgBoardRepository } from './infrastructure/repositories/boardRepository';
import { PgEventRepository } from './infrastructure/repositories/eventRepository';
import { PgExecutionRepository } from './infrastructure/repositories/executionRepository';
import { PgDocumentRepository, PgFolderRepository } from './infrastructure/repositories/libraryRepositories';
import {
  PgNotificationLogRepository, PgNotificationRepository, PgNotificationSettingsRepository, PgPushSubscriptionRepository, PgReminderRepository,
} from './infrastructure/repositories/lifeRepositories';
import { PgMeditationRepository } from './infrastructure/repositories/meditationRepository';
import { PgReviewRepository } from './infrastructure/repositories/reviewRepository';
import { PgProfileRepository, PgVaultRepository } from './infrastructure/repositories/securityRepositories';
import { PgPrincipleRepository } from './infrastructure/repositories/principleRepository';
import { OpenAiTranscriber } from './infrastructure/speech/openaiTranscriber';

export function createContainer() {
  // repositórios
  const activityRepo = new PgActivityRepository(pool);
  const commuteRepo = new PgCommuteRepository(pool);
  const executionRepo = new PgExecutionRepository(pool);
  const eventRepo = new PgEventRepository(pool);
  const boardRepo = new PgBoardRepository(pool);
  const reviewRepo = new PgReviewRepository(pool);
  const meditationRepo = new PgMeditationRepository(pool);
  const settingsRepo = new PgAgentSettingsRepository(pool);
  const permissionRepo = new PgPermissionRepository(pool);
  const actionRepo = new PgAgentActionRepository(pool);
  const conversationRepo = new PgConversationRepository(pool);
  const reminderRepo = new PgReminderRepository(pool);
  const inbox = new PgNotificationRepository(pool);
  const notificationLog = new PgNotificationLogRepository(pool);
  const pushSubscriptions = new PgPushSubscriptionRepository(pool);
  const notificationSettings = new PgNotificationSettingsRepository(pool);
  const vaultRepo = new PgVaultRepository(pool);
  const profileRepo = new PgProfileRepository(pool);
  const principleRepo = new PgPrincipleRepository(pool);
  const folderRepo = new PgFolderRepository(pool);
  const documentRepo = new PgDocumentRepository(pool);
  const userRepo = new PgUserRepository(pool);
  const auditRepo = new PgAuditRepository(pool);
  const financeRepo = new PgFinanceRepository(pool);
  const suggestionRepo = new PgSuggestionRepository(pool);

  // casos de uso
  const activities = new ActivityService(activityRepo);
  const commutes = new CommuteService(commuteRepo, activityRepo);
  const scheduling = new ActivitySchedulingService(activityRepo, commuteRepo);
  const executions = new ExecutionService(executionRepo, activityRepo);
  const events = new EventService(eventRepo);
  const boards = new BoardService(boardRepo);
  const reviews = new ReviewService(reviewRepo);
  const meditation = new MeditationService(meditationRepo);
  const stats = new StatsService(activityRepo, executionRepo, meditationRepo);
  const reminders = new ReminderService(reminderRepo, activityRepo);
  const vault = new VaultService(vaultRepo, profileRepo, principleRepo);
  const profile = new ProfileService(profileRepo, vault);
  const principles = new PrinciplesService(principleRepo, vault);
  const documents = new DocumentService(folderRepo, documentRepo, new DiskFileStore(features.filesDir), extractText);
  // Academia. Ao finalizar um treino com nível, registra o nível na atividade "Academia" da rotina (se existir e o dia ainda não tiver registro).
  const gym = new GymService(new PgGymRepository(pool), new DiskFileStore(features.filesDir), config.timezone, () => new Date(), async (view) => {
    const level = view.session.level;
    const act = (await activityRepo.list()).find((a) => a.active && a.name.trim().toLowerCase() === 'academia');
    if (!level || !act) return;
    const date = todayIn(config.timezone);
    const already = (await executions.dayPlan(date)).items.find((i) => i.id === act.id)?.executionLevel;
    if (!already) await executions.set(act.id, date, level, `Treino: ${view.session.name}`);
  });
  // Leitura. A cada sessão registrada, se existir uma atividade de rotina "Leitura" (ainda sem registro naquele dia),
  // usa os números das descrições mínimo/ideal/máximo (ex.: "20 páginas") como metas; sem nenhum número, qualquer
  // leitura no dia já marca o mínimo.
  const bookLookup = new FallbackBookLookup([new GoogleBooksLookup(), new OpenLibraryLookup()]);
  const bookSearch = new FallbackBookSearch([new GoogleBooksSearch(), new OpenLibrarySearch()]);
  const reading = new ReadingService(new PgReadingRepository(pool), bookLookup, bookSearch, new DiskFileStore(features.filesDir), config.timezone, () => new Date(), async (date, totalPagesOnDate) => {
    const act = (await activityRepo.list()).find((a) => a.active && a.name.trim().toLowerCase() === 'leitura');
    if (!act) return;
    const already = (await executions.dayPlan(date)).items.find((i) => i.id === act.id)?.executionLevel;
    if (already) return;
    const thresholds = { min: pagesGoalOf(act.minDesc), ideal: pagesGoalOf(act.idealDesc), max: pagesGoalOf(act.maxDesc) };
    let level: Level | null = null;
    if (thresholds.min !== null && totalPagesOnDate >= thresholds.min) level = 'min';
    if (thresholds.ideal !== null && totalPagesOnDate >= thresholds.ideal) level = 'ideal';
    if (thresholds.max !== null && totalPagesOnDate >= thresholds.max) level = 'max';
    if (!level && totalPagesOnDate > 0) level = 'min';
    if (level) await executions.set(act.id, date, level, 'Sessão de leitura');
  });
  const study = new StudyService(new PgStudyRepository(pool), new DiskFileStore(features.filesDir));

  // segurança e finanças
  const audit = new AuditService(auditRepo);
  const auth = new AuthService(userRepo, new PgSessionRepository(pool), auditRepo);
  const finance = new FinanceService(financeRepo, new FieldCrypto(loadDataKey(features.dataEncryptionKey, features.filesDir)), {
    today: () => todayIn(config.timezone),
    createEvent: (e) => events.create(e),
    createCard: async (c) => { const board = await boards.getBoard(); return boards.createCard(board.columns[0].id, c); },
    audit: (userId, action, target, detail) => void audit.record(userId, action, target, detail),
  });
  const exporter = new PgExportRepository(pool, features.filesDir);
  const fieldCrypto = new FieldCrypto(loadDataKey(features.dataEncryptionKey, features.filesDir));
  const providers = [
    new DemoOpenFinanceProvider(() => todayIn(config.timezone)),
    ...(features.pluggyClientId && features.pluggyClientSecret
      ? [new PluggyProvider({ clientId: features.pluggyClientId, clientSecret: features.pluggyClientSecret, script: features.pluggyScript, webhook: features.pluggyWebhook })] : []),
  ];
  const openFinance = new OpenFinanceService({
    repo: new PgOpenFinanceRepository(pool), finance, providers, primary: features.pluggyClientId && features.pluggyClientSecret ? 'pluggy' : 'demo',
    crypto: fieldCrypto, users: userRepo, audit: (userId, action, target, detail) => void audit.record(userId, action, target, detail), today: () => todayIn(config.timezone),
  });

  const pluggyWebhooks = new PluggyWebhookQueue(pool, fieldCrypto, (event) => openFinance.handleWebhook(event));

  // notificações
  const channels = { push: new PushChannel(pushSubscriptions), whatsapp: new WhatsAppChannel(notificationSettings) };
  const notifier = new Notifier(inbox, [channels.push, channels.whatsapp]);
  const scheduler = new ReminderScheduler({
    reminders: reminderRepo, activities: activityRepo, commutes: commuteRepo, executions: executionRepo, events: eventRepo,
    log: notificationLog, notifier, timezone: config.timezone,
  });

  // assistente proativo
  const signals = new LiveSignalSource({ activities: activityRepo, executions: executionRepo, events: eventRepo, reviews: reviewRepo, boards: boardRepo, financeInsights: (u) => finance.insights(u), timezone: config.timezone });
  const suggestions = new SuggestionService(
    suggestionRepo, signals,
    async (_userId, s) => { if (s.severity === 'high') await notifier.notify({ title: s.title, body: s.reason, link: '/', source: 'assistant', channels: [] }); },
    () => new Date(), (d) => dateInTz(d, config.timezone),
  );
  const financeReminders = new FinanceReminders({ users: userRepo, finance, log: notificationLog, notifier, suggestions, reviews: reviewRepo, timezone: config.timezone });
  scheduler.addJob('finance', 10 * 60_000, (now) => financeReminders.run(now));
  scheduler.addJob('open-finance', 30 * 60_000, () => openFinance.syncAll());
  scheduler.addJob('pluggy-webhooks', 30_000, () => pluggyWebhooks.drain());
  scheduler.addJob('of-consents', 6 * 3_600_000, () => openFinance.checkConsents(async (userId, title, body, key) => {
    if (await notificationLog.claim(key)) await notifier.notify({ title, body, link: '/financas?tab=conexoes', source: 'finance', channels: [] });
  }));
  scheduler.addJob('suggestions', 30 * 60_000, async () => { for (const u of await userRepo.list()) await suggestions.refresh(u.id); });
  // Lembrete de Princípios: por pasta/categoria, cada uma com seu horário — nunca leva o texto do princípio.
  scheduler.addJob('principles', 60_000, async (now) => {
    const folders = await principles.listFolders();
    const local = nowLocalTs(config.timezone, now);
    const today = local.slice(0, 10);
    const minutes = toMinutes(local.slice(11));
    for (const f of folders) {
      const r = f.reminder;
      if (!r.enabled || r.times.length === 0) continue;
      if (!r.weekdays.includes(weekdayOf(today))) continue;
      for (const t of r.times) {
        if (Math.abs(minutes - toMinutes(t)) > 1) continue;
        if (!(await notificationLog.claim(`principle:${f.id}:${today}:${t}`))) continue;
        await notifier.notify({ title: 'Princípios', body: `Hora de revisitar seus princípios de "${f.name}".`, link: '/principios', source: 'principle', channels: r.channels });
      }
    }
  });

  // agente
  const tools = buildTools({ activities, executions, events, boards, reviews, meditation, stats, reminders, commutes, documents, profile, finance, suggestions, gym, reading, study });
  const policy = new PermissionPolicy(permissionRepo);
  const runner = new ToolRunner(tools, policy, actionRepo);
  const orchestrator = new AgentOrchestrator(conversationRepo, settingsRepo, runner, policy, tools, activities, commutes, profile,
    async (userId) => (await suggestions.open(userId)).slice(0, 3).map((s) => s.title));

  return {
    activities, commutes, scheduling, gym, reading, study, executions, events, boards, reviews, meditation, stats, reminders, documents, profile, vault, principles,
    inbox, notifier, channels, pushSubscriptions, notificationSettings, scheduler,
    auth, audit, finance, suggestions, suggestionRepo, exporter, openFinance, pluggyWebhooks,
    agent: { tools, policy, runner, orchestrator, settingsRepo, permissionRepo, actionRepo, conversationRepo },
    stt: new OpenAiTranscriber(),
  };
}
export type Container = ReturnType<typeof createContainer>;
