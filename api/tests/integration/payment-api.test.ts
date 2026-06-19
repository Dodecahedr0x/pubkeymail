import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import paymentRoutes from '../../src/api/routes/payment-routes.js';

interface ExpressLayer {
  name?: string;
  regexp?: RegExp;
  route?: {
    path: string;
    stack: Array<{ handle: RequestHandler }>;
  };
}

function routerLayers(): ExpressLayer[] {
  return (paymentRoutes as unknown as { stack: ExpressLayer[] }).stack;
}

async function invokeGet(path: string): Promise<unknown> {
  const layer = routerLayers().find((candidate) => candidate.route?.path === path);
  const handler = layer?.route?.stack[0]?.handle;
  if (!handler) throw new Error(`Missing GET ${path} handler`);

  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  await handler(
    {} as Request,
    response as unknown as Response,
    vi.fn() as NextFunction
  );
  expect(response.status).toHaveBeenCalledWith(200);
  return response.json.mock.calls[0]?.[0];
}

describe('Solana Pay API mounting', () => {
  it('mounts payment routes in the main API', () => {
    const app = createApp() as unknown as {
      _router: { stack: ExpressLayer[] };
    };
    const paymentMount = app._router.stack.find(
      (layer) => layer.name === 'router' && layer.regexp?.test('/api/v1/payments')
    );

    expect(paymentMount).toBeDefined();
  });

  it('serves Solana Pay pricing', async () => {
    await expect(invokeGet('/pricing')).resolves.toMatchObject({
      monthly: { amount: 2, currency: 'usdc' },
      yearly: { amount: 15, currency: 'usdc' },
    });
  });

  it('advertises the configured Solana Pay provider', async () => {
    await expect(invokeGet('/providers')).resolves.toEqual({
      providers: ['solana_pay'],
      solana_pay: { available: true },
    });
  });
});
