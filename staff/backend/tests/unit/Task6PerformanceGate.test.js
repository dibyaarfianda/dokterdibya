const path = require('path');

const scriptPath = path.resolve(__dirname, '../../scripts/perf-budget-check.js');

test('performance gate is importable without running CI and rejects request, failure, and activation breaches', () => {
    const { pageBudgetViolations } = require(scriptPath);
    const fixture = { warm: { requestCount: 40, failedRequests: 0 }, cachedActivationP95: 1000,
        firstPartyJsKB: 100, largestImageKB: 50 };
    expect(pageBudgetViolations(fixture)).toEqual([]);
    expect(pageBudgetViolations({ ...fixture, warm: { requestCount: 41, failedRequests: 1 }, cachedActivationP95: 1001 })
        .map(item => item.label)).toEqual(['Warm requests', 'Warm failed requests', 'Cached activation p95 (ms)']);
    expect(pageBudgetViolations({ ...fixture, warm: { requestCount: undefined, failedRequests: 0 } })
        .map(item => item.label)).toContain('Warm requests');
});
