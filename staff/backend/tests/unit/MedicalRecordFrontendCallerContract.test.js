'use strict';

const fs = require('node:fs');
const path = require('node:path');
const publicRoot = path.resolve(__dirname, '../../../public/scripts');
const read = file => fs.readFileSync(path.join(publicRoot, file), 'utf8');

test.each([
    'sunday-clinic/sections/usg.js',
    'sunday-clinic/components/gyn_repro/usg-gyn_repro.js',
    'sunday-clinic/components/gyn_special/usg-gyn_special.js'
])('%s does not issue legacy direct medical-record writes or broad resets', file => {
    const source = read(file);
    expect(source).not.toMatch(/apiClient\.(?:put|delete)\(\s*`?\/?api\/medical-records/);
    expect(source).not.toMatch(/fetch\(\s*`\/api\/sunday-clinic\/records\/\$\{[^}]+\}\/usg`/);
    expect(source).toMatch(/apiClient\.(?:saveSection|resetSection)\(/);
});

test('shared client retires unscoped whole-record save', () => {
    expect(read('sunday-clinic/utils/api-client.js')).not.toMatch(/return this\.put\(`\$\{API_ENDPOINTS\.RECORDS\}\/\$\{mrId\}`/);
});

test('active resume reset uses the shared exact-scope versioned adapter', () => {
    const source = read('sunday-clinic/main.js');
    expect(source).toMatch(/apiClient\.resetSection\(mrId, 'resume_medis'\)/);
    expect(source).not.toMatch(/fetch\(`\/api\/medical-records\/\$\{encodeURIComponent\(mrId\)\}\/sections\/resume_medis\/reset`/);
});

test('archived standalone medical form cannot POST an unscoped record', () => {
    expect(read('medical-record.js')).not.toMatch(/authorizedFetch\('\/api\/medical-records',\s*\{\s*method:\s*'POST'/);
});

test('unreachable bulk medical import path is retired without a fabricated MR or unversioned write', () => {
    const source = read('sunday-clinic/utils/medical-import.js');
    expect(source).not.toMatch(/fetch\('\/api\/medical-import\/save'/);
    expect(source).not.toMatch(/MR-\$\{patientId\}-\$\{Date\.now\(\)\}/);
    expect(source).not.toMatch(/findOrCreatePatient\(/);
    expect(source).toMatch(/apiClient\.saveSection\(mrId, section, data\)/);
});

test('clinical import script does not log imported payloads or identifiers', () => {
    expect(read('sunday-clinic/utils/medical-import.js')).not.toMatch(/console\.(?:log|warn|error)\(/);
});
