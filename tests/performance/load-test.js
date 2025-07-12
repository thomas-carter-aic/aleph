import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200
    { duration: '5m', target: 200 }, // Stay at 200
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],    // Error rate under 10%
  },
};

const BASE_URL = 'http://localhost:3000';

export default function() {
  // Test API Gateway health
  let response = http.get(`${BASE_URL}/health`);
  check(response, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 100ms': (r) => r.timings.duration < 100,
  });

  // Test AI model listing
  response = http.get(`${BASE_URL}/api/v1/models`);
  check(response, {
    'models endpoint status is 200': (r) => r.status === 200,
    'models response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Test AI inference
  response = http.post(`${BASE_URL}/api/v1/inference/llama2-7b`, 
    JSON.stringify({
      input: { prompt: 'Performance test' },
      parameters: { temperature: 0.1, max_tokens: 10 }
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(response, {
    'inference status is 200': (r) => r.status === 200,
    'inference response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}
