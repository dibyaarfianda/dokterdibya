const pool = require('../db');
const logger = require('../utils/logger');

class SurgeryService {

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
      `SELECT id, full_name, birth_date, phone, whatsapp, allergy, medical_history, husband_name
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
        medical_history: patient.medical_history || '',
        husband_name: patient.husband_name || ''
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

    return rows.map(r => ({
      ...r,
      team_members: typeof r.team_members === 'string' ? JSON.parse(r.team_members) : r.team_members
    }));
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

    const row = rows[0];
    row.team_members = typeof row.team_members === 'string' ? JSON.parse(row.team_members) : row.team_members;
    return row;
  }

  async createSurgery(data, userId) {
    const {
      patient_name, patient_age, patient_id, mr_id,
      diagnosis, lab_results, radiology_results, usg_results,
      operation_type_id, operation_type_other,
      location, surgery_date, surgery_time, estimated_duration_min,
      team_members, special_notes
    } = data;

    const [result] = await pool.query(
      `INSERT INTO surgery_schedules
       (patient_name, patient_age, patient_id, mr_id,
        diagnosis, lab_results, radiology_results, usg_results,
        operation_type_id, operation_type_other,
        location, surgery_date, surgery_time, estimated_duration_min,
        team_members, special_notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient_name, patient_age || null, patient_id || null, mr_id || null,
        diagnosis, lab_results || null, radiology_results || null, usg_results || null,
        operation_type_id, operation_type_other || null,
        location, surgery_date, surgery_time || null, estimated_duration_min || null,
        team_members ? JSON.stringify(team_members) : null,
        special_notes || null, userId || null
      ]
    );

    logger.info(`Surgery scheduled: ${patient_name} - ${surgery_date} at ${location}`, { id: result.insertId });
    return this.getSurgeryById(result.insertId);
  }

  async updateSurgery(id, data) {
    const fields = [];
    const values = [];

    const allowedFields = [
      'patient_name', 'patient_age', 'patient_id', 'mr_id',
      'diagnosis', 'lab_results', 'radiology_results', 'usg_results',
      'operation_type_id', 'operation_type_other',
      'location', 'surgery_date', 'surgery_time', 'estimated_duration_min',
      'special_notes', 'post_op_notes', 'status', 'cancellation_reason'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    // Handle team_members separately (JSON)
    if (data.team_members !== undefined) {
      fields.push('team_members = ?');
      values.push(JSON.stringify(data.team_members));
    }

    if (fields.length === 0) return this.getSurgeryById(id);

    values.push(id);
    await pool.query(
      `UPDATE surgery_schedules SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    logger.info(`Surgery updated: #${id}`);
    return this.getSurgeryById(id);
  }

  async updateStatus(id, status, reason) {
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

    return rows.map(r => ({
      ...r,
      team_members: typeof r.team_members === 'string' ? JSON.parse(r.team_members) : r.team_members
    }));
  }

  async getTomorrowSurgeries() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    return this.getDaySurgeries(dateStr);
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
}

module.exports = new SurgeryService();
