# Active Work

Update before and after planned work. Completed history is in
[`archive/progress-history.md`](archive/progress-history.md); do not load it by
default.

## Production

- [ ] Payment reconciliation (requires production setup)
- [ ] Configure and document SPF, DKIM, and DMARC; test deliverability
- [ ] CAPTCHA for sending

## Product

- [ ] Encryption toggle and status UI
- [ ] Mobile app API support
- [ ] Attachment preview
- [ ] Touch-friendly interactions

## Scale And Operations

- [ ] Read replicas
- [ ] Horizontal scaling
- [ ] Load test at 100k emails/day
- [ ] Monitoring dashboards
- [ ] Wire Sentry with `SENTRY_DSN`
- [ ] Deploy Prometheus alert rules

## Verify Before Fixing

- HTML sanitization may still use regex instead of a DOM sanitizer.
- Webhook signature verification may still be placeholder logic.

## Recent Milestones

- Main API now runs operational Solana Pay endpoints with SDK-validated USDC
  transfers, persistent requests, automatic status discovery, and 85%+ service
  coverage.
- Agent knowledge moved to compact `.agents/` context, memory, skills, and specs.
- Render Blueprint validated for API, web, PostgreSQL, and Redis.
- Encryption storage, metrics, query indexes, multi-chain tests, forwarding
  filters, templates, search, threading, spam filtering, and accessibility work
  completed.
