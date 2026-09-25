const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/staff-panel-ci.yml'), 'utf8').replace(/\r\n/g, '\n');

function jobBody(name) {
    const match = new RegExp(`^  ${name}:\\n`, 'm').exec(workflow);
    if (!match) return '';
    const rest = workflow.slice(match.index + match[0].length);
    const next = /^  [\w-]+:\n/m.exec(rest);
    return rest.slice(0, next ? next.index : undefined);
}

function namedStepBody(job, name) {
    const match = new RegExp(`^      - name: ${name}\\n`, 'm').exec(job);
    if (!match) return '';
    const rest = job.slice(match.index + match[0].length);
    const next = /^      - (?:name:|uses:|run:)/m.exec(rest);
    return rest.slice(0, next ? next.index : undefined);
}

function triggerPaths(event) {
    const section = workflow.match(new RegExp(`^  ${event}:\\r?\\n([\\s\\S]*?)(?=^  (?:push|pull_request):|^permissions:|^jobs:)`, 'm'))?.[1] || '';
    const paths = section.match(/      - "([^"]+)"/g) || [];
    return paths.map(line => line.match(/"([^"]+)"/)[1]);
}

function matches(patterns, changedPath) {
    return patterns.some(pattern => pattern.endsWith('/**')
        ? changedPath.startsWith(pattern.slice(0, -3) + '/')
        : changedPath === pattern);
}

test.each(['push', 'pull_request'])('%s runs staff visual and service-worker gates for patient-only assets', event => {
    const patterns = triggerPaths(event);
    expect(patterns).not.toHaveLength(0);
    for (const changedPath of ['public/sw.js', 'public/patient-dashboard.html', 'public/styles/patient.css']) {
        expect(matches(patterns, changedPath)).toBe(true);
    }
    expect(matches(patterns, 'staff/public/sw.js')).toBe(true);
    expect(matches(patterns, 'docs/unrelated.md')).toBe(false);
});

test('Staff CI browser jobs stay on Ubuntu 24.04 and contracts launch system Chrome with its sandbox', () => {
    expect(jobBody('staff-asset-nginx')).toMatch(/^    runs-on: ubuntu-24\.04$/m);
    const contracts = jobBody('staff-contracts');
    expect(contracts).toMatch(/^    runs-on: ubuntu-24\.04$/m);
    expect(contracts).toMatch(/^      PUPPETEER_SKIP_DOWNLOAD: 'true'$/m);
    expect(contracts).toMatch(/^      PUPPETEER_EXECUTABLE_PATH: \/opt\/google\/chrome\/chrome$/m);
    const browserIndex = contracts.indexOf('      - name: Verify sandboxed system Chrome');
    const testIndex = contracts.indexOf('npm run test:ci');
    expect(browserIndex).toBeGreaterThan(-1);
    expect(browserIndex).toBeLessThan(testIndex);
    const browserStep = namedStepBody(contracts, 'Verify sandboxed system Chrome');
    expect(browserStep).toContain('test -x "$PUPPETEER_EXECUTABLE_PATH"');
    expect(browserStep).toContain('puppeteer.launch({ headless: true })');
    expect(browserStep).not.toContain('--no-sandbox');
    const visual = fs.readFileSync(path.resolve(__dirname, '../../scripts/visual-structure-check.js'), 'utf8');
    expect(visual).not.toContain('--no-sandbox');
});

test('Staff CI fails boundedly on open handles and keeps a masked visual failure artifact', () => {
    const contracts = jobBody('staff-contracts');
    expect(contracts).toMatch(/^        run: timeout --signal=TERM --kill-after=15s 300s npm run test:ci -- --detectOpenHandles$/m);
    expect(contracts).not.toContain('--forceExit');
    const artifact = namedStepBody(contracts, 'Upload masked visual diff on failure');
    expect(artifact).toContain('if: failure()');
    expect(artifact).toContain('uses: actions/upload-artifact@v4');
    expect(artifact).toContain('path: ${{ runner.temp }}/staff-visual-diff/');
    const visualTest = fs.readFileSync(path.resolve(__dirname, './Task6VisualBaseline.test.js'), 'utf8');
    expect(visualTest).toContain('ratio >= 0.002 && process.env.CI');
    expect(visualTest).toContain('expect(ratio).toBeLessThan(0.002)');
    const renderer = fs.readFileSync(path.resolve(__dirname, '../../scripts/visual-structure-check.js'), 'utf8');
    expect(renderer).toContain('await page.setJavaScriptEnabled(false)');
    expect(renderer).toContain('await page.addStyleTag({ content: MASK_CSS + extraCss })');
    expect(renderer).toContain('if (url.origin !== FIXTURE_ORIGIN) return request.abort()');
});
