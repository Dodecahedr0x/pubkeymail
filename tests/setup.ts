/**
 * Vitest global setup file
 * Sets environment variables BEFORE any imports that depend on config
 */

// Set test environment variables BEFORE any other imports
process.env.NODE_ENV = 'test';
process.env.DOMAIN = 'test.pubkeymail.com';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/pubkeymail_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SMTP_API_KEY = 'test-api-key-12345';
process.env.SMTP_WEBHOOK_SECRET = 'test-webhook-secret-12345';
process.env.SMTP_FROM_DOMAIN = 'test.pubkeymail.com';
process.env.SOLANA_RPC_ENDPOINT = 'https://api.devnet.solana.com';
process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-characters-long';
process.env.SOLANA_CLUSTER = 'devnet';

import { beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock @solana/spl-name-service to avoid ESM import issues in tests
vi.mock('@solana/spl-name-service', () => ({
  getHashedName: vi.fn().mockResolvedValue(new Uint8Array(32)),
  getNameAccountKey: vi.fn().mockResolvedValue({
    toBase58: () => 'MockNameAccountKey111111111111111',
  }),
  NameRegistryState: {
    retrieve: vi.fn().mockResolvedValue({
      owner: {
        toBase58: () => 'MockOwnerAddress1111111111111111',
      },
    }),
  },
}));

// Mock database connection to avoid actual database calls in unit tests
vi.mock('../src/database/connection', () => ({
  db: {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    }),
    end: vi.fn(),
  },
}));

// Mock Redis client
vi.mock('../src/services/cache/redis-client', () => ({
  redisClient: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    isOpen: true,
  },
  ensureRedisConnected: vi.fn().mockResolvedValue(undefined),
}));

beforeAll(async () => {
  console.log('🧪 Test environment setup complete');
});

afterAll(async () => {
  console.log('🧹 Test environment cleanup complete');
});

beforeEach(async () => {
  vi.clearAllMocks();
});
