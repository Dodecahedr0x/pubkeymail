import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockAdd = vi.fn();
const mockGetWaitingCount = vi.fn();
const mockGetActiveCount = vi.fn();
const mockGetCompletedCount = vi.fn();
const mockGetFailedCount = vi.fn();
const mockClose = vi.fn();

vi.mock('bull', () => ({
  default: vi.fn(() => ({
    add: mockAdd,
    getWaitingCount: mockGetWaitingCount,
    getActiveCount: mockGetActiveCount,
    getCompletedCount: mockGetCompletedCount,
    getFailedCount: mockGetFailedCount,
    close: mockClose,
  })),
}));

vi.mock('../../../src/config/index.js', () => ({
  config: {
    REDIS_URL: 'redis://localhost:6379',
  },
}));

import { emailQueue, type EmailJobData } from '../../../src/services/queue/email-queue.js';

describe('EmailQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: '1', data: {} });
    mockGetWaitingCount.mockResolvedValue(5);
    mockGetActiveCount.mockResolvedValue(2);
    mockGetCompletedCount.mockResolvedValue(100);
    mockGetFailedCount.mockResolvedValue(3);
    mockClose.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await emailQueue.close();
  });

  describe('initialize', () => {
    it('should initialize the queue', async () => {
      await emailQueue.initialize();
      expect(emailQueue.isReady()).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      await emailQueue.initialize();
      await emailQueue.initialize();
      expect(emailQueue.isReady()).toBe(true);
    });
  });

  describe('addJob', () => {
    it('should throw if queue not initialized', async () => {
      await expect(
        emailQueue.addJob({ type: 'forward', payload: {} })
      ).rejects.toThrow('Queue not initialized');
    });

    it('should add a forward job', async () => {
      await emailQueue.initialize();
      const jobData: EmailJobData = {
        type: 'forward',
        payload: { emailId: '123', destination: 'test@example.com' },
      };

      await emailQueue.addJob(jobData);

      expect(mockAdd).toHaveBeenCalledWith(jobData, {});
    });

    it('should add a send job', async () => {
      await emailQueue.initialize();
      const jobData: EmailJobData = {
        type: 'send',
        payload: { to: 'user@example.com', subject: 'Test' },
      };

      await emailQueue.addJob(jobData);

      expect(mockAdd).toHaveBeenCalledWith(jobData, {});
    });

    it('should add a cleanup job', async () => {
      await emailQueue.initialize();
      const jobData: EmailJobData = {
        type: 'cleanup',
        payload: { olderThanDays: 30 },
      };

      await emailQueue.addJob(jobData);

      expect(mockAdd).toHaveBeenCalledWith(jobData, {});
    });

    it('should respect priority option', async () => {
      await emailQueue.initialize();
      const jobData: EmailJobData = {
        type: 'forward',
        payload: {},
        priority: 1,
      };

      await emailQueue.addJob(jobData);

      expect(mockAdd).toHaveBeenCalledWith(jobData, { priority: 1 });
    });
  });

  describe('getStats', () => {
    it('should throw if queue not initialized', async () => {
      await expect(emailQueue.getStats()).rejects.toThrow(
        'Queue not initialized'
      );
    });

    it('should return queue statistics', async () => {
      await emailQueue.initialize();

      const stats = await emailQueue.getStats();

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
      });
    });
  });

  describe('close', () => {
    it('should close the queue', async () => {
      await emailQueue.initialize();
      await emailQueue.close();

      expect(mockClose).toHaveBeenCalled();
      expect(emailQueue.isReady()).toBe(false);
    });

    it('should handle close when not initialized', async () => {
      await emailQueue.close();
      expect(emailQueue.isReady()).toBe(false);
    });
  });

  describe('getQueue', () => {
    it('should return null if not initialized', () => {
      expect(emailQueue.getQueue()).toBeNull();
    });

    it('should return the queue instance after initialization', async () => {
      await emailQueue.initialize();
      expect(emailQueue.getQueue()).not.toBeNull();
    });
  });
});
