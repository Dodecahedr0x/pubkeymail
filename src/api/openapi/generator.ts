/**
 * OpenAPI Spec Generator
 * Generates OpenAPI 3.1 specification from registered Zod schemas
 */

import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { registry } from './registry.js';
import './routes.js'; // Import routes to register them

export function generateOpenApiSpec(): OpenAPIObject {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'PubKeyMail API',
      version: '1.0.0',
      description: `Blockchain-based email service with wallet authentication.

## Authentication
PubKeyMail uses wallet-based authentication. Users sign a challenge message 
with their blockchain wallet and receive a JWT token for subsequent requests.

## Case Sensitivity
**CRITICAL**: All blockchain addresses are case-sensitive. Different casing 
represents different addresses.`,
      contact: {
        name: 'PubKeyMail Support',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.pubkeymail.com',
        description: 'Production server',
      },
    ],
    tags: [
      { name: 'Auth', description: 'Wallet-based authentication endpoints' },
      { name: 'Users', description: 'User registration and profile management' },
      { name: 'Emails', description: 'Email sending and management' },
      { name: 'Payments', description: 'Subscription payment endpoints' },
      { name: 'Webhooks', description: 'Inbound email webhook handlers' },
      { name: 'Health', description: 'Health check and monitoring endpoints' },
    ],
  });
}
