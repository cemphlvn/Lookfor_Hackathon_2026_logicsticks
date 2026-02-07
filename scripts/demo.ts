/**
 * Demo Script — Interactive CLI for hackathon demo
 *
 * Usage: npx tsx scripts/demo.ts
 */

import { createInterface } from 'readline';
import { buildNATPATMAS } from '../src/brands/natpat';
import { MASRuntime } from '../src/mas/runtime';

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                    NATPAT MAS DEMO - Lookfor Hackathon 2026                ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Team: logicsticks                                                          ║
║  API: ${process.env.API_URL || 'https://lookfor-backend.ngrok.app/v1/api'}
╚════════════════════════════════════════════════════════════════════════════╝
`);

  // Build MAS
  console.log('[DEMO] Building NATPAT MAS...');
  const { config, summary } = buildNATPATMAS();
  console.log(`[DEMO] Agents: ${summary.agentCount}`);
  console.log(`[DEMO] Tools: ${summary.toolCount}`);
  console.log(`[DEMO] Workflows: ${summary.workflows.join(', ')}`);
  console.log('');

  // Create runtime
  const runtime = new MASRuntime(config);

  // Start session with sample customer
  const sessionId = runtime.startSession({
    customerEmail: 'demo@example.com',
    firstName: 'Demo',
    lastName: 'Customer',
    shopifyCustomerId: 'cust_demo123'
  });

  console.log(`[DEMO] Session started: ${sessionId}`);
  console.log('[DEMO] Type messages as the customer. Type "trace" to see trace, "quit" to exit.');
  console.log('');

  // Interactive loop
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = () => {
    rl.question('Customer: ', async (input) => {
      if (!input || input.toLowerCase() === 'quit') {
        console.log('\n[DEMO] Session ended.');
        console.log(runtime.getTrace(sessionId));
        rl.close();
        return;
      }

      if (input.toLowerCase() === 'trace') {
        console.log(runtime.getTrace(sessionId));
        prompt();
        return;
      }

      try {
        const response = await runtime.handleMessage(sessionId, input);
        console.log(`\nAgent: ${response.message}`);

        if (response.escalated) {
          console.log('\n[ESCALATED] Session has been escalated. No further auto-replies.');
          if (response.escalationSummary) {
            console.log('[SUMMARY]', JSON.stringify(response.escalationSummary, null, 2));
          }
        }
        console.log('');
      } catch (error) {
        console.error('[ERROR]', error);
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
