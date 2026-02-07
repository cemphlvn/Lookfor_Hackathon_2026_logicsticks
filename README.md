# NatPat Support Agent — Lookfor Hackathon 2026

> Multi-Agent System for e-commerce email support automation

**Team**: logicsticks
**Submission**: Step 1 (MAS Instance)

---

## Hackathon Requirements

| # | Requirement | Status | Implementation |
|---|-------------|--------|----------------|
| 1 | **Session Start** | ✅ | `MASRuntime.startSession()` — captures email, name, Shopify ID |
| 2 | **Continuous Memory** | ✅ | `MemoryStore` — tracks messages, entities, context across turns |
| 3 | **Observable Actions** | ✅ | `Tracer` — logs every tool call with inputs/outputs/timing |
| 4 | **Escalation** | ✅ | Detects "human/manager/supervisor" → stops auto-reply, builds summary |

---

## Quick Start

### Docker (Recommended)

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

docker compose up
```

### Local Development

```bash
npm install
npm run build

export ANTHROPIC_API_KEY=sk-ant-...

# Run with mock API (no backend needed)
USE_MOCK_API=true npm run demo

# Or run tests
npm test
```

---

## Architecture

```
Customer Email
     ↓
┌─────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                            │
│  1. Classify intent (ORDER_STATUS, REFUND, ESCALATION...)   │
│  2. Check escalation keywords → stop if human requested     │
│  3. Route to specialized agent                              │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│                    AGENT EXECUTOR                            │
│  • System prompt (brand voice, boundaries)                   │
│  • Available tools (Shopify/Skio APIs)                       │
│  • LLM brain (Claude) decides what to do                     │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│                    TOOL CLIENT                               │
│  14 Shopify tools + 5 Skio tools                             │
│  • get_customer_orders, get_order_details                    │
│  • refund_order, cancel_order                                │
│  • get_subscription_status, pause_subscription               │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│                     MEMORY STORE                             │
│  • Messages (customer + agent)                               │
│  • Extracted entities (order #, email, dates)                │
│  • Cached tool results                                       │
│  • Intent history                                            │
└─────────────────────────────────────────────────────────────┘
     ↓
Response to Customer (or escalation summary for human agent)
```

---

## Intent Classification

12 intents with priority-based keyword matching:

| Intent | Priority | Example Trigger |
|--------|----------|-----------------|
| ESCALATION_REQUEST | 15 | "speak to human", "talk to manager" |
| SUBSCRIPTION_CANCEL | 10 | "cancel subscription", "unsubscribe" |
| SUBSCRIPTION_PAUSE | 10 | "pause subscription", "skip next order" |
| REFUND_REQUEST | 8 | "refund", "money back" |
| RETURN_REQUEST | 7 | "return", "exchange", "wrong item" |
| CANCEL_ORDER | 6 | "cancel order" |
| SUBSCRIPTION_INQUIRY | 5 | "subscription status", "billing date" |
| SHIPPING_ADDRESS | 4 | "change address", "wrong address" |
| ORDER_STATUS | 3 | "where is my order", "tracking" |
| PRODUCT_INQUIRY | 2 | "how to use", "ingredients" |
| DISCOUNT_REQUEST | 2 | "coupon", "promo code" |
| GENERAL_INQUIRY | 1 | "help", "question" |

---

## Testing

### Unit Tests (19 tests)
```bash
npm test
```

### Judge Suite (19 scenarios)
```bash
USE_MOCK_API=true npm run judge
```

### Continuous Audit
```bash
npm run audit        # Runs forever, 60s intervals
npm run audit:once   # Single run
```

---

## Project Structure

```
src/
├── mas/                    # Runtime (Step 1)
│   ├── runtime.ts          # Main MAS runtime
│   ├── orchestrator/       # Intent routing + escalation
│   ├── agents/             # LLM executor
│   ├── tools/              # API client
│   ├── memory/             # Session memory
│   └── tracing/            # Observable actions
├── meta/                   # Generator (Step 2)
│   ├── intent-extractor/   # Learn patterns from tickets
│   ├── agent-generator/    # Create agent configs
│   ├── workflow-parser/    # Parse brand workflows
│   └── mas-builder/        # Assemble MAS
└── api/
    ├── server.ts           # HTTP API
    └── mock-lookfor.ts     # Mock for demos
```

---

## API Endpoints

```
POST /session/start
  { customerEmail, firstName, lastName, shopifyCustomerId }
  → { sessionId }

POST /session/:id/message
  { message }
  → { message, escalated, toolsCalled }

GET /session/:id
  → { session with full history }

GET /session/:id/trace
  → { observable action log }
```

---

## Demo Customers

Test with mock API using:
- `baki@lookfor.ai`
- `ebrar@lookfor.ai`

```bash
USE_MOCK_API=true npm run demo
```

---

## Self-Referential Design

This repo is **Step 1** — a generated MAS instance.

It was created by **Step 2** (meta-MAS generator) at:
https://github.com/cemphlvn/lookfor-hackathon-2026

The meta-system:
1. Parses brand workflows
2. Extracts intent patterns from historical tickets
3. Generates agent configurations
4. Assembles complete MAS

This design ensures correctness: the abstraction (Step 2) validates the instance (Step 1).

---

## License

MIT
