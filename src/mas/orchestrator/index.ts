/**
 * Orchestrator — Routes messages to agents
 *
 * Intent-based routing with fallback to general agent
 */

import { classifyMessage, IntentClassification } from '../../meta/intent-extractor';
import { MASConfig, AgentConfig, RoutingRule, EscalationConfig } from '../../meta/agent-generator';
import { Session, memoryStore } from '../memory';
import { tracer } from '../tracing';
import { applyDynamicRules } from '../../api/mas-update';

export interface RoutingResult {
  targetAgent: AgentConfig;
  intent: IntentClassification;
  confidence: number;
}

export interface EscalationResult {
  escalated: boolean;
  reason?: string;
  customerMessage?: string;
  internalSummary?: Record<string, unknown>;
}

/**
 * Orchestrator manages routing between agents
 */
export class Orchestrator {
  private config: MASConfig;
  private agents: Map<string, AgentConfig>;
  private routingRules: RoutingRule[];
  private escalationConfig: EscalationConfig;
  private fallbackAgent: AgentConfig;

  constructor(config: MASConfig) {
    this.config = config;
    this.agents = new Map();
    this.routingRules = config.orchestrator.routing;
    this.escalationConfig = config.orchestrator.escalationHandler;

    // Index agents
    for (const agent of config.orchestrator.agents) {
      this.agents.set(agent.id, agent);
    }

    // Set fallback
    this.fallbackAgent = this.agents.get(config.orchestrator.fallbackAgent) ||
      config.orchestrator.agents[0];
  }

  /**
   * Route message to appropriate agent
   */
  route(sessionId: string, message: string): RoutingResult {
    const session = memoryStore.getSession(sessionId);
    const intent = classifyMessage(message);

    // Find matching routing rule
    let targetAgent = this.fallbackAgent;
    let highestScore = 0;

    for (const rule of this.routingRules) {
      const score = this.calculateRuleScore(message, intent, rule);
      if (score > highestScore && score >= rule.conditions.minConfidence) {
        highestScore = score;
        const agent = this.agents.get(rule.targetAgent);
        if (agent) targetAgent = agent;
      }
    }

    // Consider session context for continuity
    if (session?.context.currentAgent) {
      const currentAgent = this.agents.get(session.context.currentAgent);
      // Stay with current agent if intent is related
      if (currentAgent && this.isRelatedToCurrentAgent(intent, currentAgent)) {
        targetAgent = currentAgent;
      }
    }

    // Trace routing
    const previousAgent = session?.context.currentAgent || 'none';
    if (previousAgent !== targetAgent.id) {
      tracer.traceRouting(sessionId, previousAgent, targetAgent.id, intent.primary);
    }

    // Update session
    if (session) {
      memoryStore.setCurrentAgent(sessionId, targetAgent.id);
      memoryStore.recordIntent(sessionId, intent.primary);
    }

    return {
      targetAgent,
      intent,
      confidence: highestScore || intent.confidence
    };
  }

  /**
   * Check if escalation is needed
   */
  checkEscalation(sessionId: string, message: string, agentResponse?: string): EscalationResult {
    const session = memoryStore.getSession(sessionId);
    if (!session) return { escalated: false };

    // Already escalated - no further processing
    if (session.context.escalated) {
      return {
        escalated: true,
        reason: session.context.escalationReason,
        customerMessage: 'This issue has been escalated to our team. A specialist will respond shortly.'
      };
    }

    const messageLower = message.toLowerCase();

    // SIDE QUEST: Check dynamic rules first
    const dynamicResult = applyDynamicRules(message);
    if (dynamicResult.escalate) {
      const reason = dynamicResult.reason || 'Dynamic rule triggered escalation';
      const summary = this.buildEscalationSummary(session);
      if (dynamicResult.tag) {
        (summary as any).tag = dynamicResult.tag;
      }

      memoryStore.escalate(sessionId, reason, summary);
      tracer.traceEscalation(sessionId, reason, summary);

      return {
        escalated: true,
        reason,
        customerMessage: this.escalationConfig.customerMessage,
        internalSummary: summary
      };
    }

    // Direct escalation keyword detection
    const escalationKeywords = ['human', 'real person', 'manager', 'supervisor', 'live agent'];
    const escalationTriggers = ['speak to', 'talk to', 'transfer to', 'transfer me'];
    const hasEscalationKeyword = escalationKeywords.some(k => messageLower.includes(k));
    const hasEscalationTrigger = escalationTriggers.some(t => messageLower.includes(t));

    const shouldEscalate = (hasEscalationKeyword || hasEscalationTrigger) ||
      this.escalationConfig.conditions.some(condition => {
        const condLower = condition.toLowerCase();
        if (condLower.includes('cannot determine') && session.context.intentHistory.length > 3) {
          const uniqueIntents = new Set(session.context.intentHistory);
          if (uniqueIntents.size >= 3) return true;
        }
        return false;
      });

    if (shouldEscalate) {
      const reason = this.determineEscalationReason(message, session);
      const summary = this.buildEscalationSummary(session);

      memoryStore.escalate(sessionId, reason, summary);
      tracer.traceEscalation(sessionId, reason, summary);

      return {
        escalated: true,
        reason,
        customerMessage: this.escalationConfig.customerMessage,
        internalSummary: summary
      };
    }

    return { escalated: false };
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  private calculateRuleScore(message: string, intent: IntentClassification, rule: RoutingRule): number {
    let score = 0;
    const messageLower = message.toLowerCase();

    // Keyword matches
    for (const keyword of rule.conditions.keywords) {
      if (messageLower.includes(keyword.toLowerCase())) {
        score += 0.2;
      }
    }

    // Intent match
    if (intent.primary.toLowerCase().replace(/_/g, '-') === rule.intentId) {
      score += 0.5;
    }

    // Secondary intent match
    if (intent.secondary.some(s => s.toLowerCase().replace(/_/g, '-') === rule.intentId)) {
      score += 0.2;
    }

    return Math.min(score, 1);
  }

  private isRelatedToCurrentAgent(intent: IntentClassification, agent: AgentConfig): boolean {
    // Check if intent relates to agent's triggers
    const intentWords = intent.primary.toLowerCase().split('_');
    return agent.triggers.some(trigger => {
      const triggerWords = trigger.toLowerCase().split(' ');
      return intentWords.some(w => triggerWords.includes(w));
    });
  }

  private determineEscalationReason(message: string, session: Session): string {
    const messageLower = message.toLowerCase();

    if (messageLower.includes('human') || messageLower.includes('speak to') ||
        messageLower.includes('real person') || messageLower.includes('manager') ||
        messageLower.includes('supervisor') || messageLower.includes('transfer')) {
      return 'customer explicitly requested human agent';
    }

    if (session.context.intentHistory.length > 3) {
      return 'complex issue requiring multiple intents';
    }

    if (session.toolCalls.filter(t => !t.result.success).length >= 2) {
      return 'multiple tool failures during session';
    }

    return 'agent cannot safely proceed';
  }

  private buildEscalationSummary(session: Session): Record<string, unknown> {
    return {
      session_id: session.id,
      customer: {
        email: session.customerEmail,
        name: `${session.customerFirstName} ${session.customerLastName}`,
        shopify_id: session.shopifyCustomerId
      },
      issue_type: session.context.intentHistory[0] || 'unknown',
      message_count: session.messages.length,
      tool_calls: session.toolCalls.map(t => ({
        tool: t.toolHandle,
        success: t.result.success
      })),
      mentioned_orders: session.context.mentionedOrderNumbers,
      attempted_resolution: session.context.currentAgent,
      conversation_summary: session.messages.slice(-3).map(m => ({
        role: m.role,
        preview: m.content.slice(0, 100)
      }))
    };
  }
}
