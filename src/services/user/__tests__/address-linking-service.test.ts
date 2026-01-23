/**
 * Address Linking Service Tests
 * Tests address linking, unlinking, and unified mailbox
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddressLinkingService } from '../address-linking-service.js';
import { db, withTransaction } from '../../../database/connection.js';
import { tierService } from '../../tier/tier-service.js';
import { getBlockchainProvider } from '../../blockchain/provider-factory.js';
import {
  mockQueryResult,
  mockMutationResult,
} from '../../../test-utils/mock-query-result.js';

vi.mock('../../../database/connection.js', () => {
  const mockClient = {
    query: vi.fn(),
  };
  return {
    db: {
      query: vi.fn(),
      getClient: vi.fn().mockResolvedValue(mockClient),
    },
    withTransaction: vi.fn(async (callback: (client: typeof mockClient) => Promise<unknown>) => {
      return callback(mockClient);
    }),
  };
});

vi.mock('../../tier/tier-service.js', () => ({
  tierService: {
    canLinkAddress: vi.fn(),
  },
}));

vi.mock('../../blockchain/provider-factory.js', () => ({
  getBlockchainProvider: vi.fn(),
}));



describe('AddressLinkingService', () => {
  let service: AddressLinkingService;
  let mockClientQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new AddressLinkingService();
    vi.clearAllMocks();

    mockClientQuery = vi.fn();
    vi.mocked(withTransaction).mockImplementation(async (callback) => {
      const mockClient = { query: mockClientQuery };
      return callback(mockClient as never);
    });
  });

  describe('linkAddress', () => {
    const validInput = {
      userId: 1,
      address: 'So1anaAddress123456789012345678901234567890',
      blockchain: 'solana' as const,
      signature: 'validSignature123',
      message: 'Sign this message to link your address',
    };

    it('should link address successfully with valid signature', async () => {
      vi.mocked(tierService.canLinkAddress).mockResolvedValue(true);

      vi.mocked(getBlockchainProvider).mockReturnValue({
        verifySignature: vi.fn().mockResolvedValue({
          valid: true,
          address: validInput.address,
          blockchain: 'solana',
          message: validInput.message,
          signature: validInput.signature,
        }),
        getBlockchainType: vi.fn().mockReturnValue('solana'),
        validateAddress: vi.fn(),
        resolveNameService: vi.fn(),
        getAddressFromPublicKey: vi.fn(),
      });

      // Not a primary address
      mockClientQuery
        .mockResolvedValueOnce(mockQueryResult([]))
        // Not already linked
        .mockResolvedValueOnce(mockQueryResult([]))
        // Insert blockchain_address (ON CONFLICT returns the id)
        .mockResolvedValueOnce(mockQueryResult([{ id: 10 }]))
        // Create address_link
        .mockResolvedValueOnce(
          mockQueryResult([{ id: 1, verified_at: new Date('2024-01-15') }])
        );

      const result = await service.linkAddress(validInput);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 1,
        addressId: 10,
        address: validInput.address,
        blockchain: 'solana',
      });
    });

    it('should deny linking when tier limit reached', async () => {
      vi.mocked(tierService.canLinkAddress).mockResolvedValue(false);

      const result = await service.linkAddress(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('limit reached');
      expect(getBlockchainProvider).not.toHaveBeenCalled();
    });

    it('should deny linking with invalid signature', async () => {
      vi.mocked(tierService.canLinkAddress).mockResolvedValue(true);

      vi.mocked(getBlockchainProvider).mockReturnValue({
        verifySignature: vi.fn().mockResolvedValue({
          valid: false,
          address: validInput.address,
          blockchain: 'solana',
          message: validInput.message,
          signature: validInput.signature,
          error: 'Signature verification failed',
        }),
        getBlockchainType: vi.fn().mockReturnValue('solana'),
        validateAddress: vi.fn(),
        resolveNameService: vi.fn(),
        getAddressFromPublicKey: vi.fn(),
      });

      const result = await service.linkAddress(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Signature verification failed');
    });

    it('should deny linking when address is already a primary address', async () => {
      vi.mocked(tierService.canLinkAddress).mockResolvedValue(true);

      vi.mocked(getBlockchainProvider).mockReturnValue({
        verifySignature: vi.fn().mockResolvedValue({
          valid: true,
          address: validInput.address,
          blockchain: 'solana',
          message: validInput.message,
          signature: validInput.signature,
        }),
        getBlockchainType: vi.fn().mockReturnValue('solana'),
        validateAddress: vi.fn(),
        resolveNameService: vi.fn(),
        getAddressFromPublicKey: vi.fn(),
      });

      // Address is already a primary address
      mockClientQuery.mockResolvedValueOnce(mockQueryResult([{ id: 5 }]));

      const result = await service.linkAddress(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('primary address');
    });

    it('should deny linking when address is already linked to another account', async () => {
      vi.mocked(tierService.canLinkAddress).mockResolvedValue(true);

      vi.mocked(getBlockchainProvider).mockReturnValue({
        verifySignature: vi.fn().mockResolvedValue({
          valid: true,
          address: validInput.address,
          blockchain: 'solana',
          message: validInput.message,
          signature: validInput.signature,
        }),
        getBlockchainType: vi.fn().mockReturnValue('solana'),
        validateAddress: vi.fn(),
        resolveNameService: vi.fn(),
        getAddressFromPublicKey: vi.fn(),
      });

      // Not a primary address
      mockClientQuery
        .mockResolvedValueOnce(mockQueryResult([]))
        // Already linked to another user
        .mockResolvedValueOnce(mockQueryResult([{ user_id: 999 }]));

      const result = await service.linkAddress(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already linked to another account');
    });

    it('should use existing blockchain address if it exists', async () => {
      vi.mocked(tierService.canLinkAddress).mockResolvedValue(true);

      vi.mocked(getBlockchainProvider).mockReturnValue({
        verifySignature: vi.fn().mockResolvedValue({
          valid: true,
          address: validInput.address,
          blockchain: 'solana',
          message: validInput.message,
          signature: validInput.signature,
        }),
        getBlockchainType: vi.fn().mockReturnValue('solana'),
        validateAddress: vi.fn(),
        resolveNameService: vi.fn(),
        getAddressFromPublicKey: vi.fn(),
      });

      // Not a primary address
      mockClientQuery
        .mockResolvedValueOnce(mockQueryResult([]))
        // Not already linked
        .mockResolvedValueOnce(mockQueryResult([]))
        // Address already exists (ON CONFLICT returns existing id)
        .mockResolvedValueOnce(mockQueryResult([{ id: 25 }]))
        // Create address_link
        .mockResolvedValueOnce(
          mockQueryResult([{ id: 2, verified_at: new Date('2024-01-20') }])
        );

      const result = await service.linkAddress(validInput);

      expect(result.success).toBe(true);
      expect(result.data?.addressId).toBe(25);
    });
  });

  describe('unlinkAddress', () => {
    it('should unlink address successfully', async () => {
      vi.mocked(db.query).mockResolvedValue(mockMutationResult(1));

      const result = await service.unlinkAddress(1, 10);

      expect(result.success).toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM address_links'),
        [1, 10]
      );
    });

    it('should return error when address link not found', async () => {
      vi.mocked(db.query).mockResolvedValue(mockMutationResult(0));

      const result = await service.unlinkAddress(1, 999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle database errors', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Database connection failed'));

      const result = await service.unlinkAddress(1, 10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });
  });

  describe('getLinkedAddresses', () => {
    it('should return all linked addresses for user', async () => {
      const mockAddresses = [
        {
          id: 1,
          address_id: 10,
          address: 'SolanaAddress1',
          blockchain: 'solana',
          verified_at: new Date('2024-01-10'),
        },
        {
          id: 2,
          address_id: 20,
          address: 'SolanaAddress2',
          blockchain: 'solana',
          verified_at: new Date('2024-01-15'),
        },
      ];

      vi.mocked(db.query).mockResolvedValue(mockQueryResult(mockAddresses));

      const result = await service.getLinkedAddresses(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0]).toMatchObject({
        id: 1,
        addressId: 10,
        address: 'SolanaAddress1',
        blockchain: 'solana',
      });
      expect(result.data![1]).toMatchObject({
        id: 2,
        addressId: 20,
        address: 'SolanaAddress2',
        blockchain: 'solana',
      });
    });

    it('should return empty array when no linked addresses', async () => {
      vi.mocked(db.query).mockResolvedValue(mockQueryResult([]));

      const result = await service.getLinkedAddresses(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should handle database errors', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      const result = await service.getLinkedAddresses(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Query failed');
    });
  });

  describe('getUnifiedMailbox', () => {
    it('should return emails from all addresses with total count', async () => {
      // Get address IDs
      vi.mocked(db.query)
        .mockResolvedValueOnce(
          mockQueryResult([{ address_id: 10 }, { address_id: 20 }])
        )
        // Get total count
        .mockResolvedValueOnce(mockQueryResult([{ count: '100' }]))
        // Get emails
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              id: 'email-1',
              sender_email: 'sender@example.com',
              subject: 'Test Email 1',
              received_at: new Date('2024-01-15'),
              address: 'SolanaAddress1',
              read: false,
            },
            {
              id: 'email-2',
              sender_email: 'another@example.com',
              subject: 'Test Email 2',
              received_at: new Date('2024-01-14'),
              address: 'SolanaAddress2',
              read: true,
            },
          ])
        );

      const result = await service.getUnifiedMailbox(1, 50, 0);

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(100);
      expect(result.data?.emails).toHaveLength(2);
      expect(result.data?.emails[0]).toMatchObject({
        id: 'email-1',
        from: 'sender@example.com',
        subject: 'Test Email 1',
        sourceAddress: 'SolanaAddress1',
        read: false,
      });
      expect(result.data?.emails[1]).toMatchObject({
        id: 'email-2',
        from: 'another@example.com',
        subject: 'Test Email 2',
        sourceAddress: 'SolanaAddress2',
        read: true,
      });
    });

    it('should return error when user not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([]));

      const result = await service.getUnifiedMailbox(999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });

    it('should apply pagination correctly', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce(mockQueryResult([{ address_id: 10 }]))
        .mockResolvedValueOnce(mockQueryResult([{ count: '200' }]))
        .mockResolvedValueOnce(mockQueryResult([]));

      await service.getUnifiedMailbox(1, 25, 50);

      const emailsQueryCall = vi.mocked(db.query).mock.calls[2];
      expect(emailsQueryCall![1]).toContain(25); // limit
      expect(emailsQueryCall![1]).toContain(50); // offset
    });

    it('should return empty mailbox for user with no emails', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce(mockQueryResult([{ address_id: 10 }]))
        .mockResolvedValueOnce(mockQueryResult([{ count: '0' }]))
        .mockResolvedValueOnce(mockQueryResult([]));

      const result = await service.getUnifiedMailbox(1);

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(0);
      expect(result.data?.emails).toHaveLength(0);
    });

    it('should handle database errors', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Database error'));

      const result = await service.getUnifiedMailbox(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });

    it('should include primary address in unified mailbox', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce(
          mockQueryResult([
            { address_id: 1 }, // primary
            { address_id: 2 }, // linked
          ])
        )
        .mockResolvedValueOnce(mockQueryResult([{ count: '50' }]))
        .mockResolvedValueOnce(mockQueryResult([]));

      await service.getUnifiedMailbox(1);

      // Verify query uses array with both addresses
      const countQueryCall = vi.mocked(db.query).mock.calls[1];
      expect(countQueryCall![1]).toEqual([[1, 2]]);
    });
  });
});
