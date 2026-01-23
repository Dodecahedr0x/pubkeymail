import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Local Dev Mode', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('Memory Cache Client', () => {
    it('should store and retrieve values', async () => {
      const { getMemoryCacheClient, initMemoryCacheClient } =
        await import('../../../src/services/cache/memory-client.js');

      await initMemoryCacheClient();
      const client = getMemoryCacheClient();

      await client.set('test-key', 'test-value');
      const value = await client.get('test-key');

      expect(value).toBe('test-value');
    });

    it('should handle setEx with TTL', async () => {
      const { getMemoryCacheClient, initMemoryCacheClient } =
        await import('../../../src/services/cache/memory-client.js');

      await initMemoryCacheClient();
      const client = getMemoryCacheClient();

      await client.setEx('ttl-key', 3600, 'ttl-value');
      const value = await client.get('ttl-key');

      expect(value).toBe('ttl-value');
    });

    it('should handle increment operations', async () => {
      const { getMemoryCacheClient, initMemoryCacheClient } =
        await import('../../../src/services/cache/memory-client.js');

      await initMemoryCacheClient();
      const client = getMemoryCacheClient();

      const result1 = await client.incr('counter');
      const result2 = await client.incr('counter');
      const result3 = await client.incrBy('counter', 5);

      expect(result1).toBe(1);
      expect(result2).toBe(2);
      expect(result3).toBe(7);
    });

    it('should handle hash operations', async () => {
      const { getMemoryCacheClient, initMemoryCacheClient } =
        await import('../../../src/services/cache/memory-client.js');

      await initMemoryCacheClient();
      const client = getMemoryCacheClient();

      await client.hSet('hash-key', 'field1', 'value1');
      await client.hSet('hash-key', 'field2', 'value2');

      const value1 = await client.hGet('hash-key', 'field1');
      const allValues = await client.hGetAll('hash-key');

      expect(value1).toBe('value1');
      expect(allValues).toEqual({ field1: 'value1', field2: 'value2' });
    });

    it('should handle sorted set operations', async () => {
      const { getMemoryCacheClient, initMemoryCacheClient } =
        await import('../../../src/services/cache/memory-client.js');

      await initMemoryCacheClient();
      const client = getMemoryCacheClient();

      await client.zAdd('zset-key', { score: 1, value: 'one' });
      await client.zAdd('zset-key', { score: 2, value: 'two' });
      await client.zAdd('zset-key', { score: 3, value: 'three' });

      const count = await client.zCard('zset-key');
      const range = await client.zRange('zset-key', 0, -1);

      expect(count).toBe(3);
      expect(range).toEqual(['one', 'two', 'three']);
    });

    it('should ping successfully', async () => {
      const { getMemoryCacheClient, initMemoryCacheClient } =
        await import('../../../src/services/cache/memory-client.js');

      await initMemoryCacheClient();
      const client = getMemoryCacheClient();

      const result = await client.ping();
      expect(result).toBe('PONG');
    });
  });

  describe('Memory Database', () => {
    it('should execute basic SELECT query', async () => {
      const { getMemoryDatabase, initMemoryDatabase } =
        await import('../../../src/database/memory-db.js');

      await initMemoryDatabase();
      const db = getMemoryDatabase();

      const result = await db.query('SELECT NOW()');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('now');
    });

    it('should execute health check query', async () => {
      const { getMemoryDatabase, initMemoryDatabase } =
        await import('../../../src/database/memory-db.js');

      await initMemoryDatabase();
      const db = getMemoryDatabase();

      const result = await db.query('SELECT 1 as health_check');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ health_check: 1 });
    });

    it('should insert and select from blockchain_addresses', async () => {
      const { getMemoryDatabase, initMemoryDatabase } =
        await import('../../../src/database/memory-db.js');

      await initMemoryDatabase();
      const db = getMemoryDatabase();
      db.reset();

      const insertResult = await db.query(
        'INSERT INTO blockchain_addresses (address, blockchain) VALUES ($1, $2) RETURNING *',
        ['0x123abc', 'ethereum']
      );

      expect(insertResult.rows).toHaveLength(1);
      expect(insertResult.rows[0]).toMatchObject({
        address: '0x123abc',
        blockchain: 'ethereum',
      });

      const selectResult = await db.query(
        'SELECT * FROM blockchain_addresses WHERE address = $1 COLLATE "C"',
        ['0x123abc']
      );

      expect(selectResult.rows).toHaveLength(1);
    });

    it('should respect case sensitivity', async () => {
      const { getMemoryDatabase, initMemoryDatabase } =
        await import('../../../src/database/memory-db.js');

      await initMemoryDatabase();
      const db = getMemoryDatabase();
      db.reset();

      await db.query(
        'INSERT INTO blockchain_addresses (address, blockchain) VALUES ($1, $2)',
        ['0xAbCdEf', 'ethereum']
      );

      const lowerResult = await db.query(
        'SELECT * FROM blockchain_addresses WHERE address = $1',
        ['0xabcdef']
      );

      const exactResult = await db.query(
        'SELECT * FROM blockchain_addresses WHERE address = $1',
        ['0xAbCdEf']
      );

      expect(lowerResult.rows).toHaveLength(0);
      expect(exactResult.rows).toHaveLength(1);
    });
  });
});
