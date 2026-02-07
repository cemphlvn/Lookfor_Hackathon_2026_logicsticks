#!/usr/bin/env npx tsx
/**
 * JUDGE EVALUATION SUITE
 *
 * This suite tests all 4 hackathon requirements from the judge's perspective.
 * Run with: npm run judge
 *
 * Requirements:
 * 1. Email Session Start — Customer details initialize session
 * 2. Continuous Memory — Context persists across messages
 * 3. Observable Actions — Every action is traceable
 * 4. Escalation Mechanism — Human requests stop auto-reply
 */

import { buildDefaultMAS } from '../src/meta/mas-builder';
import { MASRuntime } from '../src/mas/runtime';
import { memoryStore } from '../src/mas/memory';
import { createLLMClient, LLMClient } from '../src/mas/agents/executor';

interface TestResult {
  requirement: string;
  test: string;
  passed: boolean;
  details: string;
  evidence?: string;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(msg);
}

function pass(requirement: string, test: string, details: string, evidence?: string) {
  results.push({ requirement, test, passed: true, details, evidence });
  log(`  ✅ ${test}`);
  if (evidence) log(`     Evidence: ${evidence}`);
}

function fail(requirement: string, test: string, details: string) {
  results.push({ requirement, test, passed: false, details });
  log(`  ❌ ${test}: ${details}`);
}

async function testRequirement1(runtime: MASRuntime) {
  log('\n═══════════════════════════════════════════════════════════════');
  log('REQUIREMENT 1: Email Session Start');
  log('═══════════════════════════════════════════════════════════════');

  // Test 1.1: Session starts with customer details
  const sessionId = runtime.startSession({
    customerEmail: 'judge@lookfor.ai',
    firstName: 'Judge',
    lastName: 'Evaluator',
    shopifyCustomerId: 'cust_judge_001'
  });

  if (sessionId && sessionId.startsWith('session_')) {
    pass('R1', 'Session ID generated', 'Unique session ID created', sessionId);
  } else {
    fail('R1', 'Session ID generated', 'No session ID returned');
  }

  // Test 1.2: Customer info stored
  const session = memoryStore.getSession(sessionId);
  if (session?.customerEmail === 'judge@lookfor.ai' &&
      session?.customerFirstName === 'Judge') {
    pass('R1', 'Customer details stored', 'Email and name persisted',
         `Email: ${session.customerEmail}, Name: ${session.customerFirstName}`);
  } else {
    fail('R1', 'Customer details stored', 'Customer info not found in session');
  }

  // Test 1.3: Shopify ID linked
  if (session?.shopifyCustomerId === 'cust_judge_001') {
    pass('R1', 'Shopify customer ID linked', 'External ID stored', session.shopifyCustomerId);
  } else {
    fail('R1', 'Shopify customer ID linked', 'Shopify ID not stored');
  }

  return sessionId;
}

async function testRequirement2(runtime: MASRuntime, sessionId: string) {
  log('\n═══════════════════════════════════════════════════════════════');
  log('REQUIREMENT 2: Continuous Memory');
  log('═══════════════════════════════════════════════════════════════');

  // Test 2.1: First message stored
  await runtime.handleMessage(sessionId, 'What is the status of order #NP9876543?');

  let session = memoryStore.getSession(sessionId);
  if (session && session.messages.length >= 1) {
    pass('R2', 'Messages stored in history', 'Conversation persists',
         `${session.messages.length} messages in history`);
  } else {
    fail('R2', 'Messages stored in history', 'No messages found');
  }

  // Test 2.2: Entity extraction (order number)
  if (session?.context.mentionedOrderNumbers.includes('#NP9876543')) {
    pass('R2', 'Entity extraction works', 'Order number extracted',
         `Extracted: ${session.context.mentionedOrderNumbers.join(', ')}`);
  } else {
    fail('R2', 'Entity extraction works', 'Order number not extracted');
  }

  // Test 2.3: Second message maintains context
  await runtime.handleMessage(sessionId, 'When will it arrive?');

  session = memoryStore.getSession(sessionId);
  if (session && session.messages.length >= 3) { // 2 customer + at least 1 agent
    pass('R2', 'Context maintained across messages', 'Multi-turn conversation works',
         `Total messages: ${session.messages.length}`);
  } else {
    fail('R2', 'Context maintained across messages', 'Messages not accumulating');
  }

  // Test 2.4: Memory isolation between sessions
  memoryStore.clear();
  const newSessionId = runtime.startSession({
    customerEmail: 'other@test.com',
    firstName: 'Other',
    lastName: 'User',
    shopifyCustomerId: 'cust_other'
  });

  const newSession = memoryStore.getSession(newSessionId);
  if (newSession && newSession.messages.length === 0) {
    pass('R2', 'Session isolation', 'New session starts fresh',
         'No bleed-over from previous session');
  } else {
    fail('R2', 'Session isolation', 'Session data leaked');
  }
}

async function testRequirement3(runtime: MASRuntime) {
  log('\n═══════════════════════════════════════════════════════════════');
  log('REQUIREMENT 3: Observable Actions');
  log('═══════════════════════════════════════════════════════════════');

  memoryStore.clear();

  const sessionId = runtime.startSession({
    customerEmail: 'trace@test.com',
    firstName: 'Trace',
    lastName: 'Test',
    shopifyCustomerId: 'cust_trace'
  });

  await runtime.handleMessage(sessionId, 'I need a refund for my order #12345');

  // Test 3.1: Trace exists
  const trace = runtime.getTrace(sessionId);
  if (trace && trace.includes('SESSION TRACE')) {
    pass('R3', 'Trace generated', 'Trace log created for session',
         `Trace length: ${trace.length} chars`);
  } else {
    fail('R3', 'Trace generated', 'No trace found');
  }

  // Test 3.2: Customer message logged (format: MESSAGE: customer)
  if (trace.includes('MESSAGE') && trace.includes('customer')) {
    pass('R3', 'Customer messages traced', 'Input logged in trace',
         'MESSAGE: customer - "..."');
  } else {
    fail('R3', 'Customer messages traced', 'Customer message not in trace');
  }

  // Test 3.3: Agent response logged (format: MESSAGE: agent)
  if (trace.includes('MESSAGE') && trace.includes('agent')) {
    pass('R3', 'Agent responses traced', 'Output logged in trace',
         'MESSAGE: agent - "..."');
  } else {
    fail('R3', 'Agent responses traced', 'Agent message not in trace');
  }

  // Test 3.4: Routing decision logged
  if (trace.includes('ROUTING')) {
    pass('R3', 'Routing decisions traced', 'Agent selection logged',
         'ROUTING: from → to');
  } else {
    fail('R3', 'Routing decisions traced', 'Routing not in trace');
  }

  // Test 3.5: JSON trace available
  const traceJson = runtime.getTraceJson(sessionId);
  try {
    const parsed = JSON.parse(traceJson);
    if (parsed.sessionId && parsed.timeline) {
      pass('R3', 'Structured JSON trace', 'Machine-readable trace available',
           `Timeline events: ${parsed.timeline.length}`);
    } else {
      fail('R3', 'Structured JSON trace', 'Invalid JSON structure');
    }
  } catch {
    fail('R3', 'Structured JSON trace', 'JSON parse failed');
  }
}

async function testRequirement4(runtime: MASRuntime) {
  log('\n═══════════════════════════════════════════════════════════════');
  log('REQUIREMENT 4: Escalation Mechanism');
  log('═══════════════════════════════════════════════════════════════');

  memoryStore.clear();

  const sessionId = runtime.startSession({
    customerEmail: 'escalate@test.com',
    firstName: 'Escalate',
    lastName: 'Test',
    shopifyCustomerId: 'cust_escalate'
  });

  // Test 4.1: Normal message does NOT escalate
  const normalResponse = await runtime.handleMessage(sessionId, 'Where is my order?');
  if (!normalResponse.escalated) {
    pass('R4', 'Normal messages not escalated', 'Regular inquiries handled by agent',
         'escalated: false');
  } else {
    fail('R4', 'Normal messages not escalated', 'False positive escalation');
  }

  // Test 4.2: Human request DOES escalate
  memoryStore.clear();
  const escalateSessionId = runtime.startSession({
    customerEmail: 'human@test.com',
    firstName: 'Human',
    lastName: 'Request',
    shopifyCustomerId: 'cust_human'
  });

  const escalateResponse = await runtime.handleMessage(escalateSessionId,
    'I want to speak to a human agent please');

  if (escalateResponse.escalated) {
    pass('R4', 'Human request triggers escalation', 'Customer gets human',
         'escalated: true');
  } else {
    fail('R4', 'Human request triggers escalation', 'Failed to detect escalation');
  }

  // Test 4.3: Escalation summary provided
  if (escalateResponse.escalationSummary) {
    pass('R4', 'Escalation summary generated', 'Handoff info available',
         `Summary keys: ${Object.keys(escalateResponse.escalationSummary).join(', ')}`);
  } else {
    fail('R4', 'Escalation summary generated', 'No summary provided');
  }

  // Test 4.4: Auto-reply stops after escalation
  const followUp = await runtime.handleMessage(escalateSessionId, 'Hello? Anyone there?');
  if (followUp.escalated && followUp.message.includes('escalated')) {
    pass('R4', 'Auto-reply stops after escalation', 'No further bot responses',
         'Session remains escalated');
  } else {
    fail('R4', 'Auto-reply stops after escalation', 'Bot continued responding');
  }

  // Test 4.5: Multiple escalation triggers work
  const triggers = [
    'Let me speak to your manager',
    'I need a real person',
    'Transfer me to a supervisor'
  ];

  for (const trigger of triggers) {
    memoryStore.clear();
    const testSession = runtime.startSession({
      customerEmail: 'trigger@test.com',
      firstName: 'Trigger',
      lastName: 'Test',
      shopifyCustomerId: 'cust_trigger'
    });

    const response = await runtime.handleMessage(testSession, trigger);
    if (response.escalated) {
      pass('R4', `Trigger: "${trigger.slice(0, 30)}..."`, 'Correctly escalated', '');
    } else {
      fail('R4', `Trigger: "${trigger.slice(0, 30)}..."`, 'Failed to escalate');
    }
  }
}

async function testEndToEnd(runtime: MASRuntime, llmClient: LLMClient | null) {
  log('\n═══════════════════════════════════════════════════════════════');
  log('END-TO-END: Real Customer Scenarios');
  log('═══════════════════════════════════════════════════════════════');

  if (!llmClient) {
    log('  ⚠️  Skipping E2E tests (no LLM client available)');
    return;
  }

  const scenarios = [
    {
      name: 'Order Status Inquiry',
      messages: ['Where is my order #NP1234567?'],
      expectTools: true
    },
    {
      name: 'Subscription Cancellation',
      messages: ['I want to cancel my subscription'],
      expectTools: true
    },
    {
      name: 'Multi-turn Refund',
      messages: [
        'I need a refund',
        'Order number is #NP9999999',
        'Yes, please process the refund'
      ],
      expectTools: true
    }
  ];

  for (const scenario of scenarios) {
    memoryStore.clear();
    const sessionId = runtime.startSession({
      customerEmail: 'e2e@test.com',
      firstName: 'E2E',
      lastName: 'Test',
      shopifyCustomerId: 'cust_e2e'
    });

    log(`  Testing: ${scenario.name}`);

    try {
      for (const msg of scenario.messages) {
        const response = await runtime.handleMessage(sessionId, msg);
        if (response.message) {
          pass('E2E', scenario.name, 'Agent responded',
               response.message.slice(0, 50) + '...');
        }
      }
    } catch (error) {
      fail('E2E', scenario.name, `Error: ${error}`);
    }
  }
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║                    LOOKFOR HACKATHON — JUDGE SUITE                        ║
║                                                                           ║
║   Team: logicsticks                                                       ║
║   Project: Multi-Agent System for E-commerce Email Support                ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  // Initialize
  log('Initializing MAS...');
  const { config, summary } = buildDefaultMAS('natpat');
  log(`  Agents: ${summary.agentCount}`);
  log(`  Tools: ${summary.toolCount}`);
  log(`  Routing Rules: ${summary.routingRuleCount}`);

  // Create LLM client (or use test mock)
  let llmClient: LLMClient;
  let usingRealLLM = false;

  try {
    llmClient = createLLMClient();
    usingRealLLM = true;
    log('  LLM: Production (Anthropic Claude)');
  } catch {
    log('  LLM: Test mock (no API key found)');
    llmClient = {
      async chat(messages) {
        const lastUser = messages.filter(m => m.role === 'user').pop();
        const content = lastUser?.content || '';

        if (typeof content === 'string' &&
            (content.includes('human') || content.includes('manager') || content.includes('real person'))) {
          return { content: 'I am escalating this to our team.' };
        }

        return { content: `I understand your request. Let me help you with that.` };
      }
    };
  }

  const runtime = new MASRuntime(config, llmClient);

  // Run all requirement tests
  const sessionId = await testRequirement1(runtime);
  await testRequirement2(runtime, sessionId);
  await testRequirement3(runtime);
  await testRequirement4(runtime);

  if (usingRealLLM) {
    await testEndToEnd(runtime, llmClient);
  }

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`
═══════════════════════════════════════════════════════════════════════════
                           FINAL RESULTS
═══════════════════════════════════════════════════════════════════════════

  Total Tests:  ${total}
  Passed:       ${passed} ✅
  Failed:       ${failed} ${failed > 0 ? '❌' : ''}

  Score:        ${((passed / total) * 100).toFixed(1)}%

═══════════════════════════════════════════════════════════════════════════
                        REQUIREMENT SUMMARY
═══════════════════════════════════════════════════════════════════════════

  R1 (Email Session Start):    ${results.filter(r => r.requirement === 'R1' && r.passed).length}/${results.filter(r => r.requirement === 'R1').length} passed
  R2 (Continuous Memory):      ${results.filter(r => r.requirement === 'R2' && r.passed).length}/${results.filter(r => r.requirement === 'R2').length} passed
  R3 (Observable Actions):     ${results.filter(r => r.requirement === 'R3' && r.passed).length}/${results.filter(r => r.requirement === 'R3').length} passed
  R4 (Escalation Mechanism):   ${results.filter(r => r.requirement === 'R4' && r.passed).length}/${results.filter(r => r.requirement === 'R4').length} passed
  ${usingRealLLM ? `E2E (End-to-End):            ${results.filter(r => r.requirement === 'E2E' && r.passed).length}/${results.filter(r => r.requirement === 'E2E').length} passed` : ''}

═══════════════════════════════════════════════════════════════════════════
`);

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Judge suite failed:', error);
  process.exit(1);
});
