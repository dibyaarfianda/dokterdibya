import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  jakartaDateString,
  addDays,
  formatDateTime,
  formatDate,
} from '../src/utils/gambiranMonitorDate.js';

assert.equal(jakartaDateString(new Date('2026-07-02T18:30:00.000Z')), '2026-07-03');
assert.equal(addDays('2026-07-03', -1), '2026-07-02');
assert.equal(addDays('2026-07-03', 1), '2026-07-04');
assert.match(formatDateTime('2026-07-03T02:00:00.000Z'), /^03 Jul, 09[.:]00$/);
assert.match(formatDateTime('2026-07-03 09:00:00'), /^03 Jul, 09[.:]00$/);
assert.equal(formatDate('2026-07-03'), '03 Jul 2026');

const view = readFileSync(new URL('../src/views/GambiranMonitor.jsx', import.meta.url), 'utf8');
assert.match(view, /useState\(\(\) => jakartaDateString\(\)\)/);
assert.match(view, /const todayDate = jakartaDateString\(\)/);

console.log('Gambiran monitor date tests passed');
