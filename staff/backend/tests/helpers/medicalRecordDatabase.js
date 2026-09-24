'use strict';

// Transactional boundary double: synthetic fixtures only. SQL shape and lock order
// are deliberately checked; executable MariaDB migration tests remain a release gate.
function medicalRecordDatabase() {
    let state;
    let tail = Promise.resolve();
    const events = [];
    const clone = value => JSON.parse(JSON.stringify(value));
    const reset = () => {
        state = {
            visits: [{ id: 1, mr_id: 'TEST001', patient_id: 'fixture-a', visit_location: 'klinik_private', status: 'draft' }],
            patients: [{ id: 'fixture-a' }], counter: 1,
            records: [], documents: [], revisions: [], nextId: 1
        };
        events.length = 0;
    };
    reset();
    const database = { events, reset, state: () => state, failure: null };
    async function execute(sql, p = [], tx) {
        sql = sql.replace(/\s+/g, ' ').trim();
        events.push({ kind: 'query', sql, params: clone(p), tx: !!tx });
        if (database.failure && sql.includes(database.failure)) throw new Error('Injected database failure');
        if (sql.includes('FROM role_permissions')) return [[22].includes(p[0]) ? p.slice(1).map(name => ({ name })) : []];
        if (sql.includes('FROM patients WHERE id = ? FOR UPDATE')) {
            if (!tx) throw new Error('Patient lock outside transaction');
            return [clone(state.patients.filter(row => String(row.id) === String(p[0])))];
        }
        if (sql.includes('FROM sunday_clinic_records')) {
            if (!tx || !sql.endsWith('FOR UPDATE')) throw new Error('Visit lock missing');
            tx.visitLocked = true;
            if (sql.includes('WHERE patient_id = ? AND visit_location = ?')) {
                return [clone(state.visits.filter(row => row.patient_id === p[0] && row.visit_location === p[1])
                    .sort((a, b) => b.id - a.id).slice(0, 1))];
            }
            return [clone(state.visits.filter(row => row.mr_id === p[0]))];
        }
        if (sql.startsWith('UPDATE sunday_clinic_mr_counters')) {
            if (!tx) throw new Error('Counter update outside transaction');
            state.counter += 1;
            return [{ affectedRows: 1 }];
        }
        if (sql.includes('FROM sunday_clinic_mr_counters')) return [[{ current_sequence: state.counter }]];
        if (sql.startsWith('INSERT INTO sunday_clinic_records')) {
            if (!tx) throw new Error('Visit insertion outside transaction');
            state.visits.push({ id: Math.max(0, ...state.visits.map(row => row.id)) + 1,
                mr_id: p[0], patient_id: p.length > 5 ? p[2] : p[1],
                visit_location: p.length > 5 ? p[3] : p[2], status: 'draft',
                created_at: p.length > 5 ? '2026-09-24' : p[3], last_activity_at: p.length > 5 ? '2026-09-24' : p[4] });
            return [{ affectedRows: 1, insertId: state.visits[state.visits.length - 1].id }];
        }
        if (sql.startsWith('UPDATE sunday_clinic_records')) {
            const id = sql.includes("status = 'finalized'") ? p[1] : p[0];
            const visit = state.visits.find(row => String(row.id) === String(id));
            if (!visit) return [{ affectedRows: 0 }];
            if (sql.includes("status = 'finalized'")) {
                if (visit.status !== 'draft') return [{ affectedRows: 0 }];
                visit.status = 'finalized';
            } else visit.last_activity_at = '2026-09-24 12:00:00';
            return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('SELECT') && sql.includes('FROM medical_records')) {
            if (sql.endsWith('FOR UPDATE') && !tx?.visitLocked) throw new Error('Medical lock before visit');
            let rows = state.records;
            if (sql.includes('WHERE id = ?')) rows = rows.filter(r => String(r.id) === String(p[0]));
            else if (sql.includes('WHERE patient_id = ? AND mr_id = ? AND record_type = ?')) rows = rows.filter(r => r.patient_id === p[0] && r.mr_id === p[1] && r.record_type === p[2]);
            else throw new Error('Unexpected medical scope: ' + sql);
            return [clone(rows)];
        }
        if (sql.startsWith('SELECT') && sql.includes('FROM medical_record_revisions')) {
            if (sql.includes('MAX(to_version)')) {
                const versions = state.revisions.filter(r => r.mr_id === p[0] && r.record_type === p[1]).map(r => r.to_version);
                return [[{ last_version: Math.max(0, ...versions) }]];
            }
            return [clone(state.revisions.filter(r => r.medical_record_id === p[0] && r.to_version > p[1] && r.to_version <= p[2]).sort((a,b) => a.to_version-b.to_version))];
        }
        if (sql.startsWith('INSERT INTO medical_records')) {
            const [patient_id, mr_id, doctor_id, doctor_name, record_type, record_data, version] = p;
            const row = { id: state.nextId++, patient_id, mr_id, doctor_id, doctor_name, record_type, record_data, version };
            state.records.push(row);
            return [{ insertId: row.id, affectedRows: 1 }];
        }
        if (sql.startsWith('UPDATE medical_records')) {
            const [record_data, doctor_id, doctor_name, version, id] = p;
            const row = state.records.find(r => r.id === id);
            if (!row) return [{ affectedRows: 0 }];
            Object.assign(row, { record_data, doctor_id, doctor_name, version });
            return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO medical_record_revisions')) {
            const [medical_record_id, patient_id, mr_id, record_type, event_type, actor_id, from_version, to_version, before_snapshot, after_snapshot, changed_paths] = p;
            state.revisions.push({ medical_record_id, patient_id, mr_id, record_type, event_type, actor_id, from_version, to_version, before_snapshot, after_snapshot, changed_paths });
            return [{ insertId: state.revisions.length, affectedRows: 1 }];
        }
        if (sql.startsWith('SELECT') && sql.includes('FROM patient_documents')) {
            if (!tx?.visitLocked || !sql.endsWith('FOR UPDATE')) throw new Error('Document lock missing');
            const documentTypes = Array.isArray(p[2]) ? p[2] : sql.includes("document_type = 'usg_photo'") ? ['usg_photo'] : [];
            return [clone(state.documents.filter(r => r.patient_id === p[0] && r.mr_id === p[1] && documentTypes.includes(r.document_type)))];
        }
        if (sql.startsWith('INSERT INTO patient_documents')) {
            if (!tx?.visitLocked) throw new Error('Document insertion before visit lock');
            const [patient_id, mr_id, title, file_url, file_path, file_name, file_type, file_size, published_by, created_by] = p;
            state.documents.push({ id: state.documents.length + 1, patient_id, mr_id, document_type: 'usg_photo',
                title, file_url, file_path, file_name, file_type, file_size, published_by, created_by });
            return [{ affectedRows: 1, insertId: state.documents.length }];
        }
        if (sql.startsWith('DELETE FROM patient_documents')) {
            const before = state.documents.length;
            state.documents = state.documents.filter(r => !(r.patient_id === p[0] && r.mr_id === p[1] && p[2].includes(r.document_type)));
            return [{ affectedRows: before - state.documents.length }];
        }
        if (sql.startsWith('DELETE FROM medical_records')) {
            const before = state.records.length;
            if (sql.includes('WHERE id = ?')) state.records = state.records.filter(r => String(r.id) !== String(p[0]));
            else state.records = state.records.filter(r => !(r.patient_id === p[0] && r.record_type === p[1] && (!p[2] || r.mr_id === p[2] || r.mr_id === null)));
            return [{ affectedRows: before - state.records.length }];
        }
        throw new Error('Unexpected SQL: ' + sql);
    }
    database.query = (sql, p) => execute(sql, p);
    database.getConnection = async () => {
        let snapshot, unlock;
        const tx = { visitLocked: false };
        return {
            async beginTransaction() {
                const previous = tail;
                tail = new Promise(resolve => { unlock = resolve; });
                await previous;
                snapshot = clone(state);
                events.push({ kind: 'begin' });
            },
            query: (sql, p) => execute(sql, p, tx),
            async commit() { events.push({ kind: 'commit' }); unlock(); },
            async rollback() { state = snapshot; events.push({ kind: 'rollback' }); unlock(); },
            release() { events.push({ kind: 'release' }); }
        };
    };
    return database;
}

module.exports = medicalRecordDatabase;
