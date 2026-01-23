# Email Cleanup Service Implementation

## Overview
The Email Cleanup Service automatically deletes expired emails for unregistered users according to the 30-day retention policy (configurable via `EMAIL_RETENTION_DAYS`).

## Components

### 1. EmailCleanupService (`src/services/email/cleanup-service.ts`)
Core service responsible for identifying and deleting expired emails.

**Key Features:**
- **Granular Deletion**: Deletes individual expired emails, NOT entire mailboxes
- **Safety Threshold**: Prevents accidental mass deletion (max 100,000 emails per run)
- **Batch Processing**: Processes deletions in configurable batches (default 1,000 emails per batch)
- **Transaction Safety**: Uses PostgreSQL transactions with rollback on error
- **Dry Run Mode**: Test cleanup without actually deleting data
- **Comprehensive Metrics**: Tracks deleted count, affected addresses, errors, duration

**Critical Safety Checks:**
- Only deletes emails where `expires_at IS NOT NULL AND expires_at < NOW()`
- Never touches registered user emails (`expires_at IS NULL`)
- Respects safety threshold to prevent accidental mass deletion
- Uses FOR UPDATE locks during transaction to prevent race conditions

**Public Methods:**
```typescript
// Get statistics without performing deletion
getCleanupStats(retentionDays?: number): Promise<CleanupStats>

// Perform cleanup with options
cleanupExpiredEmails(options?: CleanupOptions): Promise<CleanupResult>

// Preview emails that will be deleted
getExpiredEmailsPreview(limit?: number): Promise<Array<EmailPreview>>

// Admin function: force cleanup for specific address
cleanupAddressEmails(addressId: number, olderThanDays: number, dryRun?: boolean): Promise<number>
```

### 2. EmailCleanupScheduler (`src/services/email/cleanup-scheduler.ts`)
Scheduled task runner that executes cleanup on a cron schedule.

**Key Features:**
- **Configurable Schedule**: Defaults to daily at 2 AM UTC (via `CLEANUP_JOB_HOUR`)
- **Overlap Prevention**: Prevents multiple simultaneous cleanup runs
- **State Tracking**: Maintains stats (totalRuns, totalEmailsDeleted, lastRun, etc.)
- **Health Checks**: `isHealthy()` method for monitoring
- **Manual Trigger**: `runManualCleanup()` for admin operations
- **Graceful Shutdown**: `shutdownCleanupScheduler()` stops scheduler cleanly

**Configuration:**
```typescript
scheduler.start({
  cronExpression: '0 2 * * *',  // Daily at 2 AM UTC
  timezone: 'UTC',
  enabled: true,
  runOnStartup: false,          // Run immediately on app start
}, logger);
```

**Health Check Integration:**
```typescript
// For monitoring endpoints
const schedulerState = emailCleanupScheduler.getState();
const isHealthy = emailCleanupScheduler.isHealthy();

if (!isHealthy) {
  // Alert: Scheduler hasn't run in over 25 hours or last run had errors
}
```

## Configuration

### Environment Variables
```env
EMAIL_RETENTION_DAYS=30       # Days before emails expire
CLEANUP_JOB_HOUR=2            # Hour to run cleanup (0-23 UTC)
```

### Database Requirements
- PostgreSQL with case-sensitive collation
- `expires_at` column in `emails` table (TIMESTAMP, nullable)
- Indexes on `recipient_address_id` and `expires_at`

## Usage Examples

### Starting the Scheduler (Production)
```typescript
import { emailCleanupScheduler } from './services/email/index.js';

// Start with defaults (daily at 2 AM UTC)
emailCleanupScheduler.start({
  enabled: true,
  runOnStartup: false,
});

// Graceful shutdown on app exit
process.on('SIGTERM', () => {
  emailCleanupScheduler.stop();
});
```

### Manual Cleanup (Admin)
```typescript
import { emailCleanupScheduler } from './services/email/index.js';

// Dry run to preview
const dryRunResult = await emailCleanupScheduler.runManualCleanup(true);
console.log(`Would delete ${dryRunResult.deletedCount} emails`);

// Actual cleanup
const result = await emailCleanupScheduler.runManualCleanup(false);
console.log(`Deleted ${result.deletedCount} emails`);
```

### Health Check Endpoint
```typescript
import { emailCleanupScheduler } from './services/email/index.js';

app.get('/health/cleanup', (req, res) => {
  const state = emailCleanupScheduler.getState();
  const isHealthy = emailCleanupScheduler.isHealthy();

  res.json({
    healthy: isHealthy,
    lastRun: state.lastRun,
    totalRuns: state.totalRuns,
    totalEmailsDeleted: state.totalEmailsDeleted,
    isRunning: state.isRunning,
  });
});
```

### Monitoring & Alerting
```typescript
import { emailCleanupScheduler } from './services/email/index.js';

// Custom logger for external monitoring
emailCleanupScheduler.start({}, (result) => {
  if (!result.success || result.errorCount > 0) {
    // Send alert to Sentry, PagerDuty, etc.
    alerting.sendAlert({
      title: 'Email Cleanup Failed',
      deletedCount: result.deletedCount,
      errorCount: result.errorCount,
      errors: result.details.errors,
    });
  }

  // Send metrics to monitoring system
  metrics.gauge('cleanup.emails_deleted', result.deletedCount);
  metrics.gauge('cleanup.duration_ms', result.duration);
  metrics.gauge('cleanup.addresses_affected', result.details.addressesAffected);
});
```

## Testing

### Unit Tests (`src/services/email/__tests__/cleanup-service.test.ts`)
Comprehensive test suite covering:
- Statistics gathering
- Safety threshold enforcement
- Batch processing logic
- Transaction rollback on error
- Dry run mode
- Email preview functionality
- Admin cleanup functions
- Performance expectations

### Integration Testing
```bash
# Run all cleanup service tests
npm test src/services/email/__tests__/cleanup-service.test.ts

# Run with coverage
npm run test:coverage
```

## Dependencies

**Required:**
- `node-cron` (^3.0.3) - Cron job scheduler
- `pg` - PostgreSQL client (already installed)

**Dev Dependencies:**
- `@types/node-cron` - TypeScript types

## Installation

Add to `package.json`:
```json
{
  "dependencies": {
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.6"
  }
}
```

Then run:
```bash
npm install
```

## Monitoring Queries

### Check Expired Email Count
```sql
SELECT COUNT(*) as expired_count
FROM emails
WHERE expires_at IS NOT NULL AND expires_at < NOW();
```

### Find Addresses with Most Expired Emails
```sql
SELECT
  recipient_address_id,
  COUNT(*) as expired_count,
  MIN(expires_at) as oldest_expiry
FROM emails
WHERE expires_at IS NOT NULL AND expires_at < NOW()
GROUP BY recipient_address_id
ORDER BY expired_count DESC
LIMIT 10;
```

### Cleanup History (if logging to table)
```sql
-- Example cleanup_logs table structure
CREATE TABLE cleanup_logs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  deleted_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT FALSE
);
```

## Performance Considerations

### Batch Size Tuning
- **Default**: 1,000 emails per batch
- **Small datasets** (<10K emails): Use larger batches (5,000-10,000)
- **Large datasets** (>100K emails): Keep at 1,000 to avoid memory issues
- **Very large datasets**: Consider running multiple times with shorter maxBatches

### Index Optimization
Ensure these indexes exist:
```sql
CREATE INDEX idx_emails_expires ON emails(expires_at)
WHERE expires_at IS NOT NULL;

CREATE INDEX idx_emails_recipient_expires ON emails(recipient_address_id, expires_at);
```

### Cleanup Frequency
- **Low volume** (<1K emails/day): Weekly cleanup is sufficient
- **Medium volume** (1K-10K emails/day): Daily cleanup recommended
- **High volume** (>10K emails/day): Daily cleanup required, consider twice daily

## Troubleshooting

### Cleanup Not Running
1. Check scheduler is started: `emailCleanupScheduler.getState().isRunning`
2. Verify cron expression is valid
3. Check logs for errors
4. Ensure `CLEANUP_JOB_HOUR` is set correctly

### Slow Cleanup Performance
1. Check batch size (reduce if necessary)
2. Verify database indexes exist
3. Monitor database connection pool
4. Consider increasing `maxBatches` and running more frequently

### Safety Threshold Exceeded
If cleanup exceeds 100,000 emails:
1. Verify retention policy is correct
2. Check for data anomalies (bulk email imports?)
3. Increase threshold if legitimate (modify `SAFETY_THRESHOLD` constant)
4. Run manual cleanup in smaller batches

## Security Considerations

1. **Never delete registered user emails**: The service strictly enforces `expires_at IS NOT NULL`
2. **Transaction safety**: All deletions use transactions with rollback on error
3. **Audit trail**: Consider logging cleanup operations to separate table
4. **Admin functions**: `cleanupAddressEmails()` bypasses normal checks - use with caution
5. **Rate limiting**: Cleanup runs once per schedule, overlapping runs prevented

## Future Enhancements

Potential improvements for future versions:
- [ ] Soft delete with tombstone records for audit trail
- [ ] Archive to cold storage before deletion
- [ ] Configurable per-user retention policies
- [ ] Webhook notifications before email deletion
- [ ] Prometheus metrics export
- [ ] Cleanup pause/resume API
- [ ] Parallel batch processing for very large datasets

## Related Files

- Implementation: `src/services/email/cleanup-service.ts`
- Scheduler: `src/services/email/cleanup-scheduler.ts`
- Tests: `src/services/email/__tests__/cleanup-service.test.ts`
- Tests: `src/services/email/__tests__/cleanup-scheduler.test.ts`
- Config: `src/config/index.ts` (emailConfig)
- Database: `src/database/init.sql` (emails table schema)
