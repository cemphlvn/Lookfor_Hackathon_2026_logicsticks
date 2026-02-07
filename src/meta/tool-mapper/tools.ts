/**
 * Tool Definitions — 19 Shopify + Skio tools
 * Generated from Lookfor Hackathon Tooling Spec
 */

export interface ToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enum?: string[];
  properties?: Record<string, ToolParam>;
}

export interface ToolDefinition {
  handle: string;
  description: string;
  endpoint: string;
  method: 'POST';
  params: ToolParam[];
  outputSchema: {
    success: { data?: unknown };
    failure: { error: string };
  };
}

// Shopify Tools (14)
export const SHOPIFY_TOOLS: ToolDefinition[] = [
  {
    handle: 'shopify_add_tags',
    description: 'Add tags to order, draft order, customer, product, or article',
    endpoint: '/hackhaton/add_tags',
    method: 'POST',
    params: [
      { name: 'id', type: 'string', required: true, description: 'Shopify resource GID' },
      { name: 'tags', type: 'array', required: true, description: 'Tags to add' }
    ],
    outputSchema: { success: {}, failure: { error: 'Failed to add tags' } }
  },
  {
    handle: 'shopify_cancel_order',
    description: 'Cancel order with reason and refund options',
    endpoint: '/hackhaton/cancel_order',
    method: 'POST',
    params: [
      { name: 'orderId', type: 'string', required: true, description: 'Order GID' },
      { name: 'reason', type: 'string', required: true, description: 'Cancellation reason', enum: ['CUSTOMER', 'DECLINED', 'FRAUD', 'INVENTORY', 'OTHER', 'STAFF'] },
      { name: 'notifyCustomer', type: 'boolean', required: true, description: 'Notify customer' },
      { name: 'restock', type: 'boolean', required: true, description: 'Restock inventory' },
      { name: 'staffNote', type: 'string', required: true, description: 'Internal note' },
      { name: 'refundMode', type: 'string', required: true, description: 'Refund method', enum: ['ORIGINAL', 'STORE_CREDIT'] },
      { name: 'storeCredit', type: 'object', required: true, description: 'Store credit options' }
    ],
    outputSchema: { success: {}, failure: { error: 'Shopify returned errors when cancelling order' } }
  },
  {
    handle: 'shopify_create_discount_code',
    description: 'Create discount code for customer',
    endpoint: '/hackhaton/create_discount_code',
    method: 'POST',
    params: [
      { name: 'type', type: 'string', required: true, description: 'percentage (0-1) or fixed' },
      { name: 'value', type: 'number', required: true, description: 'Discount value' },
      { name: 'duration', type: 'number', required: true, description: 'Validity in hours' },
      { name: 'productIds', type: 'array', required: true, description: 'Product GIDs or empty for order-wide' }
    ],
    outputSchema: { success: { data: { code: 'DISCOUNT_LF_XXX' } }, failure: { error: 'Failed to create discount code' } }
  },
  {
    handle: 'shopify_create_return',
    description: 'Create return for order',
    endpoint: '/hackhaton/create_return',
    method: 'POST',
    params: [
      { name: 'orderId', type: 'string', required: true, description: 'Order GID' }
    ],
    outputSchema: { success: {}, failure: { error: 'Shopify returnCreate failed' } }
  },
  {
    handle: 'shopify_create_store_credit',
    description: 'Credit store credit to customer',
    endpoint: '/hackhaton/create_store_credit',
    method: 'POST',
    params: [
      { name: 'id', type: 'string', required: true, description: 'Customer or StoreCreditAccount GID' },
      { name: 'creditAmount', type: 'object', required: true, description: 'Amount and currency' },
      { name: 'expiresAt', type: 'string', required: false, description: 'ISO8601 expiry or null' }
    ],
    outputSchema: {
      success: { data: { storeCreditAccountId: 'gid://...', credited: { amount: '0', currencyCode: 'USD' }, newBalance: { amount: '0', currencyCode: 'USD' } } },
      failure: { error: 'Failed to credit store credit' }
    }
  },
  {
    handle: 'shopify_get_collection_recommendations',
    description: 'Get collection recommendations from keywords',
    endpoint: '/hackhaton/get_collection_recommendations',
    method: 'POST',
    params: [
      { name: 'queryKeys', type: 'array', required: true, description: 'Keywords for what customer wants' }
    ],
    outputSchema: {
      success: { data: [{ id: 'gid://...', title: '', handle: '' }] },
      failure: { error: 'Failed to fetch collection recommendations' }
    }
  },
  {
    handle: 'shopify_get_customer_orders',
    description: 'Get customer orders with pagination',
    endpoint: '/hackhaton/get_customer_orders',
    method: 'POST',
    params: [
      { name: 'email', type: 'string', required: true, description: 'Customer email' },
      { name: 'after', type: 'string', required: true, description: 'Cursor or "null"' },
      { name: 'limit', type: 'number', required: true, description: 'Max 250' }
    ],
    outputSchema: {
      success: { data: { orders: [], hasNextPage: false, endCursor: null } },
      failure: { error: 'Failed to fetch customer orders' }
    }
  },
  {
    handle: 'shopify_get_order_details',
    description: 'Get order details by order number',
    endpoint: '/hackhaton/get_order_details',
    method: 'POST',
    params: [
      { name: 'orderId', type: 'string', required: true, description: 'Order identifier starting with #' }
    ],
    outputSchema: {
      success: { data: { id: 'gid://...', name: '#1001', createdAt: '', status: '', trackingUrl: '' } },
      failure: { error: 'Order not found' }
    }
  },
  {
    handle: 'shopify_get_product_details',
    description: 'Get product info by id, name, or key feature',
    endpoint: '/hackhaton/get_product_details',
    method: 'POST',
    params: [
      { name: 'queryType', type: 'string', required: true, description: 'How to interpret queryKey', enum: ['id', 'name', 'key feature'] },
      { name: 'queryKey', type: 'string', required: true, description: 'Lookup key' }
    ],
    outputSchema: {
      success: { data: [{ id: 'gid://...', title: '', handle: '' }] },
      failure: { error: 'Product not found' }
    }
  },
  {
    handle: 'shopify_get_product_recommendations',
    description: 'Get product recommendations from keywords',
    endpoint: '/hackhaton/get_product_recommendations',
    method: 'POST',
    params: [
      { name: 'queryKeys', type: 'array', required: true, description: 'Keywords for intent' }
    ],
    outputSchema: {
      success: { data: [{ id: 'gid://...', title: '', handle: '' }] },
      failure: { error: 'Failed to fetch product recommendations' }
    }
  },
  {
    handle: 'shopify_get_related_knowledge_source',
    description: 'Get FAQs, PDFs, blogs, pages for a question',
    endpoint: '/hackhaton/get_related_knowledge_source',
    method: 'POST',
    params: [
      { name: 'question', type: 'string', required: true, description: 'Customer question' },
      { name: 'specificToProductId', type: 'string', required: true, description: 'Product GID or null' }
    ],
    outputSchema: {
      success: { data: { faqs: [], pdfs: [], blogArticles: [], pages: [] } },
      failure: { error: 'Failed to fetch related knowledge sources' }
    }
  },
  {
    handle: 'shopify_refund_order',
    description: 'Refund an order',
    endpoint: '/hackhaton/refund_order',
    method: 'POST',
    params: [
      { name: 'orderId', type: 'string', required: true, description: 'Order GID' },
      { name: 'refundMethod', type: 'string', required: true, description: 'Refund destination', enum: ['ORIGINAL_PAYMENT_METHODS', 'STORE_CREDIT'] }
    ],
    outputSchema: { success: {}, failure: { error: 'Shopify refundCreate failed' } }
  },
  {
    handle: 'shopify_update_order_shipping_address',
    description: 'Update order shipping address',
    endpoint: '/hackhaton/update_order_shipping_address',
    method: 'POST',
    params: [
      { name: 'orderId', type: 'string', required: true, description: 'Order GID' },
      { name: 'shippingAddress', type: 'object', required: true, description: 'Full address object' }
    ],
    outputSchema: { success: {}, failure: { error: 'Shopify returned errors when updating shipping address' } }
  }
];

// Skio Tools (5)
export const SKIO_TOOLS: ToolDefinition[] = [
  {
    handle: 'skio_cancel_subscription',
    description: 'Cancel subscription',
    endpoint: '/hackhaton/cancel-subscription',
    method: 'POST',
    params: [
      { name: 'subscriptionId', type: 'string', required: true, description: 'Subscription ID' },
      { name: 'cancellationReasons', type: 'array', required: true, description: 'Reasons for cancellation' }
    ],
    outputSchema: { success: {}, failure: { error: 'Failed to cancel subscription' } }
  },
  {
    handle: 'skio_get_subscription_status',
    description: 'Get subscription status',
    endpoint: '/hackhaton/get-subscription-status',
    method: 'POST',
    params: [
      { name: 'email', type: 'string', required: true, description: 'Customer email' }
    ],
    outputSchema: {
      success: { data: { status: 'ACTIVE', subscriptionId: '', nextBillingDate: '' } },
      failure: { error: 'Failed to get subscription status' }
    }
  },
  {
    handle: 'skio_pause_subscription',
    description: 'Pause subscription until date',
    endpoint: '/hackhaton/pause-subscription',
    method: 'POST',
    params: [
      { name: 'subscriptionId', type: 'string', required: true, description: 'Subscription ID' },
      { name: 'pausedUntil', type: 'string', required: true, description: 'Date YYYY-MM-DD' }
    ],
    outputSchema: { success: {}, failure: { error: 'Failed to pause subscription' } }
  },
  {
    handle: 'skio_skip_next_order_subscription',
    description: 'Skip next subscription order',
    endpoint: '/hackhaton/skip-next-order-subscription',
    method: 'POST',
    params: [
      { name: 'subscriptionId', type: 'string', required: true, description: 'Subscription ID' }
    ],
    outputSchema: { success: {}, failure: { error: 'Failed to skip next subscription order' } }
  },
  {
    handle: 'skio_unpause_subscription',
    description: 'Unpause paused subscription',
    endpoint: '/hackhaton/unpause-subscription',
    method: 'POST',
    params: [
      { name: 'subscriptionId', type: 'string', required: true, description: 'Subscription ID' }
    ],
    outputSchema: { success: {}, failure: { error: 'Failed to unpause subscription' } }
  }
];

export const ALL_TOOLS = [...SHOPIFY_TOOLS, ...SKIO_TOOLS];

export function getToolByHandle(handle: string): ToolDefinition | undefined {
  return ALL_TOOLS.find(t => t.handle === handle);
}

export function getToolsByCategory(category: 'shopify' | 'skio'): ToolDefinition[] {
  return category === 'shopify' ? SHOPIFY_TOOLS : SKIO_TOOLS;
}
