#!/usr/bin/env npx tsx
/**
 * Semantic Test — Real LLM + Real Scenarios
 *
 * Tests if the system actually understands and responds correctly,
 * not just passes mock tests.
 */

import 'dotenv/config';

// Override API_URL for mock server
process.env.API_URL = 'http://localhost:3002/v1/api';

import { buildDefaultMAS } from '../src/meta/mas-builder';
import { resetToolClient } from '../src/mas/tools/client';

// Reset tool client to pick up new API_URL
resetToolClient();
import { MASRuntime } from '../src/mas/runtime';
import { memoryStore } from '../src/mas/memory';
import { createLLMClient } from '../src/mas/agents/executor';
import { createMockServer } from '../src/api/mock-lookfor';

async function runSemanticTest() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                     SEMANTIC TEST — Real LLM                              ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  // Start mock API for tool calls
  const mockServer = createMockServer(3002);
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    // Initialize with real LLM
    const llmClient = createLLMClient();
    console.log('✓ Real LLM client initialized (Anthropic Claude)\n');

    const { config } = buildDefaultMAS('natpat');
    const runtime = new MASRuntime(config, llmClient);

    // Scenario 1: Order Status
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('SCENARIO 1: Order Status Inquiry');
    console.log('═══════════════════════════════════════════════════════════════\n');

    memoryStore.clear();
    const session1 = runtime.startSession({
      customerEmail: 'sarah@example.com',
      firstName: 'Sarah',
      lastName: 'Johnson',
      shopifyCustomerId: 'cust_sarah_001'
    });

    console.log('Customer: "Hi, I placed an order last week and haven\'t received it yet. Order #NP1234567"\n');
    const response1 = await runtime.handleMessage(session1,
      "Hi, I placed an order last week and haven't received it yet. Order #NP1234567");

    console.log(`Agent Response:\n${response1.message}\n`);
    console.log(`Escalated: ${response1.escalated}`);
    console.log(`Tools Used: Check trace for details`);

    // Scenario 2: Subscription Cancellation
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('SCENARIO 2: Subscription Cancellation');
    console.log('═══════════════════════════════════════════════════════════════\n');

    memoryStore.clear();
    const session2 = runtime.startSession({
      customerEmail: 'mike@example.com',
      firstName: 'Mike',
      lastName: 'Chen',
      shopifyCustomerId: 'cust_mike_002'
    });

    console.log('Customer: "I want to cancel my subscription. The patches don\'t work for my kid."\n');
    const response2 = await runtime.handleMessage(session2,
      "I want to cancel my subscription. The patches don't work for my kid.");

    console.log(`Agent Response:\n${response2.message}\n`);
    console.log(`Escalated: ${response2.escalated}`);

    // Scenario 3: Multi-turn Conversation
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('SCENARIO 3: Multi-turn Refund Request');
    console.log('═══════════════════════════════════════════════════════════════\n');

    memoryStore.clear();
    const session3 = runtime.startSession({
      customerEmail: 'emma@example.com',
      firstName: 'Emma',
      lastName: 'Williams',
      shopifyCustomerId: 'cust_emma_003'
    });

    console.log('Customer: "I need a refund"\n');
    const r3a = await runtime.handleMessage(session3, "I need a refund");
    console.log(`Agent: ${r3a.message}\n`);

    console.log('Customer: "My order number is #NP9999999"\n');
    const r3b = await runtime.handleMessage(session3, "My order number is #NP9999999");
    console.log(`Agent: ${r3b.message}\n`);

    console.log('Customer: "Yes please process the refund"\n');
    const r3c = await runtime.handleMessage(session3, "Yes please process the refund");
    console.log(`Agent: ${r3c.message}\n`);

    // Check memory continuity
    const session3Data = memoryStore.getSession(session3);
    console.log(`Memory Check:`);
    console.log(`  - Messages: ${session3Data?.messages.length}`);
    console.log(`  - Mentioned Orders: ${session3Data?.context.mentionedOrderNumbers.join(', ')}`);

    // Scenario 4: Escalation
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('SCENARIO 4: Escalation Request');
    console.log('═══════════════════════════════════════════════════════════════\n');

    memoryStore.clear();
    const session4 = runtime.startSession({
      customerEmail: 'angry@example.com',
      firstName: 'Frustrated',
      lastName: 'Customer',
      shopifyCustomerId: 'cust_angry_004'
    });

    console.log('Customer: "This is unacceptable! I want to speak to a manager right now!"\n');
    const response4 = await runtime.handleMessage(session4,
      "This is unacceptable! I want to speak to a manager right now!");

    console.log(`Agent Response:\n${response4.message}\n`);
    console.log(`Escalated: ${response4.escalated}`);

    if (response4.escalationSummary) {
      console.log(`Escalation Summary:`);
      console.log(`  - Session: ${response4.escalationSummary.session_id}`);
      console.log(`  - Customer: ${JSON.stringify(response4.escalationSummary.customer)}`);
      console.log(`  - Issue Type: ${response4.escalationSummary.issue_type}`);
    }

    // Scenario 5: Product Question
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('SCENARIO 5: Product Information');
    console.log('═══════════════════════════════════════════════════════════════\n');

    memoryStore.clear();
    const session5 = runtime.startSession({
      customerEmail: 'curious@example.com',
      firstName: 'New',
      lastName: 'Customer',
      shopifyCustomerId: 'cust_new_005'
    });

    console.log('Customer: "What are the ingredients in your sleep patches? Are they safe for a 3 year old?"\n');
    const response5 = await runtime.handleMessage(session5,
      "What are the ingredients in your sleep patches? Are they safe for a 3 year old?");

    console.log(`Agent Response:\n${response5.message}\n`);

    // Final Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('SEMANTIC TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('Scenarios Tested:');
    console.log('  1. Order Status Inquiry → Agent should look up order');
    console.log('  2. Subscription Cancel → Agent should handle subscription');
    console.log('  3. Multi-turn Refund → Memory should persist across turns');
    console.log('  4. Escalation → Should stop auto-reply, generate summary');
    console.log('  5. Product Question → Agent should provide info');
    console.log('\n✓ Review the responses above to verify semantic correctness');

  } finally {
    mockServer.close();
  }
}

runSemanticTest().catch(error => {
  console.error('Semantic test failed:', error);
  process.exit(1);
});
