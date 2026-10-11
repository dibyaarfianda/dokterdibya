const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const helperFile = path.resolve(
  __dirname,
  '../../../public/scripts/sunday-clinic/utils/docboard-planning.js',
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

describe('Sunday Clinic DocBoard Planning helpers', () => {
  test('detects unsaved Planning while treating equivalent array-backed values as unchanged', () => {
    expect(runHelper('helper.hasUnsavedPlanning(input.current, input.persisted)', {
      current: { record_datetime: '2026-10-11T09:00', tindakan: 'USG', terapi: 'Vitamin', rencana: 'Kontrol 1 minggu' },
      persisted: { record_datetime: '2026-10-11T09:00', tindakan: ['USG'], terapi: ['Vitamin'], rencana: 'Kontrol 1 minggu' },
    })).toBe(false);
    expect(runHelper('helper.hasUnsavedPlanning(input.current, input.persisted)', {
      current: { record_datetime: '2026-10-11T09:00', tindakan: 'USG', terapi: 'Vitamin', rencana: 'SC besok' },
      persisted: { record_datetime: '2026-10-11T09:00', tindakan: 'USG', terapi: 'Vitamin', rencana: 'Kontrol 1 minggu' },
    })).toBe(true);
  });

  test('validates required schedule fields, future Jakarta date, and destination-specific type', () => {
    const options = { today: '2026-10-11', procedureCategories: ['Stripping Membrane'], operationTypeIds: [1, 2] };
    expect(runHelper('helper.validateDocBoardSchedule(input.form, input.options)', {
      form: { kind: 'procedure', schedule_date: '2026-10-10', schedule_time: '', location: '', procedure_category: '' }, options,
    })).toEqual(['Tanggal jadwal tidak boleh sebelum hari ini.', 'Jam wajib dipilih.', 'Lokasi wajib dipilih.', 'Jenis tindakan wajib dipilih.']);
    expect(runHelper('helper.validateDocBoardSchedule(input.form, input.options)', {
      form: { kind: 'surgery', schedule_date: '2026-10-12', schedule_time: '08:00', location: 'rsia_melinda', operation_type_ids: [] }, options,
    })).toEqual(['Jenis operasi wajib dipilih atau ditulis.']);
    expect(runHelper('helper.validateDocBoardSchedule(input.form, input.options)', {
      form: { kind: 'procedure', schedule_date: '2026-10-12', schedule_time: '08:00', location: 'rsia_melinda', procedure_category: 'Stripping Membrane' }, options,
    })).toEqual([]);
  });

  test('builds a minimal create request without browser patient or diagnosis fields', () => {
    const payload = runHelper('helper.buildDocBoardScheduleRequest(input.form, input.mrId, input.key)', {
      form: {
        kind: 'procedure', schedule_date: '2026-10-12', schedule_time: '08:00', location: 'rsia_melinda',
        procedure_category: 'Induksi Foley Balon', patient_name: 'Jangan dikirim', diagnosis: 'Jangan dikirim',
      },
      mrId: 'DRD1001', key: 'schedule-key',
    });
    expect(payload).toEqual({
      mr_id: 'DRD1001', kind: 'procedure', schedule_date: '2026-10-12', schedule_time: '08:00',
      location: 'rsia_melinda', procedure_category: 'Induksi Foley Balon', operation_type_ids: [],
      operation_type_other: '', idempotency_key: 'schedule-key',
    });
  });
});
