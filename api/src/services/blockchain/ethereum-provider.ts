/**
 * Ethereum Blockchain Provider
 * Implements blockchain operations for Ethereum network with ENS support
 *
 * CRITICAL SECURITY NOTES:
 * - All address comparisons should use checksummed addresses
 * - Signature verification uses personal_sign (EIP-191)
 * - Never trust client-provided addresses without signature verification
 */

import { ethers, JsonRpcProvider } from 'ethers';
import {
  IBlockchainProvider,
  BlockchainType,
  NameServiceType,
  AddressValidationResult,
  SignatureVerificationResult,
  NameResolutionResult,
  AddressValidationError,
  SignatureVerificationError,
  NameResolutionError,
} from '../../types/blockchain.js';
import { ethereumConfig } from '../../config/index.js';

/**
 * Ethereum blockchain provider implementation
 */
export class EthereumProvider implements IBlockchainProvider {
  private provider: JsonRpcProvider;
  private readonly ensCacheTTL: number;

  constructor(rpcEndpoint?: string, ensCacheTTL?: number) {
    this.provider = new JsonRpcProvider(
      rpcEndpoint || ethereumConfig.rpcEndpoint
    );
    this.ensCacheTTL = ensCacheTTL ?? ethereumConfig.ensCacheTTL;
  }

  /**
   * Get blockchain type
   */
  getBlockchainType(): BlockchainType {
    return 'ethereum';
  }

  /**
   * Validate Ethereum address format
   * Ethereum addresses are 40 hex characters prefixed with 0x
   * Returns checksummed address as normalized form
   *
   * @param address - The Ethereum address to validate
   * @returns Validation result
   */
  async validateAddress(address: string): Promise<AddressValidationResult> {
    try {
      if (!ethers.isAddress(address)) {
        return {
          valid: false,
          blockchain: 'ethereum',
          error: 'Invalid Ethereum address format',
        };
      }

      const normalized = ethers.getAddress(address);

      return {
        valid: true,
        blockchain: 'ethereum',
        normalized,
      };
    } catch (error) {
      return {
        valid: false,
        blockchain: 'ethereum',
        error:
          error instanceof Error
            ? error.message
            : 'Invalid Ethereum address format',
      };
    }
  }

  /**
   * Verify EIP-191 personal_sign signature for Ethereum
   * CRITICAL: This proves ownership of the private key corresponding to the address
   *
   * Security considerations:
   * - Message should include a nonce to prevent replay attacks
   * - Signature should be hex encoded (with or without 0x prefix)
   * - Never trust the address without verifying the signature
   *
   * @param message - The message that was signed
   * @param signature - The signature (hex encoded)
   * @param address - The address that should have signed the message
   * @returns Verification result
   */
  async verifySignature(
    message: string,
    signature: string,
    address: string
  ): Promise<SignatureVerificationResult> {
    try {
      const addressValidation = await this.validateAddress(address);
      if (!addressValidation.valid) {
        throw new SignatureVerificationError(
          `Invalid address format: ${addressValidation.error}`,
          'ethereum'
        );
      }

      const recoveredAddress = ethers.verifyMessage(message, signature);

      const normalizedAddress = ethers.getAddress(address);
      const normalizedRecovered = ethers.getAddress(recoveredAddress);

      const isValid =
        normalizedAddress.toLowerCase() === normalizedRecovered.toLowerCase();

      if (!isValid) {
        return {
          valid: false,
          address,
          blockchain: 'ethereum',
          message,
          signature,
          error: 'Signature verification failed',
        };
      }

      return {
        valid: true,
        address: addressValidation.normalized || address,
        blockchain: 'ethereum',
        message,
        signature,
      };
    } catch (error) {
      if (error instanceof SignatureVerificationError) {
        throw error;
      }
      return {
        valid: false,
        address,
        blockchain: 'ethereum',
        message,
        signature,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Resolve Ethereum Name Service (ENS) domain to address
   * CRITICAL: Resolution is cached and may change over time
   * Always store the resolved address, not just the name
   *
   * ENS domains end with .eth (e.g., "vitalik.eth")
   *
   * @param name - The ENS domain name
   * @param nameService - Must be 'ENS' for Ethereum
   * @returns Resolution result with address
   */
  async resolveNameService(
    name: string,
    nameService: NameServiceType
  ): Promise<NameResolutionResult> {
    if (nameService !== 'ENS') {
      throw new NameResolutionError(
        `Unsupported name service for Ethereum: ${nameService}. Only ENS is supported.`,
        'ethereum'
      );
    }

    try {
      const ensName = name.endsWith('.eth') ? name : `${name}.eth`;

      const resolvedAddress = await this.provider.resolveName(ensName);

      if (!resolvedAddress) {
        throw new NameResolutionError(
          `ENS domain not found: ${ensName}`,
          'ethereum'
        );
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.ensCacheTTL * 1000);

      return {
        name: ensName,
        nameService: 'ENS',
        blockchain: 'ethereum',
        resolvedAddress,
        resolvedAt: now,
        expiresAt,
        cached: false,
      };
    } catch (error) {
      if (error instanceof NameResolutionError) {
        throw error;
      }
      throw new NameResolutionError(
        `Failed to resolve ENS domain ${name}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        'ethereum'
      );
    }
  }

  /**
   * Get Ethereum address from public key
   * @param publicKey - Hex encoded uncompressed public key (with or without 0x prefix)
   * @returns The checksummed Ethereum address
   */
  async getAddressFromPublicKey(publicKey: string): Promise<string> {
    try {
      const normalizedKey = publicKey.startsWith('0x')
        ? publicKey
        : `0x${publicKey}`;

      const address = ethers.computeAddress(normalizedKey);
      return address;
    } catch (error) {
      throw new AddressValidationError(
        `Invalid public key: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ethereum'
      );
    }
  }
}
