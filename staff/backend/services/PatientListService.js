class PatientListService {
    constructor(db) {
        if (!db || typeof db.query !== 'function') throw new Error('PatientListService requires a database pool');
        this.db = db;
    }

    decodeCursor(cursor) {
        if (!cursor) return null;
        try {
            return JSON.parse(Buffer.from(cursor, 'base64url').toString());
        } catch {
            return null;
        }
    }

    async listBasic(options = {}) {
        const search = String(options.search || '').trim();
        const sort = options.sort === 'name' ? 'name' : 'recent';
        const lastVisitLocation = String(options.last_visit_location || '').trim();
        const hospital = String(options.hospital || '').trim();
        const requestedLimit = Number.parseInt(options.limit, 10);
        const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
            ? Math.min(requestedLimit, 1000)
            : null;
        const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
        const cursor = this.decodeCursor(options.cursor);
        const where = [
            "p.status = 'active'",
            `NOT EXISTS (
                SELECT 1 FROM patient_merge_quarantine pmq
                WHERE pmq.source_patient_id = p.id
                  AND pmq.status = 'quarantined'
            )`
        ];
        const params = [];

        if (hospital) {
            where.push(`EXISTS (
                SELECT 1 FROM appointments a
                WHERE a.patient_id = p.id
                  AND a.hospital_location = ?
            )`);
            params.push(hospital);
        } else if (lastVisitLocation === 'no_visit') {
            where.push('NOT EXISTS (SELECT 1 FROM sunday_clinic_records scr WHERE scr.patient_id = p.id)');
        } else if (lastVisitLocation) {
            where.push(`EXISTS (
                SELECT 1
                FROM sunday_clinic_records scr
                WHERE scr.patient_id = p.id
                  AND scr.visit_location = ?
            )`);
            params.push(lastVisitLocation);
        }

        if (search) {
            where.push('(p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)');
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        if (cursor) {
            if (sort === 'name' && cursor.fn && cursor.id) {
                where.push('(p.full_name > ? OR (p.full_name = ? AND p.id > ?))');
                params.push(cursor.fn, cursor.fn, cursor.id);
            } else if (cursor.created_at && cursor.id) {
                where.push('(p.created_at < ? OR (p.created_at = ? AND p.id < ?))');
                params.push(cursor.created_at, cursor.created_at, cursor.id);
            }
        }

        const whereSql = `WHERE ${where.join('\n AND ')}`;
        const orderSql = sort === 'name'
            ? 'ORDER BY p.full_name ASC, p.id ASC'
            : 'ORDER BY p.created_at DESC, p.id DESC';
        let dataSql = `
            SELECT p.id, p.full_name, p.whatsapp, p.phone, p.birth_date, p.age,
                   p.patient_type, p.status, p.registration_date, p.created_at,
                   p.updated_at, p.last_visit
            FROM patients p
            ${whereSql}
            ${orderSql}`;
        const dataParams = [...params];

        let total = null;
        if (limit) {
            const [countRows] = await this.db.query(
                `SELECT COUNT(*) AS total FROM patients p ${whereSql}`,
                params
            );
            total = Number(countRows[0]?.total || 0);
            dataSql += ' LIMIT ?';
            dataParams.push(limit);
            if (!cursor) {
                dataSql += ' OFFSET ?';
                dataParams.push((page - 1) * limit);
            }
        }

        const [rows] = await this.db.query(dataSql, dataParams);
        const data = rows.map(patient => ({
            ...patient,
            whatsapp: patient.whatsapp || patient.phone || null
        }));
        const response = { success: true, data, count: data.length };

        if (limit) {
            response.pagination = {
                total,
                page,
                totalPages: Math.ceil(total / limit),
                limit
            };
            const last = data[data.length - 1];
            if (last) {
                response.pagination.nextCursor = Buffer.from(JSON.stringify({
                    id: last.id,
                    fn: last.full_name || null,
                    created_at: last.created_at || null
                })).toString('base64url');
            }
        }

        return response;
    }
}

module.exports = PatientListService;
