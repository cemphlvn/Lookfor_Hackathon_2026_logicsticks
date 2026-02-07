/**
 * Workflow Parser — Converts workflow manual to structured config
 *
 * Input: Workflow manual (CSV/JSON from Google Sheets)
 * Output: WorkflowConfig for agent generation
 */

import { ToolDefinition, getToolByHandle } from '../tool-mapper/tools';

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  triggerCondition: string;
  requiredTools: string[];
  boundaries: string[];
  escalationTriggers: string[];
  successCriteria: string[];
}

export interface WorkflowPolicy {
  id: string;
  name: string;
  rules: string[];
  exceptions: string[];
}

export interface WorkflowConfig {
  brandName: string;
  version: string;
  workflows: WorkflowStep[];
  policies: WorkflowPolicy[];
  escalationRules: {
    conditions: string[];
    message: string;
    summary: string[];
  };
  toolMappings: Map<string, string[]>; // workflow step -> tool handles
}

export interface RawWorkflowEntry {
  category: string;
  workflow: string;
  step: string;
  description: string;
  tools: string;
  boundaries: string;
  escalation: string;
}

/**
 * Parse workflow manual from CSV/JSON format
 */
export function parseWorkflowManual(entries: RawWorkflowEntry[]): WorkflowConfig {
  const workflows: WorkflowStep[] = [];
  const policies: WorkflowPolicy[] = [];
  const toolMappings = new Map<string, string[]>();

  // Group by workflow
  const workflowGroups = new Map<string, RawWorkflowEntry[]>();
  for (const entry of entries) {
    const key = entry.workflow;
    if (!workflowGroups.has(key)) {
      workflowGroups.set(key, []);
    }
    workflowGroups.get(key)!.push(entry);
  }

  // Convert each workflow group
  for (const [workflowName, steps] of workflowGroups) {
    const firstStep = steps[0];
    const toolHandles = extractToolHandles(steps.map(s => s.tools).join(','));

    workflows.push({
      id: slugify(workflowName),
      name: workflowName,
      description: steps.map(s => s.description).join(' '),
      triggerCondition: inferTriggerCondition(workflowName),
      requiredTools: toolHandles,
      boundaries: steps.flatMap(s => extractBoundaries(s.boundaries)),
      escalationTriggers: steps.flatMap(s => extractEscalationTriggers(s.escalation)),
      successCriteria: inferSuccessCriteria(workflowName, toolHandles)
    });

    toolMappings.set(slugify(workflowName), toolHandles);
  }

  // Extract policies from boundaries
  const allBoundaries = entries.flatMap(e => extractBoundaries(e.boundaries));
  if (allBoundaries.length > 0) {
    policies.push({
      id: 'general-policy',
      name: 'General Policy',
      rules: allBoundaries,
      exceptions: []
    });
  }

  return {
    brandName: 'default',
    version: '1.0.0',
    workflows,
    policies,
    escalationRules: {
      conditions: [
        'customer explicitly requests human',
        'agent cannot determine correct action',
        'sensitive financial dispute',
        'legal or regulatory concern'
      ],
      message: 'I\'m escalating this to our team for further review. A specialist will respond shortly.',
      summary: ['issue_type', 'customer_sentiment', 'attempted_resolution', 'blocking_reason']
    },
    toolMappings
  };
}

/**
 * Extract tool handles from comma-separated string
 */
function extractToolHandles(toolsStr: string): string[] {
  const handles: string[] = [];
  const patterns = [
    /shopify_\w+/g,
    /skio_\w+/g
  ];

  for (const pattern of patterns) {
    const matches = toolsStr.match(pattern);
    if (matches) {
      handles.push(...matches);
    }
  }

  // Also match descriptive tool names
  const descriptiveMap: Record<string, string> = {
    'get orders': 'shopify_get_customer_orders',
    'order details': 'shopify_get_order_details',
    'cancel order': 'shopify_cancel_order',
    'refund': 'shopify_refund_order',
    'return': 'shopify_create_return',
    'store credit': 'shopify_create_store_credit',
    'discount': 'shopify_create_discount_code',
    'subscription status': 'skio_get_subscription_status',
    'pause subscription': 'skio_pause_subscription',
    'cancel subscription': 'skio_cancel_subscription',
    'skip order': 'skio_skip_next_order_subscription',
    'update address': 'shopify_update_order_shipping_address',
    'knowledge': 'shopify_get_related_knowledge_source',
    'product info': 'shopify_get_product_details',
    'recommendations': 'shopify_get_product_recommendations'
  };

  const lowerStr = toolsStr.toLowerCase();
  for (const [desc, handle] of Object.entries(descriptiveMap)) {
    if (lowerStr.includes(desc)) {
      handles.push(handle);
    }
  }

  return [...new Set(handles)]; // dedupe
}

/**
 * Extract boundary rules from boundary text
 */
function extractBoundaries(boundaryStr: string): string[] {
  if (!boundaryStr) return [];
  return boundaryStr
    .split(/[,;]/)
    .map(b => b.trim())
    .filter(b => b.length > 0);
}

/**
 * Extract escalation triggers
 */
function extractEscalationTriggers(escalationStr: string): string[] {
  if (!escalationStr) return [];
  return escalationStr
    .split(/[,;]/)
    .map(e => e.trim())
    .filter(e => e.length > 0);
}

/**
 * Infer trigger condition from workflow name
 */
function inferTriggerCondition(workflowName: string): string {
  const lower = workflowName.toLowerCase();
  if (lower.includes('order')) return 'customer asks about order';
  if (lower.includes('subscription')) return 'customer asks about subscription';
  if (lower.includes('refund')) return 'customer requests refund';
  if (lower.includes('cancel')) return 'customer wants to cancel';
  if (lower.includes('return')) return 'customer wants to return';
  if (lower.includes('product')) return 'customer asks about product';
  if (lower.includes('shipping')) return 'customer asks about shipping';
  return `customer mentions ${workflowName}`;
}

/**
 * Infer success criteria from workflow and tools
 */
function inferSuccessCriteria(workflowName: string, tools: string[]): string[] {
  const criteria: string[] = [];

  if (tools.some(t => t.includes('get_'))) {
    criteria.push('relevant information retrieved');
  }
  if (tools.some(t => t.includes('cancel') || t.includes('refund'))) {
    criteria.push('action completed successfully');
    criteria.push('customer confirmed satisfaction');
  }
  if (tools.some(t => t.includes('create'))) {
    criteria.push('resource created and confirmed');
  }

  criteria.push('customer query resolved');
  return criteria;
}

/**
 * Convert to URL-safe slug
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate agent-compatible config from workflow config
 */
export function toAgentConfig(config: WorkflowConfig): object {
  return {
    name: `${config.brandName}-mas`,
    version: config.version,
    agents: config.workflows.map(w => ({
      id: `agent-${w.id}`,
      name: w.name,
      description: w.description,
      triggers: [w.triggerCondition],
      tools: w.requiredTools,
      boundaries: w.boundaries,
      escalation: w.escalationTriggers
    })),
    orchestration: {
      type: 'intent-router',
      fallback: 'escalate'
    },
    escalation: config.escalationRules,
    policies: config.policies
  };
}
