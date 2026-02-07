# Demo Guide — Lookfor Hackathon Presentation

## Quick Start (2 terminals)

**Terminal 1 — Mock API:**
```bash
cd demo-brand
npm run mock-api
# Running on http://localhost:3002
```

**Terminal 2 — Dashboard:**
```bash
cd demo-brand
USE_MOCK_API=true npm run dev
# Open http://localhost:3001
```

---

## Test Customers

| Email | Orders | Subscription |
|-------|--------|--------------|
| `baki@lookfor.ai` | #NP2001001 (Fulfilled), #NP2001002 (In Transit) | ACTIVE, bills Feb 15 |
| `ebrar@lookfor.ai` | #NP3001001 (Delivered), #NP3001002 (Processing) | PAUSED, resumes Mar 1 |

---

## Demo Scenarios

### 1. Order Status (Requirement 2 + 3)

**Start session**: Click "+ New" → enter `baki@lookfor.ai`

**Customer says:**
> Where is my order #NP2001002?

**Expected:**
- Intent: ORDER_STATUS
- Tool calls: `shopify_get_order_details`
- Response: Shows "In Transit" status with tracking link
- Trace Timeline: Shows routing → tool call → response

---

### 2. Subscription Cancel (Requirement 2 + 3)

**Start session**: Click "+ New" → enter `baki@lookfor.ai`

**Customer says:**
> I want to cancel my subscription

**Expected:**
- Intent: SUBSCRIPTION_CANCEL
- Tool calls: `skio_get_subscription_status`, `skio_cancel_subscription`
- Response: Confirms cancellation
- Memory: Shows intent history

---

### 3. Escalation (Requirement 4)

**Start session**: Click "+ New" → enter `ebrar@lookfor.ai`

**Customer says:**
> I need to speak to a human

**Expected:**
- Status changes to ESCALATED (red badge)
- Auto-reply STOPS
- Trace shows: "ESCALATION: customer explicitly requested human agent"
- Summary generated for human handoff

**Variations to try:**
- "Let me talk to your manager"
- "Transfer me to a supervisor"
- "I want a real person"

---

### 4. Multi-turn Memory (Requirement 2)

**Start session**: Click "+ New" → enter `baki@lookfor.ai`

**Turn 1:**
> I need help with an order

**Turn 2:**
> The order number is #NP2001001

**Turn 3:**
> Can I get a refund for it?

**Expected:**
- System remembers the order number from turn 2
- Uses it in turn 3 for refund processing
- Entity extraction shows: mentionedOrderNumbers: ["#NP2001001"]

---

### 5. Subscription Pause (Requirement 2 + 3)

**Start session**: Click "+ New" → enter `ebrar@lookfor.ai`

**Customer says:**
> Can I pause my subscription for 2 weeks?

**Expected:**
- Intent: SUBSCRIPTION_PAUSE
- Tool calls: `skio_pause_subscription`
- Response: Confirms pause

---

### 6. Address Update (Requirement 3)

**Start session**: Click "+ New" → enter `baki@lookfor.ai`

**Customer says:**
> I need to change my shipping address to 123 Main St

**Expected:**
- Intent: SHIPPING_ADDRESS
- Tool calls: `shopify_update_order_shipping_address`
- Trace shows address in tool params

---

## Dashboard Features

### Left Panel — Sessions
- All active sessions
- Message count badge
- Status: active (green) / escalated (red)

### Middle Panel — Chat
- Real-time conversation
- Customer messages (right, green)
- Agent responses (left, dark)

### Right Panel — Trace Timeline
- **Messages**: Total customer + agent messages
- **Tool OK**: Successful tool calls
- **Errors**: Failed operations
- **Duration**: Total session time
- Timeline events:
  - MESSAGE: Customer/agent text
  - ROUTING: Intent → agent routing decision
  - TOOL_CALL: API calls with success/fail
  - ESCALATION: Human handoff trigger

---

## Troubleshooting

**"Unable to process request"**
→ Mock API not running. Start it: `npm run mock-api`

**404 errors in trace**
→ Check USE_MOCK_API=true is set

**Session not starting**
→ Refresh page, check console for errors

---

## Requirement Checklist

| # | Requirement | Demo Scenario |
|---|-------------|---------------|
| 1 | Session Start | Any scenario — click "+ New" |
| 2 | Continuous Memory | Scenario 4 (multi-turn) |
| 3 | Observable Actions | Any — check Trace Timeline |
| 4 | Escalation | Scenario 3 — "speak to human" |

---

## Free Session Mode

After demos, let judges try anything:

- Mixed intents ("I want to return order #NP2001001 and cancel my subscription")
- Edge cases ("asdfasdf" → general-support fallback)
- Rapid escalation ("HUMAN NOW!" → immediate escalation)
- Entity extraction ("My email is test@test.com, order is #12345")
