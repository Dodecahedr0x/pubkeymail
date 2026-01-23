/**
 * API Middleware
 * Export all middleware functions
 */

export {
  authMiddleware,
  optionalAuthMiddleware,
  requireAddressOwnership,
} from './auth-middleware.js';
export type { AuthenticatedRequest } from './auth-middleware.js';
