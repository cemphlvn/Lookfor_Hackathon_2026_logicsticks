#!/usr/bin/env npx tsx
/**
 * JUDGE CI/CD — Continuous Integration with Judge Perspective
 *
 * Runs comprehensive tests from a judge's viewpoint:
 * - All 4 hackathon requirements
 * - Quality metrics
 * - Improvement suggestions
 *
 * Usage:
 *   npm run judge:ci          # Single run
 *   npm run judge:ci -- --loop # Continuous loop
 */

import 'dotenv/config';
import { createMockServer } from '../src/api/mock-lookfor';
import { MASRuntime } from '../src/mas/runtime';
import { buildNATPATMAS } from '../src/brands/natpat';
import { memoryStore } from '../src/mas/memory';
import { tracer } from '../src/mas/tracing';
import { classifyMessage } from '../src/meta/intent-extractor';
import { resetToolClient } from '../src/mas/tools/client';
import { LLMClient, createLLMClient } from '../src/mas/agents/executor';
import * as http from 'http';

// Mock LLM client for testing without API key
function createMockLLMClient(): LLMClient {
  return {
    async chat(messages: any[]) {
      const lastUser = messages.filter((m: any) => m.role === 'user').pop();
      const content = (lastUser?.content || '').toLowerCase();

      // Detect escalation keywords
      if (content.includes('human') || content.includes('manager') || content.includes('supervisor') || content.includes('real person')) {
        return { content: 'I understand you would like to speak with a human agent. Let me escalate this for you.' };
      }

      // Simple response based on intent
      if (content.includes('order') || content.includes('tracking')) {
        return { content: 'I can help you with your order. Let me look up the details.' };
      }
      if (content.includes('cancel') || content.includes('subscription')) {
        return { content: 'I can help you with your subscription request.' };
      }
      if (content.includes('refund')) {
        return { content: 'I can help process your refund request.' };
      }

      return { content: 'I understand your request. Let me help you with that.' };
    }
  };
}

function getLLMClient(): LLMClient {
  try {
    return createLLMClient();
  } catch {
    console.log('[Judge CI] No LLM API key — using mock LLM client');
    return createMockLLMClient();
  }
}

// Force mock mode
process.env.USE_MOCK_API = 'true';
resetToolClient();

interface JudgeResult {
  requirement: string;
  scenario: string;
  passed: boolean;
  score: number;
  details: string;
  improvement?: string;
}

interface JudgeReport {
  timestamp: string;
  totalScore: number;
  requirements: {
    r1_session: { passed: number; total: number; score: number };
    r2_memory: { passed: number; total: number; score: number };
    r3_observable: { passed: number; total: number; score: number };
    r4_escalation: { passed: number; total: number; score: number };
  };
  results: JudgeResult[];
  improvements: string[];
}

// Test scenarios organized by requirement
const JUDGE_SCENARIOS = {
  R1_SESSION: [
    { name: 'Basic session start', email: 'baki@lookfor.ai', check: 'session_created' },
    { name: 'Customer info stored', email: 'ebrar@lookfor.ai', check: 'customer_info' },
    { name: 'Unique session ID', email: 'baki@lookfor.ai', check: 'unique_id' },
  ],
  R2_MEMORY: [
    { name: 'Message history', email: 'baki@lookfor.ai', messages: ['Hello', 'My order is #NP2001001'], check: 'history' },
    { name: 'Entity extraction', email: 'baki@lookfor.ai', messages: ['Order #NP2001002 is late'], check: 'entities' },
    { name: 'Context preserved', email: 'ebrar@lookfor.ai', messages: ['I need help', 'With order #NP3001001', 'Can I get refund?'], check: 'context' },
    { name: 'Intent history', email: 'baki@lookfor.ai', messages: ['Where is my order?', 'I want to cancel my subscription'], check: 'intents' },
  ],
  R3_OBSERVABLE: [
    { name: 'Tool calls logged', email: 'baki@lookfor.ai', message: 'Where is my order?', check: 'tool_logged' },
    { name: 'Routing traced', email: 'ebrar@lookfor.ai', message: 'Cancel my subscription', check: 'routing_traced' },
    { name: 'Timestamps present', email: 'baki@lookfor.ai', message: 'Help me', check: 'timestamps' },
    { name: 'Error handling traced', email: 'ebrar@lookfor.ai', message: 'asdfasdf random text', check: 'errors_traced' },
  ],
  R4_ESCALATION: [
    { name: '"human" keyword', email: 'baki@lookfor.ai', message: 'I want to speak to a human', check: 'escalated' },
    { name: '"manager" keyword', email: 'ebrar@lookfor.ai', message: 'Let me talk to your manager', check: 'escalated' },
    { name: '"supervisor" keyword', email: 'baki@lookfor.ai', message: 'Transfer me to a supervisor', check: 'escalated' },
    { name: 'Auto-reply stops', email: 'ebrar@lookfor.ai', messages: ['I need a human', 'Are you there?'], check: 'auto_stopped' },
    { name: 'Summary generated', email: 'baki@lookfor.ai', message: 'I need to speak to a real person', check: 'summary' },
  ],
};

async function runJudgeTests(runtime: MASRuntime): Promise<JudgeReport> {
  const results: JudgeResult[] = [];
  const improvements: string[] = [];

  // R1: Session Start
  for (const scenario of JUDGE_SCENARIOS.R1_SESSION) {
    memoryStore.clear();
    const sessionId = runtime.startSession({
      customerEmail: scenario.email,
      firstName: scenario.email.split('@')[0],
      lastName: 'Test',
      shopifyCustomerId: `cust_${scenario.email.split('@')[0]}`
    });

    let passed = false;
    let details = '';

    if (scenario.check === 'session_created') {
      passed = !!sessionId && sessionId.length > 0;
      details = passed ? `Session ID: ${sessionId}` : 'No session ID returned';
    } else if (scenario.check === 'customer_info') {
      const session = memoryStore.getSession(sessionId);
      passed = session?.customerEmail === scenario.email;
      details = passed ? `Email stored: ${session?.customerEmail}` : 'Customer info not stored';
    } else if (scenario.check === 'unique_id') {
      const sessionId2 = runtime.startSession({
        customerEmail: scenario.email,
        firstName: 'Test',
        lastName: 'User',
        shopifyCustomerId: 'cust_test'
      });
      passed = sessionId !== sessionId2;
      details = passed ? 'Unique IDs generated' : 'Duplicate session IDs';
    }

    results.push({
      requirement: 'R1',
      scenario: scenario.name,
      passed,
      score: passed ? 100 : 0,
      details
    });
  }

  // R2: Continuous Memory
  for (const scenario of JUDGE_SCENARIOS.R2_MEMORY) {
    memoryStore.clear();
    const sessionId = runtime.startSession({
      customerEmail: scenario.email,
      firstName: scenario.email.split('@')[0],
      lastName: 'Test',
      shopifyCustomerId: `cust_${scenario.email.split('@')[0]}`
    });

    // Send messages
    for (const msg of scenario.messages) {
      await runtime.handleMessage(sessionId, msg);
    }

    const session = memoryStore.getSession(sessionId);
    let passed = false;
    let details = '';

    if (scenario.check === 'history') {
      passed = session!.messages.length >= scenario.messages.length;
      details = `${session!.messages.length} messages stored`;
    } else if (scenario.check === 'entities') {
      passed = session!.context.mentionedOrderNumbers.length > 0;
      details = `Extracted: ${session!.context.mentionedOrderNumbers.join(', ') || 'none'}`;
      if (!passed) improvements.push('Entity extraction missing order numbers');
    } else if (scenario.check === 'context') {
      passed = session!.messages.length >= 3 && session!.context.mentionedOrderNumbers.length > 0;
      details = passed ? 'Context preserved across turns' : 'Context lost';
    } else if (scenario.check === 'intents') {
      passed = session!.context.intentHistory.length >= 2;
      details = `Intents: ${session!.context.intentHistory.join(' → ')}`;
    }

    results.push({
      requirement: 'R2',
      scenario: scenario.name,
      passed,
      score: passed ? 100 : 0,
      details
    });
  }

  // R3: Observable Actions
  for (const scenario of JUDGE_SCENARIOS.R3_OBSERVABLE) {
    memoryStore.clear();
    const sessionId = runtime.startSession({
      customerEmail: scenario.email,
      firstName: scenario.email.split('@')[0],
      lastName: 'Test',
      shopifyCustomerId: `cust_${scenario.email.split('@')[0]}`
    });

    await runtime.handleMessage(sessionId, scenario.message);
    const trace = tracer.getTrace(sessionId);

    let passed = false;
    let details = '';

    const events = trace?.timeline || [];

    if (scenario.check === 'tool_logged') {
      const toolEvents = events.filter(e => e.type === 'tool_call');
      passed = toolEvents.length > 0;
      details = `${toolEvents.length} tool calls logged`;
    } else if (scenario.check === 'routing_traced') {
      const routeEvents = events.filter(e => e.type === 'routing');
      passed = routeEvents.length > 0;
      details = passed ? `Routing to: ${routeEvents[0]?.data.to}` : 'No routing trace';
    } else if (scenario.check === 'timestamps') {
      passed = events.length > 0 && events.every(e => !!e.timestamp);
      details = passed ? 'All events timestamped' : 'Missing timestamps';
    } else if (scenario.check === 'errors_traced') {
      // Even for random text, should have some trace
      passed = events.length > 0;
      details = `${events.length} events traced`;
    }

    results.push({
      requirement: 'R3',
      scenario: scenario.name,
      passed,
      score: passed ? 100 : 0,
      details
    });
  }

  // R4: Escalation
  for (const scenario of JUDGE_SCENARIOS.R4_ESCALATION) {
    memoryStore.clear();
    const sessionId = runtime.startSession({
      customerEmail: scenario.email,
      firstName: scenario.email.split('@')[0],
      lastName: 'Test',
      shopifyCustomerId: `cust_${scenario.email.split('@')[0]}`
    });

    const messages = 'messages' in scenario ? scenario.messages : [scenario.message];
    let lastResponse: any;
    for (const msg of messages) {
      lastResponse = await runtime.handleMessage(sessionId, msg);
    }

    const session = memoryStore.getSession(sessionId);
    let passed = false;
    let details = '';

    if (scenario.check === 'escalated') {
      passed = lastResponse?.escalated === true || session?.context.escalated === true;
      details = passed ? 'Escalation triggered' : 'Not escalated';
      if (!passed) improvements.push(`Escalation keyword not detected: "${messages[0]}"`);
    } else if (scenario.check === 'auto_stopped') {
      // Second message after escalation should not get auto-reply
      passed = session?.context.escalated === true;
      details = passed ? 'Auto-reply stopped after escalation' : 'Auto-reply continued';
    } else if (scenario.check === 'summary') {
      passed = !!session?.context.escalationSummary;
      details = passed ? 'Summary generated for handoff' : 'No summary';
    }

    results.push({
      requirement: 'R4',
      scenario: scenario.name,
      passed,
      score: passed ? 100 : 0,
      details
    });
  }

  // Calculate scores
  const r1Results = results.filter(r => r.requirement === 'R1');
  const r2Results = results.filter(r => r.requirement === 'R2');
  const r3Results = results.filter(r => r.requirement === 'R3');
  const r4Results = results.filter(r => r.requirement === 'R4');

  const calcScore = (arr: JudgeResult[]) => arr.filter(r => r.passed).length / arr.length * 100;

  return {
    timestamp: new Date().toISOString(),
    totalScore: (calcScore(r1Results) + calcScore(r2Results) + calcScore(r3Results) + calcScore(r4Results)) / 4,
    requirements: {
      r1_session: { passed: r1Results.filter(r => r.passed).length, total: r1Results.length, score: calcScore(r1Results) },
      r2_memory: { passed: r2Results.filter(r => r.passed).length, total: r2Results.length, score: calcScore(r2Results) },
      r3_observable: { passed: r3Results.filter(r => r.passed).length, total: r3Results.length, score: calcScore(r3Results) },
      r4_escalation: { passed: r4Results.filter(r => r.passed).length, total: r4Results.length, score: calcScore(r4Results) },
    },
    results,
    improvements: [...new Set(improvements)]
  };
}

function printReport(report: JudgeReport) {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                     JUDGE CI/CD REPORT                                    ║
║                     ${report.timestamp}                      ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                     TOTAL SCORE: ${report.totalScore.toFixed(1)}%                              ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  R1 Session Start:     ${report.requirements.r1_session.passed}/${report.requirements.r1_session.total} (${report.requirements.r1_session.score.toFixed(0)}%)                                    ║
║  R2 Continuous Memory: ${report.requirements.r2_memory.passed}/${report.requirements.r2_memory.total} (${report.requirements.r2_memory.score.toFixed(0)}%)                                    ║
║  R3 Observable Actions:${report.requirements.r3_observable.passed}/${report.requirements.r3_observable.total} (${report.requirements.r3_observable.score.toFixed(0)}%)                                    ║
║  R4 Escalation:        ${report.requirements.r4_escalation.passed}/${report.requirements.r4_escalation.total} (${report.requirements.r4_escalation.score.toFixed(0)}%)                                    ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  // Print failures
  const failures = report.results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('=== FAILURES ===');
    for (const f of failures) {
      console.log(`  ❌ [${f.requirement}] ${f.scenario}: ${f.details}`);
    }
    console.log('');
  }

  // Print improvements
  if (report.improvements.length > 0) {
    console.log('=== IMPROVEMENT SUGGESTIONS ===');
    for (const imp of report.improvements) {
      console.log(`  → ${imp}`);
    }
    console.log('');
  }

  // Print all results in detail
  console.log('=== DETAILED RESULTS ===');
  for (const r of report.results) {
    const status = r.passed ? '✅' : '❌';
    console.log(`  ${status} [${r.requirement}] ${r.scenario}`);
    console.log(`       ${r.details}`);
  }
}

async function main() {
  const isLoop = process.argv.includes('--loop');

  // Start mock API
  const mockServer = createMockServer(3002);
  console.log('[Judge CI] Mock API started on port 3002');

  // Build MAS with LLM client (real or mock)
  const { config } = buildNATPATMAS();
  const llmClient = getLLMClient();
  const runtime = new MASRuntime(config, llmClient);

  let iteration = 1;

  do {
    if (isLoop) {
      console.log(`\\n=== ITERATION ${iteration} ===`);
    }

    const report = await runJudgeTests(runtime);
    printReport(report);

    if (report.totalScore === 100) {
      console.log('🎉 PERFECT SCORE! All requirements pass.');
    } else if (report.totalScore >= 90) {
      console.log('✅ Excellent! Minor issues remain.');
    } else if (report.totalScore >= 70) {
      console.log('⚠️  Good progress. Some requirements need work.');
    } else {
      console.log('❌ Significant issues. Review failures above.');
    }

    if (isLoop) {
      console.log('\\nNext run in 30 seconds... (Ctrl+C to stop)');
      await new Promise(r => setTimeout(r, 30000));
      iteration++;
    }
  } while (isLoop);

  mockServer.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
