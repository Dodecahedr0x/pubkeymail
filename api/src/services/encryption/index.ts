/**
 * Encryption Services
 * Export encryption-related functionality
 */

export { EncryptionService, encryptionService } from './encryption-service.js';
export {
  EmailEncryptionService,
  emailEncryptionService,
  type EncryptableContent,
  type EncryptedEnvelope,
  type StoredEncryptedEmail,
  type StoredEncryptionMetadata,
} from './email-encryption-service.js';
export type {
  EncryptionKeyPair,
  EncryptedData,
  EncryptionMetadata,
  UserEncryptionKey,
} from '../../types/encryption.js';
