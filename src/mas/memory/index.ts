/**
 * Memory Store — Continuous session memory for MAS
 *
 * Requirement: Maintain continuous memory so system remembers context,
 * doesn't contradict itself, behaves like real email thread
 */

export interface Message {
  role: 'customer' | 'agent' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  toolHandle: string;
  params: Record<string, unknown>;
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  timestamp: string;
}

export interface Session {
  id: string;
  customerId: string;
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  shopifyCustomerId: string;
  startedAt: string;
  lastActivity: string;
  status: 'active' | 'escalated' | 'resolved';
  messages: Message[];
  toolCalls: ToolCall[];
  context: SessionContext;
}

export interface SessionContext {
  // Cached data from tool calls
  orderHistory?: unknown[];
  subscriptionStatus?: unknown;
  currentOrder?: unknown;

  // Extracted entities from conversation
  mentionedOrderNumbers: string[];
  mentionedProducts: string[];

  // Agent state
  currentAgent: string;
  previousAgents: string[];
  intentHistory: string[];

  // Escalation info
  escalated: boolean;
  escalationReason?: string;
  escalationSummary?: Record<string, unknown>;
}

/**
 * In-memory session store
 */
export class MemoryStore {
  private sessions: Map<string, Session> = new Map();

  /**
   * Start new session (Requirement 1: Email Session Start)
   */
  startSession(params: {
    customerEmail: string;
    firstName: string;
    lastName: string;
    shopifyCustomerId: string;
  }): Session {
    const sessionId = this.generateSessionId();
    const now = new Date().toISOString();

    const session: Session = {
      id: sessionId,
      customerId: params.shopifyCustomerId,
      customerEmail: params.customerEmail,
      customerFirstName: params.firstName,
      customerLastName: params.lastName,
      shopifyCustomerId: params.shopifyCustomerId,
      startedAt: now,
      lastActivity: now,
      status: 'active',
      messages: [],
      toolCalls: [],
      context: {
        mentionedOrderNumbers: [],
        mentionedProducts: [],
        currentAgent: '',
        previousAgents: [],
        intentHistory: [],
        escalated: false
      }
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Add message to session (Requirement 2: Continuous Memory)
   */
  addMessage(sessionId: string, role: 'customer' | 'agent' | 'system', content: string, metadata?: Record<string, unknown>): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata
    });
    session.lastActivity = new Date().toISOString();

    // Extract entities from customer messages
    if (role === 'customer') {
      this.extractEntities(session, content);
    }
  }

  /**
   * Record tool call (Requirement 3: Observable Actions)
   */
  recordToolCall(sessionId: string, toolHandle: string, params: Record<string, unknown>, result: { success: boolean; data?: unknown; error?: string }): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.toolCalls.push({
      toolHandle,
      params,
      result,
      timestamp: new Date().toISOString()
    });
    session.lastActivity = new Date().toISOString();

    // Cache useful data
    this.cacheToolResult(session, toolHandle, result);
  }

  /**
   * Mark session as escalated (Requirement 4: Escalation)
   */
  escalate(sessionId: string, reason: string, summary: Record<string, unknown>): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.status = 'escalated';
    session.context.escalated = true;
    session.context.escalationReason = reason;
    session.context.escalationSummary = summary;
    session.lastActivity = new Date().toISOString();
  }

  /**
   * Check if session is escalated (no further auto replies)
   */
  isEscalated(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.context.escalated ?? false;
  }

  /**
   * Set current agent
   */
  setCurrentAgent(sessionId: string, agentId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.context.currentAgent && session.context.currentAgent !== agentId) {
      session.context.previousAgents.push(session.context.currentAgent);
    }
    session.context.currentAgent = agentId;
  }

  /**
   * Add intent to history
   */
  recordIntent(sessionId: string, intentId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.context.intentHistory.push(intentId);
  }

  /**
   * Get conversation history for LLM context
   */
  getConversationHistory(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    return session.messages
      .map(m => `${m.role === 'customer' ? 'Customer' : 'Agent'}: ${m.content}`)
      .join('\n\n');
  }

  /**
   * Get session summary for escalation
   */
  getSessionSummary(sessionId: string): Record<string, unknown> {
    const session = this.sessions.get(sessionId);
    if (!session) return {};

    return {
      sessionId: session.id,
      customer: {
        email: session.customerEmail,
        name: `${session.customerFirstName} ${session.customerLastName}`,
        shopifyId: session.shopifyCustomerId
      },
      messageCount: session.messages.length,
      toolCallCount: session.toolCalls.length,
      intents: session.context.intentHistory,
      mentionedOrders: session.context.mentionedOrderNumbers,
      currentAgent: session.context.currentAgent,
      startedAt: session.startedAt,
      lastActivity: session.lastActivity
    };
  }

  /**
   * Extract entities from message
   */
  private extractEntities(session: Session, content: string): void {
    // Order numbers: #12345, #1234567, #NP1234567, NP1234567
    // Match: # followed by 4-10 digits, or NP followed by 4-10 digits, or # followed by NP and digits
    const orderMatches = content.match(/#\d{4,10}|#NP\d{4,10}|NP\d{4,10}/gi);
    if (orderMatches) {
      for (const match of orderMatches) {
        const normalized = match.startsWith('#') ? match : `#${match}`;
        if (!session.context.mentionedOrderNumbers.includes(normalized) &&
            !session.context.mentionedOrderNumbers.includes(match)) {
          session.context.mentionedOrderNumbers.push(match);
        }
      }
    }
  }

  /**
   * Cache useful tool results
   */
  private cacheToolResult(session: Session, toolHandle: string, result: { success: boolean; data?: unknown }): void {
    if (!result.success || !result.data) return;

    if (toolHandle === 'shopify_get_customer_orders') {
      session.context.orderHistory = (result.data as { orders: unknown[] }).orders;
    }
    if (toolHandle === 'skio_get_subscription_status') {
      session.context.subscriptionStatus = result.data;
    }
    if (toolHandle === 'shopify_get_order_details') {
      session.context.currentOrder = result.data;
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get all active sessions (for observability)
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
  }
}

// Singleton instance
export const memoryStore = new MemoryStore();
