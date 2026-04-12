const pool = require('../db');
const logger = require('../utils/logger');

class SurgeryService {

  decorateSurgeryRow(row) {
    if (!row) return row;

    return {
      ...row,
      op_display_name: row.operation_type_other || row.op_name_id || row.op_name || '',
      team_members: typeof row.team_members === 'string' ? JSON.parse(row.team_members) : row.team_members
    };
  }

  // =====================================================
  // RM LOOKUP - Fetch patient data from SIMRS
  // =====================================================

  async lookupByMrId(mrId) {
    // 1. Find visit record
    const [records] = await pool.query(
      `SELECT scr.mr_id, scr.patient_id, scr.mr_category, scr.visit_location, scr.created_at
       FROM sunday_clinic_records scr
       WHERE scr.mr_id = ?`,
      [mrId]
    );

    if (records.length === 0) return null;

    const record = records[0];

    // 2. Get patient demographics
    const [patients] = await pool.query(
      `SELECT id, full_name, birth_date, phone, whatsapp, allergy, medical_history
       FROM patients WHERE id = ?`,
      [record.patient_id]
    );

    const patient = patients[0] || {};

    // Calculate age
    let age = null;
    if (patient.birth_date) {
      const bd = new Date(patient.birth_date);
      const now = new Date();
      age = now.getFullYear() - bd.getFullYear();
      if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) {
        age--;
      }
    }

    // 3. Get medical records for this visit (anamnesa, usg, lab, diagnosis, planning)
    const [medRecords] = await pool.query(
      `SELECT record_type, record_data FROM medical_records
       WHERE mr_id = ? AND record_type IN ('anamnesa', 'usg', 'lab', 'diagnosis', 'planning', 'physical_exam')
       ORDER BY created_at DESC`,
      [mrId]
    );

    // Parse record_data JSON
    const byType = {};
    for (const mr of medRecords) {
      let data = mr.record_data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { data = {}; }
      }
      byType[mr.record_type] = data;
    }

    // 4. Build diagnosis summary
    let diagnosis = '';
    if (byType.diagnosis) {
      const dd = byType.diagnosis;
      if (dd.diagnoses && Array.isArray(dd.diagnoses)) {
        diagnosis = dd.diagnoses.map(d => d.text || d.name || d).join(', ');
      } else if (dd.diagnosis) {
        diagnosis = dd.diagnosis;
      } else if (dd.primary_diagnosis) {
        diagnosis = dd.primary_diagnosis;
      }
    }

    // 5. Build lab results summary
    let labResults = '';
    if (byType.lab) {
      const lab = byType.lab;
      if (lab.results && Array.isArray(lab.results)) {
        labResults = lab.results
          .map(r => `${r.test_name || r.name}: ${r.value || r.result}${r.unit ? ' ' + r.unit : ''}`)
          .join('\n');
      } else if (lab.summary) {
        labResults = lab.summary;
      } else if (lab.interpretation) {
        labResults = lab.interpretation;
      }
    }

    // 6. Build USG results summary
    let usgResults = '';
    if (byType.usg) {
      const usg = byType.usg;
      const parts = [];

      if (usg.usg_type) parts.push(`Tipe: ${usg.usg_type}`);
      if (usg.gestational_age_weeks) parts.push(`UK: ${usg.gestational_age_weeks}w${usg.gestational_age_days ? usg.gestational_age_days + 'd' : ''}`);
      if (usg.efw) parts.push(`EFW: ${usg.efw}g`);
      if (usg.bpd) parts.push(`BPD: ${usg.bpd}`);
      if (usg.hc) parts.push(`HC: ${usg.hc}`);
      if (usg.ac) parts.push(`AC: ${usg.ac}`);
      if (usg.fl) parts.push(`FL: ${usg.fl}`);
      if (usg.afi) parts.push(`AFI: ${usg.afi}`);
      if (usg.fetal_heart_rate) parts.push(`FHR: ${usg.fetal_heart_rate} bpm`);
      if (usg.presentation) parts.push(`Presentasi: ${usg.presentation}`);
      if (usg.placenta_location) parts.push(`Plasenta: ${usg.placenta_location}`);
      if (usg.findings) parts.push(`\n${usg.findings}`);

      usgResults = parts.join(', ');
    }

    // 7. Get all RM history for this patient
    const [allVisits] = await pool.query(
      `SELECT scr.mr_id, scr.mr_category, scr.visit_location, scr.created_at
       FROM sunday_clinic_records scr
       WHERE scr.patient_id = ?
       ORDER BY scr.created_at DESC
       LIMIT 20`,
      [record.patient_id]
    );

    return {
      patient: {
        id: record.patient_id,
        name: patient.full_name || '',
        age,
        birth_date: patient.birth_date,
        phone: patient.phone || patient.whatsapp || '',
        allergy: patient.allergy || '',
        medical_history: patient.medical_history || ''
      },
      visit: {
        mr_id: mrId,
        category: record.mr_category,
        location: record.visit_location,
        date: record.created_at
      },
      clinical: {
        diagnosis,
        lab_results: labResults,
        usg_results: usgResults,
        anamnesa: byType.anamnesa || null,
        planning: byType.planning || null
      },
      history: allVisits.map(v => ({
        mr_id: v.mr_id,
        category: v.mr_category,
        location: v.visit_location,
        date: v.created_at
      }))
    };
  }

  async searchPatients(query) {
    const [rows] = await pool.query(
      `SELECT p.id, p.full_name, p.birth_date,
              (SELECT GROUP_CONCAT(scr.mr_id ORDER BY scr.created_at DESC SEPARATOR ', ')
               FROM sunday_clinic_records scr WHERE scr.patient_id = p.id LIMIT 5) as recent_mr_ids,
              (SELECT scr2.mr_id FROM sunday_clinic_records scr2
               WHERE scr2.patient_id = p.id ORDER BY scr2.created_at DESC LIMIT 1) as latest_mr_id,
              (SELECT scr3.created_at FROM sunday_clinic_records scr3
               WHERE scr3.patient_id = p.id ORDER BY scr3.created_at DESC LIMIT 1) as last_visit
       FROM patients p
       WHERE p.full_name LIKE ?
       ORDER BY last_visit DESC
       LIMIT 15`,
      [`%${query}%`]
    );

    return rows.map(r => {
      let age = null;
      if (r.birth_date) {
        const bd = new Date(r.birth_date);
        const now = new Date();
        age = now.getFullYear() - bd.getFullYear();
        if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
      }
      return {
        id: r.id,
        name: r.full_name,
        age,
        latest_mr_id: r.latest_mr_id,
        recent_mr_ids: r.recent_mr_ids,
        last_visit: r.last_visit
      };
    });
  }

  // =====================================================
  // OPERATION TYPES
  // =====================================================

  async getOperationTypes() {
    const [rows] = await pool.query(
      'SELECT * FROM surgery_operation_types WHERE is_active = 1 ORDER BY category, sort_order'
    );
    return rows;
  }

  // =====================================================
  // SURGERY SCHEDULES
  // =====================================================

  async getCalendarMonth(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [rows] = await pool.query(
      `SELECT surgery_date, location, COUNT(*) as count, status
       FROM surgery_schedules
       WHERE surgery_date BETWEEN ? AND ? AND status NOT IN ('cancelled')
       GROUP BY surgery_date, location, status
       ORDER BY surgery_date`,
      [startDate, endDate]
    );

    const days = {};
    for (const row of rows) {
      const d = new Date(row.surgery_date);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!days[dateStr]) {
        days[dateStr] = { total: 0, locations: [], surgeries: [] };
      }
      days[dateStr].total += row.count;
      if (!days[dateStr].locations.includes(row.location)) {
        days[dateStr].locations.push(row.location);
      }
      days[dateStr].surgeries.push({
        location: row.location,
        count: row.count,
        status: row.status
      });
    }

    return days;
  }

  async getDaySurgeries(date) {
    const [rows] = await pool.query(
      `SELECT s.*, ot.code as op_code, ot.name as op_name, ot.name_id as op_name_id, ot.category as op_category
       FROM surgery_schedules s
       JOIN surgery_operation_types ot ON s.operation_type_id = ot.id
       WHERE s.surgery_date = ?
       ORDER BY s.surgery_time, s.created_at`,
      [date]
    );

    return rows.map(r => this.decorateSurgeryRow(r));
  }

  async getSurgeryById(id) {
    const [rows] = await pool.query(
      `SELECT s.*, ot.code as op_code, ot.name as op_name, ot.name_id as op_name_id, ot.category as op_category
       FROM surgery_schedules s
       JOIN surgery_operation_types ot ON s.operation_type_id = ot.id
       WHERE s.id = ?`,
      [id]
    );

    if (rows.length === 0) return null;

    return this.decorateSurgeryRow(rows[0]);
  }

  async createSurgery(data, userId) {
    const {
      patient_name, patient_age, patient_id, mr_id,
      diagnosis, lab_results, radiology_results, usg_results,
      operation_type_id, operation_type_other,
      location, surgery_date, surgery_time, estimated_duration_min,
      anesthesia_type, asa_score, npo_status,
      team_members, special_notes, idempotency_key
    } = data;

    // Idempotency check: if key provided and already exists, return existing record
    if (idempotency_key) {
      const [existing] = await pool.query(
        'SELECT id FROM surgery_schedules WHERE idempotency_key = ?',
        [idempotency_key]
      );
      if (existing.length > 0) {
        logger.info(`Surgery create deduplicated by idempotency_key: ${idempotency_key}`);
        return this.getSurgeryById(existing[0].id);
      }
    }

    const [result] = await pool.query(
      `INSERT INTO surgery_schedules
       (patient_name, patient_age, patient_id, mr_id,
        diagnosis, lab_results, radiology_results, usg_results,
        operation_type_id, operation_type_other,
        location, surgery_date, surgery_time, estimated_duration_min,
        anesthesia_type, asa_score, npo_status,
        team_members, special_notes, created_by, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient_name, patient_age || null, patient_id || null, mr_id || null,
        diagnosis, lab_results || null, radiology_results || null, usg_results || null,
        operation_type_id, operation_type_other || null,
        location, surgery_date, surgery_time || null, estimated_duration_min || null,
        anesthesia_type || null, asa_score || null, npo_status || null,
        team_members ? JSON.stringify(team_members) : null,
        special_notes || null, userId || null, idempotency_key || null
      ]
    );

    logger.info(`Surgery scheduled: ${patient_name} - ${surgery_date} at ${location}`, { id: result.insertId });

    // Audit log
    await this.logAudit(result.insertId, 'created', userId, {
      patient_name,
      operation_type_id,
      operation_type_other: operation_type_other || null,
      location,
      surgery_date
    });

    return this.getSurgeryById(result.insertId);
  }

  async updateSurgery(id, data, userId) {
    const fields = [];
    const values = [];

    const allowedFields = [
      'patient_name', 'patient_age', 'patient_id', 'mr_id',
      'diagnosis', 'lab_results', 'radiology_results', 'usg_results',
      'operation_type_id', 'operation_type_other',
      'location', 'surgery_date', 'surgery_time', 'estimated_duration_min',
      'anesthesia_type', 'asa_score', 'npo_status',
      'special_notes', 'post_op_notes', 'status', 'cancellation_reason'
    ];

    const changedFields = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
        changedFields[field] = data[field];
      }
    }

    // Handle team_members separately (JSON)
    if (data.team_members !== undefined) {
      fields.push('team_members = ?');
      values.push(JSON.stringify(data.team_members));
      changedFields.team_members = '(updated)';
    }

    if (fields.length === 0) return this.getSurgeryById(id);

    values.push(id);
    await pool.query(
      `UPDATE surgery_schedules SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    logger.info(`Surgery updated: #${id}`);

    // Audit log
    await this.logAudit(id, 'updated', userId, changedFields);

    return this.getSurgeryById(id);
  }

  async updateStatus(id, status, reason, userId) {
    const fields = ['status = ?'];
    const values = [status];

    if (reason) {
      fields.push('cancellation_reason = ?');
      values.push(reason);
    }

    values.push(id);
    await pool.query(
      `UPDATE surgery_schedules SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    logger.info(`Surgery #${id} status → ${status}`);

    // Audit log
    const changes = { status };
    if (reason) changes.reason = reason;
    await this.logAudit(id, 'status_changed', userId, changes);

    return this.getSurgeryById(id);
  }

  async deleteSurgery(id) {
    await pool.query('DELETE FROM surgery_schedules WHERE id = ?', [id]);
    logger.info(`Surgery #${id} deleted`);
  }

  async getUpcoming(days = 7) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + days);
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const [rows] = await pool.query(
      `SELECT s.*, ot.code as op_code, ot.name as op_name, ot.name_id as op_name_id, ot.category as op_category
       FROM surgery_schedules s
       JOIN surgery_operation_types ot ON s.operation_type_id = ot.id
       WHERE s.surgery_date BETWEEN ? AND ? AND s.status NOT IN ('cancelled','completed')
       ORDER BY s.surgery_date, s.surgery_time`,
      [todayStr, endStr]
    );

    return rows.map(r => this.decorateSurgeryRow(r));
  }

  async getForExport(startDate, endDate) {
    const [rows] = await pool.query(
      `SELECT s.*, ot.code as op_code, ot.name as op_name, ot.name_id as op_name_id, ot.category as op_category
       FROM surgery_schedules s
       JOIN surgery_operation_types ot ON s.operation_type_id = ot.id
       WHERE s.surgery_date BETWEEN ? AND ? AND s.status != 'cancelled'
       ORDER BY s.surgery_date, s.surgery_time, s.created_at`,
      [startDate, endDate]
    );

    return rows.map(r => this.decorateSurgeryRow(r));
  }

  async getTomorrowSurgeries() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    return this.getDaySurgeries(dateStr);
  }

  // =====================================================
  // AUDIT LOG
  // =====================================================

  async logAudit(surgeryId, action, userId, changes) {
    try {
      await pool.query(
        `INSERT INTO surgery_audit_log (surgery_id, action, user_id, changes)
         VALUES (?, ?, ?, ?)`,
        [surgeryId, action, userId || null, JSON.stringify(changes || {})]
      );
    } catch (err) {
      // Non-blocking — audit failure should not break the main operation
      logger.error(`Audit log failed for surgery #${surgeryId}:`, err.message);
    }
  }

  async getAuditLog(surgeryId) {
    const [rows] = await pool.query(
      `SELECT id, surgery_id, action, user_id, changes, created_at
       FROM surgery_audit_log
       WHERE surgery_id = ?
       ORDER BY created_at DESC`,
      [surgeryId]
    );
    return rows.map(r => ({
      ...r,
      changes: typeof r.changes === 'string' ? JSON.parse(r.changes) : r.changes
    }));
  }

  // =====================================================
  // ANALYTICS
  // =====================================================

  async getAnalytics(period, location) {
    // Calculate date range based on period
    const now = new Date();
    const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let startDate;
    switch (period) {
      case '3m':
        const m3 = new Date(now);
        m3.setMonth(m3.getMonth() - 3);
        startDate = `${m3.getFullYear()}-${String(m3.getMonth() + 1).padStart(2, '0')}-${String(m3.getDate()).padStart(2, '0')}`;
        break;
      case '6m':
        const m6 = new Date(now);
        m6.setMonth(m6.getMonth() - 6);
        startDate = `${m6.getFullYear()}-${String(m6.getMonth() + 1).padStart(2, '0')}-${String(m6.getDate()).padStart(2, '0')}`;
        break;
      case '1y':
        const y1 = new Date(now);
        y1.setFullYear(y1.getFullYear() - 1);
        startDate = `${y1.getFullYear()}-${String(y1.getMonth() + 1).padStart(2, '0')}-${String(y1.getDate()).padStart(2, '0')}`;
        break;
      default: // 30d
        const d30 = new Date(now);
        d30.setDate(d30.getDate() - 30);
        startDate = `${d30.getFullYear()}-${String(d30.getMonth() + 1).padStart(2, '0')}-${String(d30.getDate()).padStart(2, '0')}`;
    }

    const locationFilter = location ? 'AND s.location = ?' : '';
    const params = location ? [startDate, endDate, location] : [startDate, endDate];

    // Total count
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) as total FROM surgery_schedules s WHERE s.surgery_date BETWEEN ? AND ? ${locationFilter}`,
      params
    );
    const total = totalRows[0].total;

    // Count by month
    const [monthlyRows] = await pool.query(
      `SELECT YEAR(s.surgery_date) as yr, MONTH(s.surgery_date) as mo, COUNT(*) as count
       FROM surgery_schedules s
       WHERE s.surgery_date BETWEEN ? AND ? ${locationFilter}
       GROUP BY yr, mo
       ORDER BY yr, mo`,
      params
    );

    // Count by operation type (top 10)
    const [opTypeRows] = await pool.query(
      `SELECT ot.name as op_name, ot.name_id as op_name_id, ot.code as op_code, COUNT(*) as count
       FROM surgery_schedules s
       JOIN surgery_operation_types ot ON s.operation_type_id = ot.id
       WHERE s.surgery_date BETWEEN ? AND ? ${locationFilter}
       GROUP BY s.operation_type_id, ot.name, ot.name_id, ot.code
       ORDER BY count DESC
       LIMIT 10`,
      params
    );

    // Count by status
    const [statusRows] = await pool.query(
      `SELECT s.status, COUNT(*) as count
       FROM surgery_schedules s
       WHERE s.surgery_date BETWEEN ? AND ? ${locationFilter}
       GROUP BY s.status`,
      params
    );

    // Count by location
    const [locationRows] = await pool.query(
      `SELECT s.location, COUNT(*) as count
       FROM surgery_schedules s
       WHERE s.surgery_date BETWEEN ? AND ? ${locationFilter}
       GROUP BY s.location
       ORDER BY count DESC`,
      params
    );

    // Calculate rates
    const statusMap = {};
    for (const row of statusRows) {
      statusMap[row.status] = row.count;
    }
    const completedCount = statusMap['completed'] || 0;
    const cancelledCount = statusMap['cancelled'] || 0;
    const postponedCount = statusMap['postponed'] || 0;

    const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    const cancelRate = total > 0 ? Math.round((cancelledCount / total) * 100) : 0;
    const postponeRate = total > 0 ? Math.round((postponedCount / total) * 100) : 0;

    // Top operation name
    const topOp = opTypeRows.length > 0
      ? (opTypeRows[0].op_name_id || opTypeRows[0].op_name)
      : '-';

    // Average per month
    const monthCount = monthlyRows.length || 1;
    const avgPerMonth = Math.round(total / monthCount);

    return {
      period,
      startDate,
      endDate,
      total,
      completionRate,
      cancelRate,
      postponeRate,
      topOperation: topOp,
      avgPerMonth,
      byMonth: monthlyRows.map(r => ({
        year: r.yr,
        month: r.mo,
        count: r.count
      })),
      byOperationType: opTypeRows.map(r => ({
        name: r.op_name_id || r.op_name,
        code: r.op_code,
        count: r.count
      })),
      byStatus: statusRows.map(r => ({
        status: r.status,
        count: r.count
      })),
      byLocation: locationRows.map(r => ({
        location: r.location,
        count: r.count
      }))
    };
  }

  // =====================================================
  // OUTCOME ANALYTICS
  // =====================================================

  async getOutcomeAnalytics(period) {
    const now = new Date();
    const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let startDate;
    switch (period) {
      case '3m': { const d = new Date(now); d.setMonth(d.getMonth() - 3); startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; break; }
      case '6m': { const d = new Date(now); d.setMonth(d.getMonth() - 6); startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; break; }
      case '1y': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; break; }
      default: { const d = new Date(now); d.setDate(d.getDate() - 30); startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    }

    // Total outcomes recorded
    const [totals] = await pool.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN o.complication_grade = 'none' THEN 1 ELSE 0 END) as no_complication,
              SUM(CASE WHEN o.readmission = 1 THEN 1 ELSE 0 END) as readmissions,
              AVG(o.actual_duration_min) as avg_duration,
              AVG(o.estimated_blood_loss) as avg_blood_loss
       FROM surgery_outcomes o
       JOIN surgery_schedules s ON o.surgery_id = s.id
       WHERE s.surgery_date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    // By complication grade
    const [byGrade] = await pool.query(
      `SELECT o.complication_grade, COUNT(*) as count
       FROM surgery_outcomes o
       JOIN surgery_schedules s ON o.surgery_id = s.id
       WHERE s.surgery_date BETWEEN ? AND ?
       GROUP BY o.complication_grade ORDER BY count DESC`,
      [startDate, endDate]
    );

    // By wound class
    const [byWound] = await pool.query(
      `SELECT o.wound_class, COUNT(*) as count
       FROM surgery_outcomes o
       JOIN surgery_schedules s ON o.surgery_id = s.id
       WHERE s.surgery_date BETWEEN ? AND ? AND o.wound_class IS NOT NULL
       GROUP BY o.wound_class ORDER BY count DESC`,
      [startDate, endDate]
    );

    // Monthly trend
    const [byMonth] = await pool.query(
      `SELECT YEAR(s.surgery_date) as year, MONTH(s.surgery_date) as month,
              COUNT(*) as total,
              SUM(CASE WHEN o.complication_grade != 'none' THEN 1 ELSE 0 END) as complications
       FROM surgery_outcomes o
       JOIN surgery_schedules s ON o.surgery_id = s.id
       WHERE s.surgery_date BETWEEN ? AND ?
       GROUP BY year, month ORDER BY year, month`,
      [startDate, endDate]
    );

    const total = totals[0].total || 0;
    const noComplicationRate = total > 0 ? Math.round((totals[0].no_complication / total) * 100) : 0;

    return {
      period, startDate, endDate, total,
      noComplicationRate,
      readmissions: totals[0].readmissions || 0,
      avgDuration: totals[0].avg_duration ? Math.round(totals[0].avg_duration) : null,
      avgBloodLoss: totals[0].avg_blood_loss ? Math.round(totals[0].avg_blood_loss) : null,
      byGrade: byGrade.map(r => ({ grade: r.complication_grade, count: r.count })),
      byWound: byWound.map(r => ({ woundClass: r.wound_class, count: r.count })),
      byMonth: byMonth.map(r => ({ year: r.year, month: r.month, total: r.total, complications: r.complications }))
    };
  }

  // =====================================================
  // EXTERNAL STAFF
  // =====================================================

  async getExternalStaff() {
    const [rows] = await pool.query(
      'SELECT * FROM surgery_external_staff WHERE is_active = 1 ORDER BY name'
    );
    return rows;
  }

  async addExternalStaff(data) {
    const { name, role, phone, hospital_affiliation, notes } = data;
    const [result] = await pool.query(
      `INSERT INTO surgery_external_staff (name, role, phone, hospital_affiliation, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [name, role || 'Asisten', phone || null, hospital_affiliation || null, notes || null]
    );
    logger.info(`External staff added: ${name} (${role})`);
    return { id: result.insertId, name, role };
  }

  async updateExternalStaff(id, data) {
    const fields = [];
    const values = [];
    for (const field of ['name', 'role', 'phone', 'hospital_affiliation', 'notes', 'is_active']) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }
    if (fields.length === 0) return;

    values.push(id);
    await pool.query(`UPDATE surgery_external_staff SET ${fields.join(', ')} WHERE id = ?`, values);
    logger.info(`External staff #${id} updated`);
  }

  // =====================================================
  // TEMPLATES
  // =====================================================

  async getTemplates(userId) {
    const [rows] = await pool.query(
      'SELECT id, name, default_data, created_at FROM surgery_templates WHERE user_id = ? ORDER BY name',
      [userId]
    );
    return rows.map(r => ({
      ...r,
      default_data: typeof r.default_data === 'string' ? JSON.parse(r.default_data) : r.default_data
    }));
  }

  async createTemplate(userId, name, defaultData) {
    const [result] = await pool.query(
      'INSERT INTO surgery_templates (user_id, name, default_data) VALUES (?, ?, ?)',
      [userId, name, JSON.stringify(defaultData)]
    );
    logger.info(`Surgery template created: "${name}" by ${userId}`);
    return { id: result.insertId, name, default_data: defaultData };
  }

  async deleteTemplate(id, userId) {
    await pool.query('DELETE FROM surgery_templates WHERE id = ? AND user_id = ?', [id, userId]);
    logger.info(`Surgery template #${id} deleted`);
  }

  // =====================================================
  // PRE-OP CHECKLIST
  // =====================================================

  static DEFAULT_CHECKLIST_ITEMS = [
    { key: 'informed_consent', label: 'Informed consent ditandatangani', checked: false },
    { key: 'lab_results', label: 'Hasil lab lengkap', checked: false },
    { key: 'blood_type', label: 'Golongan darah & crossmatch', checked: false },
    { key: 'npo_verified', label: 'Status puasa (NPO) diverifikasi', checked: false },
    { key: 'anesthesia_assessment', label: 'Asesmen anestesi selesai', checked: false },
    { key: 'site_marking', label: 'Marking lokasi operasi', checked: false },
    { key: 'iv_access', label: 'Akses IV terpasang', checked: false },
    { key: 'allergy_check', label: 'Alergi diperiksa', checked: false },
    { key: 'instruments_ready', label: 'Instrumen & alat siap', checked: false },
    { key: 'blood_available', label: 'Darah tersedia (jika perlu)', checked: false }
  ];

  async getChecklist(surgeryId) {
    const [rows] = await pool.query(
      'SELECT * FROM surgery_checklists WHERE surgery_id = ?',
      [surgeryId]
    );
    if (rows.length === 0) {
      return { surgery_id: surgeryId, items: SurgeryService.DEFAULT_CHECKLIST_ITEMS, is_new: true };
    }
    const row = rows[0];
    row.items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
    return row;
  }

  async updateChecklist(surgeryId, items, userId) {
    await pool.query(
      `INSERT INTO surgery_checklists (surgery_id, items, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE items = VALUES(items), updated_by = VALUES(updated_by)`,
      [surgeryId, JSON.stringify(items), userId]
    );
    logger.info(`Checklist updated for surgery #${surgeryId}`);
    return this.getChecklist(surgeryId);
  }

  // =====================================================
  // OR BOARD
  // =====================================================

  async getORBoard(date) {
    const now = new Date();
    const dateStr = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [rows] = await pool.query(
      `SELECT s.id, s.patient_name, s.patient_age, s.status, s.location,
              s.surgery_time, s.estimated_duration_min, s.anesthesia_type, s.asa_score,
              s.created_at, s.updated_at,
              ot.code as op_code, ot.name as op_name, ot.name_id as op_name_id, ot.category as op_category
       FROM surgery_schedules s
       JOIN surgery_operation_types ot ON s.operation_type_id = ot.id
       WHERE s.surgery_date = ? AND s.status NOT IN ('cancelled')
       ORDER BY s.surgery_time, s.created_at`,
      [dateStr]
    );

    // Group by location
    const byLocation = {};
    for (const row of rows) {
      if (!byLocation[row.location]) byLocation[row.location] = [];
      byLocation[row.location].push(row);
    }

    return {
      date: dateStr,
      last_updated: new Date().toISOString(),
      total: rows.length,
      byLocation
    };
  }

  // =====================================================
  // POST-OP OUTCOMES
  // =====================================================

  async getOutcome(surgeryId) {
    const [rows] = await pool.query(
      'SELECT * FROM surgery_outcomes WHERE surgery_id = ?',
      [surgeryId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async saveOutcome(surgeryId, data, userId) {
    const {
      complication_grade, wound_class, estimated_blood_loss, actual_duration_min,
      disposition, readmission, readmission_reason, follow_up_date, follow_up_notes, notes
    } = data;

    await pool.query(
      `INSERT INTO surgery_outcomes
       (surgery_id, complication_grade, wound_class, estimated_blood_loss, actual_duration_min,
        disposition, readmission, readmission_reason, follow_up_date, follow_up_notes, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         complication_grade = VALUES(complication_grade), wound_class = VALUES(wound_class),
         estimated_blood_loss = VALUES(estimated_blood_loss), actual_duration_min = VALUES(actual_duration_min),
         disposition = VALUES(disposition), readmission = VALUES(readmission),
         readmission_reason = VALUES(readmission_reason), follow_up_date = VALUES(follow_up_date),
         follow_up_notes = VALUES(follow_up_notes), notes = VALUES(notes), recorded_by = VALUES(recorded_by)`,
      [
        surgeryId,
        complication_grade || 'none', wound_class || null,
        estimated_blood_loss || null, actual_duration_min || null,
        disposition || null, readmission ? 1 : 0,
        readmission_reason || null, follow_up_date || null,
        follow_up_notes || null, notes || null, userId || null
      ]
    );

    logger.info(`Outcome saved for surgery #${surgeryId}`);
    await this.logAudit(surgeryId, 'updated', userId, { outcome: complication_grade });
    return this.getOutcome(surgeryId);
  }
}

module.exports = new SurgeryService();
