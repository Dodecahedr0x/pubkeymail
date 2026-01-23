# Redis Integration - PubKeyMail

## Overview
This document describes the Redis integration implemented for PubKeyMail, specifically focusing on the authentication nonce storage system.

## Implementation Date
January 23, 2026

## Components

### 1. Redis Client (`src/services/cache/redis-client.ts`)
Singleton Redis connection manager with the following features:

#### Features
- **Lazy Connection**: Connects on first use, not at module load time
- **Singleton Pattern**: Single shared connection across the application
- **Auto-Reconnection**: Exponential backoff retry strategy (max 10 retries)
- **Health Monitoring**: Ping functionality to check connection status
- **Graceful Shutdown**: Clean disconnect via `disconnectRedis()`
- **Connection Events**: Logs for connect, ready, error, and reconnecting states

#### Key Functions
```typescript
getRedisClient(): Promise<RedisClientType>  // Get or create client
disconnectRedis(): Promise<void>            // Clean shutdown
isRedisConnected(): boolean                 // Connection status check
pingRedis(): Promise<boolean>               // Health check
```

#### Configuration
Uses environment variables from `config/index.ts`:
- `REDIS_URL`: Redis connection string (e.g., `redis://localhost:6379`)
- `REDIS_KEY_PREFIX`: Namespace prefix for all keys (default: `pubkeymail:`)
- `REDIS_DEFAULT_TTL`: Default TTL in seconds (default: 3600)

### 2. Nonce Store (`src/services/cache/nonce-store.ts`)
Low-level Redis operations for nonce management.

#### Storage Format
```typescript
interface StoredNonce {
  nonce: string;              // Unique nonce value
  address: string;            // Blockchain address
  blockchain: string;         // Blockchain type (solana, ethereum, etc.)
  challengeMessage: string;   // Message that was signed
  expiresAt: number;         // Expiration timestamp (ms)
  used: boolean;             // Replay attack prevention flag
}
```

#### Key Format
All nonce keys follow the pattern: `{REDIS_KEY_PREFIX}nonce:{nonce}`
Example: `pubkeymail:nonce:abc123def456...`

#### Functions
- `storeNonce(nonceData)`: Store nonce with auto-expiration via TTL
- `getNonce(nonce)`: Retrieve nonce data or null if expired/missing
- `markNonceAsUsed(nonce)`: Mark nonce as used while preserving TTL
- `deleteNonce(nonce)`: Immediately invalidate a nonce
- `isNonceValid(nonce)`: Check if nonce exists, unused, and not expired
- `cleanupExpiredNonces()`: No-op (Redis TTL handles cleanup automatically)

#### TTL Behavior
- Nonces are stored with TTL = `AUTH_NONCE_EXPIRATION` (default: 300 seconds)
- Redis automatically removes expired keys
- No manual cleanup required
- `markNonceAsUsed()` preserves remaining TTL

### 3. Redis Nonce Store Adapter (`src/services/cache/redis-nonce-store.ts`)
Implements the `INonceStore` interface required by `AuthService`.

#### Purpose
Bridges the gap between:
- `AuthService` internal nonce format (`AuthNonce`)
- Redis storage format (`StoredNonce`)

#### Implementation Details
```typescript
class RedisNonceStore implements INonceStore {
  async save(nonce: AuthNonce): Promise<void>
  async get(nonceValue: string): Promise<AuthNonce | null>
  async markUsed(nonceValue: string): Promise<void>
  async cleanup(): Promise<number>  // No-op for Redis
}
```

#### Type Conversion
Converts between:
- `AuthNonce.challenge` ↔ `StoredNonce.challengeMessage`
- `AuthNonce.expiresAt: Date` ↔ `StoredNonce.expiresAt: number`
- Reconstructs `createdAt` from `expiresAt` (approximation)

### 4. AuthService Integration (`src/services/auth/index.ts`)
Production auth service now uses Redis by default.

#### Before
```typescript
export const authService = new AuthService();  // In-memory store
```

#### After
```typescript
import { RedisNonceStore } from '../cache/redis-nonce-store.js';
export const authService = new AuthService(new RedisNonceStore());
```

## Benefits

### 1. Distributed Authentication
- Multiple API server instances can share nonce state
- Horizontal scaling without session affinity requirements
- Consistent authentication across load-balanced servers

### 2. Automatic Cleanup
- Redis TTL handles expiration natively
- No cron jobs or cleanup workers needed for nonces
- Reduced operational complexity

### 3. Replay Attack Prevention
- Nonces marked as "used" remain in Redis until TTL expires
- Prevents same nonce from being used twice
- Attack window limited to TTL duration

### 4. Production-Ready
- Reconnection logic handles network failures
- Singleton pattern prevents connection leaks
- Health checks enable monitoring integration

## Testing Considerations

### Unit Tests
Auth service tests continue to use in-memory nonce store:
```typescript
const authService = new AuthService();  // Uses MemoryNonceStore
```

### Integration Tests
For testing Redis integration:
```typescript
const authService = new AuthService(new RedisNonceStore());
// Requires Redis running at REDIS_URL
```

### Test Isolation
- Use unique `REDIS_KEY_PREFIX` per test suite
- Clear test keys in `beforeEach` hooks
- Use separate Redis database for tests (DB 1 vs DB 0)

## Configuration

### Environment Variables
```bash
# Production
REDIS_URL=redis://your-redis-host:6379
REDIS_KEY_PREFIX=pubkeymail:
REDIS_DEFAULT_TTL=3600
AUTH_NONCE_EXPIRATION=300

# Testing
REDIS_URL=redis://localhost:6379/1  # Use DB 1 for tests
REDIS_KEY_PREFIX=pubkeymail_test:
```

### Docker Compose
```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  command: redis-server --appendonly yes
```

## Monitoring

### Health Checks
```typescript
import { pingRedis } from '@/services/cache';

const isHealthy = await pingRedis();
if (!isHealthy) {
  // Alert: Redis connection failed
}
```

### Metrics to Track
- Redis connection pool size
- Nonce creation rate (keys/second)
- Nonce expiration rate
- Memory usage for nonce keys
- Failed connection attempts
- Average TTL remaining on active nonces

### Redis CLI Commands
```bash
# Count active nonces
redis-cli KEYS "pubkeymail:nonce:*" | wc -l

# View a specific nonce
redis-cli GET "pubkeymail:nonce:{nonce-value}"

# Check TTL of a nonce
redis-cli TTL "pubkeymail:nonce:{nonce-value}"

# Clear all test nonces
redis-cli --scan --pattern "pubkeymail_test:nonce:*" | xargs redis-cli DEL
```

## Performance Characteristics

### Latency
- `storeNonce`: ~1-2ms (single SET operation)
- `getNonce`: ~1ms (single GET operation)
- `markNonceAsUsed`: ~2-3ms (GET + SET operations)

### Memory Usage
- ~200 bytes per nonce (JSON storage)
- Example: 10,000 active nonces = ~2MB memory
- Auto-cleanup via TTL prevents memory growth

### Scalability
- Redis can handle 100k+ operations/second
- Bottleneck will be application logic, not Redis
- Consider Redis Cluster for >1M nonces/minute

## Migration Path

### Phase 1: Development (Current)
- Redis nonce store implemented
- In-memory fallback for tests
- Docker Compose for local Redis

### Phase 2: Staging
- Deploy Redis instance
- Enable Redis nonce store in staging environment
- Monitor error rates and performance

### Phase 3: Production
- Deploy Redis with high availability (Redis Sentinel/Cluster)
- Enable Redis nonce store in production
- Implement monitoring and alerting
- Document runbook for Redis failures

## Troubleshooting

### Connection Failures
**Symptom**: "Redis Client Error: connect ECONNREFUSED"

**Solution**:
1. Check Redis is running: `redis-cli ping`
2. Verify REDIS_URL in .env
3. Check network connectivity
4. Review Redis logs: `docker-compose logs redis`

### Memory Issues
**Symptom**: Redis memory usage growing indefinitely

**Diagnosis**:
```bash
# Check memory usage
redis-cli INFO memory

# Find keys without TTL
redis-cli --scan --pattern "pubkeymail:nonce:*" | while read key; do
  ttl=$(redis-cli TTL "$key")
  if [ "$ttl" = "-1" ]; then
    echo "No TTL: $key"
  fi
done
```

**Solution**: Ensure all nonces have TTL set via `setEx` command

### Nonce Reuse Detected
**Symptom**: Authentication fails with "Nonce has already been used"

**Diagnosis**:
- Check if nonce was marked as used
- Verify TTL hasn't expired
- Check for clock skew between servers

## Future Enhancements

### Potential Improvements
1. **Nonce Rotation**: Implement nonce pools for high-traffic scenarios
2. **Compression**: Use MessagePack instead of JSON for storage efficiency
3. **Replication**: Add read replicas for GET-heavy workloads
4. **Monitoring**: Integrate with Prometheus for metrics collection
5. **Rate Limiting**: Use Redis for authentication rate limiting per address

### Alternative Approaches
- **PostgreSQL**: Store nonces in database with indexes (slower, but simpler)
- **In-Memory Only**: Accept single-server limitation (not recommended for production)
- **DynamoDB**: Use AWS DynamoDB with TTL (cloud-native option)

## References

### Code Locations
- Redis Client: `src/services/cache/redis-client.ts`
- Nonce Store: `src/services/cache/nonce-store.ts`
- Adapter: `src/services/cache/redis-nonce-store.ts`
- Integration: `src/services/auth/index.ts`

### Dependencies
- `redis` (v4.6.11): Official Redis client for Node.js
- `@types/redis`: TypeScript definitions

### Documentation
- [Redis Node.js Client](https://github.com/redis/node-redis)
- [Redis TTL Command](https://redis.io/commands/ttl/)
- [Redis SETEX Command](https://redis.io/commands/setex/)
