const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const workflow = fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/staff-panel-ci.yml'), 'utf8');
const jobs = yaml.load(workflow).jobs;

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
    expect(jobs['staff-asset-nginx']['runs-on']).toBe('ubuntu-24.04');
    const contracts = jobs['staff-contracts'];
    expect(contracts['runs-on']).toBe('ubuntu-24.04');
    expect(contracts.env).toEqual(expect.objectContaining({
        PUPPETEER_SKIP_DOWNLOAD: 'true',
        PUPPETEER_EXECUTABLE_PATH: '/opt/google/chrome/chrome'
    }));
    const steps = contracts.steps;
    const browserIndex = steps.findIndex(step => step.name === 'Verify sandboxed system Chrome');
    const testIndex = steps.findIndex(step => step.run?.includes('npm run test:ci'));
    expect(browserIndex).toBeGreaterThan(-1);
    expect(browserIndex).toBeLessThan(testIndex);
    expect(steps[browserIndex].run).toContain('test -x "$PUPPETEER_EXECUTABLE_PATH"');
    expect(steps[browserIndex].run).toContain('puppeteer.launch({ headless: true })');
    expect(steps[browserIndex].run).not.toContain('--no-sandbox');
    const visual = fs.readFileSync(path.resolve(__dirname, '../../scripts/visual-structure-check.js'), 'utf8');
    expect(visual).not.toContain('--no-sandbox');
});

test('Staff CI fails boundedly on open handles and keeps a masked visual failure artifact', () => {
    const steps = jobs['staff-contracts'].steps;
    const testStep = steps.find(step => step.run?.includes('npm run test:ci'));
    expect(testStep.run).toMatch(/^timeout --signal=TERM --kill-after=15s 300s npm run test:ci -- --detectOpenHandles$/);
    expect(testStep.run).not.toContain('--forceExit');
    const artifact = steps.find(step => step.uses === 'actions/upload-artifact@v4');
    expect(artifact).toEqual(expect.objectContaining({
        if: 'failure()',
        with: expect.objectContaining({ path: '${{ runner.temp }}/staff-visual-diff/' })
    }));
    const visualTest = fs.readFileSync(path.resolve(__dirname, './Task6VisualBaseline.test.js'), 'utf8');
    expect(visualTest).toContain('ratio >= 0.002 && process.env.CI');
    expect(visualTest).toContain('expect(ratio).toBeLessThan(0.002)');
    const renderer = fs.readFileSync(path.resolve(__dirname, '../../scripts/visual-structure-check.js'), 'utf8');
    expect(renderer).toContain('await page.setJavaScriptEnabled(false)');
    expect(renderer).toContain('await page.addStyleTag({ content: MASK_CSS + extraCss })');
    expect(renderer).toContain('if (url.origin !== FIXTURE_ORIGIN) return request.abort()');
});
