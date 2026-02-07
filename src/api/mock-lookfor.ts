/**
 * Mock Lookfor API — For demo/testing when backend routes not available
 *
 * This simulates the expected Lookfor API responses.
 * Use only for demos. Set USE_MOCK_API=true to enable.
 */

import http from 'http';

interface MockOrder {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  trackingUrl: string | null;
  items: { title: string; quantity: number }[];
}

interface MockSubscription {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  nextBillingDate: string;
  email: string;
}

// Mock data store - keyed by customer email
const mockOrdersByEmail: Record<string, MockOrder[]> = {
  'baki@lookfor.ai': [
    {
      id: 'gid://shopify/Order/2001',
      name: '#NP2001001',
      createdAt: '2026-02-01T10:00:00Z',
      status: 'FULFILLED',
      trackingUrl: 'https://track.ups.com/BAKI123',
      items: [{ title: 'NATPAT Sleep Patches (30 pack)', quantity: 2 }]
    },
    {
      id: 'gid://shopify/Order/2002',
      name: '#NP2001002',
      createdAt: '2026-02-05T14:30:00Z',
      status: 'IN_TRANSIT',
      trackingUrl: 'https://track.usps.com/BAKI456',
      items: [{ title: 'NATPAT Calm Patches', quantity: 1 }, { title: 'NATPAT Focus Patches', quantity: 1 }]
    }
  ],
  'ebrar@lookfor.ai': [
    {
      id: 'gid://shopify/Order/3001',
      name: '#NP3001001',
      createdAt: '2026-01-28T09:15:00Z',
      status: 'DELIVERED',
      trackingUrl: 'https://track.fedex.com/EBRAR789',
      items: [{ title: 'NATPAT Energy Patches', quantity: 3 }]
    },
    {
      id: 'gid://shopify/Order/3002',
      name: '#NP3001002',
      createdAt: '2026-02-06T11:00:00Z',
      status: 'PROCESSING',
      trackingUrl: null,
      items: [{ title: 'NATPAT Sleep Patches (60 pack)', quantity: 1 }]
    }
  ]
};

// Flat list for order lookups
const mockOrders: MockOrder[] = Object.values(mockOrdersByEmail).flat();

const mockSubscriptionsByEmail: Record<string, MockSubscription> = {
  'baki@lookfor.ai': {
    id: 'sub_baki_001',
    status: 'ACTIVE',
    nextBillingDate: '2026-02-15',
    email: 'baki@lookfor.ai'
  },
  'ebrar@lookfor.ai': {
    id: 'sub_ebrar_001',
    status: 'PAUSED',
    nextBillingDate: '2026-03-01',
    email: 'ebrar@lookfor.ai'
  }
};

const mockSubscriptions: MockSubscription[] = Object.values(mockSubscriptionsByEmail);

// Route handlers
const handlers: Record<string, (params: Record<string, unknown>) => { success: boolean; data?: unknown; error?: string }> = {
  '/hackhaton/get_customer_orders': (params) => {
    const email = params.email as string;
    const limit = (params.limit as number) || 10;
    const customerOrders = mockOrdersByEmail[email] || mockOrders;
    return {
      success: true,
      data: {
        orders: customerOrders.slice(0, limit),
        hasNextPage: false,
        endCursor: null
      }
    };
  },

  '/hackhaton/get_order_details': (params) => {
    const orderId = params.orderId as string;
    const order = mockOrders.find(o => o.name.includes(orderId.replace('#', '')));
    if (order) {
      return { success: true, data: order };
    }
    return { success: false, error: 'Order not found' };
  },

  '/hackhaton/cancel_order': (params) => {
    return { success: true, data: { cancelled: true, orderId: params.orderId } };
  },

  '/hackhaton/refund_order': (params) => {
    return { success: true, data: { refunded: true, orderId: params.orderId } };
  },

  '/hackhaton/create_return': (params) => {
    return { success: true, data: { returnId: `return_${Date.now()}`, orderId: params.orderId } };
  },

  '/hackhaton/update_order_shipping_address': (params) => {
    return { success: true, data: { updated: true, orderId: params.orderId } };
  },

  '/hackhaton/create_discount_code': (params) => {
    const code = `DISCOUNT_LF_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return { success: true, data: { code } };
  },

  '/hackhaton/create_store_credit': (params) => {
    return {
      success: true,
      data: {
        storeCreditAccountId: `gid://shopify/StoreCreditAccount/${Date.now()}`,
        credited: params.creditAmount,
        newBalance: params.creditAmount
      }
    };
  },

  '/hackhaton/add_tags': (params) => {
    return { success: true, data: { added: params.tags } };
  },

  '/hackhaton/get_product_details': (params) => {
    return {
      success: true,
      data: [{
        id: 'gid://shopify/Product/1',
        title: 'NATPAT Sleep Patches',
        handle: 'natpat-sleep-patches',
        description: 'Natural sleep patches for kids'
      }]
    };
  },

  '/hackhaton/get_product_recommendations': (params) => {
    return {
      success: true,
      data: [
        { id: 'gid://shopify/Product/1', title: 'NATPAT Sleep Patches', handle: 'sleep-patches' },
        { id: 'gid://shopify/Product/2', title: 'NATPAT Calm Patches', handle: 'calm-patches' }
      ]
    };
  },

  '/hackhaton/get_collection_recommendations': (params) => {
    return {
      success: true,
      data: [
        { id: 'gid://shopify/Collection/1', title: 'Sleep Collection', handle: 'sleep' },
        { id: 'gid://shopify/Collection/2', title: 'Wellness Collection', handle: 'wellness' }
      ]
    };
  },

  '/hackhaton/get_related_knowledge_source': (params) => {
    return {
      success: true,
      data: {
        faqs: [
          { question: 'How do I use the patches?', answer: 'Apply to clean, dry skin 30 minutes before bedtime.' }
        ],
        pdfs: [],
        blogArticles: [],
        pages: []
      }
    };
  },

  // Skio endpoints
  '/hackhaton/get-subscription-status': (params) => {
    const email = params.email as string;
    const sub = mockSubscriptionsByEmail[email] || mockSubscriptions[0];
    return {
      success: true,
      data: {
        status: sub.status,
        subscriptionId: sub.id,
        nextBillingDate: sub.nextBillingDate,
        email: sub.email
      }
    };
  },

  '/hackhaton/cancel-subscription': (params) => {
    return { success: true, data: { cancelled: true, subscriptionId: params.subscriptionId } };
  },

  '/hackhaton/pause-subscription': (params) => {
    return { success: true, data: { paused: true, pausedUntil: params.pausedUntil } };
  },

  '/hackhaton/skip-next-order-subscription': (params) => {
    return { success: true, data: { skipped: true, subscriptionId: params.subscriptionId } };
  },

  '/hackhaton/unpause-subscription': (params) => {
    return { success: true, data: { unpaused: true, subscriptionId: params.subscriptionId } };
  }
};

export function createMockServer(port: number = 3001): http.Server {
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Extract path (remove /v1/api prefix if present)
    let path = req.url || '/';
    if (path.startsWith('/v1/api')) {
      path = path.replace('/v1/api', '');
    }

    console.log(`[MockAPI] ${req.method} ${path}`);

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
      return;
    }

    const handler = handlers[path];
    if (!handler) {
      console.log(`[MockAPI] Route not found: ${path}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Route not found: ${path}` }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const params = body ? JSON.parse(body) : {};
        const result = handler(params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error(`[MockAPI] Error:`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
      }
    });
  });

  server.listen(port, () => {
    console.log(`[MockAPI] Mock Lookfor API running on http://localhost:${port}`);
    console.log(`[MockAPI] Set API_URL=http://localhost:${port}/v1/api to use`);
  });

  return server;
}

// To run standalone: npx tsx scripts/start-mock-api.ts
