/**
 * Polygon Blockchain Provider
 * Extends Ethereum provider for Polygon network (EVM-compatible)
 *
 * Polygon uses the same address format and signature scheme as Ethereum.
 * The main differences are:
 * - Different RPC endpoints
 * - Different chain ID
 * - ENS is not natively supported (Unstoppable Domains can be used instead)
 */

import { JsonRpcProvider, keccak256, toUtf8Bytes, concat, zeroPadBytes } from 'ethers';
import {
  BlockchainType,
  NameServiceType,
  NameResolutionResult,
  NameResolutionError,
} from '../../types/blockchain.js';
import { EthereumProvider } from './ethereum-provider.js';
import { config } from '../../config/index.js';

const POLYGON_RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://polygon-rpc.com',
  testnet: 'https://rpc-mumbai.maticvigil.com',
};

export class PolygonProvider extends EthereumProvider {
  private polygonProvider: JsonRpcProvider;

  constructor(rpcEndpoint?: string) {
    const endpoint = rpcEndpoint || POLYGON_RPC_ENDPOINTS['mainnet']!;
    super(endpoint);
    this.polygonProvider = new JsonRpcProvider(endpoint);
  }

  override getBlockchainType(): BlockchainType {
    return 'polygon';
  }

  /**
   * Resolve name service for Polygon
   * Polygon primarily supports Unstoppable Domains
   * ENS is not natively available on Polygon
   */
  override async resolveNameService(
    name: string,
    nameService: NameServiceType
  ): Promise<NameResolutionResult> {
    if (nameService === 'ENS') {
      throw new NameResolutionError(
        'ENS is not supported on Polygon. Use Unstoppable Domains instead.',
        'polygon'
      );
    }

    if (nameService === 'unstoppable') {
      return this.resolveUnstoppableDomains(name);
    }

    throw new NameResolutionError(
      `Unsupported name service for Polygon: ${nameService}`,
      'polygon'
    );
  }

  /**
   * Resolve Unstoppable Domains on Polygon
   * Domains include: .crypto, .nft, .blockchain, .wallet, .x, .888, etc.
   *
   * @see https://docs.unstoppabledomains.com/resolution/overview/
   */
  private async resolveUnstoppableDomains(
    name: string
  ): Promise<NameResolutionResult> {
    try {
      const contractAddress = '0xa9a6A3626993D487d2Dbda3173cf58cA1a9D9e9f';
      const tokenId = this.namehash(name);

      const result = await this.polygonProvider.call({
        to: contractAddress,
        data: `0xb85afd28${tokenId.slice(2).padStart(64, '0')}`,
      });

      if (!result || result === '0x') {
        throw new NameResolutionError(
          `Domain not found: ${name}`,
          'polygon'
        );
      }

      const offset = parseInt(result.slice(2, 66), 16) * 2 + 2;
      const addressLength = parseInt(result.slice(offset, offset + 64), 16) * 2;
      const address = '0x' + result.slice(offset + 64, offset + 64 + addressLength);

      if (!address || address.length < 42) {
        throw new NameResolutionError(
          `No crypto address found for: ${name}`,
          'polygon'
        );
      }

      const now = new Date();
      const cacheTTL = config.ENS_CACHE_TTL || 3600;
      const expiresAt = new Date(now.getTime() + cacheTTL * 1000);

      return {
        name,
        nameService: 'unstoppable',
        blockchain: 'polygon',
        resolvedAddress: address,
        resolvedAt: now,
        expiresAt,
        cached: false,
      };
    } catch (error) {
      if (error instanceof NameResolutionError) {
        throw error;
      }
      throw new NameResolutionError(
        `Failed to resolve Unstoppable Domain ${name}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        'polygon'
      );
    }
  }

  /**
   * Calculate namehash for Unstoppable Domains
   * Uses EIP-137 namehash algorithm
   */
  private namehash(name: string): string {
    let node = zeroPadBytes('0x', 32);

    if (name) {
      const labels = name.split('.');
      for (let i = labels.length - 1; i >= 0; i--) {
        const labelHash = keccak256(toUtf8Bytes(labels[i]!));
        node = keccak256(concat([node, labelHash]));
      }
    }

    return node;
  }
}
