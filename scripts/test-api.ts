/**
 * Test API — Verify Lookfor backend tools work
 */

import { toolClient, ToolCallResult } from '../src/mas/tools/client';

async function testTools() {
  console.log('Testing Lookfor API tools...\n');
  console.log(`API URL: ${process.env.API_URL || 'https://lookfor-backend.ngrok.app/v1/api'}\n`);

  const tests: { name: string; tool: string; params: Record<string, unknown> }[] = [
    {
      name: 'Get customer orders',
      tool: 'shopify_get_customer_orders',
      params: {
        email: 'demo@example.com',
        after: 'null',
        limit: 10
      }
    },
    {
      name: 'Get order details',
      tool: 'shopify_get_order_details',
      params: {
        orderId: '#NP1234567'
      }
    },
    {
      name: 'Get subscription status',
      tool: 'skio_get_subscription_status',
      params: {
        email: 'demo@example.com'
      }
    },
    {
      name: 'Get product recommendations',
      tool: 'shopify_get_product_recommendations',
      params: {
        queryKeys: ['mosquito', 'repellent', 'kids']
      }
    }
  ];

  for (const test of tests) {
    console.log(`Testing: ${test.name}`);
    console.log(`  Tool: ${test.tool}`);
    console.log(`  Params: ${JSON.stringify(test.params)}`);

    try {
      const result = await toolClient.execute(test.tool, test.params);
      console.log(`  Result: ${result.success ? '✓ SUCCESS' : '✗ FAILED'}`);
      if (result.data) {
        console.log(`  Data: ${JSON.stringify(result.data).slice(0, 200)}...`);
      }
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    } catch (error) {
      console.log(`  Error: ${error}`);
    }
    console.log('');
  }
}

testTools().catch(console.error);
