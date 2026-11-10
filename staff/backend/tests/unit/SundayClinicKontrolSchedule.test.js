const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const helperFile = path.resolve(
  __dirname,
  '../../../public/scripts/sunday-clinic/utils/kontrol-schedule.js',
);

function runHelper(expression, input) {
  const source = fs.readFileSync(helperFile, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const runner = `
    const helper = await import(process.env.MODULE_URL);
    const input = JSON.parse(process.env.TEST_INPUT);
    process.stdout.write(JSON.stringify(${expression}));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', runner], {
    encoding: 'utf8',
    env: { ...process.env, MODULE_URL: moduleUrl, TEST_INPUT: JSON.stringify(input) },
  }));
}

function compute(baseDate, interval, manualDate) {
  return runHelper('helper.computeKontrolDate(input.baseDate, input.interval, input.manualDate)', {
    baseDate, interval, manualDate,
  });
}

describe('Sunday Clinic kontrol schedule helper', () => {
  test('exposes the fixed interval options', () => {
    expect(runHelper('helper.KONTROL_INTERVALS', {})).toEqual([
      { value: '1_minggu', label: '1 mgg' },
      { value: '2_minggu', label: '2 mgg' },
      { value: '1_bulan', label: '1 bln' },
      { value: '3_bulan', label: '3 bln' },
      { value: '6_bulan', label: '6 bln' },
      { value: 'tanggal', label: 'Pilih tanggal' },
      { value: 'tidak_perlu', label: 'Tidak perlu' },
    ]);
    expect(runHelper('Object.isFrozen(helper.KONTROL_INTERVALS) && helper.KONTROL_INTERVALS.every(Object.isFrozen)', {})).toBe(true);
  });

  test('adds weeks as 7/14 days', () => {
    expect(compute('2026-11-07', '1_minggu')).toBe('2026-11-14');
    expect(compute('2026-11-07', '2_minggu')).toBe('2026-11-21');
  });

  test('adds months clamping to the last day of the target month', () => {
    expect(compute('2026-01-31', '1_bulan')).toBe('2026-02-28');
    expect(compute('2028-01-31', '1_bulan')).toBe('2028-02-29');
    expect(compute('2026-08-31', '6_bulan')).toBe('2027-02-28');
    expect(compute('2026-11-07', '3_bulan')).toBe('2027-02-07');
  });

  test('uses manual date only when it is a real YYYY-MM-DD date', () => {
    expect(compute('2026-11-07', 'tanggal', '2026-12-01')).toBe('2026-12-01');
    expect(compute('2026-11-07', 'tanggal', '')).toBe('');
    expect(compute('2026-11-07', 'tanggal', '2026-02-30')).toBe('');
    expect(compute('2026-11-07', 'tanggal', '1/12/2026')).toBe('');
  });

  test('returns empty for tidak_perlu, unknown interval, and invalid base date', () => {
    expect(compute('2026-11-07', 'tidak_perlu')).toBe('');
    expect(compute('2026-11-07', '')).toBe('');
    expect(compute('2026-11-07', 'foo')).toBe('');
    expect(compute('', '1_minggu')).toBe('');
    expect(compute('2026-02-30', '1_minggu')).toBe('');
  });
});
