/**
 * Email Storage Service
 * High-level service for storing and retrieving emails
 *
 * CRITICAL:
 * - Email addresses are case-sensitive
 * - Name services must be resolved to blockchain addresses
 * - Retention policy automatically applied
 */

import {
  createEmail,
  getEmails,
  getEmailById,
  deleteEmail,
  getEmailStats,
  cleanupExpiredEmails,
  getOrCreateAddressId,
} from '../../database/email-queries.js';
import { getBlockchainProvider } from '../blockchain/provider-factory.js';
import { createLogger } from '../logger/index.js';

const log = createLogger('EmailStorage');
import {
  Email,
  CreateEmailData,
  EmailQueryFilters,
  PaginationParams,
  PaginatedEmails,
  EmailStats,
} from '../../types/email.js';
import { BlockchainType } from '../../types/blockchain.js';
import { forwardingExecutor } from './forwarding-executor.js';

/**
 * Parse email address to extract address and domain
 * Format: address@domain or name.sol@domain
 *
 * CRITICAL: Preserves case sensitivity
 *
 * @param email - Full email address
 * @returns Parsed components or null if invalid
 */
export function parseEmailAddress(email: string): {
  localPart: string;
  domain: string;
  isNameService: boolean;
} | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return null;
  }

  const localPart = parts[0]!;
  const domain = parts[1]!;

  // Both parts must be non-empty
  if (!localPart || !domain) {
    return null;
  }

  // Check if local part looks like a name service (ends with .sol, .eth, etc.)
  const isNameService = /\.(sol|eth|crypto|nft|blockchain|wallet|x|888)$/i.test(localPart);

  return {
    localPart,
    domain,
    isNameService,
  };
}

/**
 * TLD to blockchain/name service mapping
 */
const TLD_MAPPING: Record<string, { blockchain: BlockchainType; nameService: string }> = {
  '.sol': { blockchain: 'solana', nameService: 'SNS' },
  '.eth': { blockchain: 'ethereum', nameService: 'ENS' },
  '.crypto': { blockchain: 'polygon', nameService: 'unstoppable' },
  '.nft': { blockchain: 'polygon', nameService: 'unstoppable' },
  '.blockchain': { blockchain: 'polygon', nameService: 'unstoppable' },
  '.wallet': { blockchain: 'polygon', nameService: 'unstoppable' },
  '.x': { blockchain: 'polygon', nameService: 'unstoppable' },
  '.888': { blockchain: 'polygon', nameService: 'unstoppable' },
};

/**
 * Detect blockchain and name service type from TLD
 *
 * @param name - Domain name (e.g., "vitalik.eth", "toly.sol")
 * @param defaultBlockchain - Fallback blockchain if TLD not recognized
 * @returns Blockchain type and name service
 */
function detectBlockchainFromTLD(
  name: string,
  defaultBlockchain: BlockchainType
): { blockchain: BlockchainType; nameService: string } {
  const lowerName = name.toLowerCase();

  for (const [tld, mapping] of Object.entries(TLD_MAPPING)) {
    if (lowerName.endsWith(tld)) {
      return mapping;
    }
  }

  // Default fallback based on blockchain
  if (defaultBlockchain === 'ethereum') {
    return { blockchain: 'ethereum', nameService: 'ENS' };
  }
  if (defaultBlockchain === 'polygon') {
    return { blockchain: 'polygon', nameService: 'unstoppable' };
  }

  return { blockchain: 'solana', nameService: 'SNS' };
}

/**
 * Resolve email address to blockchain address
 * Handles both direct addresses and name services
 *
 * @param emailAddress - Full email address
 * @param defaultBlockchain - Default blockchain if not specified
 * @returns Blockchain address and type
 */
export async function resolveEmailToBlockchainAddress(
  emailAddress: string,
  defaultBlockchain: BlockchainType = 'solana'
): Promise<{ address: string; blockchain: BlockchainType }> {
  const parsed = parseEmailAddress(emailAddress);

  if (!parsed) {
    throw new Error(`Invalid email address format: ${emailAddress}`);
  }

  const { localPart, isNameService } = parsed;

  // If it's a name service, resolve it
  if (isNameService) {
    // Detect blockchain and name service from TLD
    const { blockchain, nameService } = detectBlockchainFromTLD(localPart, defaultBlockchain);
    const provider = getBlockchainProvider(blockchain);

    try {
      const resolution = await provider.resolveNameService(
        localPart,
        nameService as 'SNS' | 'ENS'
      );

      return {
        address: resolution.resolvedAddress,
        blockchain: resolution.blockchain,
      };
    } catch (error) {
      throw new Error(
        `Failed to resolve name service ${localPart}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // Otherwise, treat local part as direct blockchain address
  const blockchain = defaultBlockchain;
  const provider = getBlockchainProvider(blockchain);

  // Validate address
  const validation = await provider.validateAddress(localPart);

  if (!validation.valid) {
    throw new Error(`Invalid blockchain address: ${validation.error}`);
  }

  return {
    address: validation.normalized || localPart,
    blockchain,
  };
}

/**
 * Email Storage Service
 */
export class EmailStorageService {
  /**
   * Store incoming email
   * Automatically resolves addresses and applies retention policy
   *
   * @param data - Email data
   * @returns Stored email
   */
  async storeEmail(data: CreateEmailData): Promise<Email> {
    // Resolve recipient email to blockchain address
    const { address, blockchain } = await resolveEmailToBlockchainAddress(
      data.recipientEmail
    );

    // Store email with resolved address
    const email = await createEmail(data, address, blockchain);

    // Trigger forwarding asynchronously (don't block email storage)
    forwardingExecutor
      .processIncomingEmail({
        recipientAddressId: email.recipientAddressId,
        from: data.senderAddress,
        subject: data.subject || '',
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
      })
      .catch((error) => {
        log.error('Failed to process forwarding rules', {
          emailId: email.id,
          addressId: email.recipientAddressId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return email;
  }

  /**
   * Get emails for a blockchain address
   *
   * @param address - Blockchain address
   * @param blockchain - Blockchain type
   * @param filters - Query filters
   * @param pagination - Pagination params
   * @returns Paginated emails
   */
  async getEmailsForAddress(
    address: string,
    blockchain: BlockchainType,
    filters?: EmailQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedEmails> {
    // Validate address
    const provider = getBlockchainProvider(blockchain);
    const validation = await provider.validateAddress(address);

    if (!validation.valid) {
      throw new Error(`Invalid address: ${validation.error}`);
    }

    const normalizedAddress = validation.normalized || address;

    // Get address ID
    const addressId = await getOrCreateAddressId(normalizedAddress, blockchain);

    // Get emails
    return await getEmails(addressId, filters, pagination);
  }

  /**
   * Get single email by ID
   *
   * @param emailId - Email UUID
   * @param address - Owner blockchain address
   * @param blockchain - Blockchain type
   * @returns Email or null
   */
  async getEmail(
    emailId: string,
    address: string,
    blockchain: BlockchainType
  ): Promise<Email | null> {
    // Validate address
    const provider = getBlockchainProvider(blockchain);
    const validation = await provider.validateAddress(address);

    if (!validation.valid) {
      throw new Error(`Invalid address: ${validation.error}`);
    }

    const normalizedAddress = validation.normalized || address;
    const addressId = await getOrCreateAddressId(normalizedAddress, blockchain);

    return await getEmailById(emailId, addressId);
  }

  /**
   * Delete email
   *
   * @param emailId - Email UUID
   * @param address - Owner blockchain address
   * @param blockchain - Blockchain type
   * @returns True if deleted
   */
  async deleteEmail(
    emailId: string,
    address: string,
    blockchain: BlockchainType
  ): Promise<boolean> {
    const provider = getBlockchainProvider(blockchain);
    const validation = await provider.validateAddress(address);

    if (!validation.valid) {
      throw new Error(`Invalid address: ${validation.error}`);
    }

    const normalizedAddress = validation.normalized || address;
    const addressId = await getOrCreateAddressId(normalizedAddress, blockchain);

    return await deleteEmail(emailId, addressId);
  }

  /**
   * Get email statistics
   *
   * @param address - Blockchain address
   * @param blockchain - Blockchain type
   * @returns Email stats
   */
  async getStats(
    address: string,
    blockchain: BlockchainType
  ): Promise<EmailStats> {
    const provider = getBlockchainProvider(blockchain);
    const validation = await provider.validateAddress(address);

    if (!validation.valid) {
      throw new Error(`Invalid address: ${validation.error}`);
    }

    const normalizedAddress = validation.normalized || address;
    const addressId = await getOrCreateAddressId(normalizedAddress, blockchain);

    return await getEmailStats(addressId);
  }

  /**
   * Cleanup expired emails
   * Should be called periodically via cron job
   *
   * @returns Number of emails cleaned up
   */
  async cleanupExpired(): Promise<number> {
    return await cleanupExpiredEmails();
  }
}

// Export singleton instance
export const emailStorageService = new EmailStorageService();
