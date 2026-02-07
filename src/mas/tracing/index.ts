/**
 * Tracing — Observable answers and actions
 *
 * Requirement 3: Make answers and actions observable
 * - Final message sent to customer
 * - Tools called with inputs and outputs
 * - Actions taken as result of tool calls
 */

export interface TraceEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  type: 'message' | 'tool_call' | 'routing' | 'escalation' | 'error';
  data: Record<string, unknown>;
}

export interface TraceSpan {
  id: string;
  sessionId: string;
  name: string;
  startTime: string;
  endTime?: string;
  events: TraceEvent[];
  attributes: Record<string, unknown>;
}

export interface SessionTrace {
  sessionId: string;
  spans: TraceSpan[];
  timeline: TraceEvent[];
  summary: TraceSummary;
}

export interface TraceSummary {
  messageCount: number;
  toolCallCount: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  escalated: boolean;
  duration: number;
  agents: string[];
}

/**
 * Tracer for observability
 */
export class Tracer {
  private traces: Map<string, SessionTrace> = new Map();
  private activeSpans: Map<string, TraceSpan> = new Map();
  private enabled: boolean = true;
  private logLevel: 'minimal' | 'standard' | 'verbose' = 'standard';

  /**
   * Initialize tracer for session
   */
  initSession(sessionId: string): void {
    this.traces.set(sessionId, {
      sessionId,
      spans: [],
      timeline: [],
      summary: {
        messageCount: 0,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        escalated: false,
        duration: 0,
        agents: []
      }
    });
  }

  /**
   * Start a trace span
   */
  startSpan(sessionId: string, name: string, attributes: Record<string, unknown> = {}): string {
    const spanId = `span_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const span: TraceSpan = {
      id: spanId,
      sessionId,
      name,
      startTime: new Date().toISOString(),
      events: [],
      attributes
    };
    this.activeSpans.set(spanId, span);
    return spanId;
  }

  /**
   * End a trace span
   */
  endSpan(spanId: string): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = new Date().toISOString();
    const trace = this.traces.get(span.sessionId);
    if (trace) {
      trace.spans.push(span);
    }
    this.activeSpans.delete(spanId);
  }

  /**
   * Trace customer message received
   */
  traceMessage(sessionId: string, role: 'customer' | 'agent', content: string): void {
    const event = this.createEvent(sessionId, 'message', {
      role,
      content: this.logLevel === 'verbose' ? content : content.slice(0, 100),
      length: content.length
    });

    this.addEvent(sessionId, event);
    this.updateSummary(sessionId, s => s.messageCount++);

    if (this.logLevel !== 'minimal') {
      console.log(`[TRACE] ${role.toUpperCase()}: ${content.slice(0, 50)}...`);
    }
  }

  /**
   * Trace tool call (Requirement 3)
   */
  traceToolCall(
    sessionId: string,
    toolHandle: string,
    params: Record<string, unknown>,
    result: { success: boolean; data?: unknown; error?: string }
  ): void {
    const event = this.createEvent(sessionId, 'tool_call', {
      tool: toolHandle,
      params: this.logLevel === 'verbose' ? params : { keys: Object.keys(params) },
      success: result.success,
      hasData: !!result.data,
      error: result.error
    });

    this.addEvent(sessionId, event);
    this.updateSummary(sessionId, s => {
      s.toolCallCount++;
      if (result.success) s.successfulToolCalls++;
      else s.failedToolCalls++;
    });

    console.log(`[TRACE] TOOL: ${toolHandle} → ${result.success ? '✓' : '✗'}`);
  }

  /**
   * Trace routing decision
   */
  traceRouting(sessionId: string, fromAgent: string, toAgent: string, reason: string): void {
    const event = this.createEvent(sessionId, 'routing', {
      from: fromAgent,
      to: toAgent,
      reason
    });

    this.addEvent(sessionId, event);
    this.updateSummary(sessionId, s => {
      if (!s.agents.includes(toAgent)) s.agents.push(toAgent);
    });

    console.log(`[TRACE] ROUTE: ${fromAgent} → ${toAgent}`);
  }

  /**
   * Trace escalation (Requirement 4)
   */
  traceEscalation(sessionId: string, reason: string, summary: Record<string, unknown>): void {
    const event = this.createEvent(sessionId, 'escalation', {
      reason,
      summary: this.logLevel === 'verbose' ? summary : { keys: Object.keys(summary) }
    });

    this.addEvent(sessionId, event);
    this.updateSummary(sessionId, s => s.escalated = true);

    console.log(`[TRACE] ESCALATION: ${reason}`);
  }

  /**
   * Trace error
   */
  traceError(sessionId: string, error: string, context?: Record<string, unknown>): void {
    const event = this.createEvent(sessionId, 'error', {
      error,
      context
    });

    this.addEvent(sessionId, event);
    console.error(`[TRACE] ERROR: ${error}`);
  }

  /**
   * Get full trace for session (for inspection)
   */
  getTrace(sessionId: string): SessionTrace | undefined {
    const trace = this.traces.get(sessionId);
    if (!trace) return undefined;

    // Calculate duration
    if (trace.timeline.length >= 2) {
      const start = new Date(trace.timeline[0].timestamp).getTime();
      const end = new Date(trace.timeline[trace.timeline.length - 1].timestamp).getTime();
      trace.summary.duration = end - start;
    }

    return trace;
  }

  /**
   * Get formatted trace output (for console/logs)
   */
  formatTrace(sessionId: string): string {
    const trace = this.getTrace(sessionId);
    if (!trace) return 'No trace found';

    const lines: string[] = [
      `\n${'='.repeat(60)}`,
      `SESSION TRACE: ${sessionId}`,
      `${'='.repeat(60)}`,
      '',
      'SUMMARY:',
      `  Messages: ${trace.summary.messageCount}`,
      `  Tool Calls: ${trace.summary.toolCallCount} (${trace.summary.successfulToolCalls} ✓, ${trace.summary.failedToolCalls} ✗)`,
      `  Escalated: ${trace.summary.escalated ? 'YES' : 'No'}`,
      `  Agents: ${trace.summary.agents.join(' → ')}`,
      `  Duration: ${trace.summary.duration}ms`,
      '',
      'TIMELINE:',
    ];

    for (const event of trace.timeline) {
      const time = event.timestamp.split('T')[1].split('.')[0];
      let line = `  [${time}] ${event.type.toUpperCase()}`;

      switch (event.type) {
        case 'message':
          line += `: ${event.data.role} - "${(event.data.content as string).slice(0, 40)}..."`;
          break;
        case 'tool_call':
          line += `: ${event.data.tool} → ${event.data.success ? '✓' : '✗'}`;
          break;
        case 'routing':
          line += `: ${event.data.from} → ${event.data.to}`;
          break;
        case 'escalation':
          line += `: ${event.data.reason}`;
          break;
        case 'error':
          line += `: ${event.data.error}`;
          break;
      }

      lines.push(line);
    }

    lines.push('', `${'='.repeat(60)}\n`);
    return lines.join('\n');
  }

  /**
   * Export trace as JSON
   */
  exportTrace(sessionId: string): string {
    const trace = this.getTrace(sessionId);
    return JSON.stringify(trace, null, 2);
  }

  private createEvent(sessionId: string, type: TraceEvent['type'], data: Record<string, unknown>): TraceEvent {
    return {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      timestamp: new Date().toISOString(),
      type,
      data
    };
  }

  private addEvent(sessionId: string, event: TraceEvent): void {
    const trace = this.traces.get(sessionId);
    if (trace) {
      trace.timeline.push(event);
    }
  }

  private updateSummary(sessionId: string, updater: (summary: TraceSummary) => void): void {
    const trace = this.traces.get(sessionId);
    if (trace) {
      updater(trace.summary);
    }
  }
}

// Singleton instance
export const tracer = new Tracer();
