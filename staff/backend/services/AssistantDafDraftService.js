'use strict';

const crypto = require('crypto');
const { encryptText, decryptText } = require('./AssistantDafCrypto');
const { parseScheduleMessage, validateConfirmedDraft } = require('./AssistantDafParsing');
const { snapshot, version } = require('./AssistantDafScheduleState');

function fail(code, statusCode = 400) {
  const error = new Error(code);
  error.statusCode = statusCode;
  return error;
}

function cleaned(value, max) {
  return String(value || '').trim().slice(0, max);
}

async function syncTreatmentAlarm(connection, ownerId, scheduleId, input, action) {
  if (action === 'cancel' || input.space !== 'tindakan') {
    await connection.query(
      `UPDATE assistant_daf_reminders SET status = 'cancelled'
       WHERE user_id = ? AND schedule_id = ?`,
      [ownerId, String(scheduleId)]
    );
    return;
  }
  await connection.query(`INSERT INTO assistant_daf_reminders (schedule_id, user_id, schedule_version, reminder_at)
    VALUES (?, ?, ?, DATE_SUB(CONCAT(?, ' 09:00:00'), INTERVAL 1 DAY))
    ON DUPLICATE KEY UPDATE schedule_version = VALUES(schedule_version), reminder_at = VALUES(reminder_at),
      status = 'scheduled', attempts = 0, sent_at = NULL`, [scheduleId, ownerId, version(input), input.schedule_date]);
}

class AssistantDafDraftService {
  constructor({ db, key, context }) {
    this.db = db;
    this.key = key;
    this.context = context;
  }

  async transaction(work) {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  async createManualDraft(ownerId, sourceText) {
    if (typeof sourceText !== 'string' || !sourceText.trim()) throw fail('PESAN_KOSONG');
    if (sourceText.length > 10000) throw fail('PESAN_TERLALU_PANJANG');
    const id = crypto.randomUUID();
    const proposal = parseScheduleMessage(sourceText);
    const sealed = encryptText(JSON.stringify({ source_text: sourceText, proposal }), this.key, ownerId, id);
    await this.transaction(async (connection) => {
    await connection.query(
      `INSERT INTO assistant_daf_drafts
       (id, user_id, source_kind, encrypted_payload, payload_iv, payload_tag, source_expires_at)
       VALUES (?, ?, 'manual_share', ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
      [id, ownerId, sealed.ciphertext, sealed.iv, sealed.tag]
    );
    await connection.query(
      'INSERT INTO assistant_daf_audit (user_id, draft_id, event_type) VALUES (?, ?, ?)',
      [ownerId, id, 'draft_created']
    );
    });
    return { id, status: 'pending', proposal, source_kind: 'manual_share' };
  }

  readRow(row) {
    const payload = row.encrypted_payload ? JSON.parse(decryptText({
      ciphertext: row.encrypted_payload, iv: row.payload_iv, tag: row.payload_tag
    }, this.key, row.user_id, row.id)) : null;
    return {
      id: row.id,
      status: row.status,
      source_kind: row.source_kind,
      source_text: payload?.source_text || '',
      proposal: payload?.proposal || null,
      source_chat: payload?.source_chat || null,
      notification_truncated: Boolean(payload?.truncated),
      ai_status: row.ai_status || null,
      ai_review: payload?.ai_review || null,
      schedule_id: row.schedule_id || null,
      created_at: row.created_at
    };
  }

  async listDrafts(ownerId) {
    const [rows] = await this.db.query(
      `SELECT * FROM assistant_daf_drafts
       WHERE user_id = ? AND status = 'pending' AND source_expires_at > NOW()
       ORDER BY created_at DESC LIMIT 100`, [ownerId]
    );
    return rows.map((row) => this.readRow(row));
  }

  async getDraft(ownerId, id) {
    const [rows] = await this.db.query(
      'SELECT * FROM assistant_daf_drafts WHERE id = ? AND user_id = ? LIMIT 1', [id, ownerId]
    );
    return rows[0] ? this.readRow(rows[0]) : null;
  }

  async ignoreDraft(ownerId, id) {
    await this.transaction(async (connection) => {
    const [result] = await connection.query(
      `UPDATE assistant_daf_drafts SET status = 'ignored', decision_at = NOW()
       WHERE id = ? AND user_id = ? AND status = 'pending'`, [id, ownerId]
    );
    if (!result.affectedRows) throw fail('USULAN_TIDAK_TERSEDIA', 409);
    await connection.query(
      'INSERT INTO assistant_daf_audit (user_id, draft_id, event_type) VALUES (?, ?, ?)',
      [ownerId, id, 'draft_ignored']
    );
    });
    return { id, status: 'ignored' };
  }

  async resolvePatient(connection, input) {
    if (input.space !== 'tindakan') return null;
    const facilityByLocation = { Melinda: 'rsia_melinda', Gambiran: 'rsud_gambiran', Bhayangkara: 'rs_bhayangkara' };
    const facility = facilityByLocation[input.location];
    if (input.patient_ref_type !== 'hospital_mr' || !facility || input.patient_facility !== facility) {
      throw fail('IDENTITAS_RM_FASILITAS_TIDAK_COCOK', 422);
    }
    const mr = cleaned(input.patient_ref_value, 64);
    if (this.context) {
      const patient = await this.context.patient(facility, mr);
      if (input.patient_name && input.patient_name !== patient.full_name) throw fail('Nama pasien berubah. Cari ulang nomor RM sebelum mengonfirmasi.', 409);
      return { ref_type: 'hospital_mr', ref_value: mr, facility, patient_id: `${facility}:${patient.id}`, name: patient.full_name };
    }
    const [rows] = await connection.query(
      `SELECT DISTINCT p.id, p.full_name FROM patient_external_ids x
       JOIN patients p ON p.id = x.patient_id
       WHERE x.source_system = 'COMM' AND x.facility = ? AND x.hospital_mr_id = ? LIMIT 2`,
      [facility, mr]
    );
    if (rows.length !== 1) throw fail('IDENTITAS_PASIEN_TIDAK_DITEMUKAN', 422);
    return { ref_type: 'hospital_mr', ref_value: mr, facility, patient_id: String(rows[0].id), name: rows[0].full_name };
  }

  async confirmDraft(ownerId, id, edited) {
    const action = edited?.action;
    if (!['create', 'update', 'cancel'].includes(action)) throw fail('TINDAKAN_TIDAK_VALID');
    const input = {
      action,
      space: edited.space,
      agenda: cleaned(edited.agenda, 255),
      category: cleaned(edited.category, 80),
      schedule_date: edited.schedule_date,
      start_time: edited.start_time,
      end_time: cleaned(edited.end_time, 5),
      location: cleaned(edited.location, 64),
      patient_ref_type: edited.patient_ref_type,
      patient_ref_value: edited.patient_ref_value,
      patient_facility: edited.patient_facility,
      patient_name: cleaned(edited.patient_name, 255),
      target_schedule_id: edited.target_schedule_id
    };
    if (action !== 'cancel') {
      const errors = validateConfirmedDraft(input);
      if (errors.length) throw fail(errors.join('; '), 422);
    }
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const [draftRows] = await connection.query(
        `SELECT * FROM assistant_daf_drafts
         WHERE id = ? AND user_id = ? AND status = 'pending' AND source_expires_at > NOW() FOR UPDATE`,
        [id, ownerId]
      );
      if (draftRows.length !== 1) throw fail('USULAN_TIDAK_TERSEDIA', 409);

      let existing = null;
      if (action !== 'create') {
        const targetId = Number(input.target_schedule_id);
        if (!Number.isSafeInteger(targetId) || targetId < 1) throw fail('JADWAL_TARGET_DIPERLUKAN', 422);
        const [targetRows] = await connection.query(
          `SELECT * FROM docboard_space_schedules WHERE id = ? AND user_id = ? FOR UPDATE`,
          [targetId, ownerId]
        );
        if (targetRows.length !== 1 || targetRows[0].status === 'cancelled') throw fail('JADWAL_TARGET_TIDAK_TERSEDIA', 409);
        existing = targetRows[0];
        if (!/^[a-f0-9]{64}$/.test(String(edited.target_version || '')) || version(existing) !== edited.target_version) {
          throw fail('JADWAL_BERUBAH_MUAT_ULANG_DAN_TINJAU', 409);
        }
        if (action === 'update' && existing.space !== input.space) throw fail('JENIS_JADWAL_BERBEDA', 422);
      }

      const patient = action === 'cancel' ? null : await this.resolvePatient(connection, input);
      if (existing?.space === 'tindakan') {
        if (action === 'update') {
          if (existing.patient_ref_type !== patient.ref_type || existing.patient_ref_value !== patient.ref_value
            || existing.patient_facility !== patient.facility) throw fail('IDENTITAS_TARGET_BERBEDA', 409);
        } else await this.resolvePatient(connection, existing);
      }
      let scheduleId;
      if (action === 'create' || action === 'update') {
        if (input.space === 'tindakan') {
          const [duplicates] = await connection.query(
            `SELECT id FROM docboard_space_schedules
             WHERE space = 'tindakan' AND patient_ref_type = ? AND patient_ref_value = ?
               AND patient_facility = ? AND category = ? AND schedule_date = ? AND status <> 'cancelled'
               AND id <> ? LIMIT 1`,
            [patient.ref_type, patient.ref_value, patient.facility, input.category, input.schedule_date, existing?.id || 0]
          );
          if (duplicates.length) throw fail('JADWAL_DUPLIKAT_PERLU_DITINJAU', 409);
          const [surgeries] = await connection.query(
            `SELECT id FROM surgery_schedules WHERE mr_id = ? AND location = ? AND surgery_date = ?
             AND status NOT IN ('cancelled', 'postponed') LIMIT 1`,
            [patient.ref_value, patient.facility, input.schedule_date]
          );
          if (surgeries.length) throw fail('Sudah ada operasi pasien ini pada tanggal dan fasilitas tersebut. Periksa jadwal operasi DocBoard.', 409);
        }
        if (action === 'create') {
          const [result] = await connection.query(
            `INSERT INTO docboard_space_schedules
             (user_id, space, agenda, category, schedule_date, start_time, end_time, location,
              patient_ref_type, patient_ref_value, patient_facility, patient_name, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
            [ownerId, input.space, input.agenda, input.category, input.schedule_date,
              input.start_time, input.end_time || null, input.location || null,
              patient?.ref_type || null, patient?.ref_value || null,
              patient?.facility || null, patient?.name || null]
          );
          scheduleId = result.insertId;
        } else {
          scheduleId = existing.id;
          await connection.query(
            `UPDATE docboard_space_schedules
             SET agenda = ?, category = ?, schedule_date = ?, start_time = ?, end_time = ?, location = ?,
                 patient_ref_type = ?, patient_ref_value = ?, patient_facility = ?, patient_name = ?
             WHERE id = ? AND user_id = ?`,
            [input.agenda, input.category, input.schedule_date, input.start_time, input.end_time || null,
              input.location || null, patient?.ref_type || null, patient?.ref_value || null,
              patient?.facility || null, patient?.name || null,
              scheduleId, ownerId]
          );
        }
      } else {
        scheduleId = existing.id;
        await connection.query(
          `UPDATE docboard_space_schedules SET status = 'cancelled' WHERE id = ? AND user_id = ?`,
          [scheduleId, ownerId]
        );
      }
      const [savedRows] = await connection.query('SELECT * FROM docboard_space_schedules WHERE id = ? AND user_id = ?', [scheduleId, ownerId]);
      const saved = savedRows[0];
      if (input.space === 'tindakan' || existing?.space === 'tindakan') {
        await syncTreatmentAlarm(connection, ownerId, scheduleId, snapshot(saved), action);
      }
      await connection.query(
        `UPDATE assistant_daf_drafts SET status = 'confirmed', schedule_id = ?, decision_at = NOW()
         WHERE id = ? AND user_id = ?`, [scheduleId, id, ownerId]
      );
      const sealedDecision = encryptText(JSON.stringify({ action, before: existing ? snapshot(existing) : null, after: snapshot(saved) }), this.key, ownerId, `${id}:decision`);
      await connection.query(`INSERT INTO assistant_daf_audit
        (user_id, draft_id, schedule_id, event_type, encrypted_payload, payload_iv, payload_tag) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ownerId, id, scheduleId, `schedule_${action}`, sealedDecision.ciphertext, sealedDecision.iv, sealedDecision.tag]);
      // Memory contains only canonical scheduling choices, never message text or patient identity.
      if (['SC', 'Kuret', 'IUD'].includes(input.category)
          && ['Melinda', 'Gambiran', 'Bhayangkara'].includes(input.location)) {
        const proposal = this.readRow(draftRows[0]).proposal || {};
        const decisionKind = proposal.action === input.action
          && proposal.category === input.category && proposal.location === input.location
          ? 'approval' : 'correction';
        await connection.query(
          `INSERT INTO assistant_daf_memory
           (user_id, draft_id, decision_kind, action, category, location) VALUES (?, ?, ?, ?, ?, ?)`,
          [ownerId, id, decisionKind, input.action, input.category, input.location]
        );
      }
      await connection.commit();
      return { id, status: 'confirmed', schedule_id: String(scheduleId), action };
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') throw fail('JADWAL_DUPLIKAT_PERLU_DITINJAU', 409);
      throw error;
    } finally {
      connection.release();
    }
  }

  async purgeExpiredSources() {
    await this.db.query(
      `UPDATE assistant_daf_drafts
       SET encrypted_payload = NULL, payload_iv = NULL, payload_tag = NULL,
           status = IF(status = 'pending', 'expired', status)
       WHERE source_expires_at <= NOW() AND encrypted_payload IS NOT NULL`
    );
  }
}

module.exports = AssistantDafDraftService;
