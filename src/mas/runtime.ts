/**
 * MAS Runtime — Main entry point for Multi-Agent System
 *
 * This ties everything together:
 * - Session management (Requirement 1)
 * - Message handling with memory (Requirement 2)
 * - Observable tracing (Requirement 3)
 * - Escalation handling (Requirement 4)
 */

import { MASConfig, AgentConfig } from '../meta/agent-generator';
import { memoryStore, Session } from './memory';
import { Orchestrator } from './orchestrator';
import { AgentExecutor, LLMClient, createLLMClient, createAnthropicClient, createOpenAIClient } from './agents/executor';
import { tracer } from './tracing';

export interface SessionStartParams {
  customerEmail: string;
  firstName: string;
  lastName: string;
  shopifyCustomerId: string;
}

export interface MessageResponse {
  sessionId: string;
  message: string;
  escalated: boolean;
  escalationSummary?: Record<string, unknown>;
  trace?: string;
}

/**
 * MAS Runtime
 */
export class MASRuntime {
  private config: MASConfig;
  private orchestrator: Orchestrator;
  private llmClient: LLMClient;
  private executors: Map<string, AgentExecutor> = new Map();

  constructor(config: MASConfig, llmClient?: LLMClient) {
    this.config = config;
    this.orchestrator = new Orchestrator(config);

    // Use provided client or create based on env (PRODUCTION ONLY)
    if (llmClient) {
      this.llmClient = llmClient;
    } else {
      this.llmClient = createLLMClient();
    }

    // Pre-create executors for all agents
    for (const agent of config.orchestrator.agents) {
      this.executors.set(agent.id, new AgentExecutor(agent, this.llmClient));
    }
  }

  /**
   * Requirement 1: Start new email session
   */
  startSession(params: SessionStartParams): string {
    const session = memoryStore.startSession(params);
    tracer.initSession(session.id);

    console.log(`[MAS] Session started: ${session.id}`);
    console.log(`[MAS] Customer: ${params.firstName} ${params.lastName} (${params.customerEmail})`);

    return session.id;
  }

  /**
   * Requirement 2: Handle customer message with continuous memory
   */
  async handleMessage(sessionId: string, message: string): Promise<MessageResponse> {
    const session = memoryStore.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Check if already escalated (Requirement 4: no further auto replies)
    if (memoryStore.isEscalated(sessionId)) {
      return {
        sessionId,
        message: 'This issue has been escalated to our team. A specialist will respond shortly.',
        escalated: true,
        escalationSummary: session.context.escalationSummary
      };
    }

    // Record customer message
    memoryStore.addMessage(sessionId, 'customer', message);
    tracer.traceMessage(sessionId, 'customer', message);

    // Check for explicit escalation request
    const escalationCheck = this.orchestrator.checkEscalation(sessionId, message);
    if (escalationCheck.escalated) {
      return {
        sessionId,
        message: escalationCheck.customerMessage || 'Escalating to our team.',
        escalated: true,
        escalationSummary: escalationCheck.internalSummary
      };
    }

    // Route to appropriate agent
    const routing = this.orchestrator.route(sessionId, message);
    console.log(`[MAS] Routed to: ${routing.targetAgent.id} (confidence: ${routing.confidence.toFixed(2)})`);

    // Execute agent
    const executor = this.executors.get(routing.targetAgent.id);
    if (!executor) {
      throw new Error(`No executor for agent: ${routing.targetAgent.id}`);
    }

    const response = await executor.execute(sessionId, message);

    // Check if response triggers escalation
    const postCheck = this.orchestrator.checkEscalation(sessionId, message, response.message);
    if (postCheck.escalated) {
      return {
        sessionId,
        message: postCheck.customerMessage || response.message,
        escalated: true,
        escalationSummary: postCheck.internalSummary
      };
    }

    return {
      sessionId,
      message: response.message,
      escalated: false
    };
  }

  /**
   * Requirement 3: Get trace for session
   */
  getTrace(sessionId: string): string {
    return tracer.formatTrace(sessionId);
  }

  /**
   * Get trace as JSON
   */
  getTraceJson(sessionId: string): string {
    return tracer.exportTrace(sessionId);
  }

  /**
   * Get session summary
   */
  getSessionSummary(sessionId: string): Record<string, unknown> {
    return memoryStore.getSessionSummary(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Session[] {
    return memoryStore.getActiveSessions();
  }

  /**
   * Get MAS config
   */
  getConfig(): MASConfig {
    return this.config;
  }

  /**
   * Get orchestrator for advanced routing
   */
  getOrchestrator(): Orchestrator {
    return this.orchestrator;
  }
}

// Factory function for easy creation
export function createMASRuntime(config: MASConfig, llmClient?: LLMClient): MASRuntime {
  return new MASRuntime(config, llmClient);
}
