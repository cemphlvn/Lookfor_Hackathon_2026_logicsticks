#!/usr/bin/env npx tsx
/**
 * PLAYGROUND — Interactive MAS Testing Console
 *
 * Test the system from a judge's perspective.
 * All 4 requirements visible in real-time.
 */

import 'dotenv/config';
import * as readline from 'readline';
import { createMockServer } from '../src/api/mock-lookfor';
import { MASRuntime } from '../src/mas/runtime';
import { buildNATPATMAS } from '../src/brands/natpat';
import { memoryStore } from '../src/mas/memory';
import { tracer } from '../src/mas/tracing';
import { resetToolClient } from '../src/mas/tools/client';
import { LLMClient, createLLMClient } from '../src/mas/agents/executor';

// Force mock mode
process.env.USE_MOCK_API = 'true';
resetToolClient();

// Mock LLM client for testing without API key
function createMockLLMClient(): LLMClient {
  return {
    async chat(messages: any[]) {
      const lastUser = messages.filter((m: any) => m.role === 'user').pop();
      const content = (lastUser?.content || '').toLowerCase();

      if (content.includes('human') || content.includes('manager') || content.includes('supervisor') || content.includes('real person')) {
        return { content: 'I understand you would like to speak with a human agent. Let me escalate this for you.' };
      }
      if (content.includes('order') || content.includes('tracking')) {
        return { content: 'I can help you with your order. Let me look up the details for you.' };
      }
      if (content.includes('cancel') || content.includes('subscription')) {
        return { content: 'I can help you with your subscription. Let me check your account.' };
      }
      if (content.includes('refund')) {
        return { content: 'I can help process your refund request. Let me look into this.' };
      }
      if (content.includes('address')) {
        return { content: 'I can help update your shipping address.' };
      }

      return { content: 'I understand your request. How can I assist you further?' };
    }
  };
}

function getLLMClient(): LLMClient {
  try {
    return createLLMClient();
  } catch {
    console.log('[Playground] No LLM API key — using mock LLM client');
    return createMockLLMClient();
  }
}

// Test scenarios for judges
const SCENARIOS = [
  { cmd: '1', name: 'Order Status', email: 'baki@lookfor.ai', msg: 'Where is my order #NP2001002?' },
  { cmd: '2', name: 'Subscription Cancel', email: 'baki@lookfor.ai', msg: 'I want to cancel my subscription' },
  { cmd: '3', name: 'Escalation', email: 'ebrar@lookfor.ai', msg: 'I need to speak to a human' },
  { cmd: '4', name: 'Refund Request', email: 'ebrar@lookfor.ai', msg: 'I need a refund for order #NP3001001' },
  { cmd: '5', name: 'Multi-turn', email: 'baki@lookfor.ai', msg: 'I have a problem with my order' },
  { cmd: '6', name: 'Address Update', email: 'baki@lookfor.ai', msg: 'Change my shipping address to 123 Main St' },
];

async function main() {
  // Start mock API
  const mockServer = createMockServer(3002);
  console.log('[Mock API] Running on port 3002');

  // Build MAS with LLM client
  const { config } = buildNATPATMAS();
  const llmClient = getLLMClient();
  const runtime = new MASRuntime(config, llmClient);

  let currentSession: string | null = null;
  let currentEmail: string = '';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function printHeader() {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                     MAS PLAYGROUND — Judge Testing                        ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  Requirements Checklist:                                                  ║
║    R1 ✓ Session Start     — /new <email>                                  ║
║    R2 ✓ Continuous Memory — Multi-turn conversations remembered           ║
║    R3 ✓ Observable Actions— /trace shows all tool calls                   ║
║    R4 ✓ Escalation        — "speak to human" stops auto-reply             ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  Commands:                                                                ║
║    /new <email>   — Start session (R1)                                    ║
║    /trace         — Show observable actions (R3)                          ║
║    /memory        — Show session memory (R2)                              ║
║    /status        — Show session status                                   ║
║    /scenarios     — Show preset test scenarios                            ║
║    /run <1-6>     — Run preset scenario                                   ║
║    /quit          — Exit                                                  ║
║                                                                           ║
║  Or just type a message to send to the current session.                   ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
  }

  function printScenarios() {
    console.log('\\n=== PRESET SCENARIOS ===');
    for (const s of SCENARIOS) {
      console.log(\`  [\${s.cmd}] \${s.name}\`);
      console.log(\`      Email: \${s.email}\`);
      console.log(\`      Message: "\${s.msg}"\\n\`);
    }
  }

  function printTrace() {
    if (!currentSession) {
      console.log('[!] No active session. Use /new <email> first.');
      return;
    }
    const trace = tracer.getTrace(currentSession);
    if (!trace) {
      console.log('[!] No trace found.');
      return;
    }
    console.log('\\n=== OBSERVABLE TRACE (R3) ===');
    console.log(\`Session: \${trace.sessionId}\`);
    console.log(\`Events: \${trace.timeline.length}\`);
    console.log('');
    for (const event of trace.timeline.slice(-15)) {
      const time = new Date(event.timestamp).toLocaleTimeString();
      if (event.type === 'TOOL_CALL') {
        const status = event.data.success ? '✓' : '✗';
        console.log(\`  [\${time}] TOOL \${status} \${event.data.toolHandle}\`);
        if (event.data.error) console.log(\`           Error: \${event.data.error}\`);
      } else if (event.type === 'ESCALATION') {
        console.log(\`  [\${time}] ⚠️  ESCALATION: \${event.data.reason}\`);
      } else if (event.type === 'ROUTING') {
        console.log(\`  [\${time}] ROUTE: \${event.data.from || 'start'} → \${event.data.to} (\${event.data.intent})\`);
      } else {
        console.log(\`  [\${time}] \${event.type}: \${JSON.stringify(event.data).slice(0, 60)}...\`);
      }
    }
    console.log('');
  }

  function printMemory() {
    if (!currentSession) {
      console.log('[!] No active session.');
      return;
    }
    const session = memoryStore.getSession(currentSession);
    if (!session) {
      console.log('[!] Session not found.');
      return;
    }
    console.log('\\n=== SESSION MEMORY (R2) ===');
    console.log(\`Customer: \${session.customerFirstName} \${session.customerLastName}\`);
    console.log(\`Email: \${session.customerEmail}\`);
    console.log(\`Status: \${session.status}\`);
    console.log(\`Messages: \${session.messages.length}\`);
    console.log(\`Tool Calls: \${session.toolCalls.length}\`);
    console.log(\`Mentioned Orders: \${session.context.mentionedOrderNumbers.join(', ') || 'none'}\`);
    console.log(\`Intent History: \${session.context.intentHistory.join(' → ') || 'none'}\`);
    console.log(\`Escalated: \${session.context.escalated ? 'YES' : 'no'}\`);
    if (session.context.escalated) {
      console.log(\`Escalation Reason: \${session.context.escalationReason}\`);
    }
    console.log('');
  }

  function printStatus() {
    if (!currentSession) {
      console.log('[!] No active session. Use /new <email>');
      return;
    }
    const session = memoryStore.getSession(currentSession);
    console.log(\`\\n[Session] \${currentSession}\`);
    console.log(\`[Customer] \${currentEmail}\`);
    console.log(\`[Status] \${session?.status || 'unknown'}\`);
    console.log(\`[Messages] \${session?.messages.length || 0}\\n\`);
  }

  async function startSession(email: string) {
    memoryStore.clear();
    currentEmail = email;
    const [firstName] = email.split('@');
    currentSession = runtime.startSession({
      customerEmail: email,
      firstName: firstName,
      lastName: 'Customer',
      shopifyCustomerId: \`cust_\${firstName}\`
    });
    console.log(\`\\n[✓] Session started (R1): \${currentSession}\`);
    console.log(\`[✓] Customer: \${email}\\n\`);
  }

  async function sendMessage(message: string) {
    if (!currentSession) {
      console.log('[!] No active session. Use /new <email> first.');
      return;
    }
    console.log(\`\\n[Customer] \${message}\`);
    try {
      const response = await runtime.handleMessage(currentSession, message);
      console.log(\`\\n[Agent] \${response.message}\`);
      if (response.escalated) {
        console.log('\\n⚠️  SESSION ESCALATED (R4) — Auto-reply stopped');
        console.log('    Human agent should take over.');
      }
      console.log('');
    } catch (error) {
      console.log(\`[Error] \${error}\`);
    }
  }

  async function runScenario(num: string) {
    const scenario = SCENARIOS.find(s => s.cmd === num);
    if (!scenario) {
      console.log('[!] Invalid scenario. Use /scenarios to see options.');
      return;
    }
    console.log(\`\\n=== Running Scenario: \${scenario.name} ===\`);
    await startSession(scenario.email);
    await sendMessage(scenario.msg);
    printTrace();
  }

  printHeader();

  const prompt = () => {
    const prefix = currentSession ? \`[\${currentEmail}]\` : '[no session]';
    rl.question(\`\${prefix} > \`, async (input) => {
      const trimmed = input.trim();

      if (trimmed === '/quit' || trimmed === '/exit') {
        console.log('Goodbye!');
        mockServer.close();
        rl.close();
        process.exit(0);
      }

      if (trimmed === '/scenarios') {
        printScenarios();
      } else if (trimmed.startsWith('/run ')) {
        await runScenario(trimmed.slice(5).trim());
      } else if (trimmed.startsWith('/new ')) {
        await startSession(trimmed.slice(5).trim());
      } else if (trimmed === '/trace') {
        printTrace();
      } else if (trimmed === '/memory') {
        printMemory();
      } else if (trimmed === '/status') {
        printStatus();
      } else if (trimmed === '/help') {
        printHeader();
      } else if (trimmed.length > 0 && !trimmed.startsWith('/')) {
        await sendMessage(trimmed);
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
