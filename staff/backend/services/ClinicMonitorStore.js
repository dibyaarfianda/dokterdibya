class ClinicMonitorStore {
    constructor(db) { this.db = db; }
    async transact(fn) {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();
            const [locks] = await connection.query('SELECT id FROM clinic_monitor_lock WHERE id = 1 FOR UPDATE');
            if (locks.length !== 1) throw new Error('MONITOR_SCHEMA_NOT_READY');
            const [rows] = await connection.query('SELECT record_key, payload FROM clinic_monitor_records');
            const records = Object.fromEntries(rows.map(row => [row.record_key, typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload]));
            const before = Object.fromEntries(Object.entries(records).map(([key, value]) => [key, JSON.stringify(value)]));
            const result = await fn(records);
            for (const [key, value] of Object.entries(records)) {
                const json = JSON.stringify(value);
                if (before[key] !== json) await connection.query(
                    'INSERT INTO clinic_monitor_records (record_key,kind,payload) VALUES (?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',
                    [key, key.split(':')[0], json]);
            }
            for (const key of Object.keys(before)) if (!Object.hasOwn(records, key)) await connection.query('DELETE FROM clinic_monitor_records WHERE record_key=?', [key]);
            await connection.commit();
            return result;
        } catch (error) { await connection.rollback(); throw error; }
        finally { connection.release(); }
    }
}
module.exports = ClinicMonitorStore;
