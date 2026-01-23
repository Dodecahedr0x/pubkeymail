/**
 * Blockchain Type Definitions
 * Core types for blockchain integration (Solana, Ethereum, etc.)
 */

/**
 * Supported blockchain networks
 */
export type BlockchainType = 'solana' | 'ethereum' | 'polygon';

/**
 * Supported name services
 */
export type NameServiceType = 'SNS' | 'ENS' | 'unstoppable';

/**
 * Blockchain address validation result
 */
export interface AddressValidationResult {
  valid: boolean;
  blockchain: BlockchainType;
  normalized?: string; // Normalized version of address
  error?: string;
}

/**
 * Name service resolution result
 */
export interface NameResolutionResult {
  name: string;
  nameService: NameServiceType;
  blockchain: BlockchainType;
  resolvedAddress: string;
  resolvedAt: Date;
  expiresAt?: Date;
  cached: boolean;
}

/**
 * Signature verification result
 */
export interface SignatureVerificationResult {
  valid: boolean;
  address: string;
  blockchain: BlockchainType;
  message: string;
  signature: string;
  error?: string;
}

/**
 * Challenge for wallet authentication
 */
export interface AuthChallenge {
  nonce: string;
  challenge: string;
  address: string;
  blockchain: BlockchainType;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Abstract blockchain provider interface
 * Implementations must provide blockchain-specific functionality
 */
export interface IBlockchainProvider {
  /**
   * Get the blockchain type this provider handles
   */
  getBlockchainType(): BlockchainType;

  /**
   * Validate a blockchain address format
   * @param address - The address to validate
   * @returns Validation result with normalized address if valid
   */
  validateAddress(address: string): Promise<AddressValidationResult>;

  /**
   * Verify a signature against a message and address
   * CRITICAL: Must verify that the signature was created by the private key
   * corresponding to the given public address
   *
   * @param message - The message that was signed
   * @param signature - The signature to verify (base64 or hex encoded)
   * @param address - The address that should have signed the message
   * @returns Verification result
   */
  verifySignature(
    message: string,
    signature: string,
    address: string
  ): Promise<SignatureVerificationResult>;

  /**
   * Resolve a name service domain to a blockchain address
   * @param name - The domain name (e.g., "example.sol")
   * @param nameService - The name service to use (SNS, ENS, etc.)
   * @returns Resolution result with address and metadata
   */
  resolveNameService(
    name: string,
    nameService: NameServiceType
  ): Promise<NameResolutionResult>;

  /**
   * Get the address from a public key
   * @param publicKey - The public key (base58 or hex encoded)
   * @returns The corresponding address
   */
  getAddressFromPublicKey(publicKey: string): Promise<string>;
}

/**
 * Error types for blockchain operations
 */
export class BlockchainError extends Error {
  constructor(
    message: string,
    public code: string,
    public blockchain?: BlockchainType
  ) {
    super(message);
    this.name = 'BlockchainError';
  }
}

export class AddressValidationError extends BlockchainError {
  constructor(message: string, blockchain?: BlockchainType) {
    super(message, 'ADDRESS_VALIDATION_ERROR', blockchain);
    this.name = 'AddressValidationError';
  }
}

export class SignatureVerificationError extends BlockchainError {
  constructor(message: string, blockchain?: BlockchainType) {
    super(message, 'SIGNATURE_VERIFICATION_ERROR', blockchain);
    this.name = 'SignatureVerificationError';
  }
}

export class NameResolutionError extends BlockchainError {
  constructor(message: string, blockchain?: BlockchainType) {
    super(message, 'NAME_RESOLUTION_ERROR', blockchain);
    this.name = 'NameResolutionError';
  }
}
