'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const routineWriters = [
    'routes/medical-records.js',
    'routes/medical-import.js',
    'routes/comm-integration.js',
    'routes/medify-batch.js',
    'services/UsgBulkUploadService.js',
    'scripts/usg-inbox-processor.js',
    'services/sunday-clinic/records.js'
];

test.each(routineWriters)('%s has no routine direct medical_records mutation', filename => {
    let source = fs.readFileSync(path.join(root, filename), 'utf8');
    if (filename === 'services/sunday-clinic/records.js') {
        // Separately governed superadmin full-visit delete remains unchanged.
        source = source.replace(/async function deleteRecordsByMrId\([\s\S]*?(?=async function patchRecordsByIdCategory)/, '');
    }
    const directWrite = source.match(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+medical_records\b/i);
    expect(directWrite?.[0] || null).toBeNull();
});
