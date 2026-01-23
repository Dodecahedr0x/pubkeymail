/**
 * Blockchain Provider Factory
 * Creates and manages blockchain provider instances
 * Supports multiple blockchains (Solana, Ethereum, etc.)
 */

import { IBlockchainProvider, BlockchainType } from '../../types/blockchain.js';
import { SolanaProvider } from './solana-provider.js';
import { EthereumProvider } from './ethereum-provider.js';

/**
 * Registry of blockchain providers
 */
const providers: Map<BlockchainType, IBlockchainProvider> = new Map();

/**
 * Get blockchain provider for a specific blockchain type
 * Returns singleton instance for each blockchain
 *
 * @param blockchain - The blockchain type
 * @returns Blockchain provider instance
 */
export function getBlockchainProvider(
  blockchain: BlockchainType
): IBlockchainProvider {
  // Return cached provider if exists
  if (providers.has(blockchain)) {
    return providers.get(blockchain)!;
  }

  // Create new provider based on blockchain type
  let provider: IBlockchainProvider;

  switch (blockchain) {
    case 'solana':
      provider = new SolanaProvider();
      break;

    case 'ethereum':
      provider = new EthereumProvider();
      break;

    case 'polygon':
      // TODO: Implement Polygon provider
      throw new Error(`${blockchain} provider not yet implemented`);

    default:
      throw new Error(`Unsupported blockchain: ${blockchain}`);
  }

  // Cache provider
  providers.set(blockchain, provider);
  return provider;
}

/**
 * Get all registered blockchain providers
 * @returns Array of blockchain types that have providers
 */
export function getSupportedBlockchains(): BlockchainType[] {
  return ['solana', 'ethereum'];
}

/**
 * Check if a blockchain is supported
 * @param blockchain - The blockchain type to check
 * @returns True if blockchain is supported
 */
export function isBlockchainSupported(blockchain: string): boolean {
  return getSupportedBlockchains().includes(blockchain as BlockchainType);
}

/**
 * Clear provider cache (useful for testing)
 */
export function clearProviderCache(): void {
  providers.clear();
}
