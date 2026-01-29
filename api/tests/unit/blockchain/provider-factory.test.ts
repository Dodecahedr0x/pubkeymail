/**
 * Provider Factory Tests
 * Tests for blockchain provider factory functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getBlockchainProvider,
  getSupportedBlockchains,
  isBlockchainSupported,
  clearProviderCache,
} from '../../../src/services/blockchain/provider-factory.js';
import { SolanaProvider } from '../../../src/services/blockchain/solana-provider.js';
import { EthereumProvider } from '../../../src/services/blockchain/ethereum-provider.js';
import { PolygonProvider } from '../../../src/services/blockchain/polygon-provider.js';

describe('ProviderFactory', () => {
  afterEach(() => {
    // Clear cache after each test
    clearProviderCache();
  });

  describe('getBlockchainProvider', () => {
    it('should return SolanaProvider for solana blockchain', () => {
      const provider = getBlockchainProvider('solana');

      expect(provider).toBeInstanceOf(SolanaProvider);
      expect(provider.getBlockchainType()).toBe('solana');
    });

    it('should return same instance on multiple calls (singleton)', () => {
      const provider1 = getBlockchainProvider('solana');
      const provider2 = getBlockchainProvider('solana');

      expect(provider1).toBe(provider2);
    });

    it('should return EthereumProvider for ethereum blockchain', () => {
      const provider = getBlockchainProvider('ethereum');

      expect(provider).toBeInstanceOf(EthereumProvider);
      expect(provider.getBlockchainType()).toBe('ethereum');
    });

    it('should return PolygonProvider for polygon blockchain', () => {
      const provider = getBlockchainProvider('polygon');

      expect(provider).toBeInstanceOf(PolygonProvider);
      expect(provider.getBlockchainType()).toBe('polygon');
    });

    it('should throw error for invalid blockchain', () => {
      expect(() =>
        getBlockchainProvider('invalid' as any)
      ).toThrow('Unsupported blockchain');
    });
  });

  describe('getSupportedBlockchains', () => {
    it('should return array with solana, ethereum, and polygon', () => {
      const supported = getSupportedBlockchains();

      expect(supported).toBeInstanceOf(Array);
      expect(supported).toContain('solana');
      expect(supported).toContain('ethereum');
      expect(supported).toContain('polygon');
      expect(supported.length).toBe(3);
    });
  });

  describe('isBlockchainSupported', () => {
    it('should return true for solana', () => {
      expect(isBlockchainSupported('solana')).toBe(true);
    });

    it('should return true for ethereum', () => {
      expect(isBlockchainSupported('ethereum')).toBe(true);
    });

    it('should return true for polygon', () => {
      expect(isBlockchainSupported('polygon')).toBe(true);
    });

    it('should return false for invalid blockchain', () => {
      expect(isBlockchainSupported('bitcoin')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isBlockchainSupported('Solana')).toBe(false);
      expect(isBlockchainSupported('SOLANA')).toBe(false);
    });
  });

  describe('clearProviderCache', () => {
    it('should clear cached providers', () => {
      const provider1 = getBlockchainProvider('solana');
      clearProviderCache();
      const provider2 = getBlockchainProvider('solana');

      // Should be different instances after cache clear
      expect(provider1).not.toBe(provider2);
    });
  });
});
