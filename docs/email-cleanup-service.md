# Email Cleanup Service Documentation

## Overview

The Email Cleanup Service is a critical component of PubKeyMail that automatically deletes expired emails for unregistered users while preserving emails for registered (paid) users indefinitely. This ensures compliance with the 30-day retention policy while maintaining data integrity.

## Architecture

### Components

1. **EmailCleanupService** (`src/services/email/cleanup-service.ts`)
   - Core cleanup logic with batch processing
   - Safety checks to prevent accidental mass deletion
   - Dry-run support for testing
   - Comprehensive metrics and monitoring

2. **EmailCleanupScheduler** (`src/services/email/cleanup-scheduler.ts`)
   - Cron-based scheduling (default: daily at 2 AM UTC)
   - Prevents overlapping executions
   - Health check support
   - Manual trigger capability

## Key Features

### Safety Mechanisms

1. **Safety Threshold**: Maximum 100,000 emails deleted per run
   - Prevents accidental mass deletion due to bugs or misconfigurations
   - Can be overridden for admin operations

2. **Granular Deletion**: Only deletes individual expired emails
   - Never deletes entire mailboxes
   - Preserves recent emails even if older ones expire

3. **Transaction-Based**: Uses database transactions
   - Ensures consistency
   - Automatic rollback on errors

4. **Case-Sensitive Handling**: Respects blockchain address case sensitivity
   - Critical for security
   - Maintains data integrity

### Retention Policy

- **Unregistered Users**: Emails deleted after 30 days (configurable via `EMAIL_RETENTION_DAYS`)
- **Registered Users**: Emails kept indefinitely (`expires_at = NULL`)
- **Grace Period**: Email expiration calculated at receipt time based on user status

## Usage

### Starting the Scheduler

```typescript
import { emailCleanupScheduler } from './services/email/index.js';

// Start with default configuration (daily at 2 AM UTC)
emailCleanupScheduler.start();

// Start with custom schedule
emailCleanupScheduler.start({
  cronExpression: '0 3 * * *', // 3 AM daily
  timezone: 'America/New_York',
  enabled: true,
  runOnStartup: false, // Run immediately on startup
});

// With custom logger
emailCleanupScheduler.start({}, async (result) => {
  console.log('Cleanup completed:', result);
  // Send to monitoring system, etc.
});
```

### Manual Cleanup

```typescript
import { emailCleanupScheduler } from './services/email/index.js';

// Dry run (preview what would be deleted)
const dryRunResult = await emailCleanupScheduler.runManualCleanup(true);
console.log(`Would delete ${dryRunResult.deletedCount} emails`);

// Actual cleanup
const result = await emailCleanupScheduler.runManualCleanup(false);
console.log(`Deleted ${result.deletedCount} emails in ${result.duration}ms`);
```

### Monitoring

```typescript
import { emailCleanupScheduler, emailCleanupService } from './services/email/index.js';

// Get scheduler state
const state = emailCleanupScheduler.getState();
console.log({
  isRunning: state.isRunning,
  lastRun: state.lastRun,
  totalEmailsDeleted: state.totalEmailsDeleted,
  totalErrors: state.totalErrors,
});

// Health check
const healthy = emailCleanupScheduler.isHealthy();
if (!healthy) {
  console.error('Cleanup scheduler is unhealthy!');
}

// Get cleanup statistics (without deleting)
const stats = await emailCleanupService.getCleanupStats();
console.log({
  totalEmails: stats.totalEmailsInSystem,
  expiredEmails: stats.expiredEmailsCount,
  registeredUserEmails: stats.registeredUserEmailsCount,
});

// Preview expired emails
const preview = await emailCleanupService.getExpiredEmailsPreview(10);
preview.forEach((email) => {
  console.log(`Email ${email.id} expires at ${email.expiresAt}`);
});
```

## Configuration

### Environment Variables

```env
# Email Retention
EMAIL_RETENTION_DAYS=30        # Retention period for unregistered users
CLEANUP_JOB_HOUR=2             # Hour (UTC) to run daily cleanup
```

### Scheduler Options

```typescript
interface SchedulerOptions {
  cronExpression?: string;  // Cron expression (default: daily at CLEANUP_JOB_HOUR)
  timezone?: string;        // Timezone for schedule (default: 'UTC')
  enabled?: boolean;        // Enable/disable scheduler (default: true)
  runOnStartup?: boolean;   // Run immediately on startup (default: false)
}
```

### Cleanup Options

```typescript
interface CleanupOptions {
  dryRun?: boolean;              // Preview without deleting (default: false)
  batchSize?: number;            // Emails per batch (default: 1000)
  maxBatches?: number;           // Max batches per run (default: 100)
  retentionOverrideDays?: number; // Override retention period
  beforeDate?: Date;             // Only delete emails expiring before this date
}
```

## Metrics and Monitoring

### Cleanup Result Structure

```typescript
interface CleanupResult {
  success: boolean;           // Overall success status
  deletedCount: number;       // Total emails deleted
  errorCount: number;         // Number of errors encountered
  duration: number;           // Duration in milliseconds
  timestamp: Date;            // When cleanup ran
  dryRun: boolean;           // Whether this was a dry run
  details: {
    totalExpired: number;         // Total expired emails found
    batchesProcessed: number;     // Number of batches processed
    addressesAffected: number;    // Unique addresses affected
    errors: Array<{               // Error details
      message: string;
      context?: any;
    }>;
  };
}
```

### Key Metrics to Monitor

1. **deletedCount**: Number of emails deleted per run
   - Alert if unusually high (potential bug)
   - Alert if zero for many consecutive runs (may indicate issue)

2. **errorCount**: Number of errors during cleanup
   - Alert if > 0 for critical monitoring

3. **duration**: How long cleanup took
   - Monitor for performance degradation
   - Typical: < 1 second for 1000 emails

4. **addressesAffected**: How many users affected
   - Useful for understanding cleanup impact

5. **Health Check**: `isHealthy()` status
   - Returns false if:
     - Scheduler not running
     - Last run had errors
     - Last run was too long ago (default: > 25 hours)

## Database Queries

### Cleanup Query Logic

The service uses this SQL pattern to identify expired emails:

```sql
DELETE FROM emails
WHERE expires_at IS NOT NULL    -- Only unregistered users
  AND expires_at < NOW()        -- Past expiration date
```

Key points:
- **NEVER** deletes emails with `expires_at IS NULL` (registered users)
- Uses indexed column `expires_at` for performance
- Batch processing to avoid memory issues

### Performance Considerations

1. **Batch Size**: Default 1000 emails per batch
   - Balances memory usage and transaction overhead
   - Adjust based on system resources

2. **Indexes**: Required for performance
   ```sql
   CREATE INDEX idx_emails_expires_at ON emails(expires_at)
   WHERE expires_at IS NOT NULL;
   ```

3. **Transactions**: Each batch in separate transaction
   - Reduces lock contention
   - Allows partial success if errors occur

## Testing

### Unit Tests

Comprehensive test suite in `src/services/email/__tests__/`:
- `cleanup-service.test.ts`: Service logic tests
- `cleanup-scheduler.test.ts`: Scheduler behavior tests

Run tests:
```bash
npm test src/services/email/__tests__/cleanup-service.test.ts
npm test src/services/email/__tests__/cleanup-scheduler.test.ts
```

### Integration Testing

```typescript
// Dry run to verify setup
const result = await emailCleanupService.cleanupExpiredEmails({
  dryRun: true,
});
console.log(`Would delete ${result.deletedCount} emails`);

// Preview what will be deleted
const preview = await emailCleanupService.getExpiredEmailsPreview(100);
preview.forEach((email) => {
  console.log(`${email.recipientEmail}: expires ${email.expiresAt}`);
});
```

## Troubleshooting

### No emails being deleted

1. Check if expired emails exist:
   ```typescript
   const stats = await emailCleanupService.getCleanupStats();
   console.log('Expired emails:', stats.expiredEmailsCount);
   ```

2. Verify scheduler is running:
   ```typescript
   const state = emailCleanupScheduler.getState();
   console.log('Last run:', state.lastRun);
   ```

3. Check for errors:
   ```typescript
   const state = emailCleanupScheduler.getState();
   if (state.lastResult?.details.errors.length > 0) {
     console.error('Errors:', state.lastResult.details.errors);
   }
   ```

### Safety threshold triggered

If cleanup fails with "Safety threshold exceeded":

1. This is intentional protection against mass deletion
2. Review why so many emails are expired
3. If legitimate, increase threshold or run manual cleanup in batches

### Performance issues

If cleanup is slow:

1. Check batch size (may need to reduce)
2. Verify database indexes exist
3. Monitor database connection pool
4. Consider running during off-peak hours

## Security Considerations

1. **Case Sensitivity**: All address comparisons are case-sensitive
   - Critical for blockchain address matching
   - Database uses `COLLATE "C"` for proper behavior

2. **Registered User Protection**: Multiple safeguards
   - SQL query explicitly checks `expires_at IS NULL`
   - User registration sets `expires_at = NULL`
   - No way to accidentally delete registered user emails

3. **Transaction Rollback**: Errors don't leave partial state
   - All-or-nothing per batch
   - Database consistency maintained

## Future Enhancements

1. **Metrics Export**: Send metrics to Prometheus/Datadog
2. **Alerting**: Automated alerts for cleanup failures
3. **Archive Mode**: Archive instead of delete (compliance)
4. **Tiered Retention**: Different retention for different user tiers
5. **Soft Delete**: Mark as deleted instead of immediate removal

## Integration Example

Complete integration in application startup:

```typescript
import express from 'express';
import {
  emailCleanupScheduler,
  shutdownCleanupScheduler,
} from './services/email/index.js';

const app = express();

// Start cleanup scheduler
emailCleanupScheduler.start({
  enabled: process.env.NODE_ENV !== 'test',
  runOnStartup: false,
}, async (result) => {
  // Custom logger
  console.log('[Cleanup]', {
    deleted: result.deletedCount,
    duration: result.duration,
    success: result.success,
  });

  // Send to monitoring system
  if (result.errorCount > 0) {
    // Alert on errors
    console.error('[Cleanup] Errors:', result.details.errors);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  shutdownCleanupScheduler();
  process.exit(0);
});

// Health check endpoint
app.get('/health', (req, res) => {
  const cleanupHealthy = emailCleanupScheduler.isHealthy();

  res.json({
    status: cleanupHealthy ? 'healthy' : 'unhealthy',
    cleanup: {
      healthy: cleanupHealthy,
      state: emailCleanupScheduler.getState(),
    },
  });
});

app.listen(3000);
```

## Summary

The Email Cleanup Service provides:
- ✅ Automated 30-day retention enforcement
- ✅ Granular, safe email deletion
- ✅ Comprehensive monitoring and metrics
- ✅ Flexible scheduling and manual triggers
- ✅ Transaction-based consistency
- ✅ Extensive test coverage
- ✅ Production-ready safety mechanisms

This service is critical for:
1. Compliance with retention policies
2. Managing storage costs
3. Maintaining system performance
4. User tier differentiation (free vs. paid)
