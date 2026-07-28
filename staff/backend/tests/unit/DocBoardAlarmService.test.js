jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('../../services/OperationalSchemaValidator', () => ({
  validateOperationalSchemaScope: jest.fn().mockResolvedValue(true)
}));

const {
  DocBoardAlarmService,
  getWibParts
} = require('../../services/DocBoardAlarmService');

describe('DocBoardAlarmService', () => {
  test('uses Asia/Jakarta when deriving the active alarm date and time', () => {
    expect(getWibParts(new Date('2026-07-28T03:15:00.000Z'))).toEqual({
      date: '2026-07-28',
      time: '10:15'
    });
  });

  test('upserts one personalized alarm using the server-owned event snapshot', async () => {
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce([{ insertId: 42 }])
        .mockResolvedValueOnce([[
          {
            id: 42,
            source_type: 'operasi',
            source_id: '17',
            alarm_time: '10:30',
            sound_key: 'chime',
            status: 'scheduled'
          }
        ]])
    };
    const service = new DocBoardAlarmService({
      database,
      schemaValidator: jest.fn().mockResolvedValue(true),
      now: () => new Date('2026-07-28T03:00:00.000Z')
    });
    service.getTodayEvents = jest.fn().mockResolvedValue({
      date: '2026-07-28',
      events: [{
        source_type: 'operasi',
        source_id: '17',
        title: 'Ny. Test',
        subtitle: 'SC',
        event_date: '2026-07-28',
        event_time: '12:00',
        location: 'RSIA Melinda',
        alarmable: true
      }]
    });

    const alarm = await service.upsertAlarm('USER-1', {
      source_type: 'operasi',
      source_id: '17',
      alarm_time: '10:30',
      sound_key: 'chime'
    });

    expect(alarm).toEqual(expect.objectContaining({
      id: '42',
      alarm_time: '10:30',
      sound_key: 'chime',
      status: 'scheduled'
    }));
    expect(database.query.mock.calls[0][1]).toEqual([
      'USER-1', 'operasi', '17', '2026-07-28', '12:00',
      'Ny. Test', 'SC', 'RSIA Melinda', '2026-07-28 10:30:00', 'chime'
    ]);
  });

  test('rejects an alarm time that has already passed in WIB', async () => {
    const service = new DocBoardAlarmService({
      database: { query: jest.fn() },
      schemaValidator: jest.fn().mockResolvedValue(true),
      now: () => new Date('2026-07-28T03:00:00.000Z')
    });
    service.getTodayEvents = jest.fn().mockResolvedValue({
      date: '2026-07-28',
      events: [{
        source_type: 'tindakan',
        source_id: '9',
        alarmable: true
      }]
    });

    await expect(service.upsertAlarm('USER-1', {
      source_type: 'tindakan',
      source_id: '9',
      alarm_time: '09:59',
      sound_key: 'gentle'
    })).rejects.toMatchObject({
      message: 'Pilih jam alarm yang belum lewat hari ini',
      statusCode: 400
    });
  });

  test('claims due rows and pushes an alarm only to its owner', async () => {
    const dueAlarm = {
      id: 7,
      user_id: 'USER-7',
      source_type: 'pribadi',
      source_id: '31',
      event_date: '2026-07-28',
      event_time: '19:00:00',
      title: 'Agenda keluarga',
      subtitle: 'Keluarga',
      location: 'Rumah',
      alarm_at: '2026-07-28 18:30:00',
      sound_key: 'urgent',
      attempt_count: 0
    };
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([[dueAlarm]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 31 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
    };
    const pushService = {
      storeNotification: jest.fn().mockResolvedValue(88),
      sendToUser: jest.fn().mockResolvedValue({ success: true, sent: 1, failed: 0 })
    };
    const service = new DocBoardAlarmService({
      database,
      pushService,
      schemaValidator: jest.fn().mockResolvedValue(true)
    });

    const result = await service.dispatchDueAlarms();

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(pushService.sendToUser).toHaveBeenCalledWith(
      'USER-7',
      'Alarm Pribadi • 19:00',
      'Agenda keluarga — Keluarga — Rumah',
      expect.objectContaining({
        type: 'agenda_alarm',
        soundKey: 'urgent',
        url: '/docboard/personal'
      })
    );
  });
});
