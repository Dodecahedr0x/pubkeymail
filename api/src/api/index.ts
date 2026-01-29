/**
 * API Package
 *
 * This package contains all API-related code including routes, middleware,
 * and OpenAPI specification generation.
 */

export { createApp } from './app.js';

// Re-export middleware
export * from './middleware/index.js';

// Re-export OpenAPI utilities
export { generateOpenApiSpec } from './openapi/index.js';
