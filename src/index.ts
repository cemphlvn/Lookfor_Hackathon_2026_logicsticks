/**
 * hackaton_lookfor — Self-Referential Meta-Automata
 *
 * Main entry point exporting all components
 */

// Meta-system (Step 2)
export * from './meta/tool-mapper/tools';
export * from './meta/workflow-parser';
export * from './meta/intent-extractor';
export * from './meta/agent-generator';
export * from './meta/mas-builder';

// MAS Runtime (Step 1 implementation)
export * from './mas/memory';
export * from './mas/tracing';
export * from './mas/orchestrator';
export * from './mas/tools/client';
export * from './mas/agents/executor';
export * from './mas/runtime';

// API
export * from './api/server';

// Quick start helper
import { buildDefaultMAS } from './meta/mas-builder';
import { MASRuntime } from './mas/runtime';
import { startServer } from './api/server';

export async function quickStart(brandName: string = 'demo-brand', port: number = 3001): Promise<void> {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║  hackaton_lookfor MAS Quick Start          ║`);
  console.log(`║  Brand: ${brandName.padEnd(34)}║`);
  console.log(`╚════════════════════════════════════════════╝\n`);

  await startServer(port, brandName);
}

// CLI
if (require.main === module) {
  const brand = process.argv[2] || process.env.BRAND_NAME || 'demo-brand';
  const port = parseInt(process.argv[3] || process.env.PORT || '3001');
  quickStart(brand, port);
}
