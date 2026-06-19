#!/usr/bin/env tsx
/**
 * Generate OpenAPI specification from code
 *
 * Usage:
 *   npm run openapi:generate
 *   npm run openapi:generate -- --json
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import YAML from 'yaml';
import { generateOpenApiSpec } from '../src/api/openapi/index.js';

const args = process.argv.slice(2);
const outputJson = args.includes('--json');

const spec = generateOpenApiSpec();

const outputDir = resolve(import.meta.dirname, '..', '..', 'docs');
const outputFile = outputJson ? 'openapi.json' : 'openapi.yaml';
const outputPath = resolve(outputDir, outputFile);

const content = outputJson ? JSON.stringify(spec, null, 2) : YAML.stringify(spec);

writeFileSync(outputPath, content, 'utf-8');

console.log(`✅ OpenAPI spec generated: ${outputPath}`);
