const pool = require('../db');
const logger = require('../utils/logger');

class SurgeryService {

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
