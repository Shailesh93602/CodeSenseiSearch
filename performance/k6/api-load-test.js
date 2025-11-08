import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const searchRequests = new Counter('search_requests_total');
const searchFailures = new Rate('search_failures_rate');
const searchDuration = new Trend('search_duration');
const authRequests = new Counter('auth_requests_total');

// Test configuration
export const options = {
    stages: [
        { duration: '2m', target: 10 }, // Ramp up to 10 users
        { duration: '5m', target: 10 }, // Stay at 10 users
        { duration: '2m', target: 20 }, // Ramp up to 20 users
        { duration: '5m', target: 20 }, // Stay at 20 users
        { duration: '2m', target: 50 }, // Ramp up to 50 users
        { duration: '5m', target: 50 }, // Stay at 50 users
        { duration: '5m', target: 0 },  // Ramp down to 0 users
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
        http_req_failed: ['rate<0.05'],   // Error rate must be below 5%
        search_duration: ['p(95)<300'],   // Search requests must complete below 300ms
        search_failures_rate: ['rate<0.02'], // Search failure rate below 2%
    },
};

// Base URL for the API
const BASE_URL = __ENV.API_URL || 'http://localhost:3001';

// Sample search queries
const SEARCH_QUERIES = [
    'react hooks',
    'typescript generics',
    'node.js async await',
    'javascript promises',
    'css grid layout',
    'docker containers',
    'postgres performance',
    'redis caching',
    'authentication jwt',
    'api design patterns',
    'microservices architecture',
    'database optimization',
    'frontend performance',
    'backend scalability',
    'security best practices'
];

// Authentication token (can be set via environment variable)
let authToken = __ENV.AUTH_TOKEN || null;

export function setup() {
    // Optional: Perform authentication if needed
    if (!authToken) {
        console.log('No auth token provided, running without authentication');
    }

    // Health check
    const healthResponse = http.get(`${BASE_URL}/health`);
    check(healthResponse, {
        'health check status is 200': (r) => r.status === 200,
    });

    return { authToken };
}

export default function (data) {
    const headers = {
        'Content-Type': 'application/json',
    };

    if (data.authToken) {
        headers['Authorization'] = `Bearer ${data.authToken}`;
    }

    // Test 1: Basic search functionality
    testSearch(headers);

    // Test 2: API health endpoints
    testHealthEndpoints();

    // Test 3: Content ingestion (if available)
    testContentEndpoints(headers);

    // Test 4: User-related endpoints (if authenticated)
    if (data.authToken) {
        testUserEndpoints(headers);
    }

    sleep(1);
}

function testSearch(headers) {
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
    const searchPayload = {
        query: query,
        limit: 20,
        offset: 0,
        filters: {
            language: Math.random() > 0.7 ? 'javascript' : undefined,
            source: Math.random() > 0.8 ? 'github' : undefined,
        }
    };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/api/search`, JSON.stringify(searchPayload), {
        headers: headers,
        timeout: '30s',
    });
    const duration = Date.now() - startTime;

    searchRequests.add(1);
    searchDuration.add(duration);

    const success = check(response, {
        'search status is 200': (r) => r.status === 200,
        'search response has results': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.results && Array.isArray(body.results);
            } catch (e) {
                return false;
            }
        },
        'search response time < 500ms': () => duration < 500,
    });

    if (!success) {
        searchFailures.add(1);
    }
}

function testHealthEndpoints() {
    const endpoints = [
        '/health',
        '/api/health',
        '/metrics'
    ];

    endpoints.forEach(endpoint => {
        const response = http.get(`${BASE_URL}${endpoint}`);
        check(response, {
            [`${endpoint} is accessible`]: (r) => r.status === 200 || r.status === 404,
        });
    });
}

function testContentEndpoints(headers) {
    // Test content retrieval
    const contentResponse = http.get(`${BASE_URL}/api/content?limit=10`, { headers });
    check(contentResponse, {
        'content endpoint accessible': (r) => r.status === 200 || r.status === 401,
    });

    // Test content stats
    const statsResponse = http.get(`${BASE_URL}/api/stats`, { headers });
    check(statsResponse, {
        'stats endpoint accessible': (r) => r.status === 200,
    });
}

function testUserEndpoints(headers) {
    authRequests.add(1);

    // Test user profile
    const profileResponse = http.get(`${BASE_URL}/api/user/profile`, { headers });
    check(profileResponse, {
        'user profile accessible': (r) => r.status === 200,
    });

    // Test user favorites
    const favoritesResponse = http.get(`${BASE_URL}/api/user/favorites`, { headers });
    check(favoritesResponse, {
        'user favorites accessible': (r) => r.status === 200,
    });
}

export function teardown(data) {
    console.log('Load test completed');
}