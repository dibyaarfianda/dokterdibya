const {
  DrdDocBoardScheduleService,
  PROCEDURE_CATEGORIES,
  buildDiagnosisText,
  projectGestationalAge,
  parsePlanningSuggestions,
  selectLatestSections,
} = require('../../services/DrdDocBoardScheduleService');
const { resolveRouteAccess } = require('../../config/accessControlRegistry');

const NOW = new Date('2026-10-11T03:00:00.000Z');

function canonicalSnapshot(overrides = {}) {
  return {
    mrId: 'DRD1001',
    patient: { id: 'P001', name: 'Ny. Sari', age: 31, allergy: 'Tidak ada' },
    visit: { category: 'obstetri', location: 'rsia_melinda', createdAt: '2026-08-01 09:00:00' },
    planning: { rencana: 'SC 20/10/2026 jam 08.30 di Melinda' },
    diagnosis: { diagnosis_utama: 'G2 P1001 36+0 T/H', diagnosis_sekunder: 'Bekas SC' },
    anamnesa: { hpht: '2026-02-03', hpl: '2026-11-10', usia_kehamilan: '35 minggu 5 hari', record_datetime: '2026-10-11T09:00' },
    labResults: 'Hb: 11.2 g/dL',
    usgResults: 'UK: 35w5d',
    operationTypes: [
      { id: 1, code: 'SC', name: 'Sectio Caesarea', name_id: 'SC', category: 'obstetri' },
      { id: 99, code: 'OTHER-OP', name: 'Other', name_id: 'Lainnya', category: 'ginekologi' },
    ],
    ...overrides,
  };
}

describe('DRD to DocBoard canonical schedule service', () => {
  test('keeps modern diagnosis lines and supports legacy diagnosis fields', () => {
    expect(buildDiagnosisText({ diagnosis_utama: 'Mioma uteri', diagnosis_sekunder: 'Anemia' }))
      .toBe('Mioma uteri\nAnemia');
    expect(buildDiagnosisText({ diagnoses: [{ text: 'Kista ovarium' }, 'Dismenore'] }))
      .toBe('Kista ovarium\nDismenore');
    expect(buildDiagnosisText({ primary_diagnosis: 'Infertilitas primer' }))
      .toBe('Infertilitas primer');
  });

  test('uses HPHT, HPL, then saved gestational age with the clinical source date', () => {
    expect(projectGestationalAge({ hpht: '2026-01-01' }, '2026-09-01', { pregnant: true }).label)
      .toBe('34 minggu 5 hari');
    expect(projectGestationalAge({ hpl: '2026-10-08' }, '2026-09-01', { pregnant: true }).label)
      .toBe('34 minggu 5 hari');
    expect(projectGestationalAge(
      { usia_kehamilan: '30 minggu 2 hari', record_datetime: '2026-08-01T09:00' },
      '2026-08-15',
      { pregnant: true },
    ).label).toBe('32 minggu 2 hari');
  });

  test('does not project a gestational age when saved pregnancy sources conflict', () => {
    const result = projectGestationalAge(
      { hpht: '2026-01-01', hpl: '2026-11-20' },
      '2026-09-01',
      { pregnant: true },
    );
    expect(result.label).toBe('');
    expect(result.warning).toBe('Usia kehamilan perlu diverifikasi.');
  });

  test('uses the canonical patient pregnancy flag even outside an obstetric visit category', async () => {
    const service = new DrdDocBoardScheduleService({
      repository: {
        loadSnapshot: jest.fn().mockResolvedValue(canonicalSnapshot({
          patient: { id: 'P001', name: 'Ny. Sari', age: 31, isPregnant: true },
          visit: { category: 'ginekologi_umum', location: 'rsia_melinda', createdAt: '2026-08-01 09:00:00' },
          diagnosis: { diagnosis_utama: 'Kista ovarium' },
          anamnesa: { hpht: '2026-02-03' },
          planning: { rencana: 'Kontrol 20/10/2026 jam 08.00 di Melinda' },
        })),
      },
      surgeryService: {}, docboardService: {}, now: () => NOW,
    });

    const preview = await service.preview({ mr_id: 'DRD1001', schedule_date: '2026-10-20' });
    expect(preview.pregnancy.pregnant).toBe(true);
    expect(preview.diagnosis).toContain('Perkiraan UK saat jadwal: 37 minggu 0 hari');
  });

  test('projects saved gestational age from the anamnesis record timestamp, not the visit date', async () => {
    const service = new DrdDocBoardScheduleService({
      repository: {
        loadSnapshot: jest.fn().mockResolvedValue(canonicalSnapshot({
          visit: { category: 'obstetri', location: 'rsia_melinda', createdAt: '2026-08-01 09:00:00' },
          anamnesa: { usia_kehamilan: '35 minggu 5 hari' },
          anamnesaRecordedAt: '2026-10-11 09:00:00',
        })),
      },
      surgeryService: {}, docboardService: {}, now: () => NOW,
    });

    const preview = await service.preview({ mr_id: 'DRD1001', schedule_date: '2026-10-20' });
    expect(preview.pregnancy.label).toBe('37 minggu 0 hari');
    expect(preview.pregnancy.source).toBe('usia_kehamilan');
  });

  test('selects the newest version per record type instead of overwriting it with older rows', () => {
    const selected = selectLatestSections([
      { id: 3, record_type: 'diagnosis', version: 3, updated_at: '2026-10-11 09:00:00', record_data: { diagnosis_utama: 'Terbaru' } },
      { id: 2, record_type: 'diagnosis', version: 2, updated_at: '2026-10-10 09:00:00', record_data: { diagnosis_utama: 'Lama' } },
      { id: 7, record_type: 'planning', version: 1, updated_at: '2026-10-11 08:00:00', record_data: { rencana: 'Kontrol' } },
    ]);
    expect(selected.diagnosis.data.diagnosis_utama).toBe('Terbaru');
    expect(selected.planning.data.rencana).toBe('Kontrol');
  });

  test('parses only one explicit schedule and recognizes procedure categories', () => {
    const stripping = parsePlanningSuggestions('Stripping membrane besok jam 08.30 di Melinda', NOW, []);
    expect(stripping).toMatchObject({
      scheduleDate: '2026-10-12',
      scheduleTime: '08:30',
      location: 'rsia_melinda',
      kind: 'procedure',
      procedureCategory: 'Stripping Membrane',
    });

    const ambiguous = parsePlanningSuggestions(
      'Lepas IUD 20/10/2026 atau 21/10/2026 jam 08.00 atau jam 10.00 di Melinda',
      NOW,
      [],
    );
    expect(ambiguous.scheduleDate).toBe('');
    expect(ambiguous.scheduleTime).toBe('');
    expect(ambiguous.procedureCategory).toBe('Lepas IUD');

    const ambiguousRelativeDate = parsePlanningSuggestions(
      'Lepas/pasang IUD besok atau lusa pukul 09.00 di Melinda',
      NOW,
      [],
    );
    expect(ambiguousRelativeDate.scheduleDate).toBe('');
    expect(ambiguousRelativeDate.procedureCategory).toBe('Lepas Pasang IUD');
  });

  test('creates surgery from canonical DRD data and ignores spoofed patient or diagnosis fields', async () => {
    const captured = [];
    const service = new DrdDocBoardScheduleService({
      repository: {
        loadSnapshot: jest.fn().mockResolvedValue(canonicalSnapshot()),
        findExistingSurgery: jest.fn().mockResolvedValue(null),
      },
      surgeryService: {
        createSurgery: async (payload) => {
          captured.push(payload);
          return { id: 41, ...payload, op_display_name: 'SC' };
        },
      },
      docboardService: {},
      pushService: { sendNewBookingNotification: jest.fn().mockResolvedValue(undefined) },
      rulesService: { evaluateRules: jest.fn().mockResolvedValue(undefined) },
      now: () => NOW,
    });

    const result = await service.create({
      mr_id: 'DRD1001',
      kind: 'surgery',
      schedule_date: '2026-10-20',
      schedule_time: '08:30',
      location: 'rsia_melinda',
      operation_type_ids: [1],
      operation_type_other: '',
      idempotency_key: 'drd-1001-20261020-0830',
      patient_name: 'Nama palsu',
      diagnosis: 'Diagnosis palsu',
    }, 'STAFF01');

    expect(result).toMatchObject({ kind: 'surgery', id: '41', created: true, href: '/docboard/surgery/41' });
    expect(captured[0].patient_name).toBe('Ny. Sari');
    expect(captured[0].diagnosis).toContain('G2 P1001 36+0 T/H\nBekas SC');
    expect(captured[0].diagnosis).toContain('Perkiraan UK saat jadwal: 37 minggu 0 hari');
    expect(captured[0]).not.toHaveProperty('patient_name', 'Nama palsu');
  });

  test('keeps the internal OTHER-OP fallback out of selectable operation types', async () => {
    const service = new DrdDocBoardScheduleService({
      repository: { loadSnapshot: jest.fn().mockResolvedValue(canonicalSnapshot()) },
      surgeryService: {}, docboardService: {}, now: () => NOW,
    });

    const preview = await service.preview({ mr_id: 'DRD1001', schedule_date: '2026-10-20' });
    expect(preview.options.operation_types.map((type) => type.code)).toEqual(['SC']);
  });

  test('uses OTHER-OP only as the backend fallback for a typed custom operation', async () => {
    const createSurgery = jest.fn().mockResolvedValue({ id: 78 });
    const service = new DrdDocBoardScheduleService({
      repository: {
        loadSnapshot: jest.fn().mockResolvedValue(canonicalSnapshot()),
        findExistingSurgery: jest.fn().mockResolvedValue(null),
      },
      surgeryService: { createSurgery },
      docboardService: {}, pushService: {}, rulesService: {}, now: () => NOW,
    });

    await service.create({
      mr_id: 'DRD1001', kind: 'surgery', schedule_date: '2026-10-20', schedule_time: '08:30',
      location: 'rsia_melinda', operation_type_ids: [], operation_type_other: 'Operasi khusus',
      idempotency_key: 'custom-operation-key',
    }, 'STAFF01');

    expect(createSurgery).toHaveBeenCalledWith(expect.objectContaining({
      operation_type_id: 99,
      operation_type_other: 'Operasi khusus',
    }), 'STAFF01');
  });

  test.each(['Stripping Membrane', 'Lepas IUD', 'Lepas Pasang IUD', 'Induksi Foley Balon'])(
    'creates %s as a DRD-linked DocBoard procedure',
    async (category) => {
      const captured = [];
      const service = new DrdDocBoardScheduleService({
        repository: {
          loadSnapshot: jest.fn().mockResolvedValue(canonicalSnapshot({ visit: { category: 'gyn_special', location: 'rsud_gambiran' } })),
          findExistingProcedure: jest.fn().mockResolvedValue(null),
        },
        surgeryService: {},
        docboardService: {
          createSpaceSchedule: async (_userId, payload, options) => {
            captured.push({ payload, options });
            return { id: 77, ...payload };
          },
        },
        now: () => NOW,
      });

      const result = await service.create({
        mr_id: 'DRD1001', kind: 'procedure', schedule_date: '2026-10-20', schedule_time: '09:00',
        location: 'rsud_gambiran', procedure_category: category,
        idempotency_key: `key-${category.replace(/\s+/g, '-')}`,
      }, 'STAFF01');

      expect(PROCEDURE_CATEGORIES).toContain(category);
      expect(result).toMatchObject({ kind: 'procedure', id: '77', created: true, href: '/docboard/procedures?schedule=77' });
      expect(captured[0].payload).toMatchObject({
        space: 'tindakan', category, patient_ref_type: 'drd', patient_ref_value: 'DRD1001',
        patient_facility: 'rsud_gambiran', patient_name: 'Ny. Sari', location: 'Gambiran',
      });
      expect(captured[0].payload.notes).toContain('Diagnosis DRD:');
      expect(captured[0].options).toEqual({ trustedPatientRef: true });
    },
  );

  test('returns an existing semantic duplicate instead of writing another procedure', async () => {
    const createSpaceSchedule = jest.fn();
    const service = new DrdDocBoardScheduleService({
      repository: {
        loadSnapshot: jest.fn().mockResolvedValue(canonicalSnapshot()),
        findExistingProcedure: jest.fn().mockResolvedValue({ id: 88, agenda: 'Stripping Membrane - Ny. Sari' }),
      },
      surgeryService: {}, docboardService: { createSpaceSchedule }, now: () => NOW,
    });
    const result = await service.create({
      mr_id: 'DRD1001', kind: 'procedure', schedule_date: '2026-10-20', schedule_time: '09:00',
      location: 'rsia_melinda', procedure_category: 'Stripping Membrane', idempotency_key: 'duplicate-key',
    }, 'STAFF01');
    expect(result.created).toBe(false);
    expect(result.duplicate).toBe(true);
    expect(createSpaceSchedule).not.toHaveBeenCalled();
  });

  test('returns an existing active surgery instead of writing a duplicate', async () => {
    const createSurgery = jest.fn();
    const service = new DrdDocBoardScheduleService({
      repository: {
        loadSnapshot: jest.fn().mockResolvedValue(canonicalSnapshot()),
        findExistingSurgery: jest.fn().mockResolvedValue({ id: 66 }),
      },
      surgeryService: {
        createSurgery,
        getSurgeryById: jest.fn().mockResolvedValue({ id: 66, mr_id: 'DRD1001' }),
      },
      docboardService: {}, pushService: {}, rulesService: {}, now: () => NOW,
    });
    const result = await service.create({
      mr_id: 'DRD1001', kind: 'surgery', schedule_date: '2026-10-20', schedule_time: '08:30',
      location: 'rsia_melinda', operation_type_ids: [1], idempotency_key: 'duplicate-surgery-key',
    }, 'STAFF01');
    expect(result.created).toBe(false);
    expect(result.duplicate).toBe(true);
    expect(createSurgery).not.toHaveBeenCalled();
  });

  test('maps preview POST to view access while create POST remains DocBoard write access', () => {
    expect(resolveRouteAccess({
      sourceFile: 'docboard', method: 'POST', routePath: '/from-drd/preview',
      fileMiddleware: 'verifyStaffToken', handlerPrefix: "requirePermission('medical_records.view')",
    }).permission).toBe('docboard.view');
    expect(resolveRouteAccess({
      sourceFile: 'docboard', method: 'POST', routePath: '/from-drd',
      fileMiddleware: 'verifyStaffToken', handlerPrefix: "requirePermission('docboard.write')",
    }).permission).toBe('docboard.write');
  });
});
