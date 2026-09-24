const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/staff-panel-ci.yml'), 'utf8');

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
