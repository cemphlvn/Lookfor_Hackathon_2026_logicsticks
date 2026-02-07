/**
 * Intent Extractor — Extract patterns from historical tickets
 *
 * Input: Historical tickets (JSON array)
 * Output: Intent patterns for agent routing
 */

export interface Ticket {
  conversationId: string;
  customerId: string;
  createdAt: string;
  ConversationType: string;
  subject: string;
  conversation: string;
}

export interface IntentPattern {
  id: string;
  name: string;
  examples: string[];
  keywords: string[];
  confidence: number;
  suggestedWorkflow: string;
}

export interface IntentClassification {
  primary: string;
  secondary: string[];
  confidence: number;
  extractedEntities: Record<string, string>;
}

interface IntentConfig {
  keywords: string[];
  suggestedWorkflow: string;
  priority: number;
}

/**
 * Known intent categories for e-commerce support
 * Priority determines tiebreaker: higher priority wins when scores are equal
 */
const INTENT_CATEGORIES: Record<string, IntentConfig> = {
  // Escalation (highest priority - always detect human request)
  ESCALATION_REQUEST: {
    keywords: ['speak to human', 'talk to human', 'real person', 'speak to manager', 'talk to manager', 'human agent', 'live agent', 'customer service representative', 'speak to supervisor', 'talk to supervisor', 'transfer to supervisor', 'transfer me to', 'transfer to agent'],
    suggestedWorkflow: 'escalation',
    priority: 15
  },
  // Subscription intents (most specific - check first)
  SUBSCRIPTION_CANCEL: {
    keywords: ['cancel subscription', 'stop subscription', 'unsubscribe', 'cancel my subscription', 'end subscription', 'terminate subscription'],
    suggestedWorkflow: 'subscription-cancellation',
    priority: 10
  },
  SUBSCRIPTION_PAUSE: {
    keywords: ['pause subscription', 'pause my subscription', 'skip next', 'skip order', 'skip subscription', 'delay subscription', 'hold subscription', 'skip my next'],
    suggestedWorkflow: 'subscription-pause',
    priority: 10
  },
  SUBSCRIPTION_INQUIRY: {
    keywords: ['subscription status', 'billing date', 'next subscription', 'when is my subscription'],
    suggestedWorkflow: 'subscription-management',
    priority: 5
  },
  // Refund/Return (action-oriented)
  REFUND_REQUEST: {
    keywords: ['refund', 'money back', 'get refund', 'want refund', 'need refund', 'full refund'],
    suggestedWorkflow: 'refund-processing',
    priority: 8
  },
  RETURN_REQUEST: {
    keywords: ['return', 'send back', 'exchange', 'wrong item', 'defective', 'return order'],
    suggestedWorkflow: 'return-processing',
    priority: 7
  },
  // Cancel order (not subscription)
  CANCEL_ORDER: {
    keywords: ['cancel order', 'cancel my order', 'dont want order', 'cancel the order'],
    suggestedWorkflow: 'order-cancellation',
    priority: 6
  },
  // Order status
  ORDER_STATUS: {
    keywords: ['where is my order', 'order status', 'status of order', 'tracking', 'shipped', 'delivery status', 'when arrive', 'what is the status', 'order tracking', 'track my order'],
    suggestedWorkflow: 'order-tracking',
    priority: 3
  },
  // Address
  SHIPPING_ADDRESS: {
    keywords: ['change address', 'update address', 'wrong address', 'shipping address', 'new address'],
    suggestedWorkflow: 'address-update',
    priority: 4
  },
  // Product
  PRODUCT_INQUIRY: {
    keywords: ['product', 'how to use', 'ingredient', 'recommend', 'which patch'],
    suggestedWorkflow: 'product-information',
    priority: 2
  },
  // Other
  DISCOUNT_REQUEST: {
    keywords: ['discount', 'coupon', 'code', 'promo', 'deal'],
    suggestedWorkflow: 'discount-handling',
    priority: 2
  },
  GENERAL_INQUIRY: {
    keywords: ['question', 'help', 'information', 'tell me'],
    suggestedWorkflow: 'general-support',
    priority: 1
  }
};

/**
 * Extract intent patterns from tickets
 */
export function extractIntentPatterns(tickets: Ticket[]): IntentPattern[] {
  const patternCounts = new Map<string, { examples: string[]; count: number }>();

  for (const ticket of tickets) {
    const classification = classifyTicket(ticket);
    const key = classification.primary;

    if (!patternCounts.has(key)) {
      patternCounts.set(key, { examples: [], count: 0 });
    }

    const entry = patternCounts.get(key)!;
    entry.count++;

    if (entry.examples.length < 5) {
      entry.examples.push(extractFirstMessage(ticket.conversation));
    }
  }

  const patterns: IntentPattern[] = [];
  const totalTickets = tickets.length;

  for (const [intentId, data] of patternCounts) {
    const category = INTENT_CATEGORIES[intentId];
    patterns.push({
      id: intentId.toLowerCase().replace(/_/g, '-'),
      name: intentId.replace(/_/g, ' ').toLowerCase(),
      examples: data.examples,
      keywords: category?.keywords || [],
      confidence: data.count / totalTickets,
      suggestedWorkflow: category?.suggestedWorkflow || 'general-support'
    });
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Classify a single ticket
 */
export function classifyTicket(ticket: Ticket): IntentClassification {
  const text = `${ticket.subject} ${ticket.conversation}`.toLowerCase();
  return classifyText(text);
}

/**
 * Classify message for routing (runtime use)
 */
export function classifyMessage(message: string): IntentClassification {
  return classifyText(message.toLowerCase());
}

/**
 * Internal classification with priority-based scoring
 */
function classifyText(text: string): IntentClassification {
  const scores: Array<{ category: string; score: number; priority: number }> = [];

  for (const [category, config] of Object.entries(INTENT_CATEGORIES)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        // Longer keywords are more specific, give them more weight
        score += keyword.split(' ').length;
      }
    }
    scores.push({ category, score, priority: config.priority });
  }

  // Sort by score first, then by priority for tiebreaker
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.priority - a.priority;
  });

  const primary = scores[0].category;
  const secondary = scores
    .slice(1, 4)
    .filter(s => s.score > 0)
    .map(s => s.category);

  const config = INTENT_CATEGORIES[primary];
  const maxScore = config.keywords.reduce((sum, k) => sum + k.split(' ').length, 0);

  return {
    primary,
    secondary,
    confidence: maxScore > 0 ? scores[0].score / maxScore : 0,
    extractedEntities: extractEntities(text)
  };
}

/**
 * Extract entities from text
 */
function extractEntities(text: string): Record<string, string> {
  const entities: Record<string, string> = {};

  // Order number: #1234 or NP1234567
  const orderMatch = text.match(/#?\d{6,10}|np\d{6,10}/i);
  if (orderMatch) {
    entities.orderNumber = orderMatch[0];
  }

  // Email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    entities.email = emailMatch[0];
  }

  // Date
  const dateMatch = text.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/);
  if (dateMatch) {
    entities.date = dateMatch[0];
  }

  // Money amount
  const moneyMatch = text.match(/\$\d+\.?\d*/);
  if (moneyMatch) {
    entities.amount = moneyMatch[0];
  }

  return entities;
}

/**
 * Extract first customer message from conversation
 */
function extractFirstMessage(conversation: string): string {
  const match = conversation.match(/Customer's message:\s*"([^"]+)"/);
  return match ? match[1].slice(0, 100) : conversation.slice(0, 100);
}

/**
 * Build routing rules from patterns
 */
export function buildRoutingRules(patterns: IntentPattern[]): object[] {
  return patterns.map(p => ({
    intentId: p.id,
    conditions: {
      keywords: p.keywords,
      minConfidence: 0.3
    },
    targetWorkflow: p.suggestedWorkflow,
    examples: p.examples.slice(0, 3)
  }));
}
