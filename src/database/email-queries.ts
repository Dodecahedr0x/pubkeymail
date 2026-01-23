/**
 * Email Database Queries
 * CRUD operations for emails with case-sensitive handling
 *
 * CRITICAL SECURITY NOTES:
 * - All email addresses are case-sensitive (COLLATE "C")
 * - Retention policy must be enforced
 * - Never delete entire mailboxes, only expired emails
 */

import { db } from './connection.js';
import {
  Email,
  CreateEmailData,
  EmailQueryFilters,
  PaginationParams,
  PaginatedEmails,
  EmailStats,
} from '../types/email.js';
import { emailConfig } from '../config/index.js';

/**
 * Get or create blockchain address ID
 * CRITICAL: Case-sensitive address lookup
 *
 * @param address - Blockchain address (case-sensitive)
 * @param blockchain - Blockchain type
 * @returns Address ID
 */
export async function getOrCreateAddressId(
  address: string,
  blockchain: string
): Promise<number> {
  // Try to find existing address (case-sensitive)
  const findResult = await db.query<{ id: number }>(
    'SELECT id FROM blockchain_addresses WHERE address = $1 COLLATE "C" AND blockchain = $2',
    [address, blockchain]
  );

  if (findResult.rows.length > 0) {
    return findResult.rows[0]!.id;
  }

  // Create new address
  const insertResult = await db.query<{ id: number }>(
    'INSERT INTO blockchain_addresses (address, blockchain) VALUES ($1, $2) RETURNING id',
    [address, blockchain]
  );

  return insertResult.rows[0]!.id;
}

/**
 * Create email record
 * Automatically sets expiration for unregistered users
 *
 * @param data - Email creation data
 * @param blockchainAddress - Resolved blockchain address
 * @param blockchain - Blockchain type
 * @returns Created email
 */
export async function createEmail(
  data: CreateEmailData,
  blockchainAddress: string,
  blockchain: string
): Promise<Email> {
  // Get or create address ID
  const recipientAddressId = await getOrCreateAddressId(
    blockchainAddress,
    blockchain
  );

  // Check if user is registered (has active subscription)
  const userCheck = await db.query<{ id: number; subscription_tier: string }>(
    `SELECT u.id, u.subscription_tier
     FROM users u
     WHERE u.primary_address_id = $1
       OR EXISTS (
         SELECT 1 FROM address_links al
         WHERE al.address_id = $1 AND al.user_id = u.id
       )
     LIMIT 1`,
    [recipientAddressId]
  );

  const isRegisteredUser = userCheck.rows.length > 0;

  // Calculate expiration: null for registered users, 30 days for unregistered
  const expiresAt = isRegisteredUser
    ? null
    : new Date(Date.now() + emailConfig.retentionDays * 24 * 60 * 60 * 1000);

  // Insert email
  const result = await db.query<Email>(
    `INSERT INTO emails (
      recipient_address_id,
      recipient_email,
      sender_address,
      subject,
      body_text,
      body_html,
      headers,
      attachments,
      expires_at,
      is_encrypted,
      encryption_metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      recipientAddressId,
      data.recipientEmail,
      data.senderAddress,
      data.subject || null,
      data.bodyText || null,
      data.bodyHtml || null,
      JSON.stringify(data.headers || {}),
      JSON.stringify(data.attachments || []),
      expiresAt,
      data.isEncrypted || false,
      data.encryptionMetadata ? JSON.stringify(data.encryptionMetadata) : null,
    ]
  );

  return parseEmailRow(result.rows[0]!);
}

/**
 * Get emails for an address with pagination
 * CRITICAL: Case-sensitive address matching
 *
 * @param addressId - Blockchain address ID
 * @param filters - Query filters
 * @param pagination - Pagination parameters
 * @returns Paginated emails
 */
export async function getEmails(
  addressId: number,
  filters: EmailQueryFilters = {},
  pagination: PaginationParams = { page: 1, limit: 50 }
): Promise<PaginatedEmails> {
  const { page, limit, sortBy = 'received_at', sortOrder = 'desc' } = pagination;
  const offset = (page - 1) * limit;

  // Build WHERE clause
  const conditions: string[] = ['recipient_address_id = $1'];
  const params: any[] = [addressId];
  let paramIndex = 2;

  if (filters.senderAddress) {
    conditions.push(`sender_address ILIKE $${paramIndex}`);
    params.push(`%${filters.senderAddress}%`);
    paramIndex++;
  }

  if (filters.startDate) {
    conditions.push(`received_at >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters.endDate) {
    conditions.push(`received_at <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }

  if (filters.hasAttachments !== undefined) {
    conditions.push(
      filters.hasAttachments
        ? 'jsonb_array_length(attachments) > 0'
        : 'jsonb_array_length(attachments) = 0'
    );
  }

  if (filters.isEncrypted !== undefined) {
    conditions.push(`is_encrypted = $${paramIndex}`);
    params.push(filters.isEncrypted);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM emails WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]!.count);

  // Get emails
  const sortColumn = sortBy === 'sender' ? 'sender_address' : sortBy;
  const emailsResult = await db.query<Email>(
    `SELECT * FROM emails
     WHERE ${whereClause}
     ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const emails = emailsResult.rows.map(parseEmailRow);
  const totalPages = Math.ceil(total / limit);

  return {
    emails,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Get single email by ID
 * Verifies ownership
 *
 * @param emailId - Email UUID
 * @param addressId - Owner address ID
 * @returns Email or null
 */
export async function getEmailById(
  emailId: string,
  addressId: number
): Promise<Email | null> {
  const result = await db.query<Email>(
    'SELECT * FROM emails WHERE id = $1 AND recipient_address_id = $2',
    [emailId, addressId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return parseEmailRow(result.rows[0]!);
}

/**
 * Delete email
 * @param emailId - Email UUID
 * @param addressId - Owner address ID
 * @returns True if deleted
 */
export async function deleteEmail(
  emailId: string,
  addressId: number
): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM emails WHERE id = $1 AND recipient_address_id = $2',
    [emailId, addressId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Cleanup expired emails
 * CRITICAL: Only delete emails older than retention period
 * Never delete entire mailboxes if they contain recent emails
 *
 * @returns Number of emails deleted
 */
export async function cleanupExpiredEmails(): Promise<number> {
  const result = await db.query(
    `DELETE FROM emails
     WHERE expires_at IS NOT NULL
       AND expires_at < NOW()`,
    []
  );

  return result.rowCount || 0;
}

/**
 * Get email statistics for an address
 * @param addressId - Address ID
 * @returns Email stats
 */
export async function getEmailStats(addressId: number): Promise<EmailStats> {
  const result = await db.query<{
    total: string;
    oldest: Date | null;
    newest: Date | null;
  }>(
    `SELECT
      COUNT(*) as total,
      MIN(received_at) as oldest,
      MAX(received_at) as newest
     FROM emails
     WHERE recipient_address_id = $1`,
    [addressId]
  );

  const row = result.rows[0]!;

  return {
    totalEmails: parseInt(row.total),
    unreadEmails: 0, // TODO: Implement read/unread tracking
    storageUsed: 0, // TODO: Calculate from attachments
    oldestEmail: row.oldest,
    newestEmail: row.newest,
  };
}

/**
 * Parse email row from database
 * Converts JSON fields to proper types
 */
function parseEmailRow(row: any): Email {
  return {
    id: row.id,
    recipientAddressId: row.recipient_address_id,
    recipientEmail: row.recipient_email,
    senderAddress: row.sender_address,
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    headers: row.headers,
    attachments: row.attachments,
    receivedAt: new Date(row.received_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    isEncrypted: row.is_encrypted,
    encryptionMetadata: row.encryption_metadata,
  };
}
