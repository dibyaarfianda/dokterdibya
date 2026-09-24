const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const http = require('http');

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

test('performance workflow installs pinned backend dependencies and browser before running gate', () => {
    const workflow = fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/staff-performance-budget.yml'), 'utf8');
    const lock = require('../../package-lock.json');
    expect(lock.packages['node_modules/puppeteer'].version).toMatch(/^24\./);
    const install = workflow.indexOf('run: npm ci');
    const browser = workflow.indexOf('run: ./node_modules/.bin/puppeteer browsers install chrome');
    const gate = workflow.indexOf('run: node scripts/perf-budget-check.js');
    expect(install).toBeGreaterThan(0);
    expect(browser).toBeGreaterThan(install);
    expect(gate).toBeGreaterThan(browser);
    expect(workflow).toMatch(/STAFF_PERF_TOKEN:\s*\$\{\{ secrets\.STAFF_PERF_TOKEN \}\}/);
    expect(workflow).not.toMatch(/--token\b|--password\b/);
});

test('performance command fails closed without CI credential before making a request', () => {
    const child = spawnSync(process.execPath, [scriptPath, '--base-url', 'https://example.test'], {
        env: { ...process.env, STAFF_PERF_TOKEN: '' }, encoding: 'utf8', timeout: 10000
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain('STAFF_PERF_TOKEN environment variable is required');
    expect(child.stdout).not.toContain('https://example.test');
});

test('performance script has no literal token key or persistent credential write', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    expect(source).not.toContain('vps_auth_token');
    expect(source).not.toMatch(/(?:localStorage|sessionStorage)\.setItem\s*\(/);
});

test('performance browser credential follows the page key without storage persistence', async () => {
    const token = 'synthetic-ci-token';
    const probes = [];
    const html = `<!doctype html><script>
        const beforeKey = localStorage.getItem('SYNTHETIC_CI_AUTH');
        window.TOKEN_KEY = 'SYNTHETIC_CI_AUTH';
        window.getAuthToken = () => localStorage.getItem(window.TOKEN_KEY)
            || sessionStorage.getItem(window.TOKEN_KEY);
        window.activateRegisteredStaffPage = async () => document.body;
        fetch('/probe', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + (window.getAuthToken() || '') },
            body: JSON.stringify({ beforeKeyEmpty: beforeKey === null,
                unrelatedEmpty: localStorage.getItem('SYNTHETIC_OTHER_KEY') === null,
                localCount: localStorage.length, sessionCount: sessionStorage.length })
        });
    </script>`;
    const server = http.createServer((req, res) => {
        if (req.url === '/probe') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                probes.push({ authorized: req.headers.authorization === `Bearer ${token}`, ...JSON.parse(body) });
                res.writeHead(probes.at(-1).authorized ? 200 : 401).end();
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, token);
        expect(probes).toHaveLength(2);
        expect(probes).toEqual([
            { authorized: true, beforeKeyEmpty: true, unrelatedEmpty: true, localCount: 0, sessionCount: 0 },
            { authorized: true, beforeKeyEmpty: true, unrelatedEmpty: true, localCount: 0, sessionCount: 0 }
        ]);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);
