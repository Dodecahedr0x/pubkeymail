/**
 * Security Audit Logger
 * Non-blocking security event logging for compliance and incident response
 */

import { db } from '../../database/connection.js';

export type SecurityEventType =
  | 'AUTH_CHALLENGE_REQUESTED'
  | 'AUTH_CHALLENGE_VERIFIED'
  | 'AUTH_CHALLENGE_FAILED'
  | 'AUTH_BRUTE_FORCE_BLOCKED'
  | 'EMAIL_SENT'
  | 'EMAIL_RECEIVED'
  | 'EMAIL_DELETED'
  | 'USER_REGISTERED'
  | 'USER_DELETED'
  | 'SUBSCRIPTION_UPGRADED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'ADDRESS_LINKED'
  | 'ADDRESS_UNLINKED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'DATA_EXPORTED'
  | 'DATA_DELETION_REQUESTED';

export interface AuditLogEntry {
  eventType: SecurityEventType;
  actorType: 'user' | 'system' | 'anonymous';
  actorId?: number;
  actorAddress?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
  status: 'success' | 'failure' | 'blocked';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredAuditLog extends AuditLogEntry {
  id: string;
  createdAt: Date;
}

interface AuditLogRow {
  id: string;
  event_type: string;
  actor_type: string;
  actor_id: number | null;
  actor_address: string | null;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  status: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  since?: Date;
}

export class AuditLogger {
  async log(entry: AuditLogEntry): Promise<void> {
    const query = `
      INSERT INTO audit_logs (
        event_type, actor_type, actor_id, actor_address,
        resource_type, resource_id, action, status,
        ip_address, user_agent, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    const params = [
      entry.eventType,
      entry.actorType,
      entry.actorId ?? null,
      entry.actorAddress ?? null,
      entry.resourceType ?? null,
      entry.resourceId ?? null,
      entry.action,
      entry.status,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ];

    await db.query(query, params);
  }

  async getLogsForUser(
    userId: number,
    options: QueryOptions = {}
  ): Promise<StoredAuditLog[]> {
    const { limit = 100, offset = 0 } = options;

    const query = `
      SELECT * FROM audit_logs
      WHERE actor_type = 'user' AND actor_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query<AuditLogRow>(query, [userId, limit, offset]);
    return result.rows.map((row) => this.mapRowToEntry(row));
  }

  async getLogsByEventType(
    eventType: SecurityEventType,
    options: QueryOptions = {}
  ): Promise<StoredAuditLog[]> {
    const { limit = 100, since } = options;

    let query: string;
    let params: unknown[];

    if (since) {
      query = `
        SELECT * FROM audit_logs
        WHERE event_type = $1 AND created_at >= $2
        ORDER BY created_at DESC
        LIMIT $3
      `;
      params = [eventType, since, limit];
    } else {
      query = `
        SELECT * FROM audit_logs
        WHERE event_type = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
      params = [eventType, limit];
    }

    const result = await db.query<AuditLogRow>(query, params);
    return result.rows.map((row) => this.mapRowToEntry(row));
  }

  async getLogsForResource(
    resourceType: string,
    resourceId: string,
    options: QueryOptions = {}
  ): Promise<StoredAuditLog[]> {
    const { limit = 100, offset = 0 } = options;

    const query = `
      SELECT * FROM audit_logs
      WHERE resource_type = $1 AND resource_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await db.query<AuditLogRow>(query, [
      resourceType,
      resourceId,
      limit,
      offset,
    ]);
    return result.rows.map((row) => this.mapRowToEntry(row));
  }

  private mapRowToEntry(row: AuditLogRow): StoredAuditLog {
    return {
      id: row.id,
      eventType: row.event_type as SecurityEventType,
      actorType: row.actor_type as 'user' | 'system' | 'anonymous',
      actorId: row.actor_id ?? undefined,
      actorAddress: row.actor_address ?? undefined,
      resourceType: row.resource_type ?? undefined,
      resourceId: row.resource_id ?? undefined,
      action: row.action,
      status: row.status as 'success' | 'failure' | 'blocked',
      ipAddress: row.ip_address ?? undefined,
      userAgent: row.user_agent ?? undefined,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}

export const auditLogger = new AuditLogger();
