#!/usr/bin/env npx tsx
/**
 * Start All — Single command to start Mock API + Dashboard
 *
 * Usage: npm run start:demo
 */

import { createMockServer } from '../src/api/mock-lookfor';
import { startServer } from '../src/api/server';

// Force mock API mode
process.env.USE_MOCK_API = 'true';

console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                     LOOKFOR MAS — DEMO MODE                               ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  Mock API:   http://localhost:3002                                        ║
║  Dashboard:  http://localhost:3001                                        ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  Test Customers:                                                          ║
║    • baki@lookfor.ai   — 2 orders, ACTIVE subscription                    ║
║    • ebrar@lookfor.ai  — 2 orders, PAUSED subscription                    ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

// Start mock API on 3002
createMockServer(3002);

// Start dashboard on 3001
startServer(3001, 'NATPAT');
