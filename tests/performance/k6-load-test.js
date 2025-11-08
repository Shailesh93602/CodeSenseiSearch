import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const searchResponseTime = new Trend('search_response_time');

export const options = {
    stages: [
        { duration: '2m', target: 10 },   // Ramp up
        { duration: '5m', target: 10 },   // Stay at 10 users
        { duration: '2m', target: 20 },   // Ramp up
        { duration: '5m', target: 20 },   // Stay at 20 users
        { duration: '2m', target: 0 },    // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.1'],
        errors: ['rate<0.1'],
        search_response_time: ['p(95)<800'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_URL = __ENV.API_URL || 'http://localhost:3001';

// Test data
const searchQueries = [
    'javascript',
    'react hooks',
    'typescript interface',
    'node.js express',
    'postgresql queries',
    'docker containers',
    'api authentication',
    'vector search',
    'machine learning',
    'web development'
];

export default function () {
    const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];

    // Test search endpoint
    const searchStart = Date.now();
    const searchResponse = http.get(`${API_URL}/api/search?q=${encodeURIComponent(query)}&limit=10`);
    const searchDuration = Date.now() - searchStart;

    check(searchResponse, {
        'search status is 200': (r) => r.status === 200,
        'search has results': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.results && Array.isArray(body.results);
            } catch (e) {
                return false;
            }
        },
        'search response time < 800ms': (r) => r.timings.duration < 800,
    });

    searchResponseTime.add(searchDuration);
    errorRate.add(searchResponse.status !== 200);

    // Test health endpoint
    const healthResponse = http.get(`${API_URL}/health`);
    check(healthResponse, {
        'health status is 200': (r) => r.status === 200,
    });

    errorRate.add(healthResponse.status !== 200);

    sleep(1 + Math.random() * 2); // Random sleep 1-3 seconds
}