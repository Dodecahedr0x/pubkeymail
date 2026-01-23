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

export {
  RecipientVerificationService,
  recipientVerificationService,
  type RecipientVerificationResult,
  type MultipleRecipientVerificationResult,
} from './recipient-verification.js';

export {
  ForwardingService,
  forwardingService,
  type ForwardingRule,
  type FilterConditions,
  type CreateRuleInput,
  type UpdateRuleInput,
  type ForwardingRuleResult,
  type EmailForFiltering,
} from './forwarding-service.js';
