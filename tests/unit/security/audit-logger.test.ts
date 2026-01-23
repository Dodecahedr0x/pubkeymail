import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SecurityEventType, AuditLogEntry, StoredAuditLog } from '../../../src/services/security/audit-logger.js';

const mockQuery = vi.fn();

vi.mock('../../../src/database/connection.js', () => ({
  db: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

describe('AuditLogger', () => {
  let AuditLogger: typeof import('../../../src/services/security/audit-logger.js').AuditLogger;
  let auditLogger: InstanceType<typeof AuditLogger>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/security/audit-logger.js');
    AuditLogger = module.AuditLogger;
    auditLogger = new AuditLogger();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('log', () => {
    it('should insert audit log entry with all fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const entry: AuditLogEntry = {
        eventType: 'AUTH_CHALLENGE_VERIFIED',
        actorType: 'user',
        actorId: 123,
        actorAddress: 'So1anaAddress123',
        resourceType: 'user',
        resourceId: '123',
        action: 'login',
        status: 'success',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: { browser: 'Chrome' },
      };

      await auditLogger.log(entry);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO audit_logs');
      expect(params).toEqual([
        'AUTH_CHALLENGE_VERIFIED',
        'user',
        123,
        'So1anaAddress123',
        'user',
        '123',
        'login',
        'success',
        '192.168.1.1',
        'Mozilla/5.0',
        JSON.stringify({ browser: 'Chrome' }),
      ]);
    });

    it('should handle minimal entry with null optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const entry: AuditLogEntry = {
        eventType: 'RATE_LIMIT_EXCEEDED',
        actorType: 'anonymous',
        action: 'request',
        status: 'blocked',
      };

      await auditLogger.log(entry);

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([
        'RATE_LIMIT_EXCEEDED',
        'anonymous',
        null,
        null,
        null,
        null,
        'request',
        'blocked',
        null,
        null,
        '{}',
      ]);
    });

    it('should handle system actor type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const entry: AuditLogEntry = {
        eventType: 'EMAIL_DELETED',
        actorType: 'system',
        resourceType: 'email',
        resourceId: 'email-uuid-123',
        action: 'cleanup',
        status: 'success',
        metadata: { reason: 'retention_policy' },
      };

      await auditLogger.log(entry);

      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe('EMAIL_DELETED');
      expect(params[1]).toBe('system');
    });

    const allEventTypes: SecurityEventType[] = [
      'AUTH_CHALLENGE_REQUESTED',
      'AUTH_CHALLENGE_VERIFIED',
      'AUTH_CHALLENGE_FAILED',
      'AUTH_BRUTE_FORCE_BLOCKED',
      'EMAIL_SENT',
      'EMAIL_RECEIVED',
      'EMAIL_DELETED',
      'USER_REGISTERED',
      'USER_DELETED',
      'SUBSCRIPTION_UPGRADED',
      'SUBSCRIPTION_CANCELLED',
      'ADDRESS_LINKED',
      'ADDRESS_UNLINKED',
      'RATE_LIMIT_EXCEEDED',
      'DATA_EXPORTED',
      'DATA_DELETION_REQUESTED',
    ];

    it.each(allEventTypes)('should log event type: %s', async (eventType) => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await auditLogger.log({
        eventType,
        actorType: 'user',
        action: 'test',
        status: 'success',
      });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe(eventType);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(
        auditLogger.log({
          eventType: 'USER_REGISTERED',
          actorType: 'user',
          action: 'register',
          status: 'success',
        })
      ).rejects.toThrow('Connection failed');
    });
  });

  describe('getLogsForUser', () => {
    const mockRows = [
      {
        id: 'uuid-1',
        event_type: 'AUTH_CHALLENGE_VERIFIED',
        actor_type: 'user',
        actor_id: 123,
        actor_address: 'address123',
        resource_type: 'user',
        resource_id: '123',
        action: 'login',
        status: 'success',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        metadata: { key: 'value' },
        created_at: new Date('2024-01-01'),
      },
    ];

    it('should query logs for user with default pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await auditLogger.getLogsForUser(123);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE actor_type = 'user' AND actor_id = $1"),
        [123, 100, 0]
      );
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('AUTH_CHALLENGE_VERIFIED');
      expect(result[0].actorId).toBe(123);
    });

    it('should apply custom limit and offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await auditLogger.getLogsForUser(123, { limit: 50, offset: 10 });

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([123, 50, 10]);
    });

    it('should map row to StoredAuditLog correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await auditLogger.getLogsForUser(123);

      const log = result[0] as StoredAuditLog;
      expect(log.id).toBe('uuid-1');
      expect(log.eventType).toBe('AUTH_CHALLENGE_VERIFIED');
      expect(log.actorType).toBe('user');
      expect(log.actorId).toBe(123);
      expect(log.actorAddress).toBe('address123');
      expect(log.resourceType).toBe('user');
      expect(log.resourceId).toBe('123');
      expect(log.action).toBe('login');
      expect(log.status).toBe('success');
      expect(log.ipAddress).toBe('192.168.1.1');
      expect(log.userAgent).toBe('Mozilla/5.0');
      expect(log.metadata).toEqual({ key: 'value' });
      expect(log.createdAt).toEqual(new Date('2024-01-01'));
    });

    it('should handle null optional fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'uuid-2',
            event_type: 'RATE_LIMIT_EXCEEDED',
            actor_type: 'anonymous',
            actor_id: null,
            actor_address: null,
            resource_type: null,
            resource_id: null,
            action: 'request',
            status: 'blocked',
            ip_address: null,
            user_agent: null,
            metadata: {},
            created_at: new Date(),
          },
        ],
      });

      const result = await auditLogger.getLogsForUser(0);
      const log = result[0];

      expect(log.actorId).toBeUndefined();
      expect(log.actorAddress).toBeUndefined();
      expect(log.resourceType).toBeUndefined();
      expect(log.resourceId).toBeUndefined();
      expect(log.ipAddress).toBeUndefined();
      expect(log.userAgent).toBeUndefined();
    });
  });

  describe('getLogsByEventType', () => {
    it('should query by event type with default limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await auditLogger.getLogsByEventType('AUTH_BRUTE_FORCE_BLOCKED');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE event_type = $1'),
        ['AUTH_BRUTE_FORCE_BLOCKED', 100]
      );
    });

    it('should apply since filter when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const since = new Date('2024-01-01');

      await auditLogger.getLogsByEventType('EMAIL_SENT', { since, limit: 50 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= $2'),
        ['EMAIL_SENT', since, 50]
      );
    });

    it('should return mapped entries', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'uuid-3',
            event_type: 'USER_REGISTERED',
            actor_type: 'user',
            actor_id: 456,
            actor_address: null,
            resource_type: 'user',
            resource_id: '456',
            action: 'create',
            status: 'success',
            ip_address: '10.0.0.1',
            user_agent: 'Chrome',
            metadata: {},
            created_at: new Date(),
          },
        ],
      });

      const result = await auditLogger.getLogsByEventType('USER_REGISTERED');

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('USER_REGISTERED');
    });
  });

  describe('getLogsForResource', () => {
    it('should query logs for resource with default pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await auditLogger.getLogsForResource('email', 'email-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE resource_type = $1 AND resource_id = $2'),
        ['email', 'email-123', 100, 0]
      );
    });

    it('should apply custom pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await auditLogger.getLogsForResource('subscription', 'sub-456', {
        limit: 25,
        offset: 50,
      });

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual(['subscription', 'sub-456', 25, 50]);
    });
  });

  describe('fire-and-forget pattern', () => {
    it('should allow non-blocking logging with catch handler', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      auditLogger
        .log({
          eventType: 'EMAIL_RECEIVED',
          actorType: 'system',
          action: 'receive',
          status: 'success',
        })
        .catch((err) => console.error('Audit log failed:', err));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Audit log failed:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should not block execution when using fire-and-forget', async () => {
      mockQuery.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ rows: [] }), 100))
      );

      const start = Date.now();

      auditLogger
        .log({
          eventType: 'DATA_EXPORTED',
          actorType: 'user',
          action: 'export',
          status: 'success',
        })
        .catch(() => {});

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('status types', () => {
    it.each(['success', 'failure', 'blocked'] as const)(
      'should accept status: %s',
      async (status) => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await auditLogger.log({
          eventType: 'AUTH_CHALLENGE_VERIFIED',
          actorType: 'user',
          action: 'verify',
          status,
        });

        const [, params] = mockQuery.mock.calls[0];
        expect(params[7]).toBe(status);
      }
    );
  });

  describe('actor types', () => {
    it.each(['user', 'system', 'anonymous'] as const)(
      'should accept actor type: %s',
      async (actorType) => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await auditLogger.log({
          eventType: 'RATE_LIMIT_EXCEEDED',
          actorType,
          action: 'block',
          status: 'blocked',
        });

        const [, params] = mockQuery.mock.calls[0];
        expect(params[1]).toBe(actorType);
      }
    );
  });
});
