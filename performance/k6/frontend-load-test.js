import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const pageLoads = new Counter('page_loads_total');
const pageFailures = new Rate('page_failures_rate');
const pageLoadTime = new Trend('page_load_time');
const searchInteractions = new Counter('search_interactions_total');

export const options = {
    stages: [
        { duration: '1m', target: 5 },   // Ramp up to 5 users
        { duration: '3m', target: 5 },   // Stay at 5 users
        { duration: '1m', target: 15 },  // Ramp up to 15 users
        { duration: '3m', target: 15 },  // Stay at 15 users
        { duration: '1m', target: 30 },  // Ramp up to 30 users
        { duration: '3m', target: 30 },  // Stay at 30 users
        { duration: '2m', target: 0 },   // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
        http_req_failed: ['rate<0.02'],    // Error rate must be below 2%
        page_load_time: ['p(95)<1500'],    // Page loads must complete below 1.5s
        page_failures_rate: ['rate<0.01'], // Page failure rate below 1%
    },
};

const BASE_URL = __ENV.WEB_URL || 'http://localhost:3000';

// Common search queries users might perform
const SEARCH_QUERIES = [
    'react best practices',
    'typescript interfaces',
    'node.js performance',
    'javascript async',
    'css flexbox',
    'docker deployment',
    'postgres queries',
    'redis cache',
    'jwt authentication',
    'rest api design'
];

export function setup() {
    // Check if the frontend is accessible
    const response = http.get(BASE_URL);
    check(response, {
        'frontend is accessible': (r) => r.status === 200,
    });

    return {};
}

export default function () {
    // Test 1: Homepage load
    testHomepage();

    // Test 2: Search functionality
    testSearchFlow();

    // Test 3: Static assets
    testStaticAssets();

    // Test 4: Navigation
    testNavigation();

    sleep(1);
}

function testHomepage() {
    const startTime = Date.now();
    const response = http.get(BASE_URL);
    const duration = Date.now() - startTime;

    pageLoads.add(1);
    pageLoadTime.add(duration);

    const success = check(response, {
        'homepage status is 200': (r) => r.status === 200,
        'homepage contains search form': (r) => r.body.includes('search') || r.body.includes('Search'),
        'homepage loads quickly': () => duration < 1500,
        'homepage has proper content-type': (r) => r.headers['content-type'] && r.headers['content-type'].includes('text/html'),
    });

    if (!success) {
        pageFailures.add(1);
    }
}

function testSearchFlow() {
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];

    // Simulate user typing in search box and submitting
    const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
    const startTime = Date.now();
    const response = http.get(searchUrl);
    const duration = Date.now() - startTime;

    searchInteractions.add(1);
    pageLoadTime.add(duration);

    check(response, {
        'search page status is 200': (r) => r.status === 200,
        'search page loads quickly': () => duration < 2000,
        'search page has results or empty state': (r) =>
            r.body.includes('result') || r.body.includes('No results') || r.body.includes('Search'),
    });
}

function testStaticAssets() {
    // Test common static assets
    const assets = [
        '/_next/static/css/',
        '/_next/static/js/',
        '/favicon.ico'
    ];

    assets.forEach(asset => {
        const response = http.get(`${BASE_URL}${asset}`, {
            timeout: '10s'
        });
        check(response, {
            [`${asset} loads successfully`]: (r) => r.status === 200 || r.status === 404,
        });
    });
}

function testNavigation() {
    // Test common navigation routes
    const routes = [
        '/about',
        '/docs',
        '/login'
    ];

    routes.forEach(route => {
        const response = http.get(`${BASE_URL}${route}`);
        check(response, {
            [`${route} is accessible`]: (r) => r.status === 200 || r.status === 404,
            [`${route} responds quickly`]: (r) => r.timings.duration < 1000,
        });
    });
}

export function teardown(data) {
    console.log('Frontend load test completed');
}