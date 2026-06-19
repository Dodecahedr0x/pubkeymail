# Blockchain Extension Guide

PubKeyMail is chain-agnostic. Address validation, name-service resolution, and
signature verification are all expressed through a single provider interface, so
adding a new blockchain is a matter of implementing that interface and
registering it with the factory.

## Architecture

```
                         ┌─────────────────────────┐
  email / auth code  →   │ getBlockchainProvider()  │  ← factory (singleton cache)
                         └───────────┬─────────────┘
                                     │ returns
                         ┌───────────▼─────────────┐
                         │   IBlockchainProvider    │  ← interface
                         └───────────┬─────────────┘
            ┌────────────────────────┼────────────────────────┐
   SolanaProvider            EthereumProvider           PolygonProvider
   (SNS)                     (ENS)                       (extends Ethereum)
```

Key files:

- `src/types/blockchain.ts` — `BlockchainType` union and `IBlockchainProvider`.
- `src/services/blockchain/provider-factory.ts` — construction + registry.
- `src/services/blockchain/*-provider.ts` — concrete providers.
- `src/services/email/email-storage-service.ts` — `TLD_MAPPING` routes name
  services (`.sol`, `.eth`, …) to a chain.

## The provider interface

A provider implements:

| Method | Purpose |
|---|---|
| `getBlockchainType()` | Return the provider's `BlockchainType`. |
| `validateAddress(address)` | Offline format check; returns `{ valid, normalized?, blockchain, error? }`. |
| `resolveNameService(name, service)` | Resolve a name (e.g. `toly.sol`) to an address. |
| `verifySignature(message, signature, address)` | Verify a wallet signature. |
| `derivePublicKey(...)` *(optional)* | For encryption key features. |

`validateAddress` MUST be network-free so hot paths (ingestion, search) stay
fast. Network calls belong in `resolveNameService`.

## Steps to add a chain (example: `aptos`)

1. **Extend the union** in `src/types/blockchain.ts`:
   ```ts
   export type BlockchainType = 'solana' | 'ethereum' | 'polygon' | 'aptos';
   ```

2. **Implement the provider** in
   `src/services/blockchain/aptos-provider.ts`, implementing
   `IBlockchainProvider`. Reuse a base class if the format matches an existing
   one (as `PolygonProvider extends EthereumProvider`).

3. **Register it** in `provider-factory.ts`:
   ```ts
   case 'aptos':
     provider = new AptosProvider();
     break;
   ```
   and add `'aptos'` to `getSupportedBlockchains()`.

4. **Route its name service** (if any) by adding the TLD to `TLD_MAPPING` in
   `email-storage-service.ts`:
   ```ts
   '.apt': { blockchain: 'aptos', nameService: 'ANS' },
   ```

5. **Add tests** mirroring
   `tests/unit/blockchain/multi-chain-scenarios.test.ts`:
   - validates its own address format,
   - rejects other chains' formats,
   - factory returns a cached singleton of the right type.

## Case-sensitivity note

Blockchain addresses are case-sensitive throughout PubKeyMail (PostgreSQL
`COLLATE "C"`). When implementing `validateAddress`, return a `normalized` form
only if the chain has a canonical representation (e.g. EVM checksum); never
lowercase a case-sensitive address such as a Solana base58 key.

## Checklist

- [ ] `BlockchainType` extended
- [ ] Provider implements every `IBlockchainProvider` method
- [ ] `validateAddress` is network-free
- [ ] Registered in factory + `getSupportedBlockchains()`
- [ ] TLD added to `TLD_MAPPING` (if name service exists)
- [ ] Multi-chain scenario tests added and passing
