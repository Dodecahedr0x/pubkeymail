/**
 * Email Services
 * Export email-related functionality
 */

export {
  EmailStorageService,
  emailStorageService,
  parseEmailAddress,
  resolveEmailToBlockchainAddress,
} from './email-storage-service.js';

export {
  EmailCleanupService,
  emailCleanupService,
  type CleanupResult,
  type CleanupOptions,
  type CleanupStats,
} from './cleanup-service.js';

export {
  EmailCleanupScheduler,
  emailCleanupScheduler,
  shutdownCleanupScheduler,
  type SchedulerState,
  type SchedulerOptions,
} from './cleanup-scheduler.js';

export {
  EmailSenderService,
  emailSenderService,
  type ComposeEmailInput,
  type SendEmailResult,
  type SentEmail,
  type DeliveryStatus,
  type RateLimitResult,
} from './email-sender-service.js';
