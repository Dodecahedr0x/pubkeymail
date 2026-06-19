/**
 * Metrics Service
 *
 * Lightweight, dependency-free in-process metrics collection supporting
 * counters, gauges, and histograms, with a Prometheus text exposition format
 * for scraping. Intended as the foundation for observability — application
 * code records metrics, and the `/metrics` endpoint exposes them.
 *
 * Labels are supported and folded into the metric key so each label-set is
 * tracked independently (Prometheus-style).
 */

export type Labels = Record<string, string>;

export interface HistogramSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramSummary>;
}

interface HistogramState {
  count: number;
  sum: number;
  min: number;
  max: number;
}

/**
 * Build a stable key from a metric name + sorted labels.
 * e.g. http_requests{method="GET",status="200"}
 */
function metricKey(name: string, labels?: Labels): string {
  if (!labels || Object.keys(labels).length === 0) {
    return name;
  }
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}="${labels[k]}"`);
  return `${name}{${parts.join(',')}}`;
}

/** Split a stored key back into name + label string for export. */
function splitKey(key: string): { name: string; labelStr: string } {
  const idx = key.indexOf('{');
  if (idx === -1) return { name: key, labelStr: '' };
  return { name: key.slice(0, idx), labelStr: key.slice(idx) };
}

export class MetricsService {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, HistogramState>();

  /** Increment a counter (default by 1). */
  increment(name: string, value = 1, labels?: Labels): void {
    const key = metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  getCounter(name: string, labels?: Labels): number {
    return this.counters.get(metricKey(name, labels)) ?? 0;
  }

  /** Set a gauge to an absolute value. */
  gauge(name: string, value: number, labels?: Labels): void {
    this.gauges.set(metricKey(name, labels), value);
  }

  getGauge(name: string, labels?: Labels): number | undefined {
    return this.gauges.get(metricKey(name, labels));
  }

  /** Record a single observation in a histogram. */
  observe(name: string, value: number, labels?: Labels): void {
    const key = metricKey(name, labels);
    const state = this.histograms.get(key);
    if (!state) {
      this.histograms.set(key, { count: 1, sum: value, min: value, max: value });
    } else {
      state.count += 1;
      state.sum += value;
      state.min = Math.min(state.min, value);
      state.max = Math.max(state.max, value);
    }
  }

  getHistogram(name: string, labels?: Labels): HistogramSummary | undefined {
    const state = this.histograms.get(metricKey(name, labels));
    if (!state) return undefined;
    return {
      count: state.count,
      sum: state.sum,
      min: state.min,
      max: state.max,
      avg: state.count > 0 ? state.sum / state.count : 0,
    };
  }

  /**
   * Start a timer; returns a stop function. Pass an explicit elapsed value
   * (ms) to record — keeping the service deterministic and testable without
   * relying on wall-clock inside the service.
   */
  startTimer(name: string, labels?: Labels): (elapsedMs: number) => void {
    return (elapsedMs: number) => this.observe(name, elapsedMs, labels);
  }

  /** Structured snapshot of all metrics. */
  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [key, value] of this.counters) counters[key] = value;

    const gauges: Record<string, number> = {};
    for (const [key, value] of this.gauges) gauges[key] = value;

    const histograms: Record<string, HistogramSummary> = {};
    for (const key of this.histograms.keys()) {
      histograms[key] = this.getHistogram(key)!;
    }

    return { counters, gauges, histograms };
  }

  /** Render metrics in Prometheus text exposition format. */
  toPrometheus(): string {
    const lines: string[] = [];

    for (const [key, value] of this.counters) {
      const { name, labelStr } = splitKey(key);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${labelStr} ${value}`);
    }

    for (const [key, value] of this.gauges) {
      const { name, labelStr } = splitKey(key);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${labelStr} ${value}`);
    }

    for (const key of this.histograms.keys()) {
      const summary = this.getHistogram(key)!;
      const { name, labelStr } = splitKey(key);
      const inner = labelStr ? labelStr.slice(1, -1) : '';
      const withLabel = (extra: string) =>
        inner ? `{${inner},${extra}}` : `{${extra}}`;
      lines.push(`# TYPE ${name} summary`);
      lines.push(`${name}_count${labelStr} ${summary.count}`);
      lines.push(`${name}_sum${labelStr} ${summary.sum}`);
      lines.push(`${name}${withLabel('stat="min"')} ${summary.min}`);
      lines.push(`${name}${withLabel('stat="max"')} ${summary.max}`);
      lines.push(`${name}${withLabel('stat="avg"')} ${summary.avg}`);
    }

    return lines.join('\n') + '\n';
  }

  /** Clear all metrics. */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

/** Process-wide metrics registry. */
export const metricsService = new MetricsService();
