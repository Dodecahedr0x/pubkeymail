# Project Memory

- Preserve case for blockchain and derived email addresses. PostgreSQL address
  columns use `COLLATE "C"` or `COLLATE "POSIX"`; never lowercase addresses.
- Wallet signatures are the only authentication. Never handle private keys;
  verify unique, expiring nonces. Solana addresses are base58; Ed25519
  signatures are 64 bytes.
- Cleanup deletes only expired messages for unregistered addresses, never whole
  mailboxes containing recent mail.
- Resolve names to blockchain addresses at receipt time and store both values.
- PostgreSQL is authoritative; Redis holds short-lived coordination/cache data.
  SNS cache TTL defaults to one hour. Lists default to 50-item pagination.
- Keep outbound email queue-friendly and respect provider limits.
- `/health/live` proves process liveness; `/health/ready` checks dependencies.
- `NEXT_PUBLIC_*` changes require rebuilding the web app.
- Keep `render.yaml` and `docs/render-deployment.md` synchronized.
- Never store secrets in code, fixtures, specs, or agent files.

Add only stable, project-specific lessons; remove invalidated entries.
