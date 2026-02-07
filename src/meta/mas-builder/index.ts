/**
 * MAS Builder — Assembles complete MAS from components
 *
 * This is the entry point for Step 2:
 * workflow + tickets + tools → complete MAS config
 */

import { parseWorkflowManual, RawWorkflowEntry, WorkflowConfig } from '../workflow-parser';
import { extractIntentPatterns, Ticket, IntentPattern } from '../intent-extractor';
import { generateMASConfig, MASConfig, generateMASCode, serializeMASConfig } from '../agent-generator';
import { ALL_TOOLS, ToolDefinition } from '../tool-mapper/tools';

export interface MASBuildInput {
  brandName: string;
  workflowEntries: RawWorkflowEntry[];
  historicalTickets: Ticket[];
  toolSubset?: string[]; // If not all tools needed
}

export interface MASBuildOutput {
  config: MASConfig;
  configJson: string;
  runtimeCode: string;
  summary: BuildSummary;
}

export interface BuildSummary {
  agentCount: number;
  toolCount: number;
  intentPatterns: number;
  workflows: string[];
  escalationTriggers: string[];
  generatedAt: string;
}

/**
 * Build complete MAS from inputs
 */
export function buildMAS(input: MASBuildInput): MASBuildOutput {
  // Step 1: Parse workflow manual
  const workflowConfig = parseWorkflowManual(input.workflowEntries);
  workflowConfig.brandName = input.brandName;

  // Step 2: Extract intent patterns from tickets
  const patterns = extractIntentPatterns(input.historicalTickets);

  // Step 3: Generate MAS config
  const masConfig = generateMASConfig(workflowConfig, patterns);

  // Step 4: Filter tools if subset specified
  if (input.toolSubset) {
    for (const agent of masConfig.orchestrator.agents) {
      agent.tools = agent.tools.filter(t => input.toolSubset!.includes(t));
    }
  }

  // Generate outputs
  const configJson = serializeMASConfig(masConfig);
  const runtimeCode = generateMASCode(masConfig);

  const summary: BuildSummary = {
    agentCount: masConfig.orchestrator.agents.length,
    toolCount: new Set(masConfig.orchestrator.agents.flatMap(a => a.tools)).size,
    intentPatterns: patterns.length,
    workflows: workflowConfig.workflows.map(w => w.name),
    escalationTriggers: masConfig.orchestrator.escalationHandler.conditions,
    generatedAt: new Date().toISOString()
  };

  return {
    config: masConfig,
    configJson,
    runtimeCode,
    summary
  };
}

/**
 * Build MAS with defaults for quick testing
 */
export function buildDefaultMAS(brandName: string): MASBuildOutput {
  // Default workflow entries for e-commerce
  const defaultWorkflows: RawWorkflowEntry[] = [
    {
      category: 'Orders',
      workflow: 'Order Status Inquiry',
      step: 'Check order',
      description: 'Look up order status and tracking information',
      tools: 'shopify_get_customer_orders, shopify_get_order_details',
      boundaries: 'Do not share orders from other customers',
      escalation: 'Cannot find order, customer disputes delivery'
    },
    {
      category: 'Orders',
      workflow: 'Order Cancellation',
      step: 'Cancel order',
      description: 'Cancel order if not yet shipped',
      tools: 'shopify_get_order_details, shopify_cancel_order',
      boundaries: 'Only cancel if status is UNFULFILLED',
      escalation: 'Order already shipped, customer insists'
    },
    {
      category: 'Returns',
      workflow: 'Return Request',
      step: 'Process return',
      description: 'Create return for eligible orders',
      tools: 'shopify_get_order_details, shopify_create_return',
      boundaries: 'Check return window policy',
      escalation: 'Outside return window, damage claim'
    },
    {
      category: 'Refunds',
      workflow: 'Refund Processing',
      step: 'Issue refund',
      description: 'Process refund to original payment or store credit',
      tools: 'shopify_get_order_details, shopify_refund_order',
      boundaries: 'Verify refund amount matches order',
      escalation: 'Partial refund dispute, fraud suspected'
    },
    {
      category: 'Subscriptions',
      workflow: 'Subscription Status',
      step: 'Check subscription',
      description: 'Look up subscription status and billing info',
      tools: 'skio_get_subscription_status',
      boundaries: 'Only show customer own subscription',
      escalation: 'Billing dispute, unauthorized charges'
    },
    {
      category: 'Subscriptions',
      workflow: 'Subscription Management',
      step: 'Modify subscription',
      description: 'Pause, skip, or cancel subscription',
      tools: 'skio_get_subscription_status, skio_pause_subscription, skio_skip_next_order_subscription, skio_cancel_subscription',
      boundaries: 'Confirm action before executing',
      escalation: 'Customer wants refund of past charges'
    },
    {
      category: 'Shipping',
      workflow: 'Address Update',
      step: 'Update address',
      description: 'Update shipping address on unfulfilled orders',
      tools: 'shopify_get_order_details, shopify_update_order_shipping_address',
      boundaries: 'Only update if not shipped',
      escalation: 'Order already shipped, international address issues'
    },
    {
      category: 'Products',
      workflow: 'Product Information',
      step: 'Answer product questions',
      description: 'Provide product details and recommendations',
      tools: 'shopify_get_product_details, shopify_get_product_recommendations, shopify_get_related_knowledge_source',
      boundaries: 'Use verified product information only',
      escalation: 'Medical/health claims, ingredient sensitivity'
    }
  ];

  // Sample tickets for pattern extraction
  const sampleTickets: Ticket[] = [
    { conversationId: '1', customerId: 'c1', createdAt: '2026-01-01', ConversationType: 'email', subject: 'Where is my order?', conversation: 'Customer\'s message: "I placed an order 5 days ago and haven\'t received it"' },
    { conversationId: '2', customerId: 'c2', createdAt: '2026-01-02', ConversationType: 'email', subject: 'Cancel my subscription', conversation: 'Customer\'s message: "I want to cancel my monthly subscription"' },
    { conversationId: '3', customerId: 'c3', createdAt: '2026-01-03', ConversationType: 'email', subject: 'Refund request', conversation: 'Customer\'s message: "I need a refund for my last order, product was damaged"' },
    { conversationId: '4', customerId: 'c4', createdAt: '2026-01-04', ConversationType: 'email', subject: 'Wrong address', conversation: 'Customer\'s message: "I need to change my shipping address before it ships"' },
    { conversationId: '5', customerId: 'c5', createdAt: '2026-01-05', ConversationType: 'email', subject: 'Skip next order', conversation: 'Customer\'s message: "Can I skip my next subscription order?"' }
  ];

  return buildMAS({
    brandName,
    workflowEntries: defaultWorkflows,
    historicalTickets: sampleTickets
  });
}

/**
 * Validate MAS config for completeness
 */
export function validateMASConfig(config: MASConfig): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check agents
  if (config.orchestrator.agents.length === 0) {
    issues.push('No agents defined');
  }

  // Check tools exist
  for (const agent of config.orchestrator.agents) {
    for (const toolHandle of agent.tools) {
      if (!ALL_TOOLS.some(t => t.handle === toolHandle)) {
        issues.push(`Unknown tool: ${toolHandle} in agent ${agent.id}`);
      }
    }
  }

  // Check routing
  if (config.orchestrator.routing.length === 0) {
    issues.push('No routing rules defined');
  }

  // Check escalation
  if (config.orchestrator.escalationHandler.conditions.length === 0) {
    issues.push('No escalation conditions defined');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
