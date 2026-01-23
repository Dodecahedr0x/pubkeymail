/**
 * Forwarding Executor Service
 * Processes incoming emails against forwarding rules
 */

import { db } from '../../database/connection.js';
import { forwardingService, type ForwardingRule } from './forwarding-service.js';

/**
 * Incoming email data for processing
 */
export interface IncomingEmailData {
  recipientAddressId: number;
  from: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
}

/**
 * Result of processing an incoming email
 */
export interface ForwardingResult {
  processed: boolean;
  forwarded: number;
  failed: number;
  details: Array<{
    ruleId: number;
    destination: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Forwarding Executor Class
 * Processes incoming emails and forwards them based on active rules
 */
export class ForwardingExecutor {
  /**
   * Process an incoming email against all active forwarding rules
   */
  async processIncomingEmail(email: IncomingEmailData): Promise<ForwardingResult> {
    const result: ForwardingResult = {
      processed: true,
      forwarded: 0,
      failed: 0,
      details: [],
    };

    const activeRules = await forwardingService.getActiveRulesForAddress(
      email.recipientAddressId
    );

    if (activeRules.length === 0) {
      return result;
    }

    for (const rule of activeRules) {
      const matches = forwardingService.matchesFilter(
        { from: email.from, subject: email.subject },
        rule.filterConditions
      );

      if (!matches) {
        continue;
      }

      const forwardResult = await this.forwardEmail(email, rule);
      result.details.push(forwardResult);

      if (forwardResult.success) {
        result.forwarded++;
      } else {
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Forward an email to the rule's destination
   * Currently mocks SMTP by logging - will integrate with SMTP provider
   */
  private async forwardEmail(
    email: IncomingEmailData,
    rule: ForwardingRule
  ): Promise<{
    ruleId: number;
    destination: string;
    success: boolean;
    error?: string;
  }> {
    try {
      const sourceAddress = await this.getSourceAddress(rule.sourceAddressId);

      if (!sourceAddress) {
        return {
          ruleId: rule.id,
          destination: rule.destinationEmail,
          success: false,
          error: 'Source address not found',
        };
      }

      const forwardedSubject = `[Fwd] ${email.subject}`;

      console.log('[ForwardingExecutor] Forwarding email:', {
        from: sourceAddress,
        to: rule.destinationEmail,
        originalFrom: email.from,
        subject: forwardedSubject,
        ruleId: rule.id,
      });

      return {
        ruleId: rule.id,
        destination: rule.destinationEmail,
        success: true,
      };
    } catch (error) {
      return {
        ruleId: rule.id,
        destination: rule.destinationEmail,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get source address string from database
   */
  private async getSourceAddress(addressId: number): Promise<string | null> {
    const result = await db.query<{ address: string }>(
      `SELECT address FROM addresses WHERE id = $1`,
      [addressId]
    );

    return result.rows[0]?.address ?? null;
  }
}

/**
 * Singleton instance
 */
export const forwardingExecutor = new ForwardingExecutor();
