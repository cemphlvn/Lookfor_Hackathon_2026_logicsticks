#!/usr/bin/env npx tsx
/**
 * Start Mock API — Use for demos when backend unavailable
 */

import { createMockServer } from '../src/api/mock-lookfor';

const port = parseInt(process.env.MOCK_PORT || '3002');
createMockServer(port);

console.log('\n=== Mock Lookfor API ===');
console.log(`Port: ${port}`);
console.log(`Use: API_URL=http://localhost:${port}/v1/api`);
console.log('\nPress Ctrl+C to stop\n');
