import assert from 'node:assert/strict';
import { normalizeDateInput, parseLocalDate, formatDateDisplay } from '../src/utils/date.js';
import { AUDIT_GAMBIRAN_DEFAULT_START } from '../src/utils/gambiranAudit.js';

assert.equal(normalizeDateInput('2026-06-03T17:00:00.000Z'), '2026-06-04');
assert.equal(normalizeDateInput('2026-06-04'), '2026-06-04');
assert.equal(formatDateDisplay('2026-06-04'), '4 Juni 2026');
assert.equal(parseLocalDate('2026-06-04').getFullYear(), 2026);
assert.equal(parseLocalDate('2026-06-04').getMonth(), 5);
assert.equal(parseLocalDate('2026-06-04').getDate(), 4);
assert.equal(AUDIT_GAMBIRAN_DEFAULT_START, '2020-01-01');

console.log('date utils tests passed');
