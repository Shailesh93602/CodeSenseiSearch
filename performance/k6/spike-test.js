import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const spikeRequests = new Counter('spike_requests_total');
const spikeFailures = new Rate('spike_failures_rate');
const spikeDuration = new Trend('spike_duration');

export const options = {
    stages: [
        { duration: '10s', target: 100 }, // Sudden spike to 100 users
        { duration: '1m', target: 100 },  // Maintain spike
        { duration: '10s', target: 0 },   // Quick ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<1000'], // 95% of requests must complete below 1s
        http_req_failed: ['rate<0.1'],     // Error rate must be below 10% during spike
        spike_failures_rate: ['rate<0.15'], // Allow slightly higher failure rate during spike
    },
};

const API_URL = __ENV.API_URL || 'http://localhost:3001';
const WEB_URL = __ENV.WEB_URL || 'http://localhost:3000';

export default function () {
    spikeRequests.add(1);

    const startTime = Date.now();

    // Mix of different request types during spike
    const requestType = Math.random();

    let response;
    if (requestType < 0.4) {
        // 40% search requests
        response = testSearchUnderLoad();
    } else if (requestType < 0.7) {
        // 30% homepage requests
        response = testHomepageUnderLoad();
    } else if (requestType < 0.9) {
        // 20% health checks
        response = testHealthUnderLoad();
    } else {
        // 10% API stats
        response = testStatsUnderLoad();
    }

    const duration = Date.now() - startTime;
    spikeDuration.add(duration);

    if (!response || response.status >= 400) {
        spikeFailures.add(1);
    }

    sleep(0.1); // Short sleep to allow for higher concurrency
}

function testSearchUnderLoad() {
    const queries = ['react', 'node', 'javascript', 'typescript', 'docker'];
    const query = queries[Math.floor(Math.random() * queries.length)];

    const response = http.post(`${API_URL}/api/search`, JSON.stringify({
        query: query,
        limit: 10
    }), {
        headers: { 'Content-Type': 'application/json' },
        timeout: '5s',
    });

    check(response, {
        'search handles spike load': (r) => r.status === 200 || r.status === 429, // Allow rate limiting
    });

    return response;
}

function testHomepageUnderLoad() {
    const response = http.get(WEB_URL, { timeout: '5s' });

    check(response, {
        'homepage handles spike load': (r) => r.status === 200,
    });

    return response;
}

function testHealthUnderLoad() {
    const response = http.get(`${API_URL}/health`, { timeout: '3s' });

    check(response, {
        'health endpoint handles spike load': (r) => r.status === 200,
    });

    return response;
}

function testStatsUnderLoad() {
    const response = http.get(`${API_URL}/api/stats`, { timeout: '5s' });

    check(response, {
        'stats endpoint handles spike load': (r) => r.status === 200 || r.status === 503,
    });

    return response;
}

export function teardown(data) {
    console.log('Spike test completed');
}