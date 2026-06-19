/**
 * Multi-Chain Scenario Tests
 *
 * Exercises chain-agnostic address handling across Solana, Ethereum, and
 * Polygon providers: each chain validates its own address format, rejects
 * other chains' formats, and the factory routes consistently.
 *
 * Uses only offline validation (no RPC / name-service network calls).
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  getBlockchainProvider,
  getSupportedBlockchains,
  isBlockchainSupported,
  clearProviderCache,
} from '../../../src/services/blockchain/provider-factory.js';
import type { BlockchainType } from '../../../src/types/blockchain.js';

// Offline-valid sample addresses per chain.
const SOLANA_ADDRESS = '11111111111111111111111111111111'; // system program
const EVM_ADDRESS = '0x52908400098527886E0F7030069857D2E4169EE7'; // checksummed

describe('Multi-chain scenarios', () => {
  afterEach(() => clearProviderCache());

  it('lists all supported chains', () => {
    const chains = getSupportedBlockchains();
    expect(chains).toEqual(expect.arrayContaining(['solana', 'ethereum', 'polygon']));
    expect(isBlockchainSupported('solana')).toBe(true);
    expect(isBlockchainSupported('bitcoin')).toBe(false);
  });

  it('each provider reports its own chain type', () => {
    for (const chain of ['solana', 'ethereum', 'polygon'] as BlockchainType[]) {
      expect(getBlockchainProvider(chain).getBlockchainType()).toBe(chain);
    }
  });

  describe('address validation per chain', () => {
    it('validates a Solana address on the Solana provider', async () => {
      const result = await getBlockchainProvider('solana').validateAddress(SOLANA_ADDRESS);
      expect(result.valid).toBe(true);
      expect(result.blockchain).toBe('solana');
    });

    it('validates an EVM address on the Ethereum provider', async () => {
      const result = await getBlockchainProvider('ethereum').validateAddress(EVM_ADDRESS);
      expect(result.valid).toBe(true);
      expect(result.blockchain).toBe('ethereum');
    });

    it('validates the same EVM address on the Polygon provider (shared format)', async () => {
      const provider = getBlockchainProvider('polygon');
      const result = await provider.validateAddress(EVM_ADDRESS);
      expect(result.valid).toBe(true);
      // Polygon reuses the EVM address format via EthereumProvider; the
      // provider identity is Polygon even though validation shares EVM logic.
      expect(provider.getBlockchainType()).toBe('polygon');
    });
  });

  describe('cross-chain rejection', () => {
    it('rejects an EVM address on the Solana provider', async () => {
      const result = await getBlockchainProvider('solana').validateAddress(EVM_ADDRESS);
      expect(result.valid).toBe(false);
    });

    it('rejects a Solana address on the Ethereum provider', async () => {
      const result = await getBlockchainProvider('ethereum').validateAddress(SOLANA_ADDRESS);
      expect(result.valid).toBe(false);
    });
  });

  describe('normalization', () => {
    it('normalizes a lowercase EVM address to checksum form', async () => {
      const result = await getBlockchainProvider('ethereum').validateAddress(
        EVM_ADDRESS.toLowerCase()
      );
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(EVM_ADDRESS);
    });
  });

  it('caches one provider instance per chain (singleton)', () => {
    expect(getBlockchainProvider('solana')).toBe(getBlockchainProvider('solana'));
    expect(getBlockchainProvider('ethereum')).toBe(getBlockchainProvider('ethereum'));
    // Different chains are distinct instances.
    expect(getBlockchainProvider('ethereum')).not.toBe(getBlockchainProvider('polygon'));
  });

  it('throws for an unsupported chain', () => {
    expect(() => getBlockchainProvider('dogecoin' as BlockchainType)).toThrow();
  });
});
