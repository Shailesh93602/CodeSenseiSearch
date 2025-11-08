import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
    stages: [
        { duration: '1m', target: 50 },   // Ramp up to 50 users
        { duration: '3m', target: 50 },   // Stay at 50 users  
        { duration: '1m', target: 100 },  // Ramp up to 100 users
        { duration: '3m', target: 100 },  // Stay at 100 users
        { duration: '1m', target: 200 },  // Stress test with 200 users
        { duration: '2m', target: 200 },  // Hold stress level
        { duration: '2m', target: 0 },    // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'], // 95% under 2s during stress
        http_req_failed: ['rate<0.2'],     // 20% error rate acceptable in stress
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_URL = __ENV.API_URL || 'http://localhost:3001';

const scenarios = [
    () => searchTest(),
    () => healthTest(),
    () => contentTest(),
];

export default function () {
    // Randomly choose a scenario
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    scenario();

    sleep(Math.random() * 2 + 0.5); // Random sleep 0.5-2.5 seconds
}

function searchTest() {
    const queries = ['react', 'vue', 'angular', 'javascript', 'typescript', 'nodejs', 'python', 'java'];
    const query = queries[Math.floor(Math.random() * queries.length)];

    const response = http.get(`${API_URL}/api/search?q=${query}&limit=5`);
    check(response, {
        'search successful': (r) => r.status === 200,
        'search under stress limit': (r) => r.timings.duration < 2000,
    });

    errorRate.add(response.status !== 200);
}

function healthTest() {
    const response = http.get(`${API_URL}/health`);
    check(response, {
        'health endpoint available': (r) => r.status === 200,
    });

    errorRate.add(response.status !== 200);
}

function contentTest() {
    const response = http.get(`${API_URL}/api/content/recent?limit=10`);
    check(response, {
        'content endpoint responds': (r) => r.status !== 404,
    });

    errorRate.add(response.status >= 500);
}