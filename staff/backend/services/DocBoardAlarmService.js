'use strict';

const pool = require('../db');
const logger = require('../utils/logger');
const { validateOperationalSchemaScope } = require('./OperationalSchemaValidator');

const ALARM_SOURCE_TYPES = Object.freeze(['operasi', 'tindakan', 'ilmiah', 'pribadi']);
const ALARM_SOUND_KEYS = Object.freeze(['gentle', 'chime', 'urgent']);
const WIB_TIME_ZONE = 'Asia/Jakarta';

function getWibParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

function formatDateLocal(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.substring(0, 10);
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTimeValue(value) {
  if (!value) return '';
  return String(value).substring(0, 5);
}

function alarmRoute(sourceType, sourceId) {
  if (sourceType === 'operasi') return `/docboard/surgery/${sourceId}`;
  if (sourceType === 'tindakan') return '/docboard/procedures';
  if (sourceType === 'pribadi') return '/docboard/personal';
  return '/docboard/scientific';
}

function mapAlarm(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    source_type: row.source_type,
    source_id: String(row.source_id),
    alarm_time: formatTimeValue(row.alarm_time),
    sound_key: row.sound_key || 'gentle',
    status: row.status || 'scheduled',
    sent_at: row.sent_at || null,
    last_error: row.last_error || ''
  };
}

class DocBoardAlarmService {
  constructor(options = {}) {
    this.db = options.database || pool;
    this.validateSchema = options.schemaValidator || validateOperationalSchemaScope;
    this.pushService = options.pushService || null;
    this.now = options.now || (() => new Date());
  }

  async ensureSchema() {
    await this.validateSchema('docboard');
  }

  async getTodayEvents(userId, options = {}) {
    await this.ensureSchema();
    const { date } = getWibParts(this.now());
    const userKey = String(userId || '');
    const spaceClauses = [
      "s.schedule_date = ?",
      "s.status <> 'cancelled'",
      "(s.space IN ('ilmiah', 'tindakan') OR (s.space = 'pribadi' AND s.user_id = ?))"
    ];
    const spaceParams = [date, userKey];

    if (options.excludeScientific) {
      spaceClauses.push("s.space <> 'ilmiah'");
    }
    if (options.excludePrivate) {
      spaceClauses.push("s.space <> 'pribadi'");
    }

    const [surgeryResult, spaceResult, alarmResult] = await Promise.all([
      this.db.query(
        `SELECT s.id, s.patient_name, s.surgery_date, s.surgery_time, s.location, s.status,
                COALESCE(NULLIF(s.operation_type_other, ''), NULLIF(ot.name_id, ''), NULLIF(ot.name, ''), 'Operasi') AS operation_name
         FROM surgery_schedules s
         LEFT JOIN surgery_operation_types ot ON ot.id = s.operation_type_id
         WHERE s.surgery_date = ?
           AND s.status <> 'cancelled'
         ORDER BY COALESCE(s.surgery_time, '23:59:00'), s.created_at`,
        [date]
      ),
      this.db.query(
        `SELECT s.id, s.space, s.agenda, s.category, s.schedule_date, s.start_time,
                s.location, s.status
         FROM docboard_space_schedules s
         WHERE ${spaceClauses.join(' AND ')}
         ORDER BY COALESCE(s.start_time, '23:59:00'), s.id`,
        spaceParams
      ),
      this.db.query(
        `SELECT id, source_type, source_id, DATE_FORMAT(alarm_at, '%H:%i') AS alarm_time,
                sound_key, status, sent_at, last_error
         FROM docboard_alarms
         WHERE user_id = ?
           AND event_date = ?
           AND status <> 'cancelled'`,
        [userKey, date]
      )
    ]);

    const alarmMap = new Map(
      (alarmResult[0] || []).map(row => [`${row.source_type}:${row.source_id}`, mapAlarm(row)])
    );

    const surgeries = (surgeryResult[0] || []).map(row => {
      const sourceId = String(row.id);
      return {
        key: `operasi:${sourceId}`,
        source_type: 'operasi',
        source_id: sourceId,
        type_label: 'Operasi',
        title: row.patient_name || 'Operasi',
        subtitle: row.operation_name || 'Operasi',
        event_date: formatDateLocal(row.surgery_date),
        event_time: formatTimeValue(row.surgery_time),
        location: row.location || '',
        status: row.status || 'scheduled',
        alarmable: !['completed', 'cancelled'].includes(row.status),
        url: alarmRoute('operasi', sourceId),
        alarm: alarmMap.get(`operasi:${sourceId}`) || null
      };
    });

    const spaces = (spaceResult[0] || []).map(row => {
      const sourceId = String(row.id);
      return {
        key: `${row.space}:${sourceId}`,
        source_type: row.space,
        source_id: sourceId,
        type_label: row.space === 'tindakan' ? 'Tindakan' : row.space === 'pribadi' ? 'Pribadi' : 'Ilmiah',
        title: row.agenda,
        subtitle: row.category || '',
        event_date: formatDateLocal(row.schedule_date),
        event_time: formatTimeValue(row.start_time),
        location: row.location || '',
        status: row.status || 'scheduled',
        alarmable: !['done', 'cancelled'].includes(row.status),
        url: alarmRoute(row.space, sourceId),
        alarm: alarmMap.get(`${row.space}:${sourceId}`) || null
      };
    });

    const events = [...surgeries, ...spaces].sort((first, second) => {
      const firstTime = first.event_time || '23:59';
      const secondTime = second.event_time || '23:59';
      return firstTime.localeCompare(secondTime) || first.type_label.localeCompare(second.type_label);
    });

    return { date, events };
  }

  async upsertAlarm(userId, data, options = {}) {
    const sourceType = String(data?.source_type || '').toLowerCase();
    const sourceId = String(data?.source_id || '').trim();
    const alarmTime = String(data?.alarm_time || '').trim();
    const soundKey = String(data?.sound_key || 'gentle').toLowerCase();

    if (!ALARM_SOURCE_TYPES.includes(sourceType)) {
      const error = new Error('Jenis agenda alarm tidak valid');
      error.statusCode = 400;
      throw error;
    }
    if (!sourceId) {
      const error = new Error('Agenda alarm diperlukan');
      error.statusCode = 400;
      throw error;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(alarmTime)) {
      const error = new Error('Jam alarm tidak valid');
      error.statusCode = 400;
      throw error;
    }
    if (!ALARM_SOUND_KEYS.includes(soundKey)) {
      const error = new Error('Nada alarm tidak valid');
      error.statusCode = 400;
      throw error;
    }

    const today = await this.getTodayEvents(userId, options);
    const event = today.events.find(item => item.source_type === sourceType && item.source_id === sourceId);
    if (!event) {
      const error = new Error('Agenda hari ini tidak ditemukan atau tidak dapat diakses');
      error.statusCode = 404;
      throw error;
    }
    if (!event.alarmable) {
      const error = new Error('Agenda yang sudah selesai tidak dapat diberi alarm');
      error.statusCode = 409;
      throw error;
    }

    const now = getWibParts(this.now());
    if (today.date !== now.date || alarmTime <= now.time) {
      const error = new Error('Pilih jam alarm yang belum lewat hari ini');
      error.statusCode = 400;
      throw error;
    }

    const alarmAt = `${today.date} ${alarmTime}:00`;
    const [result] = await this.db.query(
      `INSERT INTO docboard_alarms
       (user_id, source_type, source_id, event_date, event_time, title, subtitle, location, alarm_at, sound_key, status, attempt_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 0)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         event_date = VALUES(event_date),
         event_time = VALUES(event_time),
         title = VALUES(title),
         subtitle = VALUES(subtitle),
         location = VALUES(location),
         alarm_at = VALUES(alarm_at),
         sound_key = VALUES(sound_key),
         status = 'scheduled',
         sent_at = NULL,
         last_error = NULL,
         attempt_count = 0`,
      [
        String(userId || ''), sourceType, sourceId, event.event_date, event.event_time || null,
        event.title, event.subtitle || null, event.location || null, alarmAt, soundKey
      ]
    );

    const [rows] = await this.db.query(
      `SELECT id, source_type, source_id, DATE_FORMAT(alarm_at, '%H:%i') AS alarm_time,
              sound_key, status, sent_at, last_error
       FROM docboard_alarms
       WHERE id = ? AND user_id = ?`,
      [result.insertId, String(userId || '')]
    );
    return mapAlarm(rows[0]);
  }

  async deleteAlarm(userId, alarmId) {
    await this.ensureSchema();
    const [result] = await this.db.query(
      'DELETE FROM docboard_alarms WHERE id = ? AND user_id = ?',
      [alarmId, String(userId || '')]
    );
    return result.affectedRows > 0;
  }

  async isAlarmSourceActive(alarm) {
    if (alarm.source_type === 'operasi') {
      const [rows] = await this.db.query(
        `SELECT id
         FROM surgery_schedules
         WHERE id = ?
           AND surgery_date = ?
           AND status <> 'cancelled'
         LIMIT 1`,
        [alarm.source_id, alarm.event_date]
      );
      return rows.length > 0;
    }

    const clauses = [
      'id = ?',
      'space = ?',
      'schedule_date = ?',
      "status <> 'cancelled'"
    ];
    const params = [alarm.source_id, alarm.source_type, alarm.event_date];
    if (alarm.source_type === 'pribadi') {
      clauses.push('user_id = ?');
      params.push(String(alarm.user_id || ''));
    }
    const [rows] = await this.db.query(
      `SELECT id
       FROM docboard_space_schedules
       WHERE ${clauses.join(' AND ')}
       LIMIT 1`,
      params
    );
    return rows.length > 0;
  }

  async dispatchDueAlarms() {
    await this.ensureSchema();
    await this.db.query(
      `UPDATE docboard_alarms
       SET status = 'scheduled', last_error = 'Pengiriman sebelumnya terhenti'
       WHERE status = 'sending'
         AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
    );

    const [rows] = await this.db.query(
      `SELECT id, user_id, source_type, source_id, event_date, event_time, title, subtitle, location,
              alarm_at, sound_key, attempt_count
       FROM docboard_alarms
       WHERE status = 'scheduled'
         AND alarm_at <= NOW()
         AND alarm_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
       ORDER BY alarm_at, id
       LIMIT 50`
    );

    const pushService = this.pushService || require('./DocBoardPushService');
    let sent = 0;
    let failed = 0;

    for (const alarm of rows || []) {
      const [claim] = await this.db.query(
        `UPDATE docboard_alarms
         SET status = 'sending', attempt_count = attempt_count + 1
         WHERE id = ? AND status = 'scheduled'`,
        [alarm.id]
      );
      if (!claim.affectedRows) continue;

      if (!await this.isAlarmSourceActive(alarm)) {
        await this.db.query(
          `UPDATE docboard_alarms
           SET status = 'cancelled', last_error = 'Agenda berubah atau dibatalkan'
           WHERE id = ?`,
          [alarm.id]
        );
        continue;
      }

      const timeLabel = formatTimeValue(alarm.event_time);
      const typeLabel = alarm.source_type === 'operasi'
        ? 'Operasi'
        : alarm.source_type === 'tindakan'
          ? 'Tindakan'
          : alarm.source_type === 'pribadi'
            ? 'Pribadi'
            : 'Ilmiah';
      const title = `Alarm ${typeLabel}${timeLabel ? ` • ${timeLabel}` : ''}`;
      const body = [alarm.title, alarm.subtitle, alarm.location].filter(Boolean).join(' — ');
      let result;

      try {
        await pushService.storeNotification(
          alarm.user_id,
          'agenda_alarm',
          title,
          body,
          alarm.location || null,
          String(alarm.id)
        );
        result = await pushService.sendToUser(alarm.user_id, title, body, {
          type: 'agenda_alarm',
          alarmId: String(alarm.id),
          sourceType: alarm.source_type,
          sourceId: String(alarm.source_id),
          soundKey: alarm.sound_key || 'gentle',
          alarmAt: alarm.alarm_at,
          tag: `docboard-alarm-${alarm.id}`,
          url: alarmRoute(alarm.source_type, alarm.source_id)
        });
      } catch (error) {
        result = { success: false, sent: 0, failed: 1, error: error.message };
      }

      if (result?.sent > 0) {
        await this.db.query(
          `UPDATE docboard_alarms
           SET status = 'sent', sent_at = NOW(), last_error = NULL
           WHERE id = ?`,
          [alarm.id]
        );
        sent++;
        continue;
      }

      const reason = result?.reason === 'no_tokens'
        ? 'Tidak ada perangkat dengan notifikasi aktif'
        : result?.error || 'Push notification gagal dikirim';
      const attempts = Number(alarm.attempt_count || 0) + 1;
      const nextStatus = result?.reason === 'no_tokens' || attempts >= 3 ? 'failed' : 'scheduled';
      await this.db.query(
        `UPDATE docboard_alarms
         SET status = ?, last_error = ?
         WHERE id = ?`,
        [nextStatus, reason.substring(0, 500), alarm.id]
      );
      failed++;
    }

    if (sent || failed) {
      logger.info('[DocBoardAlarm] Due alarms processed', { sent, failed });
    }
    return { processed: (rows || []).length, sent, failed };
  }
}

const service = new DocBoardAlarmService();

module.exports = service;
module.exports.DocBoardAlarmService = DocBoardAlarmService;
module.exports.ALARM_SOURCE_TYPES = ALARM_SOURCE_TYPES;
module.exports.ALARM_SOUND_KEYS = ALARM_SOUND_KEYS;
module.exports.getWibParts = getWibParts;
