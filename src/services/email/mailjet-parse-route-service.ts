/**
 * Mailjet Parse Route Service
 * Manages Mailjet Parse API routes for inbound email reception
 *
 * When a user signs in, this service registers parse routes for their
 * wallet address and any associated Solana domain names, enabling
 * email delivery to addresses like:
 *   - wallet@pubkeymail.com
 *   - domain.sol@pubkeymail.com
 *
 * @see https://dev.mailjet.com/email/guides/parse-api/
 */

import { smtpConfig } from '../../config/index.js';
import { createLogger } from '../logger/index.js';

const log = createLogger('MailjetService');

export interface ParseRouteData {
  ID: number;
  APIKeyID: string;
  Email: string;
  Url: string;
}

export interface ParseRouteResponse {
  Count: number;
  Data: ParseRouteData[];
  Total: number;
}

export interface ParseRouteResult {
  success: boolean;
  routeId?: number;
  email?: string;
  error?: string;
}

export interface MultiRouteResult {
  success: boolean;
  registered: string[];
  failed: Array<{ email: string; error: string }>;
  skipped: string[];
}

/**
 * Mailjet Parse Route Service
 * Registers and manages inbound email parse routes
 */
export class MailjetParseRouteService {
  private readonly apiUrl = 'https://api.mailjet.com/v3/REST/parseroute';
  private readonly webhookUrl: string;
  private readonly authHeader: string;
  private readonly domain: string;

  constructor() {
    this.domain = smtpConfig.fromDomain;
    this.webhookUrl = `https://api.${this.domain}/api/v1/webhooks/inbound`;

    const credentials = Buffer.from(
      `${smtpConfig.apiKey}:${smtpConfig.webhookSecret}`
    ).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * Register a parse route for a specific email address
   * @param localPart - Local part of the email (e.g., wallet address or domain name)
   * @returns Result of the registration
   */
  async registerParseRoute(localPart: string): Promise<ParseRouteResult> {
    const email = `${localPart}@${this.domain}`;

    try {
      // Check if route already exists
      const existing = await this.getParseRouteByEmail(email);
      if (existing) {
        return {
          success: true,
          routeId: existing.ID,
          email: existing.Email,
        };
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader,
        },
        body: JSON.stringify({
          Url: this.webhookUrl,
          Email: email,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        log.error('Mailjet parse route registration failed', { status: response.status, body: errorBody });
        return {
          success: false,
          error: `Mailjet API error: ${response.status} - ${errorBody}`,
        };
      }

      const data = (await response.json()) as ParseRouteResponse;

      if (data.Data && data.Data.length > 0) {
        const route = data.Data[0]!;
        return {
          success: true,
          routeId: route.ID,
          email: route.Email,
        };
      }

      return {
        success: false,
        error: 'No route data returned from Mailjet',
      };
    } catch (error) {
      log.error('Failed to register Mailjet parse route', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get existing parse route by email address
   * @param email - Full email address to search for
   * @returns Route data if found, null otherwise
   */
  async getParseRouteByEmail(email: string): Promise<ParseRouteData | null> {
    try {
      const response = await fetch(
        `${this.apiUrl}?Email=${encodeURIComponent(email)}`,
        {
          method: 'GET',
          headers: {
            Authorization: this.authHeader,
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as ParseRouteResponse;
      return data.Data && data.Data.length > 0 ? data.Data[0]! : null;
    } catch {
      return null;
    }
  }

  /**
   * List all registered parse routes
   * @returns Array of parse routes
   */
  async listParseRoutes(): Promise<ParseRouteData[]> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
        },
      });

      if (!response.ok) {
        log.error('Failed to list parse routes', { status: response.status });
        return [];
      }

      const data = (await response.json()) as ParseRouteResponse;
      return data.Data || [];
    } catch (error) {
      log.error('Failed to list Mailjet parse routes', { error });
      return [];
    }
  }

  /**
   * Delete a parse route by ID
   * @param routeId - Parse route ID to delete
   * @returns Success status
   */
  async deleteParseRoute(routeId: number): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/${routeId}`, {
        method: 'DELETE',
        headers: {
          Authorization: this.authHeader,
        },
      });

      return response.ok || response.status === 404;
    } catch (error) {
      log.error('Failed to delete Mailjet parse route', { error, routeId });
      return false;
    }
  }

  /**
   * Register parse routes for a user's wallet address and domain names
   * Called when a user signs in successfully
   *
   * @param walletAddress - User's blockchain wallet address
   * @param domainNames - Array of domain names (e.g., ['mydomain.sol'])
   * @returns Result of multi-route registration
   */
  async registerRoutesForUser(
    walletAddress: string,
    domainNames: string[] = []
  ): Promise<MultiRouteResult> {
    const result: MultiRouteResult = {
      success: true,
      registered: [],
      failed: [],
      skipped: [],
    };

    // Register route for wallet address
    const walletResult = await this.registerParseRoute(walletAddress);
    if (walletResult.success) {
      result.registered.push(walletAddress);
    } else {
      result.failed.push({
        email: walletAddress,
        error: walletResult.error || 'Unknown error',
      });
      result.success = false;
    }

    // Register routes for domain names
    for (const domain of domainNames) {
      // Normalize domain name (remove .sol suffix for email local part)
      const localPart = domain.endsWith('.sol') ? domain : `${domain}.sol`;

      const domainResult = await this.registerParseRoute(localPart);
      if (domainResult.success) {
        result.registered.push(localPart);
      } else {
        result.failed.push({
          email: localPart,
          error: domainResult.error || 'Unknown error',
        });
      }
    }

    return result;
  }
}

export const mailjetParseRouteService = new MailjetParseRouteService();
