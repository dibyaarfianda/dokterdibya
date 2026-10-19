'use strict';
const { randomUUID } = require('crypto');
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const categories = new Set(['kehamilan', 'kesuburan', 'penyakit_kandungan']);
function fail(status, code, message, data) {
    return Object.assign(new Error(message), { status, code, data });
}
function validate(body, withContent = false) {
    if (!body || !ID.test(body.draft_id || '') || !ID.test(body.mutation_id || '') || !Number.isSafeInteger(body.base_version) || body.base_version < 0) {
        throw fail(400, 'INVALID_DRAFT', 'Identitas atau versi draft tidak valid.');
    }
    if (!withContent) return;
    const c = body.content;
    if (!c || typeof c.title !== 'string' || typeof c.body !== 'string' || c.title.length > 100 || c.body.length > 3000 || !categories.has(c.category) || !['nickname', 'anonim'].includes(c.author_mode)) {
        throw fail(400, 'INVALID_DRAFT', 'Draft tidak valid. Judul maksimal 100 dan isi maksimal 3000 karakter.');
    }
    return { title: c.title, body: c.body, category: c.category, author_mode: c.author_mode };
}
function snapshot(row) {
    if (!row) return { version: 0, state: 'empty', draft_id: null, content: null, updated_at: null };
    return { version: Number(row.version), state: row.state, draft_id: row.draft_id || null, mutation_id: row.mutation_id || null,
        content: typeof row.content_json === 'string' ? JSON.parse(row.content_json) : row.content_json,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null };
}
function createService(db) {
    async function read(owner, connection = db, lock = false) {
        const [rows] = await connection.query(`SELECT * FROM patient_story_drafts WHERE owner_key = ?${lock ? ' FOR UPDATE' : ''}`, [owner]);
        return snapshot(rows[0]);
    }
    async function transaction(owner, work) {
        if (typeof owner !== 'string' || !/^(patient|demo):[A-Za-z0-9_-]{1,80}$/.test(owner)) throw fail(403, 'INVALID_OWNER', 'Akun pasien tidak valid.');
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('INSERT IGNORE INTO patient_story_drafts (owner_key) VALUES (?)', [owner]);
            const current = await read(owner, connection, true);
            const result = await work(connection, current);
            await connection.commit();
            return result;
        } catch (error) { await connection.rollback(); throw error; }
        finally { connection.release(); }
    }
    function check(current, body) {
        if (current.version !== body.base_version || (current.draft_id === body.draft_id && ['deleted', 'submitted'].includes(current.state))) {
            throw fail(409, 'DRAFT_CONFLICT', 'Ada versi draft yang lebih baru. Pilih tulisan yang ingin dilanjutkan.', current);
        }
    }
    async function write(connection, owner, current, body, state, content) {
        await connection.query('UPDATE patient_story_drafts SET version = ?, state = ?, draft_id = ?, content_json = ?, mutation_id = ? WHERE owner_key = ?',
            [current.version + 1, state, body.draft_id, content ? JSON.stringify(content) : null, body.mutation_id, owner]);
        return read(owner, connection);
    }
    async function save(owner, body) {
        const content = validate(body, true);
        return transaction(owner, async (connection, current) => {
            if (current.mutation_id === body.mutation_id && current.draft_id === body.draft_id && current.state === 'active') return current;
            check(current, body);
            return write(connection, owner, current, body, 'active', content);
        });
    }
    async function remove(owner, body) {
        validate(body);
        return transaction(owner, async (connection, current) => {
            if (current.mutation_id === body.mutation_id && current.draft_id === body.draft_id && current.state === 'deleted') return current;
            if (current.version !== body.base_version || (current.state === 'active' && current.draft_id !== body.draft_id)) throw fail(409, 'DRAFT_CONFLICT', 'Draft berubah sebelum dihapus.', current);
            return write(connection, owner, current, body, 'deleted', null);
        });
    }
    async function submit(owner, body, options = {}) {
        validate(body);
        return transaction(owner, async (connection, current) => {
            // Receipts survive later drafts, so an old retry never submits a second story.
            const [receipts] = await connection.query('SELECT story_id FROM patient_story_submissions WHERE owner_key = ? AND draft_id = ?', [owner, body.draft_id]);
            if (receipts.length) return { ...current, story_id: String(receipts[0].story_id), delivered_draft_id: body.draft_id };
            check(current, body);
            if (current.state !== 'active' || current.draft_id !== body.draft_id || !current.content?.title.trim() || !current.content?.body.trim()) throw fail(400, 'INCOMPLETE_DRAFT', 'Judul dan isi cerita wajib diisi.');
            const c = current.content;
            let storyId;
            if (options.demo) storyId = 'DEMO-' + randomUUID();
            else {
                if (owner !== 'patient:' + options.patientId) throw fail(403, 'INVALID_OWNER', 'Akun tidak sesuai.');
                const [result] = await connection.query("INSERT INTO patient_stories (patient_id, title, body, category, author_mode, status) VALUES (?, ?, ?, ?, ?, 'pending')",
                    [options.patientId, c.title.trim(), c.body.trim(), c.category, c.author_mode]);
                storyId = String(result.insertId);
            }
            // Production receipts need no duplicate copy of the story body.
            await connection.query('INSERT INTO patient_story_submissions (owner_key, draft_id, story_id, content_json) VALUES (?, ?, ?, ?)',
                [owner, body.draft_id, storyId, options.demo ? JSON.stringify(c) : null]);
            const next = await write(connection, owner, current, body, 'submitted', null);
            return { ...next, story_id: storyId, delivered_draft_id: body.draft_id };
        });
    }
    return { read, save, remove, submit };
}
module.exports = { createService, validate };
