import assert from 'node:assert/strict';
import { getJakartaNow, isArchivedProcedure } from '../src/utils/scheduleArchive.js';

const clock = getJakartaNow(new Date('2026-09-29T03:30:00Z'));
assert.deepEqual(clock, { date: '2026-09-29', time: '10:30' });

const item = (schedule_date, start_time, end_time, status = 'scheduled') => ({ schedule_date, start_time, end_time, status });
assert.equal(isArchivedProcedure(item('2026-09-30', '09:00', '10:00'), clock), false);
assert.equal(isArchivedProcedure(item('2026-09-28', '09:00', '10:00'), clock), true);
assert.equal(isArchivedProcedure(item('2026-09-29', '09:00', '11:00'), clock), false);
assert.equal(isArchivedProcedure(item('2026-09-29', '09:00', '10:29'), clock), true);
assert.equal(isArchivedProcedure(item('2026-09-29', '10:29', ''), clock), true);
assert.equal(isArchivedProcedure(item('2026-09-29', '', ''), clock), false);
assert.equal(isArchivedProcedure(item('2026-09-30', '09:00', '10:00', 'done'), clock), true);
assert.equal(isArchivedProcedure(item('2026-09-30', '09:00', '10:00', 'cancelled'), clock), true);
assert.equal(isArchivedProcedure(item('', '', ''), clock), false);
console.log('Schedule archive checks passed');
