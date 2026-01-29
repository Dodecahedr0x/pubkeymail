/**
 * Blockchain Services
 * Main entry point for blockchain-related functionality
 */

export * from './solana-provider.js';
export * from './provider-factory.js';
export type {
  IBlockchainProvider,
  BlockchainType,
  NameServiceType,
  AddressValidationResult,
  SignatureVerificationResult,
  NameResolutionResult,
  AuthChallenge,
} from '../../types/blockchain.js';
export {
  BlockchainError,
  AddressValidationError,
  SignatureVerificationError,
  NameResolutionError,
} from '../../types/blockchain.js';
