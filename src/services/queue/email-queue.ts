/**
 * Email Processing Queue - Bull-based job queue for email operations
 *
 * Handles:
 * - Email forwarding jobs
 * - Email sending jobs
 * - Cleanup/retention jobs
 */

import Bull, { Queue, Job } from 'bull';
import { config, isLocalDevMode } from '../../config/index.js';

export interface EmailJobData {
  type: 'forward' | 'send' | 'cleanup';
  payload: Record<string, unknown>;
  priority?: number;
}

export interface JobResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

class EmailQueue {
  private queue: Queue<EmailJobData> | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized && this.queue) {
      return;
    }

    // In local dev mode, queue operations are no-ops
    if (isLocalDevMode) {
      console.log('📬 Email queue disabled in local dev mode');
      this.isInitialized = true;
      return;
    }

    const redisUrl = config.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for email queue');
    }

    this.queue = new Bull<EmailJobData>('email-queue', redisUrl, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    this.isInitialized = true;
  }

  async addJob(data: EmailJobData): Promise<Job<EmailJobData>> {
    if (!this.queue) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    const jobOptions: Bull.JobOptions = {};

    if (data.priority !== undefined) {
      jobOptions.priority = data.priority;
    }

    return this.queue.add(data, jobOptions);
  }

  async getStats(): Promise<QueueStats> {
    if (!this.queue) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
      this.isInitialized = false;
    }
  }

  getQueue(): Queue<EmailJobData> | null {
    return this.queue;
  }

  isReady(): boolean {
    return this.isInitialized && this.queue !== null;
  }
}

export const emailQueue = new EmailQueue();
