const { limitOf, scopeOf, encodeCursor, decodeCursor, seekAfter } = require('./PatientListCursor');

class PatientListService {
    constructor(db) {
        if (!db || typeof db.query !== 'function') throw new Error('PatientListService requires a database pool');
        this.db = db;
    }

    async listBasic(options = {}) {
        const search = String(options.search || '').trim();
        const sort = options.sort === 'name' ? 'name' : 'recent';
        const lastVisitLocation = String(options.last_visit_location || '').trim();
        const hospital = String(options.hospital || '').trim();
        const limit = limitOf(options.limit);
        const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
        const terms = sort === 'name'
            ? [{ column: 'p.full_name', field: 'full_name', direction: 'ASC' }, { column: 'p.id', field: 'id', direction: 'ASC' }]
            : [{ column: 'p.created_at', field: 'created_at', direction: 'DESC', date: true }, { column: 'p.id', field: 'id', direction: 'DESC' }];
        const scope = scopeOf({ view: 'basic', sort, search, hospital, lastVisitLocation, limit });
        const cursor = decodeCursor(options.cursor, scope, terms);
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

        const whereSql = `WHERE ${where.join('\n AND ')}`;
        const seek = seekAfter(terms, cursor);
        const orderSql = sort === 'name'
            ? 'ORDER BY p.full_name ASC, p.id ASC'
            : 'ORDER BY p.created_at DESC, p.id DESC';
        let dataSql = `
            SELECT p.id, p.full_name, p.whatsapp, p.phone, p.birth_date, p.age,
                   p.patient_type, p.status, p.registration_date, p.created_at,
                   p.updated_at, p.last_visit
            FROM patients p
            ${whereSql}${seek.sql ? ` AND ${seek.sql}` : ''}
            ${orderSql}`;
        const dataParams = [...params, ...seek.params];

        const [countRows] = await this.db.query(
            `SELECT COUNT(*) AS total FROM patients p ${whereSql}`,
            params
        );
        const total = Number(countRows[0]?.total || 0);
        dataSql += ' LIMIT ?';
        dataParams.push(limit + 1);
        if (!cursor && page > 1) {
            dataSql += ' OFFSET ?';
            dataParams.push((page - 1) * limit);
        }

        const [rows] = await this.db.query(dataSql, dataParams);
        const hasMore = rows.length > limit;
        const pageRows = rows.slice(0, limit);
        const data = pageRows.map(patient => ({
            ...patient,
            whatsapp: patient.whatsapp || patient.phone || null
        }));
        const response = { success: true, data, count: data.length };

        const currentPage = cursor ? cursor.page + 1 : page;
        response.pagination = {
            total,
            page: currentPage,
            totalPages: Math.ceil(total / limit),
            limit,
            nextCursor: hasMore && data.length ? encodeCursor(pageRows[pageRows.length - 1], terms, scope, currentPage) : null
        };

        return response;
    }
}

module.exports = PatientListService;
