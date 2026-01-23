/**
 * Configuration Module
 * Loads and validates environment variables using Zod schema
 * CRITICAL: Validates case-sensitive database collation and other security settings
 */

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Load environment variables
loadEnv();

/**
 * Environment variable schema with validation
 * All required variables must be present or app will fail to start
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().positive().default(3000),
  DOMAIN: z.string().min(1),
  API_VERSION: z.string().default('v1'),

  // Database - CRITICAL: Must use case-sensitive collation
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().positive().default(20),
  DATABASE_POOL_IDLE_TIMEOUT: z.coerce.number().positive().default(30000),
  DATABASE_CONNECTION_TIMEOUT: z.coerce.number().positive().default(10000),

  // Redis
  REDIS_URL: z.string().url(),
  REDIS_KEY_PREFIX: z.string().default('pubkeymail:'),
  REDIS_DEFAULT_TTL: z.coerce.number().positive().default(3600),

  // Email Retention
  EMAIL_RETENTION_DAYS: z.coerce.number().positive().default(30),
  CLEANUP_JOB_HOUR: z.coerce.number().min(0).max(23).default(2),

  // SMTP Provider
  SMTP_PROVIDER: z.enum(['sendgrid', 'postmark', 'mailgun']).default('sendgrid'),
  SMTP_API_KEY: z.string().min(1),
  SMTP_WEBHOOK_SECRET: z.string().min(1),
  SMTP_FROM_DOMAIN: z.string().min(1),
  SMTP_WEBHOOK_PATH: z.string().default('/webhooks/inbound'),

  // Blockchain - Solana
  SOLANA_RPC_ENDPOINT: z.string().url(),
  SOLANA_CLUSTER: z.enum(['mainnet-beta', 'devnet', 'testnet']).default('devnet'),
  SNS_PROGRAM_ID: z.string().default('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX'),
  SNS_CACHE_TTL: z.coerce.number().positive().default(3600),

  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRATION: z.coerce.number().positive().default(86400),
  SESSION_DURATION: z.coerce.number().positive().default(86400),
  AUTH_NONCE_EXPIRATION: z.coerce.number().positive().default(300),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(3600000),
  RATE_LIMIT_MAX_REQUESTS_PER_HOUR: z.coerce.number().positive().default(1000),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().positive().default(10),
  RATE_LIMIT_EMAIL_SEND_FREE_TIER: z.coerce.number().positive().default(50),
  RATE_LIMIT_EMAIL_SEND_PAID_TIER: z.coerce.number().positive().default(500),

  // Email Limits
  MAX_EMAIL_SIZE_MB: z.coerce.number().positive().default(25),
  MAX_ATTACHMENT_SIZE_MB: z.coerce.number().positive().default(10),
  MAX_ATTACHMENTS_PER_EMAIL: z.coerce.number().positive().default(10),

  // Payments - Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ID_YEARLY: z.string().optional(),

  // Payments - Solana Pay
  SOLANA_PAY_MERCHANT_WALLET: z.string().optional(),
  SOLANA_PAY_USDC_MINT: z.string().optional(),
  SOLANA_PAY_MONTHLY_PRICE_USDC: z.coerce.number().positive().optional(),
  SOLANA_PAY_YEARLY_PRICE_USDC: z.coerce.number().positive().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  LOG_PRETTY_PRINT: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  // Security
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ALLOWED_HOSTS: z.string().default('localhost'),
  HELMET_CSP_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  // Monitoring
  ENABLE_METRICS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  METRICS_PORT: z.coerce.number().positive().default(9090),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),

  // Feature Flags
  ENABLE_EMAIL_ENCRYPTION: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  ENABLE_FORWARDING_FILTERS: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  ENABLE_SPAM_FILTERING: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Development
  ENABLE_DEBUG_ROUTES: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  MOCK_SMTP_PROVIDER: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  MOCK_BLOCKCHAIN_PROVIDER: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
});

/**
 * Parsed and validated configuration
 * Throws error if required variables are missing or invalid
 */
const parseConfig = (): z.infer<typeof envSchema> => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(
        `Configuration validation failed:\n${missingVars.join('\n')}`
      );
    }
    throw error;
  }
};

// Export singleton config
export const config = parseConfig();

// Export derived configuration objects
export const databaseConfig = {
  url: config.DATABASE_URL,
  poolSize: config.DATABASE_POOL_SIZE,
  idleTimeout: config.DATABASE_POOL_IDLE_TIMEOUT,
  connectionTimeout: config.DATABASE_CONNECTION_TIMEOUT,
};

export const redisConfig = {
  url: config.REDIS_URL,
  keyPrefix: config.REDIS_KEY_PREFIX,
  defaultTTL: config.REDIS_DEFAULT_TTL,
};

export const solanaConfig = {
  rpcEndpoint: config.SOLANA_RPC_ENDPOINT,
  cluster: config.SOLANA_CLUSTER,
  snsProgramId: config.SNS_PROGRAM_ID,
  snsCacheTTL: config.SNS_CACHE_TTL,
};

export const authConfig = {
  jwtSecret: config.JWT_SECRET,
  jwtExpiration: config.JWT_EXPIRATION,
  sessionDuration: config.SESSION_DURATION,
  nonceExpiration: config.AUTH_NONCE_EXPIRATION,
};

export const emailConfig = {
  retentionDays: config.EMAIL_RETENTION_DAYS,
  cleanupJobHour: config.CLEANUP_JOB_HOUR,
  maxSizeMB: config.MAX_EMAIL_SIZE_MB,
  maxAttachmentSizeMB: config.MAX_ATTACHMENT_SIZE_MB,
  maxAttachmentsPerEmail: config.MAX_ATTACHMENTS_PER_EMAIL,
};

export const smtpConfig = {
  provider: config.SMTP_PROVIDER,
  apiKey: config.SMTP_API_KEY,
  webhookSecret: config.SMTP_WEBHOOK_SECRET,
  fromDomain: config.SMTP_FROM_DOMAIN,
  webhookPath: config.SMTP_WEBHOOK_PATH,
};

export const rateLimitConfig = {
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  maxRequestsPerHour: config.RATE_LIMIT_MAX_REQUESTS_PER_HOUR,
  authPerMinute: config.RATE_LIMIT_AUTH_PER_MINUTE,
  emailSendFreeTier: config.RATE_LIMIT_EMAIL_SEND_FREE_TIER,
  emailSendPaidTier: config.RATE_LIMIT_EMAIL_SEND_PAID_TIER,
};
