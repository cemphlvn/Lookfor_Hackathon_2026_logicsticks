/**
 * Debug API — Test endpoints directly
 */

const API_URL = process.env.API_URL || 'https://lookfor-backend.ngrok.app/v1/api';

interface TestCase {
  name: string;
  endpoint: string;
  params: Record<string, unknown>;
}

const tests: TestCase[] = [
  {
    name: 'Get customer orders',
    endpoint: '/hackhaton/get_customer_orders',
    params: { email: 'test@example.com', after: 'null', limit: 10 }
  },
  {
    name: 'Get order details',
    endpoint: '/hackhaton/get_order_details',
    params: { orderId: '#1001' }
  },
  {
    name: 'Get subscription status',
    endpoint: '/hackhaton/get-subscription-status',
    params: { email: 'test@example.com' }
  }
];

async function testEndpoint(test: TestCase): Promise<void> {
  const url = `${API_URL}${test.endpoint}`;
  console.log(`\n=== ${test.name} ===`);
  console.log(`URL: ${url}`);
  console.log(`Params: ${JSON.stringify(test.params)}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(test.params)
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`);

    const text = await response.text();
    console.log(`Response body: ${text.slice(0, 500)}`);

    try {
      const json = JSON.parse(text);
      console.log(`Parsed JSON:`, json);
    } catch {
      console.log('Could not parse as JSON');
    }
  } catch (error) {
    console.log(`Error: ${error}`);
  }
}

async function main(): Promise<void> {
  console.log('=== API Debug ===');
  console.log(`API_URL: ${API_URL}`);
  console.log('');

  // First, test if the API is reachable
  console.log('Testing API reachability...');
  try {
    const healthCheck = await fetch(`${API_URL}`, { method: 'GET' });
    console.log(`Health check: ${healthCheck.status}`);
  } catch (error) {
    console.log(`Health check failed: ${error}`);
  }

  for (const test of tests) {
    await testEndpoint(test);
  }
}

main().catch(console.error);
