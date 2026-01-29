/**
 * Ethereum Provider Tests
 * Tests for Ethereum blockchain operations with ENS support
 *
 * These tests validate:
 * - Address validation and checksumming
 * - Signature verification (EIP-191)
 * - ENS resolution
 * - Public key to address conversion
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { SignatureVerificationError, NameResolutionError } from '../../../src/types/blockchain.js';

vi.mock('ethers', () => {
  const mockIsAddress = vi.fn();
  const mockGetAddress = vi.fn();
  const mockVerifyMessage = vi.fn();
  const mockComputeAddress = vi.fn();

  const MockJsonRpcProvider = vi.fn().mockImplementation(() => ({
    resolveName: vi.fn(),
  }));

  return {
    ethers: {
      isAddress: mockIsAddress,
      getAddress: mockGetAddress,
      verifyMessage: mockVerifyMessage,
      computeAddress: mockComputeAddress,
    },
    JsonRpcProvider: MockJsonRpcProvider,
  };
});

vi.mock('../../../src/config/index.js', () => ({
  ethereumConfig: {
    rpcEndpoint: 'https://eth.llamarpc.com',
    ensCacheTTL: 3600,
  },
}));

import { EthereumProvider } from '../../../src/services/blockchain/ethereum-provider.js';
import { ethers, JsonRpcProvider } from 'ethers';

describe('EthereumProvider', () => {
  let provider: EthereumProvider;
  let mockProviderInstance: { resolveName: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new EthereumProvider();
    mockProviderInstance = (JsonRpcProvider as Mock).mock.results[0]?.value;
  });

  describe('getBlockchainType', () => {
    it('should return ethereum as blockchain type', () => {
      expect(provider.getBlockchainType()).toBe('ethereum');
    });
  });

  describe('validateAddress', () => {
    it('should validate a correct Ethereum address', async () => {
      const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8C1e9';
      const checksummedAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8C1e9';

      (ethers.isAddress as Mock).mockReturnValue(true);
      (ethers.getAddress as Mock).mockReturnValue(checksummedAddress);

      const result = await provider.validateAddress(validAddress);

      expect(result.valid).toBe(true);
      expect(result.blockchain).toBe('ethereum');
      expect(result.normalized).toBe(checksummedAddress);
      expect(result.error).toBeUndefined();
    });

    it('should validate and checksum a lowercase address', async () => {
      const lowercaseAddress = '0x742d35cc6634c0532925a3b844bc9e7595f8c1e9';
      const checksummedAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8C1e9';

      (ethers.isAddress as Mock).mockReturnValue(true);
      (ethers.getAddress as Mock).mockReturnValue(checksummedAddress);

      const result = await provider.validateAddress(lowercaseAddress);

      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(checksummedAddress);
    });

    it('should reject an invalid address', async () => {
      const invalidAddress = 'not-an-ethereum-address';

      (ethers.isAddress as Mock).mockReturnValue(false);

      const result = await provider.validateAddress(invalidAddress);

      expect(result.valid).toBe(false);
      expect(result.blockchain).toBe('ethereum');
      expect(result.error).toBe('Invalid Ethereum address format');
    });

    it('should reject an empty string', async () => {
      (ethers.isAddress as Mock).mockReturnValue(false);

      const result = await provider.validateAddress('');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject an address that is too short', async () => {
      const shortAddress = '0x123';

      (ethers.isAddress as Mock).mockReturnValue(false);

      const result = await provider.validateAddress(shortAddress);

      expect(result.valid).toBe(false);
    });

    it('should handle getAddress throwing an error', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f8C1e9';

      (ethers.isAddress as Mock).mockReturnValue(true);
      (ethers.getAddress as Mock).mockImplementation(() => {
        throw new Error('Invalid checksum');
      });

      const result = await provider.validateAddress(address);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid checksum');
    });
  });

  describe('verifySignature', () => {
    const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8C1e9';
    const message = 'Sign this message to authenticate';
    const validSignature = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b';

    it('should verify a valid signature', async () => {
      (ethers.isAddress as Mock).mockReturnValue(true);
      (ethers.getAddress as Mock).mockImplementation((addr) => addr);
      (ethers.verifyMessage as Mock).mockReturnValue(validAddress);

      const result = await provider.verifySignature(message, validSignature, validAddress);

      expect(result.valid).toBe(true);
      expect(result.blockchain).toBe('ethereum');
      expect(result.address).toBe(validAddress);
      expect(result.message).toBe(message);
      expect(result.signature).toBe(validSignature);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for mismatched signature', async () => {
      const differentAddress = '0x1234567890123456789012345678901234567890';

      (ethers.isAddress as Mock).mockReturnValue(true);
      (ethers.getAddress as Mock).mockImplementation((addr) => addr);
      (ethers.verifyMessage as Mock).mockReturnValue(differentAddress);

      const result = await provider.verifySignature(message, validSignature, validAddress);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature verification failed');
    });

    it('should throw error for invalid address format', async () => {
      const invalidAddress = 'invalid-address';

      (ethers.isAddress as Mock).mockReturnValue(false);

      await expect(
        provider.verifySignature(message, validSignature, invalidAddress)
      ).rejects.toThrow(SignatureVerificationError);
    });

    it('should handle verifyMessage throwing an error', async () => {
      (ethers.isAddress as Mock).mockReturnValue(true);
      (ethers.getAddress as Mock).mockImplementation((addr) => addr);
      (ethers.verifyMessage as Mock).mockImplementation(() => {
        throw new Error('Invalid signature format');
      });

      const result = await provider.verifySignature(message, validSignature, validAddress);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature format');
    });

    it('should verify case-insensitively for addresses', async () => {
      const lowerAddress = '0x742d35cc6634c0532925a3b844bc9e7595f8c1e9';
      const checksumAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8C1e9';

      (ethers.isAddress as Mock).mockReturnValue(true);
      (ethers.getAddress as Mock).mockImplementation((addr) => checksumAddress);
      (ethers.verifyMessage as Mock).mockReturnValue(checksumAddress);

      const result = await provider.verifySignature(message, validSignature, lowerAddress);

      expect(result.valid).toBe(true);
    });
  });

  describe('resolveNameService', () => {
    it('should resolve an ENS name to an address', async () => {
      const ensName = 'vitalik.eth';
      const resolvedAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

      mockProviderInstance = (JsonRpcProvider as Mock).mock.results[0]?.value;
      mockProviderInstance.resolveName.mockResolvedValue(resolvedAddress);

      const result = await provider.resolveNameService(ensName, 'ENS');

      expect(result.name).toBe(ensName);
      expect(result.nameService).toBe('ENS');
      expect(result.blockchain).toBe('ethereum');
      expect(result.resolvedAddress).toBe(resolvedAddress);
      expect(result.cached).toBe(false);
      expect(result.resolvedAt).toBeInstanceOf(Date);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should add .eth suffix if not present', async () => {
      const nameWithoutSuffix = 'vitalik';
      const resolvedAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

      mockProviderInstance = (JsonRpcProvider as Mock).mock.results[0]?.value;
      mockProviderInstance.resolveName.mockResolvedValue(resolvedAddress);

      const result = await provider.resolveNameService(nameWithoutSuffix, 'ENS');

      expect(result.name).toBe('vitalik.eth');
      expect(mockProviderInstance.resolveName).toHaveBeenCalledWith('vitalik.eth');
    });

    it('should throw error for non-ENS name service', async () => {
      await expect(
        provider.resolveNameService('example.sol', 'SNS')
      ).rejects.toThrow(NameResolutionError);

      await expect(
        provider.resolveNameService('example.sol', 'SNS')
      ).rejects.toThrow('Unsupported name service for Ethereum');
    });

    it('should throw error when ENS name is not found', async () => {
      const unknownName = 'nonexistent-domain-12345.eth';

      mockProviderInstance = (JsonRpcProvider as Mock).mock.results[0]?.value;
      mockProviderInstance.resolveName.mockResolvedValue(null);

      await expect(
        provider.resolveNameService(unknownName, 'ENS')
      ).rejects.toThrow(NameResolutionError);

      await expect(
        provider.resolveNameService(unknownName, 'ENS')
      ).rejects.toThrow('ENS domain not found');
    });

    it('should throw error when resolution fails', async () => {
      const ensName = 'error.eth';

      mockProviderInstance = (JsonRpcProvider as Mock).mock.results[0]?.value;
      mockProviderInstance.resolveName.mockRejectedValue(new Error('Network error'));

      await expect(
        provider.resolveNameService(ensName, 'ENS')
      ).rejects.toThrow(NameResolutionError);

      await expect(
        provider.resolveNameService(ensName, 'ENS')
      ).rejects.toThrow('Failed to resolve ENS domain');
    });
  });

  describe('getAddressFromPublicKey', () => {
    it('should return address from valid public key with 0x prefix', async () => {
      const publicKey = '0x04bfcab0a23c41e5e0098e8f7e9a6e72b6dc1e3f8a3d5c6b7a8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8';
      const expectedAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8C1e9';

      (ethers.computeAddress as Mock).mockReturnValue(expectedAddress);

      const result = await provider.getAddressFromPublicKey(publicKey);

      expect(result).toBe(expectedAddress);
      expect(ethers.computeAddress).toHaveBeenCalledWith(publicKey);
    });

    it('should add 0x prefix if not present', async () => {
      const publicKeyWithoutPrefix = '04bfcab0a23c41e5e0098e8f7e9a6e72b6dc1e3f8a3d5c6b7a8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8';
      const expectedAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8C1e9';

      (ethers.computeAddress as Mock).mockReturnValue(expectedAddress);

      const result = await provider.getAddressFromPublicKey(publicKeyWithoutPrefix);

      expect(result).toBe(expectedAddress);
      expect(ethers.computeAddress).toHaveBeenCalledWith(`0x${publicKeyWithoutPrefix}`);
    });

    it('should throw error for invalid public key', async () => {
      const invalidKey = 'invalid-key';

      (ethers.computeAddress as Mock).mockImplementation(() => {
        throw new Error('Invalid public key');
      });

      await expect(
        provider.getAddressFromPublicKey(invalidKey)
      ).rejects.toThrow('Invalid public key');
    });
  });

  describe('constructor', () => {
    it('should use custom RPC endpoint when provided', () => {
      const customEndpoint = 'https://custom-rpc.example.com';
      new EthereumProvider(customEndpoint);

      expect(JsonRpcProvider).toHaveBeenCalledWith(customEndpoint);
    });

    it('should use default RPC endpoint from config when not provided', () => {
      new EthereumProvider();

      expect(JsonRpcProvider).toHaveBeenCalledWith('https://eth.llamarpc.com');
    });
  });
});
