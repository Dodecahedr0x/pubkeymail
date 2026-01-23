# Local Development Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable a local dev mode that uses in-memory storage instead of PostgreSQL and Redis, controlled by `USE_LOCAL_DEV=true` environment variable.

**Architecture:** Create abstraction layers for database and cache that can switch between production (PostgreSQL/Redis) and local (in-memory) implementations based on environment configuration. All existing code imports from central modules that will now be environment-aware.

**Tech Stack:** TypeScript, in-memory Map/storage, existing Express app

---

### Task 1: Update Configuration for Local Dev Mode

**Files:**
- Modify: `src/config/index.ts`
- Modify: `.env.example`

**Step 1: Update config schema to support local dev mode**

Add `USE_LOCAL_DEV` flag and make DATABASE_URL/REDIS_URL optional when in local dev mode.

**Step 2: Update .env.example with new flag**

Add documentation for local dev mode.

---

### Task 2: Create In-Memory Cache Client

**Files:**
- Create: `src/services/cache/memory-client.ts`

Implement an in-memory client that mimics the Redis client interface used in the codebase (get, set, setEx, del, ping, keys, etc.)

---

### Task 3: Create Cache Client Factory

**Files:**
- Modify: `src/services/cache/redis-client.ts`

Update `getRedisClient()` to return either Redis or in-memory client based on configuration.

---

### Task 4: Create In-Memory Database

**Files:**
- Create: `src/database/memory-db.ts`

Implement an in-memory database with the same interface as the PostgreSQL pool (query method that returns rows).

---

### Task 5: Update Database Connection Factory

**Files:**
- Modify: `src/database/connection.ts`

Update `db` singleton to return either PostgreSQL pool or in-memory DB based on configuration.

---

### Task 6: Update Auth Service to Use Memory Store in Local Dev

**Files:**
- Modify: `src/services/auth/index.ts`

Use MemoryNonceStore instead of RedisNonceStore when in local dev mode.

---

### Task 7: Add Tests for Local Dev Mode

**Files:**
- Create: `src/__tests__/local-dev-mode.test.ts`

Test that local dev mode initializes correctly and stores/retrieves data.

---

### Task 8: Update Package Scripts and Documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`

Add `dev:local` script and update documentation.
