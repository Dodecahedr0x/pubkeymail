/**
 * Mailjet Parse Route Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MailjetParseRouteService, ParseRouteResponse } from '../mailjet-parse-route-service.js';

// Mock the config
vi.mock('../../../config/index.js', () => ({
  smtpConfig: {
    apiKey: 'test-api-key',
    webhookSecret: 'test-webhook-secret',
    fromDomain: 'pubkeymail.com',
  },
}));

describe('MailjetParseRouteService', () => {
  let service: MailjetParseRouteService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    service = new MailjetParseRouteService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('registerParseRoute', () => {
    it('should register a new parse route successfully', async () => {
      const mockResponse: ParseRouteResponse = {
        Count: 1,
        Total: 1,
        Data: [
          {
            ID: 123,
            APIKeyID: 'api-key-id',
            Email: 'test-wallet@pubkeymail.com',
            Url: 'https://api.pubkeymail.com/api/v1/webhooks/inbound',
          },
        ],
      };

      // Mock GET to return no existing route
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Mock POST to create route
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.registerParseRoute('test-wallet');

      expect(result.success).toBe(true);
      expect(result.routeId).toBe(123);
      expect(result.email).toBe('test-wallet@pubkeymail.com');
    });

    it('should return existing route if already registered', async () => {
      const mockResponse: ParseRouteResponse = {
        Count: 1,
        Total: 1,
        Data: [
          {
            ID: 456,
            APIKeyID: 'api-key-id',
            Email: 'existing@pubkeymail.com',
            Url: 'https://api.pubkeymail.com/api/v1/webhooks/inbound',
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.registerParseRoute('existing');

      expect(result.success).toBe(true);
      expect(result.routeId).toBe(456);
      expect(fetchMock).toHaveBeenCalledTimes(1); // Only GET, no POST
    });

    it('should return error on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await service.registerParseRoute('failed-wallet');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Mailjet API error');
    });
  });

  describe('listParseRoutes', () => {
    it('should list all parse routes', async () => {
      const mockResponse: ParseRouteResponse = {
        Count: 2,
        Total: 2,
        Data: [
          {
            ID: 1,
            APIKeyID: 'api-key-id',
            Email: 'route1@pubkeymail.com',
            Url: 'https://api.pubkeymail.com/api/v1/webhooks/inbound',
          },
          {
            ID: 2,
            APIKeyID: 'api-key-id',
            Email: 'route2@pubkeymail.com',
            Url: 'https://api.pubkeymail.com/api/v1/webhooks/inbound',
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const routes = await service.listParseRoutes();

      expect(routes).toHaveLength(2);
      expect(routes[0]?.Email).toBe('route1@pubkeymail.com');
    });

    it('should return empty array on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const routes = await service.listParseRoutes();

      expect(routes).toEqual([]);
    });
  });

  describe('deleteParseRoute', () => {
    it('should delete a parse route successfully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
      });

      const result = await service.deleteParseRoute(123);

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.mailjet.com/v3/REST/parseroute/123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should return true for already deleted route (404)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await service.deleteParseRoute(999);

      expect(result).toBe(true);
    });
  });

  describe('registerRoutesForUser', () => {
    it('should register routes for wallet and domain names', async () => {
      // Mock successful registrations
      for (let i = 0; i < 3; i++) {
        // GET (no existing route)
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 404,
        });
        // POST (create route)
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            Count: 1,
            Total: 1,
            Data: [{ ID: i + 1, APIKeyID: 'key', Email: `test${i}@pubkeymail.com`, Url: 'url' }],
          }),
        });
      }

      const result = await service.registerRoutesForUser('wallet123', [
        'domain1',
        'domain2.sol',
      ]);

      expect(result.success).toBe(true);
      expect(result.registered).toContain('wallet123');
      expect(result.registered).toContain('domain1.sol');
      expect(result.registered).toContain('domain2.sol');
      expect(result.failed).toHaveLength(0);
    });

    it('should track failed registrations', async () => {
      // First route succeeds
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Count: 1,
          Total: 1,
          Data: [{ ID: 1, APIKeyID: 'key', Email: 'wallet@pubkeymail.com', Url: 'url' }],
        }),
      });

      // Second route fails
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      const result = await service.registerRoutesForUser('wallet', ['failing-domain']);

      expect(result.registered).toContain('wallet');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.email).toBe('failing-domain.sol');
    });
  });
});
