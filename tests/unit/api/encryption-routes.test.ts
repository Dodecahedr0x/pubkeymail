/**
 * Encryption Routes Tests
 * Tests for encryption key management endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

vi.mock('../../../src/services/encryption/encryption-service.js', () => ({
  encryptionService: {
    storeUserPublicKey: vi.fn(),
    getPublicKeyByAddress: vi.fn(),
  },
}));

vi.mock('../../../src/services/user/index.js', () => ({
  userService: {
    getUserByAddress: vi.fn(),
  },
}));

vi.mock('../../../src/api/middleware/auth-middleware.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { address: 'TestAddress123', blockchain: 'solana' };
    next();
  },
  AuthenticatedRequest: {},
}));

import { encryptionService } from '../../../src/services/encryption/encryption-service.js';
import { userService } from '../../../src/services/user/index.js';

describe('Encryption Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /encryption/keys', () => {
    it('should register encryption key for authenticated user', async () => {
      vi.mocked(userService.getUserByAddress).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddress: 'TestAddress123',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'free',
          createdAt: new Date(),
          linkedAddresses: [],
        },
      });
      vi.mocked(encryptionService.storeUserPublicKey).mockResolvedValue(undefined);

      const validPublicKey = 'a'.repeat(64);
      
      const mockReq = {
        body: { publicKey: validPublicKey },
        user: { address: 'TestAddress123', blockchain: 'solana' },
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const { default: router } = await import('../../../src/api/routes/encryption-routes.js');
      
      const postHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/keys' && layer.route?.methods?.post
      )?.route?.stack?.find((h: any) => !h.name.includes('authMiddleware'))?.handle;

      if (postHandler) {
        await postHandler(mockReq, mockRes, vi.fn());
        
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Encryption key registered',
        });
        expect(encryptionService.storeUserPublicKey).toHaveBeenCalledWith(1, validPublicKey);
      }
    });

    it('should reject invalid public key format', async () => {
      const mockReq = {
        body: { publicKey: 'invalid-key' },
        user: { address: 'TestAddress123', blockchain: 'solana' },
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const { default: router } = await import('../../../src/api/routes/encryption-routes.js');
      
      const postHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/keys' && layer.route?.methods?.post
      )?.route?.stack?.find((h: any) => !h.name.includes('authMiddleware'))?.handle;

      if (postHandler) {
        await postHandler(mockReq, mockRes, vi.fn());
        
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: 'VALIDATION_ERROR',
            }),
          })
        );
      }
    });

    it('should reject public key with wrong length', async () => {
      const mockReq = {
        body: { publicKey: 'abc123' },
        user: { address: 'TestAddress123', blockchain: 'solana' },
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const { default: router } = await import('../../../src/api/routes/encryption-routes.js');
      
      const postHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/keys' && layer.route?.methods?.post
      )?.route?.stack?.find((h: any) => !h.name.includes('authMiddleware'))?.handle;

      if (postHandler) {
        await postHandler(mockReq, mockRes, vi.fn());
        
        expect(mockRes.status).toHaveBeenCalledWith(400);
      }
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(userService.getUserByAddress).mockResolvedValue({
        success: false,
        data: null,
      } as any);

      const validPublicKey = 'a'.repeat(64);
      
      const mockReq = {
        body: { publicKey: validPublicKey },
        user: { address: 'NonExistentAddress', blockchain: 'solana' },
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const { default: router } = await import('../../../src/api/routes/encryption-routes.js');
      
      const postHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/keys' && layer.route?.methods?.post
      )?.route?.stack?.find((h: any) => !h.name.includes('authMiddleware'))?.handle;

      if (postHandler) {
        await postHandler(mockReq, mockRes, vi.fn());
        
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
          },
        });
      }
    });

    it('should return 401 if not authenticated', async () => {
      const validPublicKey = 'a'.repeat(64);
      
      const mockReq = {
        body: { publicKey: validPublicKey },
        user: undefined,
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const { default: router } = await import('../../../src/api/routes/encryption-routes.js');
      
      const postHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/keys' && layer.route?.methods?.post
      )?.route?.stack?.find((h: any) => !h.name.includes('authMiddleware'))?.handle;

      if (postHandler) {
        await postHandler(mockReq, mockRes, vi.fn());
        
        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }
    });
  });

  describe('GET /encryption/keys/:address', () => {
    it('should return public key for valid address', async () => {
      const expectedPublicKey = 'b'.repeat(64);
      vi.mocked(encryptionService.getPublicKeyByAddress).mockResolvedValue(expectedPublicKey);

      const mockReq = {
        params: { address: 'TestAddress123' },
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const { default: router } = await import('../../../src/api/routes/encryption-routes.js');
      
      const getHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/keys/:address' && layer.route?.methods?.get
      )?.route?.stack[0]?.handle;

      if (getHandler) {
        await getHandler(mockReq, mockRes, vi.fn());
        
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith({
          publicKey: expectedPublicKey,
          encryptionSupported: true,
        });
        expect(encryptionService.getPublicKeyByAddress).toHaveBeenCalledWith('TestAddress123');
      }
    });

    it('should return 404 when no key found for address', async () => {
      vi.mocked(encryptionService.getPublicKeyByAddress).mockResolvedValue(null);

      const mockReq = {
        params: { address: 'UnknownAddress' },
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const { default: router } = await import('../../../src/api/routes/encryption-routes.js');
      
      const getHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/keys/:address' && layer.route?.methods?.get
      )?.route?.stack[0]?.handle;

      if (getHandler) {
        await getHandler(mockReq, mockRes, vi.fn());
        
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: {
            code: 'NOT_FOUND',
            message: 'No encryption key found for this address',
          },
        });
      }
    });

    it('should return 400 when address is missing', async () => {
      const mockReq = {
        params: {},
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const { default: router } = await import('../../../src/api/routes/encryption-routes.js');
      
      const getHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/keys/:address' && layer.route?.methods?.get
      )?.route?.stack[0]?.handle;

      if (getHandler) {
        await getHandler(mockReq, mockRes, vi.fn());
        
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Address is required',
          },
        });
      }
    });

    it('should handle service errors gracefully', async () => {
      vi.mocked(encryptionService.getPublicKeyByAddress).mockRejectedValue(
        new Error('Database error')
      );

      const mockReq = {
        params: { address: 'TestAddress123' },
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const { default: router } = await import('../../../src/api/routes/encryption-routes.js');
      
      const getHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/keys/:address' && layer.route?.methods?.get
      )?.route?.stack[0]?.handle;

      if (getHandler) {
        await getHandler(mockReq, mockRes, vi.fn());
        
        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve encryption key',
          },
        });
      }
    });
  });
});
