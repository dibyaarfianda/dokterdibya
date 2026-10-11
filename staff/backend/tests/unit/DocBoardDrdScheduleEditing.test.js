jest.mock('../../db', () => ({
  query: jest.fn()
}));

const pool = require('../../db');
const docBoardService = require('../../services/DocBoardService');
const { canEditPatientLinkedSchedule } = require('../../services/DocBoardService');

describe('DocBoard DRD schedule identity contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docBoardService.spaceScheduleTableReady = true;
  });

  test('allows schedule details to be edited only for a DRD-backed patient reference', () => {
    expect(canEditPatientLinkedSchedule({ patient_ref_type: 'drd', patient_ref_value: 'DRD0123' })).toBe(true);
    expect(canEditPatientLinkedSchedule({ patient_ref_type: 'hospital_mr', patient_ref_value: '001234' })).toBe(false);
    expect(canEditPatientLinkedSchedule({ patient_ref_type: '', patient_ref_value: '' })).toBe(true);
  });

  test('persists canonical patient identity only on the trusted server path', async () => {
    const data = {
      space: 'tindakan',
      agenda: 'Stripping Membrane',
      category: 'Stripping Membrane',
      schedule_date: '2026-10-12',
      start_time: '10:00',
      location: 'rsia_melinda',
      notes: 'G2P1A0; Perkiraan UK saat jadwal: 39 minggu 0 hari',
      patient_ref_type: 'drd',
      patient_ref_value: 'DRD0123',
      patient_facility: 'rsia_melinda',
      patient_name: 'Pasien Uji'
    };

    pool.query
      .mockResolvedValueOnce([{ insertId: 91 }])
      .mockResolvedValueOnce([[{
        id: 91,
        user_id: 'doctor-1',
        ...data,
        status: 'scheduled'
      }]]);

    const created = await docBoardService.createSpaceSchedule('doctor-1', data, { trustedPatientRef: true });

    expect(created.patient_ref_type).toBe('drd');
    expect(created.patient_ref_value).toBe('DRD0123');
    expect(pool.query.mock.calls[0][1].slice(-4)).toEqual([
      'drd', 'DRD0123', 'rsia_melinda', 'Pasien Uji'
    ]);
  });

  test('drops browser-supplied identity on an ordinary DocBoard create', async () => {
    const data = {
      space: 'tindakan',
      agenda: 'Pap Smear',
      category: 'Pap Smear',
      schedule_date: '2026-10-12',
      patient_ref_type: 'drd',
      patient_ref_value: 'DRD9999',
      patient_facility: 'rsud_gambiran',
      patient_name: 'Identitas Palsu'
    };

    pool.query
      .mockResolvedValueOnce([{ insertId: 92 }])
      .mockResolvedValueOnce([[{
        id: 92,
        user_id: 'doctor-1',
        space: 'tindakan',
        agenda: 'Pap Smear',
        category: 'Pap Smear',
        schedule_date: '2026-10-12',
        status: 'scheduled'
      }]]);

    await docBoardService.createSpaceSchedule('doctor-1', data);

    expect(pool.query.mock.calls[0][1].slice(-4)).toEqual([null, null, null, null]);
  });

  test('keeps the canonical DRD patient name in the agenda while allowing schedule details to change', async () => {
    const current = {
      id: 91,
      user_id: 'doctor-1',
      space: 'tindakan',
      agenda: 'Stripping Membrane - Ny. Sari',
      category: 'Stripping Membrane',
      schedule_date: '2026-10-12',
      start_time: '10:00',
      location: 'Melinda',
      status: 'scheduled',
      patient_ref_type: 'drd',
      patient_ref_value: 'DRD0123',
      patient_facility: 'rsia_melinda',
      patient_name: 'Ny. Sari'
    };
    pool.query
      .mockResolvedValueOnce([[current]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{
        ...current,
        agenda: 'Lepas IUD - Ny. Sari',
        category: 'Lepas IUD',
        schedule_date: '2026-10-13'
      }]]);

    await docBoardService.updateSpaceSchedule('doctor-1', 91, {
      agenda: 'Nama pasien yang dimanipulasi',
      category: 'Lepas IUD',
      schedule_date: '2026-10-13',
      start_time: '11:00',
      end_time: '',
      location: 'Melinda',
      participants: '',
      notes: 'Catatan diperbarui'
    });

    expect(pool.query.mock.calls[1][1][0]).toBe('Lepas IUD - Ny. Sari');
    expect(pool.query.mock.calls[1][1][1]).toBe('Lepas IUD');
  });
});
