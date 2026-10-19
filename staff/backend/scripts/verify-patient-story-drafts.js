/* Isolated production smoke: writes only demo-session drafts and receipts. */
'use strict';
require('dotenv').config();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const db = require('../db');
const demo = require('../services/PatientDemoService');
const origin = 'https://sisiwanita.id';
async function exchange(code) {
    const response = await fetch(origin + '/api/patient-demo/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const result = await response.json(); assert.equal(result.success, true); return result;
}
async function run() {
    const privateFile = process.argv[2];
    if (process.argv[3] === '--renew-ui') {
        const access = JSON.parse(fs.readFileSync(privateFile, 'utf8'));
        const code = randomBytes(24).toString('base64url');
        const [result] = await db.query("UPDATE patient_demo_sessions SET code_hash = ?, code_expires_at = DATE_ADD(NOW(), INTERVAL 120 SECOND), used_at = NULL WHERE id = ? AND issued_by = 'codex-story-draft-qa' AND revoked_at IS NULL", [createHash('sha256').update(code).digest('hex'), access.sessionId]);
        assert.equal(result.affectedRows, 1);
        access.launchUrl = origin + '/patient-demo-login.html?code=' + code;
        fs.writeFileSync(privateFile, JSON.stringify(access), { mode: 0o600 });
        console.log(JSON.stringify({ renewed: true })); return;
    }
    const checks = [];
    async function newSession() { const a = await demo.createAccessCode('codex-story-draft-qa'); return exchange(a.code); }
    const a = await newSession(), b = await newSession();
    async function request(session, method, body, suffix = '') {
        const r = await fetch(origin + '/api/patient-stories/draft' + suffix, { method, headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        assert.match(r.headers.get('cache-control'), /no-store/);
        return { status: r.status, ...(await r.json()) };
    }
    const id = randomUUID();
    const content = { title: '', body: '  QA DRAFT ONLY — belum selesai\n', category: 'kesuburan', author_mode: 'anonim' };
    const body = { draft_id: id, mutation_id: randomUUID(), base_version: 0, content };
    let response = await request(a, 'PUT', body); assert.equal(response.status, 200); assert.deepEqual(response.data.content, content); assert.equal(response.data.version, 1); checks.push('partial-and-exact-field-persistence');
    response = await request(a, 'PUT', body); assert.equal(response.data.version, 1); checks.push('lost-save-response-idempotency');
    response = await request(b, 'GET'); assert.equal(response.data.state, 'empty'); checks.push('cross-account-isolation');
    response = await request(a, 'PUT', { ...body, mutation_id: randomUUID() }); assert.equal(response.status, 409); checks.push('stale-write-rejected');
    const parallel = await Promise.all(['A', 'B'].map(value => request(a, 'PUT', { ...body, base_version: 1, mutation_id: randomUUID(), content: { ...content, body: value } })));
    assert.deepEqual(parallel.map(r => r.status).sort(), [200, 409]); checks.push('concurrent-writes-compare-and-swap');
    response = await request(a, 'POST', { ...body, base_version: 2 }, '/submit'); assert.equal(response.status, 400); checks.push('incomplete-draft-never-published');
    response = await request(a, 'PUT', { ...body, base_version: 2, mutation_id: randomUUID(), content: { ...content, title: 'QA DRAFT ONLY', body: 'Dummy lifecycle verification' } }); assert.equal(response.status, 200);
    const submission = { draft_id: id, mutation_id: randomUUID(), base_version: 3 };
    const receipt = await request(a, 'POST', submission, '/submit'); assert.equal(receipt.status, 200); assert.match(receipt.data.story_id, /^DEMO-/);
    response = await request(a, 'POST', submission, '/submit'); assert.equal(response.data.story_id, receipt.data.story_id); checks.push('delivery-receipt-prevents-double-submission');
    const nextId = randomUUID();
    response = await request(a, 'PUT', { ...body, draft_id: nextId, base_version: 4, mutation_id: randomUUID() }); assert.equal(response.status, 200);
    response = await request(a, 'POST', submission, '/submit'); assert.equal(response.data.story_id, receipt.data.story_id);
    response = await request(a, 'GET'); assert.equal(response.data.draft_id, nextId); assert.equal(response.data.state, 'active'); checks.push('old-delivery-retry-preserves-new-draft');
    const removal = { draft_id: nextId, base_version: 5, mutation_id: randomUUID() };
    response = await request(a, 'DELETE', removal); assert.equal(response.status, 200);
    response = await request(a, 'DELETE', removal); assert.equal(response.data.version, 6);
    response = await request(a, 'PUT', { ...body, draft_id: nextId, base_version: 6 }); assert.equal(response.status, 409); checks.push('delete-tombstone-blocks-resurrection');
    const [rows] = await db.query('SELECT COUNT(*) AS count FROM patient_story_submissions WHERE owner_key = ? AND draft_id = ?', ['demo:' + a.user.demo_session_id, id]); assert.equal(Number(rows[0].count), 1); checks.push('one-durable-dummy-receipt');
    const unauth = await fetch(origin + '/api/patient-stories/draft'); assert.equal(unauth.status, 401); checks.push('unauthenticated-access-rejected');
    if (privateFile) {
        const access = await demo.createAccessCode('codex-story-draft-qa');
        fs.writeFileSync(privateFile, JSON.stringify({ sessionId: access.id, launchUrl: origin + '/patient-demo-login.html?code=' + access.code }), { mode: 0o600 });
    }
    console.log(JSON.stringify({ success: true, checkedAt: new Date().toISOString(), checks, clinicalWrites: 0 }));
}
run().catch(error => { console.error('Draft verification failed:', error.code || error.name, error.message); process.exitCode = 1; }).finally(() => db.end());
