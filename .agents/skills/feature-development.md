# Feature Development

1. Read project context/memory, active progress, and only the relevant spec.
2. Add/update the active task; preserve unrelated worktree changes.
3. Follow existing package boundaries. Preserve address case and wallet-only
   authentication.
4. Test behavior: unit tests for logic, integration tests for APIs, E2E for
   critical flows when a harness exists. New code requires 85%+ coverage.
5. Run relevant gates:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run test:coverage
npm run build
```

For deployment changes, also run `render blueprints validate -o json`. Report
checks that could not run; do not claim full verification.

Update affected context, memory, specs, README, and operational docs. Mark work
complete only after verification. Use conventional commits, include only task
files, and push/confirm CI when required by the requested workflow.
