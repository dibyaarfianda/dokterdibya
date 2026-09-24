const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('browser RUM redacts unknown first API segment while retaining distinct known families', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/rum.js'), 'utf8');
    const start = source.indexOf('  var knownApiFamilies = new Set([');
    const end = source.indexOf('\n  function trackApiCall', start);
    expect(start).toBeGreaterThan(0);
    const context = { window: { location: { origin: 'https://example.test' } }, URL };
    vm.runInNewContext(`${source.slice(start, end)}\nthis.normalizeApiPath = normalizeApiPath;`, context);
    expect(context.normalizeApiPath('/api/privatepatient123/detail')).toBe('/other');
    expect(context.normalizeApiPath('/api/patients/123')).toBe('/api/patients/:path');
    expect(context.normalizeApiPath('/api/notifications/count')).toBe('/api/notifications/:path');
});
