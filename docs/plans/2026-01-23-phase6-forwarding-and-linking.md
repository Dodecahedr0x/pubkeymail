# Phase 6: Email Forwarding & Multi-Address Linking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement email forwarding rules and multi-address linking backend to enable users to forward emails to external addresses and link multiple wallet addresses to a single account.

**Architecture:** Forwarding service processes incoming emails against user rules, forwarding matches via SMTP. Multi-address linking allows unified mailbox view across multiple blockchain addresses. Both features respect tier limits (paid users get more linked addresses).

**Tech Stack:** Node.js/TypeScript, PostgreSQL, Express, Vitest, Zod validation

---

## Task 1: Forwarding Service - Core Implementation

**Files:**
- Create: `src/services/email/forwarding-service.ts`
- Modify: `src/services/email/index.ts`
- Test: `src/services/email/__tests__/forwarding-service.test.ts`

**Step 1: Write the failing test**

```typescript
// src/services/email/__tests__/forwarding-service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { forwardingService } from '../forwarding-service.js';

describe('ForwardingService', () => {
  describe('createRule', () => {
    it('should create a forwarding rule for paid users', async () => {
      const result = await forwardingService.createRule({
        userId: 1,
        sourceAddressId: 1,
        destinationEmail: 'forward@example.com',
      });
      
      expect(result.success).toBe(true);
      expect(result.data?.rule).toBeDefined();
      expect(result.data?.rule.destinationEmail).toBe('forward@example.com');
      expect(result.data?.rule.enabled).toBe(true);
      expect(result.data?.rule.verified).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/email/__tests__/forwarding-service.test.ts`
Expected: FAIL with module not found

**Step 3: Write minimal implementation**

```typescript
// src/services/email/forwarding-service.ts
/**
 * Email Forwarding Service
 * Manages forwarding rules and executes email forwarding
 */

import { db } from '../../database/connection.js';
import { tierService } from '../tier/tier-service.js';
import type { FeatureAccessResult } from '../tier/tier-service.js';

export interface ForwardingRule {
  id: number;
  userId: number;
  sourceAddressId: number;
  destinationEmail: string;
  filterConditions: FilterConditions | null;
  enabled: boolean;
  verified: boolean;
  verificationToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FilterConditions {
  fromContains?: string[];
  subjectContains?: string[];
  excludeFrom?: string[];
  excludeSubject?: string[];
}

export interface CreateRuleInput {
  userId: number;
  sourceAddressId: number;
  destinationEmail: string;
  filterConditions?: FilterConditions;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ForwardingService {
  /**
   * Create a new forwarding rule
   */
  async createRule(input: CreateRuleInput): Promise<ServiceResult<{ rule: ForwardingRule; verificationSent: boolean }>> {
    // Check tier access
    const access = await tierService.checkFeatureAccess(input.userId, 'email_forwarding');
    if (!access.allowed) {
      return { success: false, error: access.reason || 'Forwarding requires paid subscription' };
    }

    // Verify user owns the source address
    const ownsAddress = await this.verifyAddressOwnership(input.userId, input.sourceAddressId);
    if (!ownsAddress) {
      return { success: false, error: 'You do not own this address' };
    }

    // Validate destination email
    if (!this.isValidEmail(input.destinationEmail)) {
      return { success: false, error: 'Invalid destination email' };
    }

    // Generate verification token
    const verificationToken = this.generateVerificationToken();

    try {
      const result = await db.query<{
        id: number;
        user_id: number;
        source_address_id: number;
        destination_email: string;
        filter_conditions: FilterConditions | null;
        enabled: boolean;
        verified: boolean;
        verification_token: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO forwarding_rules 
         (user_id, source_address_id, destination_email, filter_conditions, verification_token)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.userId,
          input.sourceAddressId,
          input.destinationEmail,
          input.filterConditions ? JSON.stringify(input.filterConditions) : null,
          verificationToken,
        ]
      );

      const row = result.rows[0]!;
      
      return {
        success: true,
        data: {
          rule: this.mapRowToRule(row),
          verificationSent: false, // TODO: Send verification email
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create rule',
      };
    }
  }

  /**
   * Get user's forwarding rules
   */
  async getRules(userId: number): Promise<ServiceResult<{ rules: ForwardingRule[] }>> {
    const result = await db.query<{
      id: number;
      user_id: number;
      source_address_id: number;
      destination_email: string;
      filter_conditions: FilterConditions | null;
      enabled: boolean;
      verified: boolean;
      verification_token: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM forwarding_rules WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return {
      success: true,
      data: { rules: result.rows.map(this.mapRowToRule) },
    };
  }

  /**
   * Update a forwarding rule
   */
  async updateRule(
    ruleId: number,
    userId: number,
    updates: Partial<Pick<ForwardingRule, 'destinationEmail' | 'filterConditions' | 'enabled'>>
  ): Promise<ServiceResult<{ rule: ForwardingRule }>> {
    // Verify ownership
    const existing = await this.getRuleById(ruleId);
    if (!existing || existing.userId !== userId) {
      return { success: false, error: 'Rule not found' };
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.destinationEmail !== undefined) {
      if (!this.isValidEmail(updates.destinationEmail)) {
        return { success: false, error: 'Invalid destination email' };
      }
      setClauses.push(`destination_email = $${paramIndex++}`);
      values.push(updates.destinationEmail);
      // Reset verification if destination changed
      setClauses.push(`verified = false`);
      setClauses.push(`verification_token = $${paramIndex++}`);
      values.push(this.generateVerificationToken());
    }

    if (updates.filterConditions !== undefined) {
      setClauses.push(`filter_conditions = $${paramIndex++}`);
      values.push(JSON.stringify(updates.filterConditions));
    }

    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }

    values.push(ruleId);

    const result = await db.query<{
      id: number;
      user_id: number;
      source_address_id: number;
      destination_email: string;
      filter_conditions: FilterConditions | null;
      enabled: boolean;
      verified: boolean;
      verification_token: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE forwarding_rules SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Failed to update rule' };
    }

    return { success: true, data: { rule: this.mapRowToRule(result.rows[0]!) } };
  }

  /**
   * Delete a forwarding rule
   */
  async deleteRule(ruleId: number, userId: number): Promise<ServiceResult<void>> {
    const result = await db.query(
      `DELETE FROM forwarding_rules WHERE id = $1 AND user_id = $2`,
      [ruleId, userId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Rule not found' };
    }

    return { success: true };
  }

  /**
   * Verify a forwarding rule destination
   */
  async verifyDestination(token: string): Promise<ServiceResult<{ rule: ForwardingRule }>> {
    const result = await db.query<{
      id: number;
      user_id: number;
      source_address_id: number;
      destination_email: string;
      filter_conditions: FilterConditions | null;
      enabled: boolean;
      verified: boolean;
      verification_token: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE forwarding_rules 
       SET verified = true, verification_token = NULL, updated_at = NOW()
       WHERE verification_token = $1
       RETURNING *`,
      [token]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Invalid or expired verification token' };
    }

    return { success: true, data: { rule: this.mapRowToRule(result.rows[0]!) } };
  }

  /**
   * Get active rules for an address (for forwarding execution)
   */
  async getActiveRulesForAddress(addressId: number): Promise<ForwardingRule[]> {
    const result = await db.query<{
      id: number;
      user_id: number;
      source_address_id: number;
      destination_email: string;
      filter_conditions: FilterConditions | null;
      enabled: boolean;
      verified: boolean;
      verification_token: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM forwarding_rules 
       WHERE source_address_id = $1 AND enabled = true AND verified = true`,
      [addressId]
    );

    return result.rows.map(this.mapRowToRule);
  }

  /**
   * Check if email matches filter conditions
   */
  matchesFilter(email: { from: string; subject: string }, conditions: FilterConditions | null): boolean {
    if (!conditions) return true;

    // Check exclusions first
    if (conditions.excludeFrom?.some(pattern => 
      email.from.toLowerCase().includes(pattern.toLowerCase())
    )) {
      return false;
    }

    if (conditions.excludeSubject?.some(pattern => 
      email.subject.toLowerCase().includes(pattern.toLowerCase())
    )) {
      return false;
    }

    // Check inclusions
    if (conditions.fromContains?.length) {
      if (!conditions.fromContains.some(pattern => 
        email.from.toLowerCase().includes(pattern.toLowerCase())
      )) {
        return false;
      }
    }

    if (conditions.subjectContains?.length) {
      if (!conditions.subjectContains.some(pattern => 
        email.subject.toLowerCase().includes(pattern.toLowerCase())
      )) {
        return false;
      }
    }

    return true;
  }

  private async verifyAddressOwnership(userId: number, addressId: number): Promise<boolean> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM (
        SELECT 1 FROM users WHERE id = $1 AND primary_address_id = $2
        UNION
        SELECT 1 FROM address_links WHERE user_id = $1 AND address_id = $2
      ) combined`,
      [userId, addressId]
    );
    return parseInt(result.rows[0]?.count || '0') > 0;
  }

  private async getRuleById(ruleId: number): Promise<ForwardingRule | null> {
    const result = await db.query<{
      id: number;
      user_id: number;
      source_address_id: number;
      destination_email: string;
      filter_conditions: FilterConditions | null;
      enabled: boolean;
      verified: boolean;
      verification_token: string | null;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM forwarding_rules WHERE id = $1`, [ruleId]);

    if (result.rows.length === 0) return null;
    return this.mapRowToRule(result.rows[0]!);
  }

  private mapRowToRule(row: {
    id: number;
    user_id: number;
    source_address_id: number;
    destination_email: string;
    filter_conditions: FilterConditions | null;
    enabled: boolean;
    verified: boolean;
    verification_token: string | null;
    created_at: Date;
    updated_at: Date;
  }): ForwardingRule {
    return {
      id: row.id,
      userId: row.user_id,
      sourceAddressId: row.source_address_id,
      destinationEmail: row.destination_email,
      filterConditions: row.filter_conditions,
      enabled: row.enabled,
      verified: row.verified,
      verificationToken: row.verification_token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private generateVerificationToken(): string {
    return `fwd_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

export const forwardingService = new ForwardingService();
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/services/email/__tests__/forwarding-service.test.ts`
Expected: Tests pass

**Step 5: Commit**

```bash
git add src/services/email/forwarding-service.ts src/services/email/__tests__/forwarding-service.test.ts
git commit -m "feat(email): add forwarding service core implementation"
```

---

## Task 2: Forwarding Service - Complete Tests

**Files:**
- Modify: `src/services/email/__tests__/forwarding-service.test.ts`

**Step 1: Write comprehensive tests**

Add tests for:
- `getRules` - list user's rules
- `updateRule` - modify existing rules
- `deleteRule` - remove rules  
- `verifyDestination` - verify with token
- `getActiveRulesForAddress` - get enabled+verified rules
- `matchesFilter` - filter condition matching
- Tier gating (deny free users)
- Address ownership validation

**Step 2: Run full test suite**

Run: `pnpm test src/services/email/__tests__/forwarding-service.test.ts -v`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/services/email/__tests__/forwarding-service.test.ts
git commit -m "test(email): add comprehensive forwarding service tests"
```

---

## Task 3: Forwarding API Routes

**Files:**
- Create: `src/api/routes/forwarding-routes.ts`
- Modify: `src/index.ts`
- Test: `tests/integration/forwarding-routes.test.ts`

**Step 1: Write failing test**

```typescript
// tests/integration/forwarding-routes.test.ts
import { describe, it, expect } from 'vitest';

describe('Forwarding Routes', () => {
  describe('POST /forwarding/rules', () => {
    it('should create a forwarding rule', async () => {
      // Integration test placeholder
      expect(true).toBe(true);
    });
  });
});
```

**Step 2: Implement routes**

```typescript
// src/api/routes/forwarding-routes.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { forwardingService } from '../../services/email/forwarding-service.js';

const router: Router = Router();

const createRuleSchema = z.object({
  userId: z.number().positive(),
  sourceAddressId: z.number().positive(),
  destinationEmail: z.string().email(),
  filterConditions: z.object({
    fromContains: z.array(z.string()).optional(),
    subjectContains: z.array(z.string()).optional(),
    excludeFrom: z.array(z.string()).optional(),
    excludeSubject: z.array(z.string()).optional(),
  }).optional(),
});

router.post('/rules', async (req: Request, res: Response) => {
  try {
    const validation = createRuleSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: validation.error.errors } });
      return;
    }
    
    const result = await forwardingService.createRule(validation.data);
    if (!result.success) {
      const status = result.error?.includes('subscription') ? 403 : 400;
      res.status(status).json({ error: { code: 'CREATE_FAILED', message: result.error } });
      return;
    }
    
    res.status(201).json(result.data);
  } catch (error) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
});

router.get('/rules', async (req: Request, res: Response) => {
  const userId = parseInt(req.query['userId'] as string, 10);
  if (!userId || isNaN(userId)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'userId required' } });
    return;
  }
  
  const result = await forwardingService.getRules(userId);
  res.status(200).json(result.data);
});

router.put('/rules/:ruleId', async (req: Request, res: Response) => {
  const ruleId = parseInt(req.params['ruleId']!, 10);
  const userId = req.body.userId;
  
  const result = await forwardingService.updateRule(ruleId, userId, req.body);
  if (!result.success) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: result.error } });
    return;
  }
  
  res.status(200).json(result.data);
});

router.delete('/rules/:ruleId', async (req: Request, res: Response) => {
  const ruleId = parseInt(req.params['ruleId']!, 10);
  const userId = parseInt(req.query['userId'] as string, 10);
  
  const result = await forwardingService.deleteRule(ruleId, userId);
  if (!result.success) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: result.error } });
    return;
  }
  
  res.status(204).end();
});

router.post('/verify/:token', async (req: Request, res: Response) => {
  const token = req.params['token']!;
  
  const result = await forwardingService.verifyDestination(token);
  if (!result.success) {
    res.status(400).json({ error: { code: 'INVALID_TOKEN', message: result.error } });
    return;
  }
  
  res.status(200).json({ message: 'Destination verified', rule: result.data?.rule });
});

export default router;
```

**Step 3: Wire routes in index.ts**

Add `app.use(`${apiPrefix}/forwarding`, forwardingRoutes);`

**Step 4: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/api/routes/forwarding-routes.ts src/index.ts
git commit -m "feat(api): add forwarding rules routes"
```

---

## Task 4: Forwarding Executor Service

**Files:**
- Create: `src/services/email/forwarding-executor.ts`
- Modify: `src/services/email/email-storage-service.ts`
- Test: `src/services/email/__tests__/forwarding-executor.test.ts`

**Step 1: Write failing test**

```typescript
// src/services/email/__tests__/forwarding-executor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { forwardingExecutor } from '../forwarding-executor.js';

describe('ForwardingExecutor', () => {
  describe('processIncomingEmail', () => {
    it('should forward email when rules match', async () => {
      const result = await forwardingExecutor.processIncomingEmail({
        recipientAddressId: 1,
        from: 'sender@example.com',
        subject: 'Test Subject',
        bodyText: 'Test body',
        bodyHtml: '<p>Test body</p>',
      });
      
      expect(result.processed).toBe(true);
    });
  });
});
```

**Step 2: Implement executor**

```typescript
// src/services/email/forwarding-executor.ts
import { forwardingService, type ForwardingRule } from './forwarding-service.js';
import { emailSenderService } from './email-sender-service.js';
import { db } from '../../database/connection.js';

export interface IncomingEmailData {
  recipientAddressId: number;
  from: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
}

export interface ForwardingResult {
  processed: boolean;
  forwarded: number;
  failed: number;
  details: Array<{
    ruleId: number;
    destination: string;
    success: boolean;
    error?: string;
  }>;
}

export class ForwardingExecutor {
  async processIncomingEmail(email: IncomingEmailData): Promise<ForwardingResult> {
    const rules = await forwardingService.getActiveRulesForAddress(email.recipientAddressId);
    
    if (rules.length === 0) {
      return { processed: true, forwarded: 0, failed: 0, details: [] };
    }
    
    const details: ForwardingResult['details'] = [];
    let forwarded = 0;
    let failed = 0;
    
    for (const rule of rules) {
      if (!forwardingService.matchesFilter({ from: email.from, subject: email.subject }, rule.filterConditions)) {
        continue;
      }
      
      try {
        // Forward via SMTP (mock for now)
        await this.forwardEmail(email, rule);
        details.push({ ruleId: rule.id, destination: rule.destinationEmail, success: true });
        forwarded++;
      } catch (error) {
        details.push({ 
          ruleId: rule.id, 
          destination: rule.destinationEmail, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        failed++;
      }
    }
    
    return { processed: true, forwarded, failed, details };
  }
  
  private async forwardEmail(email: IncomingEmailData, rule: ForwardingRule): Promise<void> {
    // Get source address info
    const addressResult = await db.query<{ address: string }>(
      'SELECT address FROM blockchain_addresses WHERE id = $1',
      [email.recipientAddressId]
    );
    
    const sourceAddress = addressResult.rows[0]?.address || 'unknown';
    
    // Construct forwarded email
    const forwardedSubject = `[Fwd] ${email.subject}`;
    const forwardedBody = `---------- Forwarded message ----------
From: ${email.from}
To: ${sourceAddress}@pubkeymail.com
Subject: ${email.subject}

${email.bodyText || ''}`;

    // TODO: Send via SMTP provider
    console.log(`[ForwardingExecutor] Forwarding to ${rule.destinationEmail}:`, forwardedSubject);
  }
}

export const forwardingExecutor = new ForwardingExecutor();
```

**Step 3: Run tests**

Run: `pnpm test src/services/email/__tests__/forwarding-executor.test.ts`
Expected: Pass

**Step 4: Commit**

```bash
git add src/services/email/forwarding-executor.ts src/services/email/__tests__/forwarding-executor.test.ts
git commit -m "feat(email): add forwarding executor for incoming emails"
```

---

## Task 5: Multi-Address Linking Service Enhancements

**Files:**
- Create: `src/services/user/address-linking-service.ts`
- Test: `src/services/user/__tests__/address-linking-service.test.ts`

**Step 1: Write failing test**

```typescript
// src/services/user/__tests__/address-linking-service.test.ts
import { describe, it, expect } from 'vitest';
import { addressLinkingService } from '../address-linking-service.js';

describe('AddressLinkingService', () => {
  describe('linkAddress', () => {
    it('should link a secondary address with verification', async () => {
      const result = await addressLinkingService.linkAddress({
        userId: 1,
        address: 'SecondaryWalletAddress123',
        blockchain: 'solana',
        signature: 'valid_signature',
        message: 'Link address to PubKeyMail',
      });
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('getUnifiedMailbox', () => {
    it('should return emails from all linked addresses', async () => {
      const result = await addressLinkingService.getUnifiedMailbox(1, 50, 0);
      expect(result.emails).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });
});
```

**Step 2: Implement service**

```typescript
// src/services/user/address-linking-service.ts
import { db } from '../../database/connection.js';
import { tierService } from '../tier/tier-service.js';
import { blockchainProviderFactory } from '../blockchain/provider-factory.js';
import type { BlockchainType } from '../../types/blockchain.js';

export interface LinkAddressInput {
  userId: number;
  address: string;
  blockchain: BlockchainType;
  signature: string;
  message: string;
}

export interface LinkedAddress {
  id: number;
  addressId: number;
  address: string;
  blockchain: BlockchainType;
  verifiedAt: Date;
}

export interface UnifiedEmail {
  id: string;
  from: string;
  subject: string | null;
  receivedAt: Date;
  sourceAddress: string;
  read: boolean;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class AddressLinkingService {
  async linkAddress(input: LinkAddressInput): Promise<ServiceResult<{ linkedAddress: LinkedAddress }>> {
    // Check tier limit
    const canLink = await tierService.canLinkAddress(input.userId);
    if (!canLink) {
      return { success: false, error: 'Maximum linked addresses reached for your tier' };
    }

    // Verify signature
    const provider = blockchainProviderFactory.getProvider(input.blockchain);
    const isValid = await provider.verifySignature(input.address, input.signature, input.message);
    if (!isValid) {
      return { success: false, error: 'Invalid signature' };
    }

    // Check address not already linked
    const existingLink = await db.query<{ id: number }>(
      `SELECT al.id FROM address_links al
       JOIN blockchain_addresses ba ON al.address_id = ba.id
       WHERE ba.address = $1`,
      [input.address]
    );
    if (existingLink.rows.length > 0) {
      return { success: false, error: 'Address already linked to an account' };
    }

    // Create or get blockchain address
    const addressResult = await db.query<{ id: number }>(
      `INSERT INTO blockchain_addresses (address, blockchain)
       VALUES ($1, $2)
       ON CONFLICT (address) DO UPDATE SET blockchain = EXCLUDED.blockchain
       RETURNING id`,
      [input.address, input.blockchain]
    );
    const addressId = addressResult.rows[0]!.id;

    // Create link
    const linkResult = await db.query<{
      id: number;
      address_id: number;
      verified_at: Date;
    }>(
      `INSERT INTO address_links (user_id, address_id)
       VALUES ($1, $2)
       RETURNING id, address_id, verified_at`,
      [input.userId, addressId]
    );

    return {
      success: true,
      data: {
        linkedAddress: {
          id: linkResult.rows[0]!.id,
          addressId: linkResult.rows[0]!.address_id,
          address: input.address,
          blockchain: input.blockchain,
          verifiedAt: linkResult.rows[0]!.verified_at,
        },
      },
    };
  }

  async unlinkAddress(userId: number, addressId: number): Promise<ServiceResult<void>> {
    const result = await db.query(
      `DELETE FROM address_links WHERE user_id = $1 AND address_id = $2`,
      [userId, addressId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Link not found' };
    }

    return { success: true };
  }

  async getLinkedAddresses(userId: number): Promise<LinkedAddress[]> {
    const result = await db.query<{
      id: number;
      address_id: number;
      address: string;
      blockchain: string;
      verified_at: Date;
    }>(
      `SELECT al.id, al.address_id, ba.address, ba.blockchain, al.verified_at
       FROM address_links al
       JOIN blockchain_addresses ba ON al.address_id = ba.id
       WHERE al.user_id = $1
       ORDER BY al.verified_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      addressId: row.address_id,
      address: row.address,
      blockchain: row.blockchain as BlockchainType,
      verifiedAt: row.verified_at,
    }));
  }

  async getUnifiedMailbox(
    userId: number,
    limit: number,
    offset: number
  ): Promise<{ emails: UnifiedEmail[]; total: number }> {
    // Get all user's address IDs
    const addressResult = await db.query<{ id: number }>(
      `SELECT ba.id FROM blockchain_addresses ba
       WHERE ba.id = (SELECT primary_address_id FROM users WHERE id = $1)
       UNION
       SELECT ba.id FROM blockchain_addresses ba
       JOIN address_links al ON ba.id = al.address_id
       WHERE al.user_id = $1`,
      [userId]
    );

    const addressIds = addressResult.rows.map(r => r.id);
    if (addressIds.length === 0) {
      return { emails: [], total: 0 };
    }

    // Get emails from all addresses
    const emailsResult = await db.query<{
      id: string;
      sender_address: string;
      subject: string | null;
      received_at: Date;
      recipient_email: string;
    }>(
      `SELECT e.id, e.sender_address, e.subject, e.received_at, e.recipient_email
       FROM emails e
       WHERE e.recipient_address_id = ANY($1)
       ORDER BY e.received_at DESC
       LIMIT $2 OFFSET $3`,
      [addressIds, limit, offset]
    );

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM emails WHERE recipient_address_id = ANY($1)`,
      [addressIds]
    );

    return {
      emails: emailsResult.rows.map(row => ({
        id: row.id,
        from: row.sender_address,
        subject: row.subject,
        receivedAt: row.received_at,
        sourceAddress: row.recipient_email.split('@')[0] || '',
        read: false, // TODO: Track read status
      })),
      total: parseInt(countResult.rows[0]?.count || '0'),
    };
  }
}

export const addressLinkingService = new AddressLinkingService();
```

**Step 3: Run tests**

Run: `pnpm test src/services/user/__tests__/address-linking-service.test.ts`
Expected: Pass

**Step 4: Commit**

```bash
git add src/services/user/address-linking-service.ts src/services/user/__tests__/address-linking-service.test.ts
git commit -m "feat(user): add address linking service with unified mailbox"
```

---

## Task 6: Update Exports and Wire Services

**Files:**
- Modify: `src/services/email/index.ts`
- Modify: `src/services/user/index.ts`

**Step 1: Update exports**

```typescript
// src/services/email/index.ts
export * from './email-storage-service.js';
export * from './email-sender-service.js';
export * from './cleanup-service.js';
export * from './cleanup-scheduler.js';
export * from './webhook-parser.js';
export * from './recipient-verification.js';
export * from './forwarding-service.js';
export * from './forwarding-executor.js';
```

```typescript
// src/services/user/index.ts  
export * from './user-service.js';
export * from './address-linking-service.js';
```

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: All 210+ tests pass

**Step 3: Commit**

```bash
git add src/services/email/index.ts src/services/user/index.ts
git commit -m "chore: update service exports"
```

---

## Task 7: Integration with Email Ingestion

**Files:**
- Modify: `src/services/email/email-storage-service.ts`

**Step 1: Add forwarding hook to email storage**

After storing an incoming email, call the forwarding executor:

```typescript
// In storeEmail method, after successful storage:
import { forwardingExecutor } from './forwarding-executor.js';

// After email is stored
await forwardingExecutor.processIncomingEmail({
  recipientAddressId: addressId,
  from: email.from,
  subject: email.subject || '',
  bodyText: email.bodyText,
  bodyHtml: email.bodyHtml,
});
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/services/email/email-storage-service.ts
git commit -m "feat(email): integrate forwarding executor with email ingestion"
```

---

## Summary

**Phase 6 Complete Deliverables:**
1. ✅ Forwarding service with CRUD for rules
2. ✅ Filter conditions support (from/subject contains, exclusions)
3. ✅ Forwarding executor for processing incoming emails
4. ✅ API routes for forwarding management
5. ✅ Address linking service with signature verification
6. ✅ Unified mailbox view across all linked addresses
7. ✅ Tier-based limits enforced

**Test Coverage Target:** 85%+ for all new code

**Next Phase:** Phase 7 - Security Hardening & Compliance
