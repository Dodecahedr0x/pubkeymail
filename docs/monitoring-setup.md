# Monitoring & Observability Setup

This document describes the observability surface of the PubKeyMail API: health
checks, metrics, and structured logging, plus how to wire them into external
monitoring.

## Health checks

Exposed at the root (no API prefix) for container/orchestrator probes:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Aggregate health (DB, Redis, scheduler). |
| `GET /health/ready` | Readiness probe — dependencies reachable. |
| `GET /health/live` | Liveness probe — process is up. |

Use `/health/live` for liveness and `/health/ready` for readiness in
Kubernetes/Render.

## Metrics

The API collects in-process metrics via `MetricsService`
(`src/services/metrics/metrics-service.ts`) and exposes them at:

| Endpoint | Format |
|---|---|
| `GET /metrics` | Prometheus text exposition (`text/plain; version=0.0.4`). |
| `GET /metrics?format=json` | Structured JSON snapshot. |

### Collected metrics

| Metric | Type | Labels | Source |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `status`, `route` | request middleware |
| `http_request_duration_ms` | summary | `method`, `route` | request middleware |
| `emails_received_total` | counter | `blockchain` | email ingestion |
| `emails_received_encrypted_total` | counter | – | email ingestion |
| `email_cleanup_runs_total` | counter | – | cleanup service |
| `email_cleanup_deleted_total` | counter | – | cleanup service |
| `email_cleanup_last_deleted` | gauge | – | cleanup service |
| `email_cleanup_last_addresses_affected` | gauge | – | cleanup service |
| `email_cleanup_duration_ms` | summary | – | cleanup service |
| `email_cleanup_errors_total` | counter | – | cleanup service |

Route labels are normalized (numeric/hex path segments collapse to `:id`) to
keep cardinality bounded.

### Recording custom metrics

```ts
import { metricsService } from './services/metrics/index.js';

metricsService.increment('payments_succeeded_total', 1, { provider: 'stripe' });
metricsService.gauge('queue_depth', depth);
const stop = metricsService.startTimer('job_ms');
stop(elapsedMs);
```

## Prometheus scrape config

```yaml
scrape_configs:
  - job_name: pubkeymail-api
    metrics_path: /metrics
    scrape_interval: 15s
    static_configs:
      - targets: ['pubkeymail-api:3000']
```

## Structured logging

Logging goes through `createLogger(scope)`
(`src/services/logger/index.ts`). Each entry is a structured record with
`level`, `message`, `timestamp`, and a `context` object.

Environment controls:

| Variable | Effect |
|---|---|
| `LOG_LEVEL` | `trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal` (default `info`). |
| `LOG_PRETTY_PRINT` | `false` → JSON lines for log aggregation (default pretty). |

For production aggregation (Loki/Datadog/CloudWatch), set
`LOG_PRETTY_PRINT=false` and ship stdout.

## Alerting recommendations

Wire these alerts off the metrics above:

- **Cleanup failures**: `increase(email_cleanup_errors_total[1h]) > 0`.
- **Cleanup stalled**: no increase in `email_cleanup_runs_total` over the
  expected schedule window.
- **Error-rate**: ratio of `http_requests_total{status=~"5.."}` to total > 1%.
- **Latency**: `http_request_duration_ms` avg/`p` above SLO.
- **Ingestion drop**: `emails_received_total` flatlines during business hours.

## Error tracking (Sentry)

Sentry is not yet wired. To add it, initialize the SDK at process start in
`src/index.ts` and capture exceptions in the Express error handler
(`src/api/app.ts`). Gate initialization behind a `SENTRY_DSN` env var so local
and test runs stay offline.
