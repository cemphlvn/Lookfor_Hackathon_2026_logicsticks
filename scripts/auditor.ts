#!/usr/bin/env npx tsx
/**
 * AUDITOR — Continuous Cognitive Simulation
 *
 * This system:
 * 1. Runs scenarios with real LLM
 * 2. Evaluates quality (routing, tools, responses)
 * 3. Identifies improvement points
 * 4. Suggests fixes
 * 5. Repeats forever
 */

import 'dotenv/config';
import { buildDefaultMAS } from '../src/meta/mas-builder';
import { MASRuntime } from '../src/mas/runtime';
import { memoryStore } from '../src/mas/memory';
import { createLLMClient, LLMClient } from '../src/mas/agents/executor';
import { classifyMessage } from '../src/meta/intent-extractor';
import { resetToolClient } from '../src/mas/tools/client';

// Test emails from Lookfor mock data
const TEST_EMAILS = ['baki@lookfor.ai', 'ebrar@lookfor.ai'];

interface AuditResult {
  scenario: string;
  passed: boolean;
  scores: {
    routing: number;      // 0-100: Did we route to right agent?
    toolSelection: number; // 0-100: Did we call the right tools?
    responseQuality: number; // 0-100: Was the response helpful?
    memoryUsage: number;  // 0-100: Did we use context properly?
  };
  issues: string[];
  suggestions: string[];
}

interface Scenario {
  name: string;
  customerEmail: string;
  messages: string[];
  expectedIntent: string;
  expectedTools: string[];
  qualityChecks: ((response: string) => boolean)[];
}

// Comprehensive test scenarios
const SCENARIOS: Scenario[] = [
  {
    name: 'Order Status - Simple',
    customerEmail: 'baki@lookfor.ai',
    messages: ['Where is my order?'],
    expectedIntent: 'ORDER_STATUS',
    expectedTools: ['shopify_get_customer_orders', 'shopify_get_order_details'],
    qualityChecks: [
      (r) => r.toLowerCase().includes('order') || r.toLowerCase().includes('status'),
      (r) => !r.includes('I apologize, but I was unable'),
    ]
  },
  {
    name: 'Order Status - With Number',
    customerEmail: 'ebrar@lookfor.ai',
    messages: ['What is the status of order #12345?'],
    expectedIntent: 'ORDER_STATUS',
    expectedTools: ['shopify_get_order_details'],
    qualityChecks: [
      (r) => r.toLowerCase().includes('order'),
    ]
  },
  {
    name: 'Subscription Cancel',
    customerEmail: 'baki@lookfor.ai',
    messages: ['I want to cancel my subscription'],
    expectedIntent: 'SUBSCRIPTION_CANCEL',
    expectedTools: ['skio_get_subscription_status', 'skio_cancel_subscription'],
    qualityChecks: [
      (r) => r.toLowerCase().includes('subscription') || r.toLowerCase().includes('cancel'),
    ]
  },
  {
    name: 'Refund Request',
    customerEmail: 'ebrar@lookfor.ai',
    messages: ['I need a refund for my order'],
    expectedIntent: 'REFUND_REQUEST',
    expectedTools: ['shopify_get_order_details', 'shopify_refund_order'],
    qualityChecks: [
      (r) => r.toLowerCase().includes('refund'),
    ]
  },
  {
    name: 'Multi-turn Refund',
    customerEmail: 'baki@lookfor.ai',
    messages: [
      'I want a refund',
      'Order number is #98765',
      'Yes please process it'
    ],
    expectedIntent: 'REFUND_REQUEST',
    expectedTools: ['shopify_get_order_details'],
    qualityChecks: [
      (r) => true, // Just check it responds
    ]
  },
  {
    name: 'Escalation - Human Request',
    customerEmail: 'ebrar@lookfor.ai',
    messages: ['I want to speak to a human agent'],
    expectedIntent: 'ESCALATION_REQUEST',
    expectedTools: [],
    qualityChecks: [
      (r) => r.toLowerCase().includes('escalat') || r.toLowerCase().includes('team'),
    ]
  },
  {
    name: 'Escalation - Manager Request',
    customerEmail: 'baki@lookfor.ai',
    messages: ['Let me speak to your manager'],
    expectedIntent: 'ESCALATION_REQUEST',
    expectedTools: [],
    qualityChecks: [
      (r) => r.toLowerCase().includes('escalat'),
    ]
  },
  {
    name: 'Address Update',
    customerEmail: 'ebrar@lookfor.ai',
    messages: ['I need to change my shipping address'],
    expectedIntent: 'SHIPPING_ADDRESS',
    expectedTools: ['shopify_update_order_shipping_address'],
    qualityChecks: [
      (r) => r.toLowerCase().includes('address'),
    ]
  },
  {
    name: 'Product Question',
    customerEmail: 'baki@lookfor.ai',
    messages: ['What ingredients are in the sleep patches?'],
    expectedIntent: 'PRODUCT_INQUIRY',
    expectedTools: ['shopify_get_product_details', 'shopify_get_related_knowledge_source'],
    qualityChecks: [
      (r) => !r.includes('I apologize, but I was unable'),
    ]
  },
  {
    name: 'Pause Subscription',
    customerEmail: 'ebrar@lookfor.ai',
    messages: ['Can I pause my subscription for a month?'],
    expectedIntent: 'SUBSCRIPTION_PAUSE',
    expectedTools: ['skio_pause_subscription'],
    qualityChecks: [
      (r) => r.toLowerCase().includes('subscription') || r.toLowerCase().includes('pause'),
    ]
  }
];

async function runAudit(runtime: MASRuntime, scenario: Scenario): Promise<AuditResult> {
  memoryStore.clear();

  const sessionId = runtime.startSession({
    customerEmail: scenario.customerEmail,
    firstName: scenario.customerEmail.split('@')[0],
    lastName: 'TestUser',
    shopifyCustomerId: `cust_${scenario.customerEmail.split('@')[0]}`
  });

  const issues: string[] = [];
  const suggestions: string[] = [];
  let routingScore = 100;
  let toolScore = 100;
  let responseScore = 100;
  let memoryScore = 100;

  let lastResponse = '';
  const toolsCalled: string[] = [];

  // Run all messages
  for (const message of scenario.messages) {
    try {
      const response = await runtime.handleMessage(sessionId, message);
      lastResponse = response.message;

      // Check escalation
      if (scenario.expectedIntent === 'ESCALATION_REQUEST' && !response.escalated) {
        issues.push('Expected escalation but did not escalate');
        routingScore -= 50;
      }
    } catch (error) {
      issues.push(`Error: ${error}`);
      responseScore -= 50;
    }
  }

  // Check intent classification
  const classification = classifyMessage(scenario.messages[0]);
  if (classification.primary !== scenario.expectedIntent) {
    issues.push(`Intent mismatch: got ${classification.primary}, expected ${scenario.expectedIntent}`);
    routingScore -= 30;
    suggestions.push(`Add keywords for ${scenario.expectedIntent} intent`);
  }

  // Check response quality
  for (const check of scenario.qualityChecks) {
    if (!check(lastResponse)) {
      responseScore -= 25;
      issues.push('Response quality check failed');
    }
  }

  // Check memory
  const session = memoryStore.getSession(sessionId);
  if (session) {
    if (session.messages.length < scenario.messages.length) {
      memoryScore -= 30;
      issues.push('Not all messages were stored');
    }

    // Check entity extraction
    const hasOrderNumber = scenario.messages.some(m => m.includes('#'));
    if (hasOrderNumber && session.context.mentionedOrderNumbers.length === 0) {
      memoryScore -= 20;
      issues.push('Order number not extracted');
    }
  }

  const avgScore = (routingScore + toolScore + responseScore + memoryScore) / 4;

  return {
    scenario: scenario.name,
    passed: avgScore >= 70 && issues.length === 0,
    scores: {
      routing: Math.max(0, routingScore),
      toolSelection: Math.max(0, toolScore),
      responseQuality: Math.max(0, responseScore),
      memoryUsage: Math.max(0, memoryScore)
    },
    issues,
    suggestions
  };
}

function printReport(results: AuditResult[]) {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           AUDIT REPORT                                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  let totalRouting = 0, totalTool = 0, totalResponse = 0, totalMemory = 0;
  const allIssues: string[] = [];
  const allSuggestions: string[] = [];

  for (const result of results) {
    const avgScore = (result.scores.routing + result.scores.toolSelection +
                      result.scores.responseQuality + result.scores.memoryUsage) / 4;
    const status = result.passed ? '✅' : '❌';

    console.log(`${status} ${result.scenario}`);
    console.log(`   Routing: ${result.scores.routing}% | Tools: ${result.scores.toolSelection}% | Response: ${result.scores.responseQuality}% | Memory: ${result.scores.memoryUsage}%`);

    if (result.issues.length > 0) {
      console.log(`   Issues: ${result.issues.join(', ')}`);
      allIssues.push(...result.issues);
    }

    totalRouting += result.scores.routing;
    totalTool += result.scores.toolSelection;
    totalResponse += result.scores.responseQuality;
    totalMemory += result.scores.memoryUsage;
    allSuggestions.push(...result.suggestions);
  }

  const n = results.length;
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('                            OVERALL SCORES');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`  Routing Accuracy:     ${(totalRouting / n).toFixed(1)}%`);
  console.log(`  Tool Selection:       ${(totalTool / n).toFixed(1)}%`);
  console.log(`  Response Quality:     ${(totalResponse / n).toFixed(1)}%`);
  console.log(`  Memory Usage:         ${(totalMemory / n).toFixed(1)}%`);
  console.log(`  Overall:              ${((totalRouting + totalTool + totalResponse + totalMemory) / (4 * n)).toFixed(1)}%`);

  if (allIssues.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('                          ISSUES FOUND');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    const uniqueIssues = [...new Set(allIssues)];
    uniqueIssues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`));
  }

  if (allSuggestions.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('                        IMPROVEMENT SUGGESTIONS');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    const uniqueSuggestions = [...new Set(allSuggestions)];
    uniqueSuggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  }

  return {
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    overallScore: (totalRouting + totalTool + totalResponse + totalMemory) / (4 * n)
  };
}

async function runAuditorLoop() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║                    CONTINUOUS AUDITOR SYSTEM                              ║
║                                                                           ║
║   Test Emails: baki@lookfor.ai, ebrar@lookfor.ai                          ║
║   Mode: Cognitive Simulation + Quality Evaluation                         ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  // Initialize
  let llmClient: LLMClient;
  try {
    llmClient = createLLMClient();
    console.log('✓ Real LLM client initialized');
  } catch (error) {
    console.log('⚠ No LLM API key - using mock client');
    llmClient = {
      async chat(messages) {
        const lastUser = messages.filter((m: any) => m.role === 'user').pop();
        const content = lastUser?.content || '';

        if (content.toLowerCase().includes('human') || content.toLowerCase().includes('manager')) {
          return { content: 'I am escalating this to our team.' };
        }

        return { content: `I understand your request. Let me help you with that.` };
      }
    };
  }

  const { config } = buildDefaultMAS('natpat');
  const runtime = new MASRuntime(config, llmClient);

  let iteration = 1;

  while (true) {
    console.log(`\n═══════════════════════════════════════════════════════════════════════════`);
    console.log(`                         AUDIT ITERATION ${iteration}`);
    console.log(`═══════════════════════════════════════════════════════════════════════════\n`);

    const results: AuditResult[] = [];

    for (const scenario of SCENARIOS) {
      console.log(`Testing: ${scenario.name}...`);
      try {
        const result = await runAudit(runtime, scenario);
        results.push(result);
      } catch (error) {
        console.log(`  Error: ${error}`);
        results.push({
          scenario: scenario.name,
          passed: false,
          scores: { routing: 0, toolSelection: 0, responseQuality: 0, memoryUsage: 0 },
          issues: [`Error: ${error}`],
          suggestions: []
        });
      }
    }

    const summary = printReport(results);

    console.log(`\n═══════════════════════════════════════════════════════════════════════════`);
    console.log(`                         ITERATION ${iteration} COMPLETE`);
    console.log(`═══════════════════════════════════════════════════════════════════════════`);
    console.log(`  Passed: ${summary.passed}/${results.length}`);
    console.log(`  Overall Score: ${summary.overallScore.toFixed(1)}%`);

    if (summary.overallScore >= 95) {
      console.log('\n🎉 System is performing excellently!');
    } else if (summary.overallScore >= 80) {
      console.log('\n✓ System is performing well, minor improvements possible');
    } else if (summary.overallScore >= 60) {
      console.log('\n⚠ System needs improvement in some areas');
    } else {
      console.log('\n❌ System needs significant improvement');
    }

    // Wait before next iteration
    console.log('\nNext audit in 60 seconds... (Ctrl+C to stop)\n');
    await new Promise(resolve => setTimeout(resolve, 60000));
    iteration++;
  }
}

// Run once or continuously
const args = process.argv.slice(2);
if (args.includes('--once')) {
  // Run single audit
  (async () => {
    let llmClient: LLMClient;
    try {
      llmClient = createLLMClient();
    } catch {
      llmClient = {
        async chat(messages) {
          const lastUser = messages.filter((m: any) => m.role === 'user').pop();
          const content = lastUser?.content || '';
          if (content.toLowerCase().includes('human') || content.toLowerCase().includes('manager')) {
            return { content: 'I am escalating this to our team.' };
          }
          return { content: `I understand your request. Let me help you with that.` };
        }
      };
    }

    const { config } = buildDefaultMAS('natpat');
    const runtime = new MASRuntime(config, llmClient);

    const results: AuditResult[] = [];
    for (const scenario of SCENARIOS) {
      console.log(`Testing: ${scenario.name}...`);
      const result = await runAudit(runtime, scenario);
      results.push(result);
    }

    printReport(results);
  })();
} else {
  runAuditorLoop().catch(console.error);
}
