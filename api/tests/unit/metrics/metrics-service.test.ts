/**
 * Metrics Service Tests
 * Tests in-process counters, gauges, and histograms plus Prometheus export.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsService } from '../../../src/services/metrics/metrics-service.js';

describe('MetricsService', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  describe('counters', () => {
    it('increments a counter by 1 by default', () => {
      metrics.increment('emails_received');
      metrics.increment('emails_received');
      expect(metrics.getCounter('emails_received')).toBe(2);
    });

    it('increments by a custom amount', () => {
      metrics.increment('bytes', 100);
      metrics.increment('bytes', 50);
      expect(metrics.getCounter('bytes')).toBe(150);
    });

    it('keeps counters separate by labels', () => {
      metrics.increment('http_requests', 1, { status: '200' });
      metrics.increment('http_requests', 1, { status: '500' });
      expect(metrics.getCounter('http_requests', { status: '200' })).toBe(1);
      expect(metrics.getCounter('http_requests', { status: '500' })).toBe(1);
    });

    it('returns 0 for an unknown counter', () => {
      expect(metrics.getCounter('nope')).toBe(0);
    });
  });

  describe('gauges', () => {
    it('sets and overwrites a gauge value', () => {
      metrics.gauge('queue_depth', 5);
      metrics.gauge('queue_depth', 12);
      expect(metrics.getGauge('queue_depth')).toBe(12);
    });

    it('returns undefined for an unset gauge', () => {
      expect(metrics.getGauge('unset')).toBeUndefined();
    });
  });

  describe('histograms', () => {
    it('records observations and computes summary stats', () => {
      metrics.observe('request_ms', 10);
      metrics.observe('request_ms', 20);
      metrics.observe('request_ms', 30);
      const h = metrics.getHistogram('request_ms')!;
      expect(h.count).toBe(3);
      expect(h.sum).toBe(60);
      expect(h.min).toBe(10);
      expect(h.max).toBe(30);
      expect(h.avg).toBe(20);
    });

    it('returns undefined for an unknown histogram', () => {
      expect(metrics.getHistogram('nope')).toBeUndefined();
    });
  });

  describe('timing helper', () => {
    it('records elapsed time via startTimer', () => {
      const stop = metrics.startTimer('op_ms');
      stop(15);
      const h = metrics.getHistogram('op_ms')!;
      expect(h.count).toBe(1);
      expect(h.sum).toBe(15);
    });
  });

  describe('snapshot & export', () => {
    it('produces a structured snapshot', () => {
      metrics.increment('a', 2);
      metrics.gauge('b', 7);
      metrics.observe('c', 4);
      const snap = metrics.snapshot();
      expect(snap.counters['a']).toBe(2);
      expect(snap.gauges['b']).toBe(7);
      expect(snap.histograms['c']!.count).toBe(1);
    });

    it('exports Prometheus text format', () => {
      metrics.increment('emails_total', 3);
      metrics.gauge('queue_depth', 9);
      const text = metrics.toPrometheus();
      expect(text).toContain('# TYPE emails_total counter');
      expect(text).toContain('emails_total 3');
      expect(text).toContain('# TYPE queue_depth gauge');
      expect(text).toContain('queue_depth 9');
    });

    it('renders labels in Prometheus output', () => {
      metrics.increment('http_requests', 1, { status: '200', method: 'GET' });
      const text = metrics.toPrometheus();
      expect(text).toMatch(/http_requests\{[^}]*status="200"[^}]*\} 1/);
    });

    it('resets all metrics', () => {
      metrics.increment('a');
      metrics.gauge('b', 1);
      metrics.observe('c', 1);
      metrics.reset();
      expect(metrics.getCounter('a')).toBe(0);
      expect(metrics.getGauge('b')).toBeUndefined();
      expect(metrics.getHistogram('c')).toBeUndefined();
    });
  });
});
