/**
 * NATPAT Brand Configuration — E-commerce sticker/patch company
 *
 * Products: BuzzPatch, MagicPatch, SleepyPatch, ZenPatch, etc.
 * Platform: Shopify + Skio subscriptions
 */

import { RawWorkflowEntry } from '../meta/workflow-parser';
import { loadTickets } from '../data/tickets';
import { buildMAS, MASBuildOutput } from '../meta/mas-builder';

/**
 * NATPAT-specific workflows based on ticket analysis
 */
export const NATPAT_WORKFLOWS: RawWorkflowEntry[] = [
  // Order Tracking (most common)
  {
    category: 'Orders',
    workflow: 'Order Status & Tracking',
    step: 'Check order status',
    description: 'Look up order status, tracking info, and delivery estimates',
    tools: 'shopify_get_customer_orders, shopify_get_order_details',
    boundaries: 'Only show customer their own orders, do not share other customer data',
    escalation: 'Order marked delivered but not received, suspected lost package'
  },

  // Shipping Issues (common)
  {
    category: 'Shipping',
    workflow: 'Shipping Issues',
    step: 'Address shipping concerns',
    description: 'Handle partial shipments, split orders, delayed deliveries',
    tools: 'shopify_get_order_details, shopify_get_customer_orders',
    boundaries: 'Provide tracking links, explain split shipments',
    escalation: 'Multiple items missing, wrong address, international customs issues'
  },

  // Product Quality Issues (NATPAT specific - patches not sticking)
  {
    category: 'Product',
    workflow: 'Product Quality Complaint',
    step: 'Address quality issues',
    description: 'Handle complaints about patches not sticking, wrong version, old stock',
    tools: 'shopify_get_order_details, shopify_get_product_details, shopify_create_discount_code',
    boundaries: 'Offer replacement packs (up to 2), explain version differences',
    escalation: 'Health claims, severe allergic reactions, legal threats'
  },

  // Refund Requests
  {
    category: 'Refunds',
    workflow: 'Refund Processing',
    step: 'Process refund request',
    description: 'Handle refund requests with options: 60% keep product, full with return',
    tools: 'shopify_get_order_details, shopify_refund_order, shopify_create_store_credit',
    boundaries: 'Offer 60% refund to keep product OR full refund with return. Return address: The Natural Patch Co, 1981 E Cross Rd, Galena IL 61036',
    escalation: 'Customer demands full refund without return, disputes more than 60 days old'
  },

  // Return Processing
  {
    category: 'Returns',
    workflow: 'Return Processing',
    step: 'Create return',
    description: 'Handle return requests within policy window',
    tools: 'shopify_get_order_details, shopify_create_return',
    boundaries: '30-day return window, product must be unused in original packaging',
    escalation: 'Outside return window, opened products, damaged items'
  },

  // Subscription Management
  {
    category: 'Subscriptions',
    workflow: 'Subscription Inquiry',
    step: 'Check subscription',
    description: 'Look up subscription status, next billing date, manage subscription',
    tools: 'skio_get_subscription_status, skio_pause_subscription, skio_skip_next_order_subscription',
    boundaries: 'Only modify active subscriptions, confirm actions before executing',
    escalation: 'Billing disputes, unauthorized charges, refund of past subscription charges'
  },

  // Cancel Subscription (retention flow)
  {
    category: 'Subscriptions',
    workflow: 'Subscription Cancellation',
    step: 'Cancel subscription',
    description: 'Handle cancellation requests with retention offers',
    tools: 'skio_get_subscription_status, skio_cancel_subscription, skio_pause_subscription, shopify_create_discount_code',
    boundaries: 'Offer pause or skip before cancel. If insistent, proceed with cancellation',
    escalation: 'Customer angry about cancellation difficulty, requests manager'
  },

  // Address Updates
  {
    category: 'Shipping',
    workflow: 'Address Update',
    step: 'Update shipping address',
    description: 'Update shipping address for unfulfilled orders',
    tools: 'shopify_get_order_details, shopify_update_order_shipping_address',
    boundaries: 'Only update if order is UNFULFILLED. Cannot change after shipped',
    escalation: 'Order already shipped, address change to different country'
  },

  // Product Information
  {
    category: 'Products',
    workflow: 'Product Information',
    step: 'Answer product questions',
    description: 'Provide product information, usage instructions, recommendations',
    tools: 'shopify_get_product_details, shopify_get_product_recommendations, shopify_get_related_knowledge_source',
    boundaries: 'Only use verified product information. No medical claims',
    escalation: 'Medical advice requests, health claims, ingredient allergies'
  },

  // Order Cancellation
  {
    category: 'Orders',
    workflow: 'Order Cancellation',
    step: 'Cancel order',
    description: 'Cancel unfulfilled orders per customer request',
    tools: 'shopify_get_order_details, shopify_cancel_order',
    boundaries: 'Only cancel UNFULFILLED orders. Refund to original payment method',
    escalation: 'Order already fulfilled, partial cancellation requested'
  }
];

/**
 * NATPAT brand context for agent prompts
 */
export const NATPAT_CONTEXT = {
  name: 'NATPAT',
  fullName: 'The Natural Patch Co',
  tone: 'friendly, empathetic, playful with emojis, solution-oriented',
  products: [
    'BuzzPatch - Mosquito repellent stickers',
    'MagicPatch - Itch relief patches',
    'SleepyPatch - Sleep aid patches for kids/adults',
    'ZenPatch - Calming/focus patches',
    'SunnyPatch - UV-detecting stickers',
    'FocusPatch - Concentration patches',
    'Pet patches - Flea/tick repellent for pets'
  ],
  commonIssues: [
    'Patches not sticking well',
    'Wrong version received (old vs new)',
    'Split shipments not explained',
    'Tracking not updating',
    'Subscription confusion'
  ],
  returnAddress: 'The Natural Patch Co, 1981 E Cross Rd, Galena IL 61036',
  policies: [
    '30-day return window',
    '60% refund option to keep products',
    'Full refund with return',
    'Free replacement for quality issues (up to 2 packs)',
    'Subscription can be paused/skipped/cancelled anytime'
  ]
};

/**
 * Build NATPAT MAS with real tickets
 */
export function buildNATPATMAS(): MASBuildOutput {
  const tickets = loadTickets();
  console.log(`[NATPAT] Loaded ${tickets.length} historical tickets`);

  return buildMAS({
    brandName: 'NATPAT',
    workflowEntries: NATPAT_WORKFLOWS,
    historicalTickets: tickets
  });
}

/**
 * Get NATPAT system prompt enhancement
 */
export function getNATPATSystemPromptAddition(): string {
  return `
BRAND: ${NATPAT_CONTEXT.name} (${NATPAT_CONTEXT.fullName})
TONE: ${NATPAT_CONTEXT.tone}

PRODUCTS:
${NATPAT_CONTEXT.products.map(p => `- ${p}`).join('\n')}

COMMON ISSUES TO WATCH FOR:
${NATPAT_CONTEXT.commonIssues.map(i => `- ${i}`).join('\n')}

KEY POLICIES:
${NATPAT_CONTEXT.policies.map(p => `- ${p}`).join('\n')}

RETURN ADDRESS: ${NATPAT_CONTEXT.returnAddress}

COMMUNICATION STYLE:
- Use emojis sparingly but warmly 🙏 😊
- Apologize sincerely for issues
- Offer solutions proactively
- Confirm understanding before taking action
- End with "Agent xx" signature
`;
}
