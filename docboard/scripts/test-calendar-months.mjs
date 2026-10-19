import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as dates from '../src/utils/date.js';
import * as schedule from '../src/stores/schedule.js';

test('desktop month range contains this month and next, including December rollover', () => {
  assert.equal(typeof dates.getCalendarMonths, 'function');
  assert.deepEqual(dates.getCalendarMonths(2026, 9, 2), [{ year: 2026, month: 9 }, { year: 2026, month: 10 }]);
  assert.deepEqual(dates.getCalendarMonths(2026, 11, 2), [{ year: 2026, month: 11 }, { year: 2027, month: 0 }]);
  assert.deepEqual(dates.getCalendarMonths(2027, 0), [{ year: 2027, month: 0 }]);
});

test('both visible months retain their independent patient or agenda dates', async () => {
  assert.equal(typeof schedule.loadCalendarMonths, 'function');
  const result = await schedule.loadCalendarMonths([{ year: 2026, month: 11 }, { year: 2027, month: 0 }], async (year, month) => {
    if (year === 2026 && month === 12) return { '2026-12-31': { total: 2 } };
    if (year === 2027 && month === 1) return { '2027-01-02': { total: 3 } };
    assert.fail(`Unexpected API month ${year}/${month}`);
  });
  assert.deepEqual(result, { '2026-12-31': { total: 2 }, '2027-01-02': { total: 3 } });
});

test('a failed second month cannot publish a partially refreshed agenda', async () => {
  assert.equal(typeof schedule.loadCalendarMonths, 'function');
  await assert.rejects(schedule.loadCalendarMonths([{ year: 2026, month: 9 }, { year: 2026, month: 10 }], async (_year, month) => {
    if (month === 11) throw new Error('agenda unavailable');
    return { '2026-10-19': { total: 1 } };
  }), /agenda unavailable/);
});

test('Staff iframe fills the visible desktop height at 80% and 100% zoom', () => {
  const source = readFileSync(new URL('../../staff/public/scripts/main.js', import.meta.url), 'utf8');
  const fn = source.match(/function syncDocboardFrameHeight\(\) \{[\s\S]*?(?=\nfunction bindDocboardViewportSync)/)?.[0];
  assert.ok(fn, 'DocBoard needs a viewport height synchronizer');
  for (const zoom of [0.8, 1]) {
    const frame = { offsetHeight: 600, style: {}, getBoundingClientRect: () => ({ top: 60, height: 600 * zoom }) };
    const context = {
      window: { innerHeight: 720, innerWidth: 1440, visualViewport: { height: 720 } },
      document: {
        body: { classList: { contains: () => true } },
        documentElement: { clientHeight: 720 },
        getElementById: id => id === 'docboard-iframe' ? frame : null,
      },
    };
    vm.runInNewContext(`${fn}\nsyncDocboardFrameHeight();`, context);
    assert.equal(parseFloat(frame.style.height) * zoom + 60, 720);
    context.window.innerHeight = 600;
    context.window.visualViewport.height = 600;
    vm.runInNewContext('syncDocboardFrameHeight();', context);
    assert.equal(parseFloat(frame.style.height) * zoom + 60, 600);
  }
});
