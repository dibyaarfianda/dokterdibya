const pool = require('../db');
const logger = require('../utils/logger');

const LOCATIONS = ['klinik_private', 'rsia_melinda', 'rsud_gambiran', 'rs_bhayangkara'];

// practice_schedules table uses 'klinik_privat', normalize to our standard
const LOCATION_NORMALIZE = {
  'klinik_privat': 'klinik_private',
  'klinik_private': 'klinik_private',
  'rsia_melinda': 'rsia_melinda',
  'rsud_gambiran': 'rsud_gambiran',
  'rs_bhayangkara': 'rs_bhayangkara'
};

const SPACE_SCHEDULE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS docboard_space_schedules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  space VARCHAR(20) NOT NULL,
  agenda VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL,
  schedule_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  location VARCHAR(255) NULL,
  participants VARCHAR(255) NULL,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_space_user_date (user_id, space, schedule_date, start_time),
  INDEX idx_space_date (schedule_date, space),
  INDEX idx_space_status (user_id, status)
)`;

function formatDateLocal(date) {
  if (!date) return null;
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTimeValue(time) {
  if (!time) return '';
  if (typeof time === 'string') return time.substring(0, 5);
  return String(time).substring(0, 5);
}

function normalizeSpace(space) {
  return space === 'pribadi' ? 'pribadi' : 'ilmiah';
}

function normalizeLoc(loc) {
  return LOCATION_NORMALIZE[loc] || loc;
}

class DocBoardService {
  constructor() {
    this.spaceScheduleTableReady = false;
  }

  async ensureSpaceScheduleTable() {
    if (this.spaceScheduleTableReady) return;
    await pool.query(SPACE_SCHEDULE_TABLE_SQL);
    this.spaceScheduleTableReady = true;
  }

  mapSpaceSchedule(row) {
    return {
      id: String(row.id),
      space: row.space,
      agenda: row.agenda,
      category: row.category,
      schedule_date: formatDateLocal(row.schedule_date),
      start_time: formatTimeValue(row.start_time),
      end_time: formatTimeValue(row.end_time),
      location: row.location || '',
      participants: row.participants || '',
      notes: row.notes || '',
      status: row.status || 'scheduled',
      updatedAt: row.updated_at,
      createdAt: row.created_at
    };
  }

  async getSpaceSchedules(userId, filters = {}) {
    await this.ensureSpaceScheduleTable();
    const clauses = ['user_id = ?'];
    const params = [String(userId || '')];

    if (filters.space) {
      clauses.push('space = ?');
      params.push(normalizeSpace(filters.space));
    }
    if (filters.date) {
      clauses.push('schedule_date = ?');
      params.push(filters.date);
    }
    if (filters.start && filters.end) {
      clauses.push('schedule_date BETWEEN ? AND ?');
      params.push(filters.start, filters.end);
    }

    const [rows] = await pool.query(
      `SELECT * FROM docboard_space_schedules
       WHERE ${clauses.join(' AND ')}
       ORDER BY schedule_date, COALESCE(start_time, '00:00:00'), id`,
      params
    );

    return rows.map(row => this.mapSpaceSchedule(row));
  }

  async getSpaceScheduleCalendar(userId, year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    const schedules = await this.getSpaceSchedules(userId, { start: startDate, end: endStr });
    const days = {};

    for (const schedule of schedules) {
      if (schedule.status === 'cancelled') continue;
      const date = schedule.schedule_date;
      if (!days[date]) {
        days[date] = { total: 0, spaces: { ilmiah: 0, pribadi: 0 } };
      }
      days[date].total += 1;
      days[date].spaces[schedule.space] = (days[date].spaces[schedule.space] || 0) + 1;
    }

    return days;
  }

  async createSpaceSchedule(userId, data) {
    await this.ensureSpaceScheduleTable();
    const space = normalizeSpace(data.space);
    const [result] = await pool.query(
      `INSERT INTO docboard_space_schedules
       (user_id, space, agenda, category, schedule_date, start_time, end_time, location, participants, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(userId || ''), space, data.agenda, data.category, data.schedule_date,
        data.start_time || null, data.end_time || null, data.location || null,
        data.participants || null, data.notes || null, data.status || 'scheduled'
      ]
    );
    const [rows] = await pool.query('SELECT * FROM docboard_space_schedules WHERE id = ?', [result.insertId]);
    return this.mapSpaceSchedule(rows[0]);
  }

  async updateSpaceSchedule(userId, id, data) {
    await this.ensureSpaceScheduleTable();
    await pool.query(
      `UPDATE docboard_space_schedules
       SET agenda = ?, category = ?, schedule_date = ?, start_time = ?, end_time = ?, location = ?, participants = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [
        data.agenda, data.category, data.schedule_date, data.start_time || null,
        data.end_time || null, data.location || null, data.participants || null,
        data.notes || null, id, String(userId || '')
      ]
    );
    const [rows] = await pool.query('SELECT * FROM docboard_space_schedules WHERE id = ? AND user_id = ?', [id, String(userId || '')]);
    return rows[0] ? this.mapSpaceSchedule(rows[0]) : null;
  }

  async updateSpaceScheduleStatus(userId, id, status) {
    await this.ensureSpaceScheduleTable();
    await pool.query(
      `UPDATE docboard_space_schedules SET status = ? WHERE id = ? AND user_id = ?`,
      [status || 'scheduled', id, String(userId || '')]
    );
    const [rows] = await pool.query('SELECT * FROM docboard_space_schedules WHERE id = ? AND user_id = ?', [id, String(userId || '')]);
    return rows[0] ? this.mapSpaceSchedule(rows[0]) : null;
  }

  async deleteSpaceSchedule(userId, id) {
    await this.ensureSpaceScheduleTable();
    await pool.query('DELETE FROM docboard_space_schedules WHERE id = ? AND user_id = ?', [id, String(userId || '')]);
  }

  /**
   * Get calendar data for a month
   * Returns events per day with location dots and patient counts
   */
  async getCalendarMonth(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0); // Last day of month
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    // Get events from docboard_events
    const [events] = await pool.query(
      `SELECT event_date, location, patient_count, completed_count, sync_status, is_disabled
       FROM docboard_events
       WHERE event_date BETWEEN ? AND ? AND is_disabled = 0
       ORDER BY event_date, location`,
      [startDate, endStr]
    );

    // Get practice schedules to fill in days without events
    const [schedules] = await pool.query(
      `SELECT day_of_week, location, start_time, end_time
       FROM practice_schedules
       WHERE is_active = 1
       ORDER BY day_of_week, location`
    );

    // Build day map
    const days = {};
    const daysInMonth = endDate.getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = dateObj.getDay(); // 0=Sun, 1=Mon, etc.

      // Find scheduled locations for this day of week
      const scheduledLocs = schedules
        .filter(s => s.day_of_week === dayOfWeek)
        .map(s => normalizeLoc(s.location));

      // Find actual events for this date
      const dateEvents = events.filter(e => {
        const ed = new Date(e.event_date);
        return ed.getDate() === d;
      });

      const eventLocs = dateEvents.map(e => e.location);
      const allLocs = [...new Set([...scheduledLocs, ...eventLocs])];

      if (allLocs.length > 0) {
        const totalPatients = dateEvents.reduce((sum, e) => sum + (e.patient_count || 0), 0);
        days[dateStr] = {
          locations: allLocs,
          totalPatients,
          events: dateEvents.map(e => ({
            location: e.location,
            patient_count: e.patient_count,
            completed_count: e.completed_count,
            sync_status: e.sync_status
          }))
        };
      }
    }

    return days;
  }

  /**
   * Get day detail with all locations and patients
   */
  async getDayDetail(date) {
    // Get events for this date
    const [events] = await pool.query(
      `SELECT * FROM docboard_events WHERE event_date = ? ORDER BY location`,
      [date]
    );

    // Get patients for each event
    const locations = [];
    for (const event of events) {
      const [patients] = await pool.query(
        `SELECT * FROM docboard_patients WHERE event_id = ? ORDER BY slot_number, slot_time`,
        [event.id]
      );
      locations.push({
        location: event.location,
        start_time: event.start_time,
        end_time: event.end_time,
        patient_count: event.patient_count,
        completed_count: event.completed_count,
        sync_status: event.sync_status,
        last_synced_at: event.last_synced_at,
        is_disabled: event.is_disabled,
        patients
      });
    }

    // Also check practice_schedules for locations without events
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();
    const [schedules] = await pool.query(
      `SELECT location, start_time, end_time
       FROM practice_schedules
       WHERE day_of_week = ? AND is_active = 1`,
      [dayOfWeek]
    );

    const existingLocs = locations.map(l => l.location);
    for (const sch of schedules) {
      const normalizedLoc = normalizeLoc(sch.location);
      if (!existingLocs.includes(normalizedLoc)) {
        locations.push({
          location: normalizedLoc,
          start_time: sch.start_time,
          end_time: sch.end_time,
          patient_count: 0,
          completed_count: 0,
          sync_status: 'pending',
          last_synced_at: null,
          patients: []
        });
      }
    }

    return { date, locations };
  }

  /**
   * Get today's data (shorthand)
   */
  async getToday() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return this.getDayDetail(todayStr);
  }

  /**
   * Get patients for a specific date and location
   */
  async getPatients(date, location) {
    const [events] = await pool.query(
      `SELECT id FROM docboard_events WHERE event_date = ? AND location = ?`,
      [date, location]
    );

    if (events.length === 0) return [];

    const [patients] = await pool.query(
      `SELECT * FROM docboard_patients WHERE event_id = ? ORDER BY slot_number, slot_time`,
      [events[0].id]
    );

    return patients;
  }

  /**
   * Sync internal data (klinik_private) from sunday_appointments
   */
  async syncInternal(date) {
    const location = 'klinik_private';

    try {
      // Get appointments for this date
      const [appointments] = await pool.query(
        `SELECT sa.id, sa.patient_name, sa.patient_id, sa.slot_number,
                sa.chief_complaint, sa.status,
                scr.mr_id
         FROM sunday_appointments sa
         LEFT JOIN sunday_clinic_records scr ON sa.id = scr.appointment_id
         WHERE sa.appointment_date = ?
         ORDER BY sa.slot_number`,
        [date]
      );

      // Upsert event
      const patientCount = appointments.length;
      const completedCount = appointments.filter(a =>
        a.status === 'completed' || a.mr_id
      ).length;

      const [eventResult] = await pool.query(
        `INSERT INTO docboard_events (event_date, location, patient_count, completed_count, source_type, last_synced_at, sync_status)
         VALUES (?, ?, ?, ?, 'internal', NOW(), 'synced')
         ON DUPLICATE KEY UPDATE
           patient_count = VALUES(patient_count),
           completed_count = VALUES(completed_count),
           last_synced_at = NOW(),
           sync_status = 'synced',
           sync_error = NULL`,
        [date, location, patientCount, completedCount]
      );

      const eventId = eventResult.insertId || (
        await pool.query('SELECT id FROM docboard_events WHERE event_date = ? AND location = ?', [date, location])
      )[0][0]?.id;

      if (!eventId) return;

      // Clear old patients and insert fresh
      await pool.query('DELETE FROM docboard_patients WHERE event_id = ?', [eventId]);

      for (const apt of appointments) {
        const visitStatus = apt.status === 'completed' || apt.mr_id ? 'completed'
          : apt.status === 'cancelled' ? 'cancelled'
          : 'scheduled';

        await pool.query(
          `INSERT INTO docboard_patients (event_id, patient_name, patient_id, slot_time, slot_number, chief_complaint, visit_status, source_record_type, source_record_id)
           VALUES (?, ?, ?, NULL, ?, ?, ?, 'sunday_appointment', ?)`,
          [eventId, apt.patient_name, apt.patient_id, apt.slot_number, apt.chief_complaint, visitStatus, String(apt.id)]
        );
      }

      // Also check hospital_appointments for klinik_private
      const [hospitalAppts] = await pool.query(
        `SELECT id, patient_name, patient_id, appointment_time, chief_complaint, status
         FROM appointments
         WHERE appointment_date = ? AND visit_location = ?
         ORDER BY appointment_time`,
        [date, location]
      );

      for (const apt of hospitalAppts) {
        const visitStatus = apt.status === 'completed' ? 'completed'
          : apt.status === 'cancelled' ? 'cancelled'
          : 'scheduled';

        await pool.query(
          `INSERT INTO docboard_patients (event_id, patient_name, patient_id, slot_time, chief_complaint, visit_status, source_record_type, source_record_id)
           VALUES (?, ?, ?, ?, ?, ?, 'appointment', ?)`,
          [eventId, apt.patient_name, apt.patient_id, apt.appointment_time, apt.chief_complaint, visitStatus, String(apt.id)]
        );
      }

      // Update final count
      const [countResult] = await pool.query(
        'SELECT COUNT(*) as cnt FROM docboard_patients WHERE event_id = ?',
        [eventId]
      );
      await pool.query(
        'UPDATE docboard_events SET patient_count = ? WHERE id = ?',
        [countResult[0].cnt, eventId]
      );

      logger.info(`DocBoard: synced internal for ${date}, ${countResult[0].cnt} patients`);
      return { success: true, patientCount: countResult[0].cnt };

    } catch (error) {
      // Mark as failed
      await pool.query(
        `INSERT INTO docboard_events (event_date, location, source_type, sync_status, sync_error, last_synced_at)
         VALUES (?, ?, 'internal', 'failed', ?, NOW())
         ON DUPLICATE KEY UPDATE sync_status = 'failed', sync_error = VALUES(sync_error), last_synced_at = NOW()`,
        [date, location, error.message]
      );
      logger.error(`DocBoard: sync internal failed for ${date}:`, error);
      throw error;
    }
  }

  /**
   * Sync from Medify (RSIA Melinda / RSUD Gambiran)
   */
  async syncMedify(date, source) {
    try {
      const { createSession } = require('./medifyHttpService');
      const session = createSession(source);
      await session.login();

      const patients = await session.searchPatientHistory(date, date);
      await session.close();

      // Upsert event
      const [eventResult] = await pool.query(
        `INSERT INTO docboard_events (event_date, location, patient_count, source_type, last_synced_at, sync_status)
         VALUES (?, ?, ?, 'medify', NOW(), 'synced')
         ON DUPLICATE KEY UPDATE
           patient_count = VALUES(patient_count),
           last_synced_at = NOW(),
           sync_status = 'synced',
           sync_error = NULL`,
        [date, source, patients.length]
      );

      const eventId = eventResult.insertId || (
        await pool.query('SELECT id FROM docboard_events WHERE event_date = ? AND location = ?', [date, source])
      )[0][0]?.id;

      if (!eventId) return;

      // Clear and re-insert patients
      await pool.query('DELETE FROM docboard_patients WHERE event_id = ?', [eventId]);

      for (const p of patients) {
        await pool.query(
          `INSERT INTO docboard_patients (event_id, patient_name, patient_id, chief_complaint, visit_status, source_record_type, source_record_id)
           VALUES (?, ?, ?, ?, 'completed', 'medify', ?)`,
          [eventId, p.patientName || p.name, p.medicalRecordNo || null, p.diagnosis || null, p.id || null]
        );
      }

      logger.info(`DocBoard: synced ${source} for ${date}, ${patients.length} patients`);
      return { success: true, patientCount: patients.length };

    } catch (error) {
      await pool.query(
        `INSERT INTO docboard_events (event_date, location, source_type, sync_status, sync_error, last_synced_at)
         VALUES (?, ?, 'medify', 'failed', ?, NOW())
         ON DUPLICATE KEY UPDATE sync_status = 'failed', sync_error = VALUES(sync_error), last_synced_at = NOW()`,
        [date, source, error.message]
      );
      logger.error(`DocBoard: sync ${source} failed for ${date}:`, error);
      throw error;
    }
  }

  /**
   * Receive data from Evo Chrome extension push
   */
  async syncEvoPush(date, patients) {
    const location = 'rs_bhayangkara';

    try {
      const [eventResult] = await pool.query(
        `INSERT INTO docboard_events (event_date, location, patient_count, source_type, last_synced_at, sync_status)
         VALUES (?, ?, ?, 'evo_push', NOW(), 'synced')
         ON DUPLICATE KEY UPDATE
           patient_count = VALUES(patient_count),
           last_synced_at = NOW(),
           sync_status = 'synced',
           sync_error = NULL`,
        [date, location, patients.length]
      );

      const eventId = eventResult.insertId || (
        await pool.query('SELECT id FROM docboard_events WHERE event_date = ? AND location = ?', [date, location])
      )[0][0]?.id;

      if (!eventId) return;

      await pool.query('DELETE FROM docboard_patients WHERE event_id = ?', [eventId]);

      for (let i = 0; i < patients.length; i++) {
        const p = patients[i];
        await pool.query(
          `INSERT INTO docboard_patients (event_id, patient_name, patient_id, slot_number, chief_complaint, visit_status, source_record_type, source_record_id)
           VALUES (?, ?, ?, ?, ?, ?, 'evo', ?)`,
          [eventId, p.name, p.id || null, i + 1, p.complaint || null, p.status || 'scheduled', p.recordId || null]
        );
      }

      logger.info(`DocBoard: synced evo push for ${date}, ${patients.length} patients`);

      // Broadcast via Socket.IO
      if (global.io) {
        global.io.emit('docboard:sync', { location, date, patientCount: patients.length });
      }

      return { success: true, patientCount: patients.length };

    } catch (error) {
      await pool.query(
        `INSERT INTO docboard_events (event_date, location, source_type, sync_status, sync_error, last_synced_at)
         VALUES (?, ?, 'evo_push', 'failed', ?, NOW())
         ON DUPLICATE KEY UPDATE sync_status = 'failed', sync_error = VALUES(sync_error), last_synced_at = NOW()`,
        [date, location, error.message]
      );
      logger.error(`DocBoard: sync evo push failed for ${date}:`, error);
      throw error;
    }
  }

  /**
   * Get sync status for all locations
   */
  async getSyncStatus() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [rows] = await pool.query(
      `SELECT location, sync_status, last_synced_at, sync_error, patient_count
       FROM docboard_events
       WHERE event_date = ?`,
      [todayStr]
    );

    const statuses = {};
    for (const loc of LOCATIONS) {
      const row = rows.find(r => r.location === loc);
      statuses[loc] = row || { sync_status: 'pending', last_synced_at: null, patient_count: 0 };
    }

    return statuses;
  }

  /**
   * Get practice schedules
   */
  async getSchedules() {
    const [rows] = await pool.query(
      `SELECT * FROM practice_schedules WHERE is_active = 1 ORDER BY day_of_week, location`
    );
    return rows;
  }

  /**
   * Get notification history from docboard_notifications
   * Returns global notifications (user_id IS NULL) and user-specific ones
   */
  async getNotifications(userId, limit = 50) {
    const [rows] = await pool.query(
      `SELECT id, user_id, type, title, message, location, reference_id, is_read, created_at
       FROM docboard_notifications
       WHERE user_id IS NULL OR user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId || '', limit]
    );
    return rows;
  }

  /**
   * Mark a single notification as read
   */
  async markNotificationRead(id) {
    await pool.query(
      'UPDATE docboard_notifications SET is_read = 1 WHERE id = ?',
      [id]
    );
  }

  /**
   * Mark all notifications as read for a user (including global ones)
   */
  async markAllNotificationsRead(userId) {
    await pool.query(
      'UPDATE docboard_notifications SET is_read = 1 WHERE user_id IS NULL OR user_id = ?',
      [userId || '']
    );
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as count FROM docboard_notifications
       WHERE is_read = 0 AND (user_id IS NULL OR user_id = ?)`,
      [userId || '']
    );
    return rows[0].count;
  }

  /**
   * Get clinic visit analytics from docboard_events
   */
  async getClinicAnalytics(period) {
    const now = new Date();
    const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let startDate;
    switch (period) {
      case '3m': { const d = new Date(now); d.setMonth(d.getMonth() - 3); startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; break; }
      case '6m': { const d = new Date(now); d.setMonth(d.getMonth() - 6); startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; break; }
      case '1y': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; break; }
      default: { const d = new Date(now); d.setDate(d.getDate() - 30); startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    }

    // Total patients & completed
    const [totals] = await pool.query(
      `SELECT SUM(patient_count) as total_patients, SUM(completed_count) as total_completed, COUNT(*) as total_events
       FROM docboard_events WHERE event_date BETWEEN ? AND ? AND is_disabled = 0`,
      [startDate, endDate]
    );
    const totalPatients = totals[0].total_patients || 0;
    const totalCompleted = totals[0].total_completed || 0;
    const completionRate = totalPatients > 0 ? Math.round((totalCompleted / totalPatients) * 100) : 0;

    // By location
    const [byLocation] = await pool.query(
      `SELECT location, SUM(patient_count) as count, SUM(completed_count) as completed
       FROM docboard_events WHERE event_date BETWEEN ? AND ? AND is_disabled = 0
       GROUP BY location ORDER BY count DESC`,
      [startDate, endDate]
    );

    // By month
    const [byMonth] = await pool.query(
      `SELECT YEAR(event_date) as year, MONTH(event_date) as month, SUM(patient_count) as count
       FROM docboard_events WHERE event_date BETWEEN ? AND ? AND is_disabled = 0
       GROUP BY year, month ORDER BY year, month`,
      [startDate, endDate]
    );

    // Daily average
    const [dayCount] = await pool.query(
      `SELECT COUNT(DISTINCT event_date) as days FROM docboard_events
       WHERE event_date BETWEEN ? AND ? AND is_disabled = 0 AND patient_count > 0`,
      [startDate, endDate]
    );
    const activeDays = dayCount[0].days || 1;
    const avgPerDay = Math.round(totalPatients / activeDays * 10) / 10;

    return {
      period, startDate, endDate,
      totalPatients, totalCompleted, completionRate,
      avgPerDay, activeDays,
      byLocation: byLocation.map(r => ({ location: r.location, count: r.count, completed: r.completed })),
      byMonth: byMonth.map(r => ({ year: r.year, month: r.month, count: r.count }))
    };
  }

  /**
   * Get/set notification preferences for a user
   */
  async getPreferences(userId) {
    const [rows] = await pool.query(
      'SELECT preferences FROM docboard_preferences WHERE user_id = ?',
      [userId]
    );
    if (rows.length === 0) {
      return { notify_new_booking: true, notify_status_change: true, notify_reminder: true, notify_sync_failure: true };
    }
    const prefs = typeof rows[0].preferences === 'string' ? JSON.parse(rows[0].preferences) : rows[0].preferences;
    return prefs;
  }

  async updatePreferences(userId, preferences) {
    await pool.query(
      `INSERT INTO docboard_preferences (user_id, preferences) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE preferences = VALUES(preferences)`,
      [userId, JSON.stringify(preferences)]
    );
    return preferences;
  }

  /**
   * Register push token
   */
  async registerPushToken(userId, platform, endpoint, p256dh, authKey) {
    await pool.query(
      `INSERT INTO docboard_push_tokens (user_id, platform, endpoint, p256dh, auth_key)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         platform = VALUES(platform),
         p256dh = VALUES(p256dh),
         auth_key = VALUES(auth_key),
         updated_at = NOW()`,
      [userId, platform, endpoint, p256dh, authKey]
    );
  }

  /**
   * Unregister push token
   */
  async unregisterPushToken(endpoint) {
    await pool.query('DELETE FROM docboard_push_tokens WHERE endpoint = ?', [endpoint]);
  }
}

module.exports = new DocBoardService();
