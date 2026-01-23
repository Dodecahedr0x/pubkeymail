/**
 * Authentication Services
 * Export authentication-related functionality with Redis-backed nonce storage
 */

import { AuthService } from './auth-service.js';
import { RedisNonceStore } from '../cache/redis-nonce-store.js';

export { AuthService } from './auth-service.js';
export type {
  JWTPayload,
  ChallengeResponse,
  AuthVerificationResult,
} from './auth-service.js';

/**
 * Production auth service instance with Redis nonce store
 * Creates singleton with Redis-backed nonce storage
 */
export const authService = new AuthService(new RedisNonceStore());
