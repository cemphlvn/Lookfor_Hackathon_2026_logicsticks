/**
 * API Server — HTTP interface for MAS
 *
 * Endpoints:
 * - POST /session/start — Start new email session
 * - POST /session/:id/message — Send message
 * - GET /session/:id/trace — Get session trace
 * - GET /health — Health check
 */

// Load environment variables first
import 'dotenv/config';

import { MASRuntime, SessionStartParams } from '../mas/runtime';
import { createSimulationRouter, createJudgeRouter } from './simulation';
import { simulationEngine } from '../mas/simulation';
import { getAllScenarios } from '../mas/simulation/scenarios';
import { judgeTeam } from '../mas/judge';
import { MASConfig } from '../meta/agent-generator';
import { buildDefaultMAS } from '../meta/mas-builder';
import { buildNATPATMAS } from '../brands/natpat';

// Simple HTTP handler types
type Handler = (req: Request) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

export class APIServer {
  private runtime: MASRuntime;
  private routes: Route[] = [];

  constructor(runtime: MASRuntime) {
    this.runtime = runtime;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check
    this.routes.push({
      method: 'GET',
      pattern: /^\/health$/,
      handler: async () => this.json({ status: 'healthy', timestamp: new Date().toISOString() })
    });

    // Start session (Requirement 1)
    this.routes.push({
      method: 'POST',
      pattern: /^\/session\/start$/,
      handler: async (req) => {
        const body = await req.json() as SessionStartParams;
        const sessionId = this.runtime.startSession(body);
        return this.json({ success: true, sessionId });
      }
    });

    // Send message (Requirement 2)
    this.routes.push({
      method: 'POST',
      pattern: /^\/session\/([^/]+)\/message$/,
      handler: async (req) => {
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/session\/([^/]+)\/message$/);
        const sessionId = match?.[1];

        if (!sessionId) {
          return this.json({ success: false, error: 'Session ID required' }, 400);
        }

        const body = await req.json() as { message: string };
        try {
          const response = await this.runtime.handleMessage(sessionId, body.message);
          return this.json({ success: true, ...response });
        } catch (error) {
          return this.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 500);
        }
      }
    });

    // Get trace (Requirement 3)
    this.routes.push({
      method: 'GET',
      pattern: /^\/session\/([^/]+)\/trace$/,
      handler: async (req) => {
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/session\/([^/]+)\/trace$/);
        const sessionId = match?.[1];

        if (!sessionId) {
          return this.json({ success: false, error: 'Session ID required' }, 400);
        }

        const format = url.searchParams.get('format') || 'text';
        if (format === 'json') {
          return this.json({ success: true, trace: JSON.parse(this.runtime.getTraceJson(sessionId)) });
        }
        return new Response(this.runtime.getTrace(sessionId), {
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    });

    // Get session summary
    this.routes.push({
      method: 'GET',
      pattern: /^\/session\/([^/]+)\/summary$/,
      handler: async (req) => {
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/session\/([^/]+)\/summary$/);
        const sessionId = match?.[1];

        if (!sessionId) {
          return this.json({ success: false, error: 'Session ID required' }, 400);
        }

        return this.json({ success: true, summary: this.runtime.getSessionSummary(sessionId) });
      }
    });

    // List active sessions
    this.routes.push({
      method: 'GET',
      pattern: /^\/sessions$/,
      handler: async () => {
        const sessions = this.runtime.getActiveSessions();
        return this.json({
          success: true,
          count: sessions.length,
          sessions: sessions.map(s => ({
            id: s.id,
            customer: s.customerEmail,
            status: s.status,
            messageCount: s.messages.length
          }))
        });
      }
    });

    // Get MAS config
    this.routes.push({
      method: 'GET',
      pattern: /^\/config$/,
      handler: async () => {
        return this.json({ success: true, config: this.runtime.getConfig() });
      }
    });

    // === SIDE QUEST: Dynamic MAS Update ===

    // Add dynamic rule via prompt
    this.routes.push({
      method: 'POST',
      pattern: /^\/mas\/update$/,
      handler: async (req) => {
        const body = await req.json() as { prompt: string };
        if (!body.prompt) {
          return this.json({ success: false, error: 'Prompt required' }, 400);
        }

        const { dynamicRules } = await import('./mas-update');
        const rule = dynamicRules.addRule(body.prompt);

        if (rule) {
          return this.json({
            success: true,
            message: 'MAS behavior updated',
            rule: {
              id: rule.id,
              triggers: rule.trigger.keywords,
              action: rule.action.type,
              tag: rule.action.tag
            }
          });
        }
        return this.json({ success: false, error: 'Could not parse update prompt' }, 400);
      }
    });

    // List dynamic rules
    this.routes.push({
      method: 'GET',
      pattern: /^\/mas\/rules$/,
      handler: async () => {
        const { dynamicRules } = await import('./mas-update');
        return this.json({ success: true, rules: dynamicRules.getRules() });
      }
    });

    // Delete dynamic rule
    this.routes.push({
      method: 'DELETE',
      pattern: /^\/mas\/rules\/([^/]+)$/,
      handler: async (req) => {
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/mas\/rules\/([^/]+)$/);
        const ruleId = match?.[1];

        if (!ruleId) {
          return this.json({ success: false, error: 'Rule ID required' }, 400);
        }

        const { dynamicRules } = await import('./mas-update');
        const deactivated = dynamicRules.deactivateRule(ruleId);
        return this.json({ success: deactivated });
      }
    });

    // === SIMULATION & JUDGE ROUTES (CI/CD Integration) ===

    // Initialize scenarios
    this.routes.push({
      method: 'POST',
      pattern: /^\/simulate\/init$/,
      handler: async () => {
        const scenarios = getAllScenarios();
        scenarios.forEach(s => simulationEngine.registerScenario({ ...s, status: 'pending' }));
        return this.json({ success: true, registered: scenarios.length });
      }
    });

    // Run all scenarios
    this.routes.push({
      method: 'POST',
      pattern: /^\/simulate\/run-all$/,
      handler: async () => {
        const executor = async (sid: string, msg: string) => {
          const sessionId = this.runtime.startSession({
            customerEmail: 'sim@test.com',
            firstName: 'Sim',
            lastName: 'Test',
            shopifyCustomerId: 'sim_test'
          });
          return this.runtime.handleMessage(sessionId, msg);
        };

        const results = [];
        for (const scenario of simulationEngine.getScenarios()) {
          try {
            const timeline = await simulationEngine.runSimulation(scenario.id, executor);
            results.push({ id: scenario.id, status: 'completed', score: timeline.finalState.qualityScore });
          } catch (e) {
            results.push({ id: scenario.id, status: 'error', error: String(e) });
          }
        }
        return this.json({ success: true, results, total: results.length });
      }
    });

    // Get dashboard data
    this.routes.push({
      method: 'GET',
      pattern: /^\/simulate\/dashboard$/,
      handler: async () => {
        return this.json(simulationEngine.exportDashboardData());
      }
    });

    // Judge session
    this.routes.push({
      method: 'POST',
      pattern: /^\/judge\/session$/,
      handler: async () => {
        const session = judgeTeam.startSession();
        return this.json({ success: true, session });
      }
    });

    // Integration checks
    this.routes.push({
      method: 'POST',
      pattern: /^\/judge\/integration$/,
      handler: async () => {
        const checks = judgeTeam.runIntegrationChecks();
        return this.json({ success: true, checks, passed: checks.filter(c => c.status === 'pass').length });
      }
    });

    // Consensus
    this.routes.push({
      method: 'POST',
      pattern: /^\/judge\/consensus$/,
      handler: async () => {
        const session = judgeTeam.getLatestSession();
        if (!session) return this.json({ success: false, error: 'No active session' }, 400);
        judgeTeam.judgeAllScenarios(session.id);
        const verdict = judgeTeam.reachConsensus(session.id);
        return this.json({ success: true, verdict });
      }
    });

    // CI/CD Gate
    this.routes.push({
      method: 'GET',
      pattern: /^\/judge\/gate$/,
      handler: async () => {
        const report = judgeTeam.exportReport();
        const pass = report.verdict?.recommendation === 'SHIP';
        return this.json({
          gate: pass ? 'PASS' : 'FAIL',
          recommendation: report.verdict?.recommendation || 'PENDING',
          score: report.verdict?.overallScore || 0
        });
      }
    });

    // Report
    this.routes.push({
      method: 'GET',
      pattern: /^\/judge\/report$/,
      handler: async () => {
        return this.json(judgeTeam.exportReport());
      }
    });
  }

  /**
   * Handle incoming request
   */
  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);

    for (const route of this.routes) {
      if (req.method === route.method && route.pattern.test(url.pathname)) {
        try {
          return await route.handler(req);
        } catch (error) {
          console.error('[API] Error:', error);
          return this.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error'
          }, 500);
        }
      }
    }

    return this.json({ success: false, error: 'Not found' }, 404);
  }

  private json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Create and start server (for Node.js or Bun)
 */
export async function startServer(port: number = 3001, brandName: string = 'NATPAT'): Promise<void> {
  // Build MAS config - use NATPAT config if that's the brand
  const { config } = brandName.toLowerCase() === 'natpat'
    ? buildNATPATMAS()
    : buildDefaultMAS(brandName);

  // Create runtime
  const runtime = new MASRuntime(config);

  // Create API server
  const api = new APIServer(runtime);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`MAS Server starting...`);
  console.log(`Brand: ${brandName}`);
  console.log(`Agents: ${config.orchestrator.agents.map(a => a.id).join(', ')}`);
  console.log(`Port: ${port}`);
  console.log(`${'='.repeat(60)}\n`);

  // Node.js server with http module
  const http = await import('http');
  const fs = await import('fs');
  const path = await import('path');

  const server = http.createServer(async (req, res) => {
    const reqUrl = req.url || '/';

    // Serve static files from /public
    if (reqUrl === '/' || reqUrl === '/dashboard' || reqUrl.startsWith('/dashboard.html')) {
      const dashboardPath = path.join(process.cwd(), 'public', 'dashboard.html');
      try {
        const content = fs.readFileSync(dashboardPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
        return;
      } catch {
        // Fall through to API
      }
    }

    const url = `http://localhost:${port}${reqUrl}`;
    const body = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk: Buffer) => data += chunk.toString());
      req.on('end', () => resolve(data));
    });

    // Build headers object
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value[0];
      }
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method || '') ? body : undefined
    });

    const response = await api.handle(request);
    const responseBody = await response.text();

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    res.writeHead(response.status, responseHeaders);
    res.end(responseBody);
  });

  server.listen(port, () => {
    console.log(`[MAS] Server running on http://localhost:${port}`);
  });
}

// CLI entry point (ESM compatible)
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1]?.endsWith('server.ts') ||
                     process.argv[1]?.endsWith('server.js');

if (isMainModule) {
  const port = parseInt(process.env.PORT || '3001');
  const brand = process.env.BRAND_NAME || 'NATPAT';
  startServer(port, brand);
}
