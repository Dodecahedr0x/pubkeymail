/**
 * Authentication Services
 * Export authentication-related functionality with environment-aware nonce storage
 */

import { AuthService } from './auth-service.js';
import { RedisNonceStore } from '../cache/redis-nonce-store.js';
import { isLocalDevMode } from '../../config/index.js';

export { AuthService } from './auth-service.js';
export type {
  JWTPayload,
  ChallengeResponse,
  AuthVerificationResult,
} from './auth-service.js';

/**
 * Auth service instance with environment-aware nonce storage
 * Uses in-memory store for local dev, Redis for production
 */
export const authService = isLocalDevMode
  ? new AuthService() // Uses MemoryNonceStore internally
  : new AuthService(new RedisNonceStore());
