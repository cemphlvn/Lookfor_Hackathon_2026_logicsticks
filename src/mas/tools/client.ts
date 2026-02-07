/**
 * Tool Client — Execute tool calls against Lookfor API
 */

import { ToolDefinition, getToolByHandle, ALL_TOOLS } from '../../meta/tool-mapper/tools';

export interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export class ToolClient {
  private apiUrl: string;
  private timeout: number;
  private useMock: boolean;

  constructor(timeout: number = 30000) {
    this.useMock = process.env.USE_MOCK_API === 'true';
    this.apiUrl = this.useMock
      ? 'http://localhost:3002/v1/api'
      : (process.env.API_URL || 'https://lookfor-backend.ngrok.app/v1/api');
    this.timeout = timeout;
    console.log(`[ToolClient] Using API: ${this.apiUrl}${this.useMock ? ' (MOCK)' : ''}`);
  }

  /**
   * Execute a tool call
   */
  async execute(toolHandle: string, params: Record<string, unknown>): Promise<ToolCallResult> {
    const tool = getToolByHandle(toolHandle);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolHandle}` };
    }

    // Validate required params
    const validation = this.validateParams(tool, params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const response = await this.makeRequest(tool.endpoint, params);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Make HTTP request to tool endpoint
   */
  private async makeRequest(endpoint: string, params: Record<string, unknown>): Promise<ToolCallResult> {
    const url = `${this.apiUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle non-2xx responses
      if (!response.ok) {
        const text = await response.text();
        try {
          const errData = JSON.parse(text) as { message?: string; error?: string };
          return { success: false, error: errData.message || errData.error || `HTTP ${response.status}` };
        } catch {
          return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 100)}` };
        }
      }

      // All success responses are HTTP 200 per spec
      const data = await response.json() as { success: boolean; data?: unknown; error?: string; message?: string };

      if (data.success) {
        return { success: true, data: data.data };
      } else {
        return { success: false, error: data.error || data.message || 'Unknown error from tool' };
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Tool call timed out' };
      }

      throw error;
    }
  }

  /**
   * Validate params against tool schema
   */
  private validateParams(tool: ToolDefinition, params: Record<string, unknown>): { valid: boolean; error?: string } {
    for (const param of tool.params) {
      if (param.required && !(param.name in params)) {
        return { valid: false, error: `Missing required parameter: ${param.name}` };
      }

      if (param.name in params) {
        const value = params[param.name];

        // Type checking
        if (param.type === 'string' && typeof value !== 'string') {
          return { valid: false, error: `Parameter ${param.name} must be a string` };
        }
        if (param.type === 'number' && typeof value !== 'number') {
          return { valid: false, error: `Parameter ${param.name} must be a number` };
        }
        if (param.type === 'boolean' && typeof value !== 'boolean') {
          return { valid: false, error: `Parameter ${param.name} must be a boolean` };
        }
        if (param.type === 'array' && !Array.isArray(value)) {
          return { valid: false, error: `Parameter ${param.name} must be an array` };
        }
        if (param.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
          return { valid: false, error: `Parameter ${param.name} must be an object` };
        }

        // Enum checking
        if (param.enum && !param.enum.includes(value as string)) {
          return { valid: false, error: `Parameter ${param.name} must be one of: ${param.enum.join(', ')}` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Get tool schemas for LLM
   */
  getToolSchemas(): object[] {
    return ALL_TOOLS.map(tool => ({
      name: tool.handle,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          tool.params.map(p => [
            p.name,
            {
              type: p.type,
              description: p.description,
              ...(p.enum ? { enum: p.enum } : {})
            }
          ])
        ),
        required: tool.params.filter(p => p.required).map(p => p.name)
      }
    }));
  }

  /**
   * Get tool schemas for specific agent
   */
  getAgentToolSchemas(toolHandles: string[]): object[] {
    return this.getToolSchemas().filter(s => toolHandles.includes((s as { name: string }).name));
  }
}

// Singleton instance with lazy initialization
let _toolClient: ToolClient | null = null;

export function getToolClient(): ToolClient {
  if (!_toolClient) {
    _toolClient = new ToolClient();
  }
  return _toolClient;
}

export function resetToolClient(): void {
  _toolClient = null;
}

// Legacy export for backwards compatibility (lazy)
export const toolClient = {
  get instance() { return getToolClient(); },
  execute: (...args: Parameters<ToolClient['execute']>) => getToolClient().execute(...args),
  getToolSchemas: () => getToolClient().getToolSchemas(),
  getAgentToolSchemas: (handles: string[]) => getToolClient().getAgentToolSchemas(handles)
};
