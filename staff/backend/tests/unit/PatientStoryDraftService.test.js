const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../../services/PatientStoryDraftService.js');
const Service = fs.existsSync(file) ? require(file) : {};
function database() {
    const drafts = new Map(); const receipts = new Map(); const stories = [];
    let before;
    const db = {
        beginTransaction: async () => { before = { drafts: structuredClone(drafts), receipts: structuredClone(receipts), stories: structuredClone(stories) }; },
        commit: async () => {}, rollback: async () => { drafts.clear(); for (const [k,v] of before.drafts) drafts.set(k,v); receipts.clear(); for(const [k,v] of before.receipts) receipts.set(k,v); stories.splice(0, stories.length, ...before.stories); },
        release() {}, getConnection: async () => db,
        async query(sql, p) {
            if (sql.includes('INSERT IGNORE INTO patient_story_drafts')) { if (!drafts.has(p[0])) drafts.set(p[0], { owner_key: p[0], version: 0, state: 'empty', content_json: null }); return [{}]; }
            if (sql.includes('SELECT') && sql.includes('FROM patient_story_drafts')) return [[drafts.get(p[0])].filter(Boolean)];
            if (sql.includes('UPDATE patient_story_drafts')) { const [version,state,id,json,mutation,owner] = p; drafts.set(owner, { owner_key: owner, version, state, draft_id: id, content_json: json, mutation_id: mutation, updated_at: new Date() }); return [{ affectedRows: 1 }]; }
            if (sql.includes('SELECT') && sql.includes('FROM patient_story_submissions')) return [[receipts.get(p[0] + ':' + p[1])].filter(Boolean)];
            if (sql.includes('INSERT INTO patient_stories')) { stories.push(p); return [{ insertId: stories.length }]; }
            if (sql.includes('INSERT INTO patient_story_submissions')) { const [owner,id,story,json] = p; receipts.set(owner + ':' + id, { owner_key: owner, draft_id: id, story_id: story, content_json: json }); return [{}]; }
            throw new Error('Unexpected SQL: ' + sql);
        }
    }; return { db, drafts, receipts, stories };
}
const draftId = '11111111-1111-4111-8111-111111111111';
const mutationId = '22222222-2222-4222-8222-222222222222';
const input = (extra = {}) => ({ draft_id: draftId, mutation_id: mutationId, base_version: 0, content: { title: '', body: '  belum selesai\n', category: 'kehamilan', author_mode: 'anonim' }, ...extra });
function fixture() { expect(typeof Service.createService).toBe('function'); const store = database(); return { ...store, service: Service.createService(store.db) }; }
test('partial drafts preserve exact whitespace in a separate owner-scoped store', async () => {
    const { service, stories } = fixture(); const saved = await service.save('patient:A', input());
    expect(saved.version).toBe(1); expect(saved.content).toEqual(input().content); expect(stories).toHaveLength(0);
    expect((await service.read('patient:B')).content).toBeNull();
});
test('stale updates cannot overwrite a newer server version', async () => {
    const { service } = fixture(); await service.save('patient:A', input());
    await expect(service.save('patient:A', input({ mutation_id: '33333333-3333-4333-8333-333333333333' }))).rejects.toMatchObject({ code: 'DRAFT_CONFLICT', status: 409 });
    expect((await service.read('patient:A')).content.body).toBe(input().content.body);
});
test('retry after a lost save response returns the committed version unchanged', async () => {
    const { service } = fixture(); await service.save('patient:A', input()); const retry = await service.save('patient:A', input()); expect(retry.version).toBe(1);
});
test('delete leaves a tombstone that rejects stale saves and permits a new draft', async () => {
    const { service } = fixture(); await service.save('patient:A', input());
    await service.remove('patient:A', input({ base_version: 1, mutation_id: '33333333-3333-4333-8333-333333333333' }));
    await expect(service.save('patient:A', input({ base_version: 2 }))).rejects.toMatchObject({ code: 'DRAFT_CONFLICT' });
    const next = await service.save('patient:A', input({ draft_id: '44444444-4444-4444-8444-444444444444', base_version: 2 })); expect(next.state).toBe('active');
});
test('only deliberate complete submission creates one pending story, including old retries after another draft', async () => {
    const { service, stories } = fixture();
    await service.save('patient:A', input({ content: { ...input().content, title: 'Cerita' } }));
    const submission = input({ base_version: 1 }); const first = await service.submit('patient:A', submission, { patientId: 'A' });
    expect(first.story_id).toBe('1'); expect(stories).toHaveLength(1); expect((await service.read('patient:A')).state).toBe('submitted');
    await service.save('patient:A', input({ base_version: 2, draft_id: '44444444-4444-4444-8444-444444444444' }));
    expect((await service.submit('patient:A', submission, { patientId: 'A' })).story_id).toBe('1'); expect(stories).toHaveLength(1);
});
test('incomplete submission leaves the private draft intact', async () => {
    const { service, stories } = fixture(); await service.save('patient:A', input());
    await expect(service.submit('patient:A', input({ base_version: 1 }), { patientId: 'A' })).rejects.toMatchObject({ status: 400 });
    expect((await service.read('patient:A')).state).toBe('active'); expect(stories).toHaveLength(0);
});
test('dummy submission uses durable isolated receipt and creates no production patient story', async () => {
    const { service, stories } = fixture(); await service.save('demo:session', input({ content: { ...input().content, title: 'Dummy' } }));
    const sent = await service.submit('demo:session', input({ base_version: 1 }), { demo: true }); expect(sent.story_id).toMatch(/^DEMO-/); expect(stories).toHaveLength(0);
});
test.each([
    input({ base_version: -1 }), input({ draft_id: '../patient-B' }), input({ content: { ...input().content, body: 'a'.repeat(3001) } }), input({ content: { ...input().content, category: 'unknown' } })
])('invalid versions, identifiers and oversized/unknown fields are rejected', async body => {
    const { service } = fixture(); await expect(service.save('patient:A', body)).rejects.toMatchObject({ status: 400 });
});
