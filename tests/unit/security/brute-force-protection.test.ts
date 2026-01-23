/**
 * Brute Force Protection Tests
 * Tests for authentication rate limiting and lockout functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockRedisClient = {
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  setEx: vi.fn(),
};

vi.mock('../../../src/services/cache/redis-client.js', () => ({
  getRedisClient: vi.fn(() => Promise.resolve(mockRedisClient)),
}));

const { BruteForceProtection } = await import(
  '../../../src/services/security/brute-force-protection.js'
);

describe('BruteForceProtection', () => {
  let protection: BruteForceProtection;

  beforeEach(() => {
    vi.clearAllMocks();
    protection = new BruteForceProtection({
      maxAttempts: 5,
      lockoutDuration: 900,
      attemptWindow: 300,
    });
    mockRedisClient.ttl.mockResolvedValue(-2);
    mockRedisClient.incr.mockResolvedValue(1);
    mockRedisClient.expire.mockResolvedValue(true);
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.setEx.mockResolvedValue('OK');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recordFailedAttempt', () => {
    it('should record first failed attempt and return remaining attempts', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(true);

      const result = await protection.recordFailedAttempt(
        'test-address',
        'address'
      );

      expect(result.isLocked).toBe(false);
      expect(result.remainingAttempts).toBe(4);
      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        'pubkeymail:bruteforce:address:test-address'
      );
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'pubkeymail:bruteforce:address:test-address',
        300
      );
    });

    it('should not reset TTL on subsequent attempts', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.incr.mockResolvedValue(3);

      const result = await protection.recordFailedAttempt(
        'test-address',
        'address'
      );

      expect(result.isLocked).toBe(false);
      expect(result.remainingAttempts).toBe(2);
      expect(mockRedisClient.expire).not.toHaveBeenCalled();
    });

    it('should lock after max attempts reached', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.incr.mockResolvedValue(5);
      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.del.mockResolvedValue(1);

      const result = await protection.recordFailedAttempt(
        'test-address',
        'address'
      );

      expect(result.isLocked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
      expect(result.unlockIn).toBe(900);
      expect(result.lockedUntil).toBeDefined();
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'pubkeymail:lockout:address:test-address',
        900,
        '1'
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'pubkeymail:bruteforce:address:test-address'
      );
    });

    it('should return locked status if already locked', async () => {
      mockRedisClient.ttl.mockResolvedValue(600);

      const result = await protection.recordFailedAttempt(
        'test-address',
        'address'
      );

      expect(result.isLocked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
      expect(result.unlockIn).toBe(600);
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
    });

    it('should work with IP type', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(true);

      const result = await protection.recordFailedAttempt('192.168.1.1', 'ip');

      expect(result.isLocked).toBe(false);
      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        'pubkeymail:bruteforce:ip:192.168.1.1'
      );
    });
  });

  describe('checkLockout', () => {
    it('should return not locked when no attempts', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.get.mockResolvedValue(null);

      const result = await protection.checkLockout('test-address', 'address');

      expect(result.isLocked).toBe(false);
      expect(result.remainingAttempts).toBe(5);
    });

    it('should return remaining attempts when some failed', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.get.mockResolvedValue('3');

      const result = await protection.checkLockout('test-address', 'address');

      expect(result.isLocked).toBe(false);
      expect(result.remainingAttempts).toBe(2);
    });

    it('should return locked status when lockout exists', async () => {
      mockRedisClient.ttl.mockResolvedValue(450);

      const result = await protection.checkLockout('test-address', 'address');

      expect(result.isLocked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
      expect(result.unlockIn).toBe(450);
      expect(result.lockedUntil).toBeDefined();
    });

    it('should work with IP type', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.get.mockResolvedValue('2');

      const result = await protection.checkLockout('192.168.1.1', 'ip');

      expect(result.isLocked).toBe(false);
      expect(result.remainingAttempts).toBe(3);
    });
  });

  describe('resetAttempts', () => {
    it('should delete attempt counter on success', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await protection.resetAttempts('test-address', 'address');

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'pubkeymail:bruteforce:address:test-address'
      );
    });

    it('should work with IP type', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await protection.resetAttempts('192.168.1.1', 'ip');

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'pubkeymail:bruteforce:ip:192.168.1.1'
      );
    });
  });

  describe('unlock', () => {
    it('should delete both attempt and lockout keys', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await protection.unlock('test-address', 'address');

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'pubkeymail:bruteforce:address:test-address'
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'pubkeymail:lockout:address:test-address'
      );
    });

    it('should work with IP type', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await protection.unlock('192.168.1.1', 'ip');

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'pubkeymail:bruteforce:ip:192.168.1.1'
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'pubkeymail:lockout:ip:192.168.1.1'
      );
    });
  });

  describe('custom configuration', () => {
    it('should use custom maxAttempts', async () => {
      const customProtection = new BruteForceProtection({ maxAttempts: 3 });
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.incr.mockResolvedValue(3);
      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.del.mockResolvedValue(1);

      const result = await customProtection.recordFailedAttempt(
        'test',
        'address'
      );

      expect(result.isLocked).toBe(true);
    });

    it('should use custom lockoutDuration', async () => {
      const customProtection = new BruteForceProtection({
        maxAttempts: 1,
        lockoutDuration: 3600,
      });
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.del.mockResolvedValue(1);

      const result = await customProtection.recordFailedAttempt(
        'test',
        'address'
      );

      expect(result.unlockIn).toBe(3600);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'pubkeymail:lockout:address:test',
        3600,
        '1'
      );
    });

    it('should use custom attemptWindow', async () => {
      const customProtection = new BruteForceProtection({ attemptWindow: 600 });
      mockRedisClient.ttl.mockResolvedValue(-2);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(true);

      await customProtection.recordFailedAttempt('test', 'address');

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'pubkeymail:bruteforce:address:test',
        600
      );
    });
  });
});

describe('bruteForceMiddleware', () => {
  let mockReq: Record<string, unknown>;
  let mockRes: Record<string, unknown>;
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.ttl.mockResolvedValue(-2);
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.incr.mockResolvedValue(1);
    mockRedisClient.expire.mockResolvedValue(true);
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.setEx.mockResolvedValue('OK');
    mockReq = {
      headers: {},
      body: {},
      params: {},
      ip: '127.0.0.1',
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };
    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call next when IP is not locked', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    const middleware = bruteForceMiddleware('ip');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 429 when IP is locked', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    mockRedisClient.ttl.mockResolvedValue(600);

    const middleware = bruteForceMiddleware('ip');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Retry-After', '600');
    expect(mockRes.json).toHaveBeenCalledWith({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many failed attempts. Please try again later.',
        unlockIn: 600,
        lockedUntil: expect.any(String),
      },
    });
  });

  it('should call next when address is not locked', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    mockReq['body'] = { address: 'test-wallet' };

    const middleware = bruteForceMiddleware('address');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 429 when address is locked', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    mockRedisClient.ttl.mockResolvedValue(300);
    mockReq['body'] = { address: 'locked-wallet' };

    const middleware = bruteForceMiddleware('address');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(429);
  });

  it('should check both IP and address when type is both', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    mockReq['body'] = { address: 'test-wallet' };

    const middleware = bruteForceMiddleware('both');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should block if IP is locked when checking both', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    mockRedisClient.ttl.mockResolvedValue(500);

    const middleware = bruteForceMiddleware('both');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(429);
  });

  it('should use x-forwarded-for header for IP', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    mockReq['headers'] = { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' };

    const middleware = bruteForceMiddleware('ip');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should continue on error', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    mockRedisClient.ttl.mockRejectedValue(new Error('Redis error'));

    const middleware = bruteForceMiddleware('ip');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should skip address check if no address provided', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    const middleware = bruteForceMiddleware('address');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should get address from params if not in body', async () => {
    const { bruteForceMiddleware } = await import(
      '../../../src/api/middleware/brute-force-middleware.js'
    );

    mockReq['params'] = { address: 'param-wallet' };

    const middleware = bruteForceMiddleware('address');
    await middleware(mockReq as never, mockRes as never, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
