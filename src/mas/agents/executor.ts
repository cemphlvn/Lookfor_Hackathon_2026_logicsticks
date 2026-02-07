/**
 * Agent Executor — Executes agent with LLM
 *
 * Connects: Agent Config + Memory + Tools + LLM → Response
 */

import { AgentConfig } from '../../meta/agent-generator';
import { Session, memoryStore } from '../memory';
import { toolClient, ToolCallResult } from '../tools/client';
import { tracer } from '../tracing';

export interface AgentResponse {
  message: string;
  toolCalls: {
    tool: string;
    params: Record<string, unknown>;
    result: ToolCallResult;
  }[];
  reasoning?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
}

export interface LLMClient {
  chat(messages: LLMMessage[], tools?: object[]): Promise<{
    content: string | null;
    tool_calls?: {
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }[];
  }>;
}

/**
 * Agent Executor
 */
export class AgentExecutor {
  private agent: AgentConfig;
  private llmClient: LLMClient;
  private maxToolCalls: number;

  constructor(agent: AgentConfig, llmClient: LLMClient, maxToolCalls: number = 5) {
    this.agent = agent;
    this.llmClient = llmClient;
    this.maxToolCalls = maxToolCalls;
  }

  /**
   * Execute agent for a message in session
   */
  async execute(sessionId: string, customerMessage: string): Promise<AgentResponse> {
    const session = memoryStore.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Build messages
    const messages = this.buildMessages(session, customerMessage);

    // Get tools for this agent
    const tools = toolClient.getAgentToolSchemas(this.agent.tools);

    // Execute LLM loop
    const toolCalls: AgentResponse['toolCalls'] = [];
    let response = await this.llmClient.chat(messages, tools);

    // Handle tool calls
    let iterations = 0;
    while (response.tool_calls && response.tool_calls.length > 0 && iterations < this.maxToolCalls) {
      iterations++;

      for (const toolCall of response.tool_calls) {
        const toolHandle = toolCall.function.name;
        const params = JSON.parse(toolCall.function.arguments);

        // Execute tool
        const result = await toolClient.execute(toolHandle, params);

        // Record in memory and trace
        memoryStore.recordToolCall(sessionId, toolHandle, params, result);
        tracer.traceToolCall(sessionId, toolHandle, params, result);

        toolCalls.push({ tool: toolHandle, params, result });

        // Add tool result to messages
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [toolCall]
        } as LLMMessage);
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id
        });
      }

      // Continue LLM loop
      response = await this.llmClient.chat(messages, tools);
    }

    const finalMessage = response.content || 'I apologize, but I was unable to process your request.';

    // Record agent message
    memoryStore.addMessage(sessionId, 'agent', finalMessage);
    tracer.traceMessage(sessionId, 'agent', finalMessage);

    return {
      message: finalMessage,
      toolCalls
    };
  }

  /**
   * Build messages for LLM
   */
  private buildMessages(session: Session, customerMessage: string): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // System prompt with context
    const systemPrompt = this.buildSystemPrompt(session);
    messages.push({ role: 'system', content: systemPrompt });

    // Conversation history
    for (const msg of session.messages) {
      messages.push({
        role: msg.role === 'customer' ? 'user' : 'assistant',
        content: msg.content
      });
    }

    // Current message
    messages.push({ role: 'user', content: customerMessage });

    return messages;
  }

  /**
   * Build system prompt with session context
   */
  private buildSystemPrompt(session: Session): string {
    let prompt = this.agent.systemPrompt;

    // Add customer context
    prompt += `\n\nCUSTOMER CONTEXT:
- Name: ${session.customerFirstName} ${session.customerLastName}
- Email: ${session.customerEmail}
- Shopify Customer ID: ${session.shopifyCustomerId}`;

    // Add cached data if available
    if (session.context.orderHistory) {
      prompt += `\n- Recent Orders: ${session.context.orderHistory.length} orders on file`;
    }
    if (session.context.subscriptionStatus) {
      prompt += `\n- Has active subscription data`;
    }
    if (session.context.mentionedOrderNumbers.length > 0) {
      prompt += `\n- Previously mentioned orders: ${session.context.mentionedOrderNumbers.join(', ')}`;
    }

    // Add boundaries
    if (this.agent.boundaries.length > 0) {
      prompt += `\n\nBOUNDARIES (must follow):
${this.agent.boundaries.map(b => `- ${b}`).join('\n')}`;
    }

    return prompt;
  }
}

/**
 * Create LLM client based on available API keys
 * PRODUCTION ONLY - No mocks
 */
export function createLLMClient(): LLMClient {
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[LLM] Using Anthropic Claude');
    return createAnthropicClient(process.env.ANTHROPIC_API_KEY);
  }
  if (process.env.OPENAI_API_KEY) {
    console.log('[LLM] Using OpenAI');
    return createOpenAIClient(process.env.OPENAI_API_KEY);
  }
  if (process.env.GOOGLE_API_KEY) {
    console.log('[LLM] Using Google Gemini');
    return createGoogleClient(process.env.GOOGLE_API_KEY);
  }
  throw new Error('No LLM API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY');
}

/**
 * Create Anthropic LLM client
 */
export function createAnthropicClient(apiKey: string): LLMClient {
  return {
    async chat(messages: LLMMessage[], tools?: object[]) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          system: messages.find(m => m.role === 'system')?.content,
          messages: messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role === 'tool' ? 'user' : m.role,
            content: m.content
          })),
          tools: tools?.map(t => ({
            name: (t as { name: string }).name,
            description: (t as { description: string }).description,
            input_schema: (t as { parameters: object }).parameters
          }))
        })
      });

      const data = await response.json() as { content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: object }> };

      // Extract content and tool calls from Anthropic response
      const textBlock = data.content?.find((b) => b.type === 'text');
      const toolUseBlocks = data.content?.filter((b) => b.type === 'tool_use') || [];

      return {
        content: textBlock?.text || null,
        tool_calls: toolUseBlocks
          .filter((b): b is { type: string; id: string; name: string; input: object } => b.type === 'tool_use' && !!b.id && !!b.name)
          .map((b) => ({
            id: b.id,
            type: 'function' as const,
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input)
            }
          }))
      };
    }
  };
}

/**
 * Create OpenAI LLM client
 */
export function createOpenAIClient(apiKey: string): LLMClient {
  return {
    async chat(messages: LLMMessage[], tools?: object[]) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            ...(m.tool_calls ? { tool_calls: m.tool_calls } : {})
          })),
          tools: tools?.map(t => ({
            type: 'function',
            function: {
              name: (t as { name: string }).name,
              description: (t as { description: string }).description,
              parameters: (t as { parameters: object }).parameters
            }
          }))
        })
      });

      interface OpenAIResponse {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              type: 'function';
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      }
      const data = await response.json() as OpenAIResponse;
      const choice = data.choices?.[0]?.message;

      return {
        content: choice?.content || null,
        tool_calls: choice?.tool_calls
      };
    }
  };
}

/**
 * Create Google Gemini LLM client
 */
export function createGoogleClient(apiKey: string): LLMClient {
  return {
    async chat(messages: LLMMessage[], tools?: object[]) {
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: systemMessage ? { parts: [{ text: systemMessage.content }] } : undefined,
          contents: conversationMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          })),
          tools: tools && tools.length > 0 ? [{
            functionDeclarations: tools.map(t => ({
              name: (t as { name: string }).name,
              description: (t as { description: string }).description,
              parameters: (t as { parameters: object }).parameters
            }))
          }] : undefined
        })
      });

      interface GeminiResponse {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              functionCall?: { name: string; args: object };
            }>;
          };
        }>;
      }
      const data = await response.json() as GeminiResponse;
      const candidate = data.candidates?.[0]?.content;

      if (!candidate) {
        return { content: 'I apologize, but I was unable to process your request.' };
      }

      const textPart = candidate.parts?.find((p) => p.text);
      const functionCalls = candidate.parts?.filter((p) => p.functionCall) || [];

      return {
        content: textPart?.text || null,
        tool_calls: functionCalls
          .filter((p): p is { functionCall: { name: string; args: object } } => !!p.functionCall)
          .map((p, i: number) => ({
            id: `call_${i}`,
            type: 'function' as const,
            function: {
              name: p.functionCall.name,
              arguments: JSON.stringify(p.functionCall.args)
            }
          }))
      };
    }
  };
}
