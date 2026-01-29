/**
 * Solana Blockchain Provider
 * Implements blockchain operations for Solana network
 *
 * CRITICAL SECURITY NOTES:
 * - All address comparisons are case-sensitive (base58 encoding)
 * - Signature verification uses Ed25519
 * - Never trust client-provided addresses without signature verification
 */

import { Connection, PublicKey, GetProgramAccountsFilter } from '@solana/web3.js';
import { getHashedName, getNameAccountKey, NameRegistryState } from '@solana/spl-name-service';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');
const ROOT_DOMAIN_ACCOUNT = new PublicKey('58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx');
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
import { solanaConfig } from '../../config/index.js';
import { createLogger } from '../logger/index.js';

const log = createLogger('SolanaProvider');

/**
 * Solana blockchain provider implementation
 */
export class SolanaProvider implements IBlockchainProvider {
  private connection: Connection;
  private readonly snsProgramId: PublicKey;

  constructor(rpcEndpoint?: string, snsProgramId?: string) {
    this.connection = new Connection(
      rpcEndpoint || solanaConfig.rpcEndpoint,
      'confirmed'
    );
    this.snsProgramId = new PublicKey(
      snsProgramId || solanaConfig.snsProgramId
    );
  }

  /**
   * Get blockchain type
   */
  getBlockchainType(): BlockchainType {
    return 'solana';
  }

  /**
   * Validate Solana address format
   * Solana addresses are base58 encoded 32-byte public keys
   * CRITICAL: Addresses are case-sensitive
   *
   * @param address - The Solana address to validate
   * @returns Validation result
   */
  async validateAddress(address: string): Promise<AddressValidationResult> {
    try {
      // Attempt to create PublicKey from address
      // This validates base58 encoding and 32-byte length
      const publicKey = new PublicKey(address);

      // Get the base58 string representation
      // CRITICAL: This preserves case sensitivity
      const normalized = publicKey.toBase58();

      return {
        valid: true,
        blockchain: 'solana',
        normalized,
      };
    } catch (error) {
      return {
        valid: false,
        blockchain: 'solana',
        error:
          error instanceof Error
            ? error.message
            : 'Invalid Solana address format',
      };
    }
  }

  /**
   * Verify Ed25519 signature for Solana
   * CRITICAL: This proves ownership of the private key corresponding to the address
   *
   * Security considerations:
   * - Message should include a nonce to prevent replay attacks
   * - Signature should be base58 or base64 encoded
   * - Never trust the address without verifying the signature
   *
   * @param message - The message that was signed
   * @param signature - The signature (base58 or base64 encoded)
   * @param address - The address that should have signed the message
   * @returns Verification result
   */
  async verifySignature(
    message: string,
    signature: string,
    address: string
  ): Promise<SignatureVerificationResult> {
    try {
      // Validate address format first
      const addressValidation = await this.validateAddress(address);
      if (!addressValidation.valid) {
        throw new SignatureVerificationError(
          `Invalid address format: ${addressValidation.error}`,
          'solana'
        );
      }

      // Get public key from address
      const publicKey = new PublicKey(address);
      const publicKeyBytes = publicKey.toBytes();

      // Encode message as UTF-8 bytes
      const messageBytes = new TextEncoder().encode(message);

      // Decode signature (try base58 first, then base64)
      let signatureBytes: Uint8Array;
      try {
        signatureBytes = bs58.decode(signature);
      } catch {
        try {
          signatureBytes = Buffer.from(signature, 'base64');
        } catch {
          throw new SignatureVerificationError(
            'Signature must be base58 or base64 encoded',
            'solana'
          );
        }
      }

      // Verify signature using Ed25519
      // nacl.sign.detached.verify returns true if signature is valid
      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes
      );

      if (!isValid) {
        return {
          valid: false,
          address,
          blockchain: 'solana',
          message,
          signature,
          error: 'Signature verification failed',
        };
      }

      return {
        valid: true,
        address: addressValidation.normalized || address,
        blockchain: 'solana',
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
        blockchain: 'solana',
        message,
        signature,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Resolve Solana Name Service (SNS) domain to address
   * CRITICAL: Resolution is cached and may change over time
   * Always store the resolved address, not just the name
   *
   * SNS domains end with .sol (e.g., "example.sol")
   *
   * @param name - The SNS domain name
   * @param nameService - Must be 'SNS' for Solana
   * @returns Resolution result with address
   */
  async resolveNameService(
    name: string,
    nameService: NameServiceType
  ): Promise<NameResolutionResult> {
    if (nameService !== 'SNS') {
      throw new NameResolutionError(
        `Unsupported name service for Solana: ${nameService}`,
        'solana'
      );
    }

    try {
      // Remove .sol suffix if present
      const domainName = name.endsWith('.sol') ? name.slice(0, -4) : name;

      // Get the hashed name
      const hashedName = await getHashedName(domainName);

      // Get the name account key
      const nameAccountKey = await getNameAccountKey(
        hashedName,
        undefined, // No parent
        this.snsProgramId
      );

      // Fetch the name registry state
      const nameAccount = await this.connection.getAccountInfo(nameAccountKey);

      if (!nameAccount) {
        throw new NameResolutionError(
          `SNS domain not found: ${name}`,
          'solana'
        );
      }

      // Parse the name registry state
      const nameRegistry = NameRegistryState.retrieve(
        this.connection,
        nameAccountKey
      );

      // Get the owner address
      const owner = (await nameRegistry).owner;
      const resolvedAddress = owner.toBase58();

      const now = new Date();
      const expiresAt = new Date(now.getTime() + solanaConfig.snsCacheTTL * 1000);

      return {
        name: name.endsWith('.sol') ? name : `${name}.sol`,
        nameService: 'SNS',
        blockchain: 'solana',
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
        `Failed to resolve SNS domain ${name}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        'solana'
      );
    }
  }

  /**
   * Get Solana address from public key
   * @param publicKey - Base58 encoded public key
   * @returns The address (same as public key for Solana)
   */
  async getAddressFromPublicKey(publicKey: string): Promise<string> {
    try {
      const pubKey = new PublicKey(publicKey);
      return pubKey.toBase58();
    } catch (error) {
      throw new AddressValidationError(
        `Invalid public key: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'solana'
      );
    }
  }

  /**
   * Check if an address exists on-chain (has been used)
   * This is useful for determining if an address is active
   *
   * @param address - The address to check
   * @returns True if the address has on-chain activity
   */
  async isAddressActive(address: string): Promise<boolean> {
    try {
      const publicKey = new PublicKey(address);
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      return accountInfo !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get the balance of an address in lamports
   * Useful for validating active accounts
   *
   * @param address - The address to check
   * @returns Balance in lamports (1 SOL = 1e9 lamports)
   */
  async getBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      return await this.connection.getBalance(publicKey);
    } catch (error) {
      throw new AddressValidationError(
        `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'solana'
      );
    }
  }

  /**
   * Get all SNS domain names owned by a wallet address
   * Uses direct program account lookup for .sol domains
   *
   * @param address - The wallet address to lookup
   * @returns Array of domain names (with .sol suffix)
   */
  async getAllDomainsForWallet(address: string): Promise<string[]> {
    try {
      const publicKey = new PublicKey(address);

      // Query all name registry accounts owned by this wallet under the root domain
      const filters: GetProgramAccountsFilter[] = [
        {
          memcmp: {
            offset: 32, // Owner pubkey offset in NameRegistryState
            bytes: publicKey.toBase58(),
          },
        },
        {
          memcmp: {
            offset: 0, // Parent name account offset (root domain)
            bytes: ROOT_DOMAIN_ACCOUNT.toBase58(),
          },
        },
      ];

      const accounts = await this.connection.getProgramAccounts(NAME_PROGRAM_ID, {
        filters,
        dataSlice: { offset: 0, length: 0 }, // We only need the pubkeys
      });

      if (!accounts || accounts.length === 0) {
        return [];
      }

      // Perform reverse lookup for each domain
      const domainNames = await Promise.all(
        accounts.map(async (account) => {
          try {
            return await this.reverseLookupDomain(account.pubkey);
          } catch {
            return null;
          }
        })
      );

      return domainNames.filter((name): name is string => name !== null);
    } catch (error) {
      log.error('Failed to get domains for wallet', { error });
      return [];
    }
  }

  /**
   * Perform reverse lookup to get domain name from account key
   * @param domainKey - The domain account public key
   * @returns The domain name with .sol suffix
   */
  private async reverseLookupDomain(domainKey: PublicKey): Promise<string | null> {
    try {
      // Get the reverse lookup key
      const hashedReverseLookup = await getHashedName(domainKey.toBase58());
      const reverseLookupAccount = await getNameAccountKey(
        hashedReverseLookup,
        new PublicKey('58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx'), // Central state / reverse lookup class
        undefined
      );

      const accountInfo = await this.connection.getAccountInfo(reverseLookupAccount);
      if (!accountInfo || !accountInfo.data) {
        return null;
      }

      // Parse the reverse name from account data
      // The data format is: [header (96 bytes)] + [name string]
      const data = accountInfo.data;
      if (data.length <= 96) {
        return null;
      }

      const nameData = data.slice(96);
      const nullIndex = nameData.indexOf(0);
      const name = new TextDecoder().decode(
        nullIndex > 0 ? nameData.slice(0, nullIndex) : nameData
      );

      return name ? `${name}.sol` : null;
    } catch {
      return null;
    }
  }
}
