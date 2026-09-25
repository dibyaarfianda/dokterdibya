const { runPerformanceGate } = require('../../scripts/perf-budget-check');

function releaseSummary() {
    const end = Date.now();
    const start = end - 60000;
    const window = { windowSeconds: 300, windowStartedAtMs: start, windowEndedAtMs: end };
    return {
        requests: { ...window, total: 300, serverErrors: 0 },
        latency: { ...window, p95Ms: 50, p99Ms: 100, sampleCount: 120 },
        api: {
            patients: { ...window, count: 10, p95Ms: 10 },
            dashboardStats: { ...window, count: 10, p95Ms: 10 },
            notificationsCount: { ...window, count: 10, p95Ms: 10 }
        },
        socketAuth: { ...window, attempts: 100, accepted: 100, rejected: 0,
            anonymousQuarantined: 0,
            expiredAfterConnect: 0,
            rejectedByCode: { AUTH_MISSING: 0, AUTH_INVALID: 0, AUTH_EXPIRED: 0, FORBIDDEN: 0 } }
    };
}

async function score(data) {
    const result = await runPerformanceGate({
        baseUrl: 'https://dokterdibya.com',
        getOidcToken: async () => 'synthetic-oidc',
        fetchAggregate: async () => ({ status: 200, body: { success: true, data } }),
        startFixture: async () => ({
            url: 'http://[::1]:31337/staff/public/index-adminlte.html', token: 'synthetic-fixture',
            assertClean() {}, async close() {}
        }),
        inspectPageImpl: async () => ({
            cold: { requestCount: 30, failedRequests: 0 },
            warm: { requestCount: 20, failedRequests: 0 },
            cachedActivationP95: 500, firstPartyJsKB: 100, largestImageKB: 50
        }),
        log() {}
    });
    return result.violations;
}

test('release gate requires at least 100 recent global samples for p99', async () => {
    const data = releaseSummary();
    expect(await score(data)).toBe(0);
    data.latency.sampleCount = 99;
    expect(await score(data)).toBeGreaterThan(0);
});

test('release gate rejects stale observation windows even when percentiles look healthy', async () => {
    const data = releaseSummary();
    data.latency.windowEndedAtMs = Date.now() - 301000;
    expect(await score(data)).toBeGreaterThan(0);
    const fresh = releaseSummary();
    fresh.api.notificationsCount.windowEndedAtMs = Date.now() - 301000;
    expect(await score(fresh)).toBeGreaterThan(0);
});

test('release gate allows a freshly pruned five-minute bucket after transport delay', async () => {
    const data = releaseSummary();
    data.requests.windowStartedAtMs = Date.now() - 300500;
    expect(await score(data)).toBe(0);
    data.requests.windowStartedAtMs = Date.now() - 306000;
    expect(await score(data)).toBeGreaterThan(0);
});

test('Socket auth release gate uses rejected handshakes over all attempts, not expiry after connect', async () => {
    const data = releaseSummary();
    data.socketAuth.expiredAfterConnect = 10;
    expect(await score(data)).toBe(0);
    data.socketAuth.accepted = 97;
    data.socketAuth.rejected = 3;
    data.socketAuth.rejectedByCode.AUTH_INVALID = 3;
    expect(await score(data)).toBeGreaterThan(0);
});

test('Socket auth release gate fails closed when its denominator is absent', async () => {
    const data = releaseSummary();
    data.socketAuth.attempts = 0;
    data.socketAuth.accepted = 0;
    expect(await score(data)).toBeGreaterThan(0);
});

test('Socket auth release gate rejects anonymous quarantine even when rejection ratio is zero', async () => {
    const data = releaseSummary();
    expect(await score(data)).toBe(0);
    data.socketAuth.anonymousQuarantined = 1;
    expect(await score(data)).toBeGreaterThan(0);
});
