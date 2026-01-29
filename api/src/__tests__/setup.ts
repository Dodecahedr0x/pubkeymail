/**
 * Vitest global setup file
 * Runs before all tests to configure the test environment
 *
 * NOTE: The main test setup is in tests/setup.ts which is configured in vitest.config.ts
 * This file provides additional utilities for tests in the src/__tests__ directory.
 *
 * Database and Redis connections are mocked globally in tests/setup.ts:
 * - Database: Uses vi.mock('../src/database/connection')
 * - Redis: Uses vi.mock('../src/services/cache/redis-client')
 *
 * Tests should import mocks from these modules and configure return values per-test.
 */

import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  // Database and Redis are mocked in tests/setup.ts
  // No actual connections needed for unit tests
});

// Global test teardown
afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  // Mocked connections don't need cleanup
});

// Reset state before each test
beforeEach(async () => {
  // Clear all mock call history between tests
  vi.clearAllMocks();
});
