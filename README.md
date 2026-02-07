# Lookfor Hackathon 2026 — logicsticks

> Multi-Agent System for e-commerce email support automation

---

## How to Run

### Docker (Recommended)

```bash
# Clone and configure
git clone https://github.com/cemphlvn/Lookfor_Hackathon_2026_logicsticks.git
cd Lookfor_Hackathon_2026_logicsticks
cp .env.example .env

# Add your API keys to .env:
# ANTHROPIC_API_KEY=sk-ant-...
# API_URL=<provided on-site>

# Run
docker compose up
```

Dashboard: http://localhost:3001

### Local Development

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
export API_URL=<provided on-site>
npm run start:demo
```

---

## High-Level Architecture

```
                              ┌─────────────────────────────────────┐
                              │         API SERVER (:3001)          │
                              │   POST /session/start               │
                              │   POST /session/:id/message         │
                              │   POST /mas/update (Side Quest)     │
                              └─────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MAS RUNTIME                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │  MEMORY STORE    │    │   ORCHESTRATOR   │    │     TRACER       │       │
│  │                  │    │                  │    │                  │       │
│  │ • Session state  │◄───│ • Intent classify│───►│ • Tool calls     │       │
│  │ • Messages       │    │ • Dynamic rules  │    │ • Routing events │       │
│  │ • Entities       │    │ • Agent routing  │    │ • Escalations    │       │
│  │ • Context        │    │ • Escalation     │    │ • Timeline       │       │
│  └──────────────────┘    └────────┬─────────┘    └──────────────────┘       │
│                                   │                                          │
│                                   ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                         AGENT EXECUTOR                            │       │
│  │                                                                   │       │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │       │
│  │   │ Order Agent │  │ Refund Agent│  │ Sub Agent   │  ...         │       │
│  │   │             │  │             │  │             │              │       │
│  │   │ LLM Brain   │  │ LLM Brain   │  │ LLM Brain   │              │       │
│  │   │ + Tools     │  │ + Tools     │  │ + Tools     │              │       │
│  │   └─────────────┘  └─────────────┘  └─────────────┘              │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                   │                                          │
│                                   ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                         TOOL CLIENT                               │       │
│  │   Shopify: get_orders, refund, cancel, update_address, etc.      │       │
│  │   Skio: get_subscription, cancel, pause, skip, unpause           │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Agents

| Agent | Responsibility | Tools |
|-------|----------------|-------|
| `order-tracking-agent` | Order status, tracking | `get_customer_orders`, `get_order_details` |
| `refund-processing-agent` | Refunds, returns | `get_order_details`, `refund_order`, `create_return` |
| `subscription-management-agent` | Sub status, changes | `get_subscription_status`, `pause`, `skip` |
| `subscription-cancellation-agent` | Cancellations | `get_subscription_status`, `cancel_subscription` |
| `address-update-agent` | Shipping updates | `get_order_details`, `update_shipping_address` |
| `product-info-agent` | Product questions | `get_product_details`, `get_recommendations` |
| `general-support-agent` | Fallback | All tools |

### Routing

1. **Intent Classification**: Keywords → intent (ORDER_STATUS, REFUND_REQUEST, etc.)
2. **Dynamic Rules**: Side quest rules checked first (can override routing)
3. **Agent Selection**: Intent → routing rules → target agent
4. **Session Continuity**: Stay with current agent if related intent

### Tool Calls

- All tools follow Lookfor API spec (HTTP 200, `{ success, data/error }`)
- Tool client validates params against schema
- Results traced with inputs/outputs
- Failures handled gracefully with retry or escalation

---

## Escalation Implementation

### Triggers

1. **Direct Request**: Customer says "human", "manager", "supervisor", "real person"
2. **Phrase Detection**: "speak to", "talk to", "transfer to"
3. **Dynamic Rules**: Side quest rules can trigger escalation
4. **Uncertainty**: 3+ different intents in single session

### Process

```typescript
// 1. Detect escalation trigger
if (shouldEscalate) {
  // 2. Build internal summary
  const summary = {
    sessionId, customer, messageCount,
    toolCallCount, intents, mentionedOrders,
    currentAgent, tag // from dynamic rule
  };

  // 3. Mark session as escalated
  memoryStore.escalate(sessionId, reason, summary);

  // 4. Stop auto-reply
  session.context.escalated = true;

  // 5. Return customer message
  return "I understand this needs special attention. I'm connecting you with our team...";
}
```

### Post-Escalation

- **No further auto-replies**: `isEscalated()` check blocks processing
- **Summary available**: `GET /session/:id/summary` returns structured handoff data
- **Trace preserved**: Full history available for human agent

---

## Side Quest: Dynamic MAS Update

Update MAS behavior at runtime via natural language prompts.

### API

```bash
# Add rule
curl -X POST http://localhost:3001/mas/update \
  -H "Content-Type: application/json" \
  -d '{"prompt": "If a customer wants to update their order address, do not update it directly. Mark the order as NEEDS_ATTENTION and escalate the situation."}'

# List rules
curl http://localhost:3001/mas/rules

# Delete rule
curl -X DELETE http://localhost:3001/mas/rules/{ruleId}
```

### Example Prompts

```
"If a customer wants to update their order address, do not update it directly. Mark the order as NEEDS_ATTENTION and escalate the situation."

"When a customer mentions legal action, immediately escalate."

"Block all refund requests over $500."
```

### How It Works

1. Prompt parsed into trigger keywords + action
2. Rule stored in dynamic rule store
3. Every message checked against rules BEFORE normal routing
4. Matching rule triggers escalation/block/redirect

---

## Requirements Checklist

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | **Session Start** | `POST /session/start` accepts email, name, Shopify ID |
| 2 | **Continuous Memory** | `MemoryStore` tracks messages, entities, context |
| 3 | **Observable Actions** | `Tracer` logs all tool calls, routing, escalations |
| 4 | **Escalation** | Keyword detection + dynamic rules → stops auto-reply |

---

## Project Structure

```
src/
├── api/
│   ├── server.ts          # HTTP endpoints
│   ├── mas-update.ts      # Side quest: dynamic rules
│   └── mock-lookfor.ts    # Mock API for testing
├── mas/
│   ├── runtime.ts         # Main MAS runtime
│   ├── orchestrator/      # Intent routing + escalation
│   ├── agents/            # LLM executor
│   ├── memory/            # Session memory
│   ├── tools/             # API client
│   └── tracing/           # Observability
├── meta/
│   ├── intent-extractor/  # Intent classification
│   ├── agent-generator/   # Agent config types
│   └── mas-builder/       # Build MAS from config
└── brands/
    └── natpat.ts          # Brand-specific config
```

---

## Testing

```bash
# Unit tests
npm test

# Judge suite (all requirements)
npm run judge:ci

# Interactive playground
npm run playground
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `API_URL` | Yes | Lookfor tool API base URL |
| `PORT` | No | Server port (default: 3001) |
| `USE_MOCK_API` | No | Use mock API for testing |
