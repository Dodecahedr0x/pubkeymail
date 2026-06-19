/**
 * Forwarding Service
 * Manages email forwarding rules with tier-based access control
 *
 * SECURITY NOTES:
 * - Only paid users can create forwarding rules
 * - Verify user owns the source address
 * - Destination emails require verification
 */

import { db } from '../../database/connection.js';
import { tierService } from '../tier/tier-service.js';
import crypto from 'crypto';

/**
 * Filter conditions for forwarding rules
 *
 * Inclusion filters (fromContains / subjectContains / bodyContains) combine
 * with OR semantics by default — an email matches if it satisfies ANY of them.
 * Set `matchAll: true` to require ALL specified inclusion filters (AND).
 *
 * Exclusion filters always take precedence: a matching exclusion drops the
 * email regardless of inclusions.
 */
export interface FilterConditions {
  fromContains?: string[];
  subjectContains?: string[];
  /** Match against the email body (text, falling back to stripped HTML). */
  bodyContains?: string[];
  excludeFrom?: string[];
  excludeSubject?: string[];
  excludeBody?: string[];
  /** Only forward emails that have / don't have attachments. */
  hasAttachment?: boolean;
  /** Require ALL inclusion filters to match instead of ANY (default false). */
  matchAll?: boolean;
}

/**
 * Forwarding rule database row
 */
export interface ForwardingRule {
  id: number;
  userId: number;
  sourceAddressId: number;
  destinationEmail: string;
  filterConditions: FilterConditions | null;
  enabled: boolean;
  verified: boolean;
  verificationToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a forwarding rule
 */
export interface CreateRuleInput {
  userId: number;
  sourceAddressId: number;
  destinationEmail: string;
  filterConditions?: FilterConditions;
}

/**
 * Input for updating a forwarding rule
 */
export interface UpdateRuleInput {
  destinationEmail?: string;
  filterConditions?: FilterConditions | null;
  enabled?: boolean;
}

/**
 * Result of create/update/delete operations
 */
export interface ForwardingRuleResult {
  success: boolean;
  data?: ForwardingRule;
  error?: string;
}

/**
 * Email data for filter matching
 */
export interface EmailForFiltering {
  from: string;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  hasAttachments?: boolean;
}

/**
 * Forwarding Service Class
 */
export class ForwardingService {
  /**
   * Create a new forwarding rule
   */
  async createRule(input: CreateRuleInput): Promise<ForwardingRuleResult> {
    const { userId, sourceAddressId, destinationEmail, filterConditions } = input;

    // Check tier access
    const featureAccess = await tierService.checkFeatureAccess(userId, 'email_forwarding');
    if (!featureAccess.allowed) {
      return {
        success: false,
        error: featureAccess.reason || 'Email forwarding requires a paid subscription',
      };
    }

    // Verify user owns the source address
    const ownsAddress = await this.verifyAddressOwnership(userId, sourceAddressId);
    if (!ownsAddress) {
      return {
        success: false,
        error: 'You do not own this address',
      };
    }

    // Validate destination email format
    if (!this.isValidEmailFormat(destinationEmail)) {
      return {
        success: false,
        error: 'Invalid destination email format',
      };
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    try {
      const result = await db.query<{
        id: number;
        user_id: number;
        source_address_id: number;
        destination_email: string;
        filter_conditions: FilterConditions | null;
        enabled: boolean;
        verified: boolean;
        verification_token: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO forwarding_rules 
          (user_id, source_address_id, destination_email, filter_conditions, enabled, verified, verification_token)
         VALUES ($1, $2, $3, $4, TRUE, FALSE, $5)
         RETURNING *`,
        [
          userId,
          sourceAddressId,
          destinationEmail,
          filterConditions ? JSON.stringify(filterConditions) : null,
          verificationToken,
        ]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Failed to create forwarding rule' };
      }

      return {
        success: true,
        data: this.mapRowToRule(result.rows[0]!),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create forwarding rule',
      };
    }
  }

  /**
   * Get all forwarding rules for a user
   */
  async getRules(userId: number): Promise<ForwardingRule[]> {
    const result = await db.query<{
      id: number;
      user_id: number;
      source_address_id: number;
      destination_email: string;
      filter_conditions: FilterConditions | null;
      enabled: boolean;
      verified: boolean;
      verification_token: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM forwarding_rules WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map((row) => this.mapRowToRule(row));
  }

  /**
   * Update a forwarding rule
   */
  async updateRule(
    ruleId: number,
    userId: number,
    updates: UpdateRuleInput
  ): Promise<ForwardingRuleResult> {
    // Verify ownership
    const existingRule = await this.getRuleById(ruleId);
    if (!existingRule) {
      return { success: false, error: 'Forwarding rule not found' };
    }

    if (existingRule.userId !== userId) {
      return { success: false, error: 'You do not own this forwarding rule' };
    }

    // Build update query dynamically
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.destinationEmail !== undefined) {
      // Validate new destination email
      if (!this.isValidEmailFormat(updates.destinationEmail)) {
        return { success: false, error: 'Invalid destination email format' };
      }

      // Reset verification if destination changes
      if (updates.destinationEmail !== existingRule.destinationEmail) {
        const newToken = crypto.randomBytes(32).toString('hex');
        setClauses.push(`destination_email = $${paramIndex++}`);
        params.push(updates.destinationEmail);
        setClauses.push(`verified = FALSE`);
        setClauses.push(`verification_token = $${paramIndex++}`);
        params.push(newToken);
      }
    }

    if (updates.filterConditions !== undefined) {
      setClauses.push(`filter_conditions = $${paramIndex++}`);
      params.push(
        updates.filterConditions ? JSON.stringify(updates.filterConditions) : null
      );
    }

    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${paramIndex++}`);
      params.push(updates.enabled);
    }

    if (setClauses.length === 0) {
      return { success: true, data: existingRule };
    }

    params.push(ruleId);

    try {
      const result = await db.query<{
        id: number;
        user_id: number;
        source_address_id: number;
        destination_email: string;
        filter_conditions: FilterConditions | null;
        enabled: boolean;
        verified: boolean;
        verification_token: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `UPDATE forwarding_rules SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Failed to update forwarding rule' };
      }

      return {
        success: true,
        data: this.mapRowToRule(result.rows[0]!),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update forwarding rule',
      };
    }
  }

  /**
   * Delete a forwarding rule
   */
  async deleteRule(ruleId: number, userId: number): Promise<ForwardingRuleResult> {
    const result = await db.query(
      `DELETE FROM forwarding_rules WHERE id = $1 AND user_id = $2`,
      [ruleId, userId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Forwarding rule not found' };
    }

    return { success: true };
  }

  /**
   * Verify a forwarding destination with token
   */
  async verifyDestination(token: string): Promise<ForwardingRuleResult> {
    if (!token) {
      return { success: false, error: 'Invalid verification token' };
    }

    const result = await db.query<{
      id: number;
      user_id: number;
      source_address_id: number;
      destination_email: string;
      filter_conditions: FilterConditions | null;
      enabled: boolean;
      verified: boolean;
      verification_token: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE forwarding_rules 
       SET verified = TRUE, verification_token = NULL 
       WHERE verification_token = $1 
       RETURNING *`,
      [token]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Invalid or expired verification token' };
    }

    return {
      success: true,
      data: this.mapRowToRule(result.rows[0]!),
    };
  }

  /**
   * Get enabled and verified rules for an address
   */
  async getActiveRulesForAddress(addressId: number): Promise<ForwardingRule[]> {
    const result = await db.query<{
      id: number;
      user_id: number;
      source_address_id: number;
      destination_email: string;
      filter_conditions: FilterConditions | null;
      enabled: boolean;
      verified: boolean;
      verification_token: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM forwarding_rules 
       WHERE source_address_id = $1 AND enabled = TRUE AND verified = TRUE
       ORDER BY created_at DESC`,
      [addressId]
    );

    return result.rows.map((row) => this.mapRowToRule(row));
  }

  /**
   * Check if an email matches filter conditions
   * Case-insensitive matching
   */
  matchesFilter(email: EmailForFiltering, conditions: FilterConditions | null): boolean {
    if (!conditions) {
      return true;
    }

    const fromLower = email.from.toLowerCase();
    const subjectLower = email.subject.toLowerCase();
    const bodyLower = (
      email.bodyText ?? (email.bodyHtml ?? '').replace(/<[^>]*>/g, ' ')
    ).toLowerCase();

    const anyMatch = (haystack: string, patterns?: string[]): boolean =>
      !!patterns?.some((p) => haystack.includes(p.toLowerCase()));

    // Check exclusions first — any match drops the email.
    if (anyMatch(fromLower, conditions.excludeFrom)) return false;
    if (anyMatch(subjectLower, conditions.excludeSubject)) return false;
    if (anyMatch(bodyLower, conditions.excludeBody)) return false;

    // Attachment presence filter.
    if (conditions.hasAttachment !== undefined) {
      if (!!email.hasAttachments !== conditions.hasAttachment) {
        return false;
      }
    }

    // Collect inclusion filter results (only for those that are specified).
    const inclusionResults: boolean[] = [];
    if (conditions.fromContains?.length) {
      inclusionResults.push(anyMatch(fromLower, conditions.fromContains));
    }
    if (conditions.subjectContains?.length) {
      inclusionResults.push(anyMatch(subjectLower, conditions.subjectContains));
    }
    if (conditions.bodyContains?.length) {
      inclusionResults.push(anyMatch(bodyLower, conditions.bodyContains));
    }

    // No inclusion filters → match all that passed exclusions/attachment check.
    if (inclusionResults.length === 0) {
      return true;
    }

    // matchAll → every inclusion filter must match (AND); otherwise ANY (OR).
    return conditions.matchAll
      ? inclusionResults.every(Boolean)
      : inclusionResults.some(Boolean);
  }

  /**
   * Get a rule by ID
   */
  private async getRuleById(ruleId: number): Promise<ForwardingRule | null> {
    const result = await db.query<{
      id: number;
      user_id: number;
      source_address_id: number;
      destination_email: string;
      filter_conditions: FilterConditions | null;
      enabled: boolean;
      verified: boolean;
      verification_token: string | null;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM forwarding_rules WHERE id = $1`, [ruleId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToRule(result.rows[0]!);
  }

  /**
   * Verify user owns an address
   */
  private async verifyAddressOwnership(
    userId: number,
    addressId: number
  ): Promise<boolean> {
    // Check if it's the primary address
    const primaryResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users WHERE id = $1 AND primary_address_id = $2`,
      [userId, addressId]
    );

    if (parseInt(primaryResult.rows[0]?.count || '0') > 0) {
      return true;
    }

    // Check if it's a linked address
    const linkedResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM address_links WHERE user_id = $1 AND address_id = $2`,
      [userId, addressId]
    );

    return parseInt(linkedResult.rows[0]?.count || '0') > 0;
  }

  /**
   * Validate email format
   */
  private isValidEmailFormat(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Map database row to ForwardingRule
   */
  private mapRowToRule(row: {
    id: number;
    user_id: number;
    source_address_id: number;
    destination_email: string;
    filter_conditions: FilterConditions | null;
    enabled: boolean;
    verified: boolean;
    verification_token: string | null;
    created_at: Date;
    updated_at: Date;
  }): ForwardingRule {
    return {
      id: row.id,
      userId: row.user_id,
      sourceAddressId: row.source_address_id,
      destinationEmail: row.destination_email,
      filterConditions: row.filter_conditions,
      enabled: row.enabled,
      verified: row.verified,
      verificationToken: row.verification_token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Singleton instance
 */
export const forwardingService = new ForwardingService();
