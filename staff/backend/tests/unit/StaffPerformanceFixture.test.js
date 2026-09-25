const http = require('http');

function get(url, options = {}) {
    return new Promise((resolve, reject) => {
        http.get(url, options, response => {
            let body = '';
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, body,
                headers: response.headers }));
        }).on('error', reject);
    });
}

test('loopback fixture serves the real Staff shell and synthetic read-only boot data', async () => {
    const { startStaffPerformanceFixture } = require('../../scripts/staff-performance-fixture');
    const fixture = await startStaffPerformanceFixture({ port: 0 });
    try {
        const page = await get(fixture.url);
        expect(page.status).toBe(200);
        expect(page.body).toContain('STAFF_CACHE_VERSION');
        expect(page.body).toContain('scripts/shell/bootstrap.js');
        const auth = await get(new URL('/api/auth/me', fixture.url));
        expect(auth.status).toBe(200);
        const user = JSON.parse(auth.body).data.user;
        expect(user).toMatchObject({ id: 'ci-fixture', user_type: 'staff', role: 'front_office' });
        expect(user.name).not.toMatch(/@/);
        expect(JSON.parse((await get(new URL('/api/patients?view=basic', fixture.url))).body).data)
            .toEqual([]);
        expect((await get(new URL('/staff/public/scripts/shell/bootstrap.js?v=v414', fixture.url))).status)
            .toBe(200);
        expect((await get(new URL('/staff/public/sw.js?v=v414', fixture.url))).status).toBe(200);
        fixture.assertClean();
    } finally {
        await fixture.close();
    }
});

test('loopback fixture denies unlisted clinical routes and records them as a gate failure', async () => {
    const { startStaffPerformanceFixture } = require('../../scripts/staff-performance-fixture');
    const fixture = await startStaffPerformanceFixture({ port: 0 });
    try {
        const response = await get(new URL('/api/medical-records/123', fixture.url));
        expect(response.status).toBe(503);
        expect(response.body).not.toContain('123');
        expect(() => fixture.assertClean()).toThrow('Unexpected fixture request');
    } finally {
        await fixture.close();
    }
});

test('real Staff shell boots and measures a cached menu switch entirely on fixture data', async () => {
    const { startStaffPerformanceFixture } = require('../../scripts/staff-performance-fixture');
    const { inspectPage } = require('../../scripts/perf-budget-check');
    const fixture = await startStaffPerformanceFixture();
    try {
        const result = await inspectPage(fixture.url, fixture.token, { cacheVersion: fixture.cacheVersion });
        fixture.assertClean();
        expect(result.warm.failures).toEqual([]);
        expect(result.warm.failedRequests).toBe(0);
        expect(result.warm.requestCount).toBeLessThanOrEqual(40);
        expect(result.cachedActivationP95).toBeLessThanOrEqual(1000);
        expect(result.menuSwitches).toBe(5);
    } finally {
        await fixture.close();
    }
}, 90000);
