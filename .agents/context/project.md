# Project Context

PubKeyMail is a wallet-authenticated email service.

## Stack

- Node.js 24+, npm workspaces
- Express/TypeScript API: `api/`
- Next.js web app: `web/`
- Remotion: `videos/`
- PostgreSQL, Redis, Solana/SNS, Vitest
- Render deployment: `render.yaml`

## Setup And Checks

```bash
cp .env.example .env
docker-compose up -d
npm install
npm run migrate

npm run dev
npm run build
npm test
npm run test:coverage
npm run type-check
npm run lint
npm run format:check
```

API: `localhost:3000`; web: `localhost:3001`. Use `.env.example` as the config
source of truth. Production requires `USE_LOCAL_DEV=false`, `DATABASE_URL`,
`REDIS_URL`, SMTP settings, Solana RPC settings, `DOMAIN`, and a 32+ character
`JWT_SECRET`. Never commit secrets.

API layout: HTTP in `api/src/api/`, config in `api/src/config/`, database in
`api/src/database/`, business logic in `api/src/services/`, tests in `api/tests/`.

## Deployment

`render.yaml` provisions API, web, PostgreSQL, and Redis. Do not restore
Railway/Nixpacks without an explicit target change. Validate with
`render blueprints validate -o json`. Services bind to `0.0.0.0:$PORT`;
`NEXT_PUBLIC_API_URL` requires a web rebuild. See `docs/render-deployment.md`.
