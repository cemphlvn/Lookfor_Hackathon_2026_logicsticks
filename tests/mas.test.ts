/**
 * MAS Tests — Verify all requirements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildDefaultMAS, validateMASConfig } from '../src/meta/mas-builder';
import { MASRuntime } from '../src/mas/runtime';
import { memoryStore } from '../src/mas/memory';
import { tracer } from '../src/mas/tracing';
import type { LLMClient } from '../src/mas/agents/executor';

// Test-only mock LLM client
function createTestLLMClient(): LLMClient {
  return {
    async chat(messages, tools) {
      const lastUser = messages.filter(m => m.role === 'user').pop();
      const content = lastUser?.content || '';

      // Simulate escalation for specific keywords
      if (typeof content === 'string' &&
        (content.toLowerCase().includes('human') ||
          content.toLowerCase().includes('real person') ||
          content.toLowerCase().includes('manager'))) {
        return { content: 'I am escalating this to our team.' };
      }

      return { content: `I understand your request about: "${content}". Let me help.` };
    }
  };
}

describe('Meta-System (Step 2)', () => {
  it('should build MAS config with default workflows', () => {
    const result = buildDefaultMAS('test-brand');

    expect(result.config).toBeDefined();
    expect(result.config.name).toBe('test-brand-mas');
    expect(result.summary.agentCount).toBeGreaterThan(0);
  });

  it('should generate valid agent configs', () => {
    const result = buildDefaultMAS('test-brand');

    for (const agent of result.config.orchestrator.agents) {
      expect(agent.id).toBeDefined();
      expect(agent.systemPrompt).toBeDefined();
      expect(agent.tools).toBeInstanceOf(Array);
    }
  });

  it('should validate MAS config', () => {
    const result = buildDefaultMAS('test-brand');
    const validation = validateMASConfig(result.config);

    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  it('should generate routing rules', () => {
    const result = buildDefaultMAS('test-brand');

    expect(result.config.orchestrator.routing.length).toBeGreaterThan(0);
    for (const rule of result.config.orchestrator.routing) {
      expect(rule.intentId).toBeDefined();
      expect(rule.targetAgent).toBeDefined();
    }
  });
});

describe('MAS Runtime (Step 1)', () => {
  let runtime: MASRuntime;

  beforeEach(() => {
    memoryStore.clear();
    const { config } = buildDefaultMAS('test-brand');
    runtime = new MASRuntime(config, createTestLLMClient());
  });

  describe('Requirement 1: Email Session Start', () => {
    it('should start session with customer details', () => {
      const sessionId = runtime.startSession({
        customerEmail: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        shopifyCustomerId: 'cust_123'
      });

      expect(sessionId).toBeDefined();
      expect(sessionId.startsWith('session_')).toBe(true);
    });

    it('should store customer info in session', () => {
      const sessionId = runtime.startSession({
        customerEmail: 'test@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        shopifyCustomerId: 'cust_456'
      });

      const session = memoryStore.getSession(sessionId);
      expect(session?.customerEmail).toBe('test@example.com');
      expect(session?.customerFirstName).toBe('Jane');
      expect(session?.shopifyCustomerId).toBe('cust_456');
    });
  });

  describe('Requirement 2: Continuous Memory', () => {
    it('should maintain conversation history', async () => {
      const sessionId = runtime.startSession({
        customerEmail: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        shopifyCustomerId: 'cust_789'
      });

      await runtime.handleMessage(sessionId, 'Where is my order?');
      await runtime.handleMessage(sessionId, 'I ordered it last week');

      const session = memoryStore.getSession(sessionId);
      expect(session?.messages.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract entities from messages', async () => {
      const sessionId = runtime.startSession({
        customerEmail: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        shopifyCustomerId: 'cust_789'
      });

      await runtime.handleMessage(sessionId, 'What is the status of order #1234567?');

      const session = memoryStore.getSession(sessionId);
      expect(session?.context.mentionedOrderNumbers).toContain('#1234567');
    });
  });

  describe('Requirement 3: Observable Actions', () => {
    it('should create trace for session', async () => {
      const sessionId = runtime.startSession({
        customerEmail: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        shopifyCustomerId: 'cust_789'
      });

      await runtime.handleMessage(sessionId, 'Hello');

      const trace = runtime.getTrace(sessionId);
      expect(trace).toContain('SESSION TRACE');
      expect(trace).toContain(sessionId);
    });

    it('should track messages in trace', async () => {
      const sessionId = runtime.startSession({
        customerEmail: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        shopifyCustomerId: 'cust_789'
      });

      await runtime.handleMessage(sessionId, 'Help me');

      const traceJson = runtime.getTraceJson(sessionId);
      const trace = JSON.parse(traceJson);

      expect(trace.summary.messageCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Requirement 4: Escalation', () => {
    it('should escalate when customer requests human', async () => {
      const sessionId = runtime.startSession({
        customerEmail: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        shopifyCustomerId: 'cust_789'
      });

      const response = await runtime.handleMessage(sessionId, 'I want to speak to a human');

      expect(response.escalated).toBe(true);
    });

    it('should stop auto-replies after escalation', async () => {
      const sessionId = runtime.startSession({
        customerEmail: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        shopifyCustomerId: 'cust_789'
      });

      await runtime.handleMessage(sessionId, 'I need a real person');

      const followUp = await runtime.handleMessage(sessionId, 'Hello?');

      expect(followUp.escalated).toBe(true);
      expect(followUp.message).toContain('escalated');
    });

    it('should include escalation summary', async () => {
      const sessionId = runtime.startSession({
        customerEmail: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        shopifyCustomerId: 'cust_789'
      });

      const response = await runtime.handleMessage(sessionId, 'Let me speak to your manager');

      expect(response.escalationSummary).toBeDefined();
      expect(response.escalationSummary?.customer).toBeDefined();
    });
  });
});

describe('Tool Definitions', () => {
  it('should have 18+ tools defined', async () => {
    const { ALL_TOOLS } = await import('../src/meta/tool-mapper/tools');
    expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(18);
  });

  it('should have 13+ Shopify tools', async () => {
    const { SHOPIFY_TOOLS } = await import('../src/meta/tool-mapper/tools');
    expect(SHOPIFY_TOOLS.length).toBeGreaterThanOrEqual(13);
  });

  it('should have 5 Skio tools', async () => {
    const { SKIO_TOOLS } = await import('../src/meta/tool-mapper/tools');
    expect(SKIO_TOOLS.length).toBe(5);
  });
});

describe('Intent Classification', () => {
  it('should classify order status inquiries', async () => {
    const { classifyMessage } = await import('../src/meta/intent-extractor');

    const result = classifyMessage('Where is my order?');
    expect(result.primary).toBe('ORDER_STATUS');
  });

  it('should classify subscription requests', async () => {
    const { classifyMessage } = await import('../src/meta/intent-extractor');

    const result = classifyMessage('I want to cancel my subscription');
    expect(result.primary).toBe('SUBSCRIPTION_CANCEL');
  });

  it('should classify refund requests', async () => {
    const { classifyMessage } = await import('../src/meta/intent-extractor');

    const result = classifyMessage('I need a refund for my order');
    expect(result.primary).toBe('REFUND_REQUEST');
  });
});
