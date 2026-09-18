const crypto = require('crypto');
const { ClinicHospitalMonitor, matchPatient, validateObservation, validateArchive } = require('../../services/ClinicHospitalMonitor');

class MemoryStore {
    constructor() { this.records = {}; this.tail = Promise.resolve(); }
    transact(fn) {
        const result = this.tail.then(async () => {
            const draft = structuredClone(this.records);
            const value = await fn(draft);
            this.records = draft;
            return value;
        });
        this.tail = result.catch(() => {});
        return result;
    }
}
const cohort = [{ id: 'P1', full_name: 'Siti Aminah', birth_date: '1990-02-01' }];
const observation = (extra = {}) => ({ facility: 'gambiran', unit: 'IGD', status: 'ok', complete: true,
    observed_at: '2026-09-18T10:00:00+07:00', patients: [{ case_id: 'case1', patient_name: ' SITI  AMINAH ', birth_date: '1990-02-01', hospital_mr_id: 'RM1' }], ...extra });
function setup(extra = {}) {
    const store = new MemoryStore();
    const service = new ClinicHospitalMonitor({ store, identity: async () => ({ cohort, external: [] }), now: () => new Date('2026-09-18T03:00:00Z'), config: {}, sendTelegram: jest.fn().mockResolvedValue(undefined), ...extra });
    return { service, store };
}
test('exact full name and DOB only; no name-only match or ambiguous positive', () => {
    expect(matchPatient(observation().patients[0], 'gambiran', cohort, []).patient_id).toBe('P1');
    expect(matchPatient({ patient_name: 'Siti Aminah' }, 'gambiran', cohort, []).patient_id).toBeNull();
    expect(matchPatient(observation().patients[0], 'gambiran', [...cohort, { ...cohort[0], id: 'P2' }], []).patient_id).toBeNull();
});
test('mapped MR conflict blocks an otherwise exact demographic match', () => {
    const mapping = [{ facility: 'rsud_gambiran', hospital_mr_id: 'RM1', patient_id: 'P2' }];
    expect(matchPatient(observation().patients[0], 'gambiran', cohort, mapping).reason).toBe('identity_conflict');
});
test('verified Medify numeric RM formatting aliases match, collisions remain conflicts', () => {
    const row = { ...observation().patients[0], hospital_mr_id:'000-123' };
    expect(matchPatient(row,'gambiran',cohort,[{facility:'rsud_gambiran',hospital_mr_id:'123',patient_id:'P1'}]).reason).toBe('external_id');
    expect(matchPatient(row,'gambiran',cohort,[{facility:'rsud_gambiran',hospital_mr_id:'123',patient_id:'P1'},{facility:'gambiran',hospital_mr_id:'000123',patient_id:'P2'}]).reason).toBe('identity_conflict');
});
test('bounds, invalid calendar date and discharge evidence are validated', () => {
    expect(() => validateObservation(observation({ facility: 'arbitrary' }), new Date())).toThrow();
    const p = observation(); p.patients[0].birth_date = '1990-02-31';
    expect(() => validateObservation(p, new Date('2026-09-18'))).toThrow();
});
test('parallel repeated observations create one episode/event; unit transition creates one more', async () => {
    const { service } = setup();
    await Promise.all([service.ingest(observation()), service.ingest(observation())]);
    await service.ingest(observation({ unit: 'RI' }));
    const data = await service.dashboard();
    expect(data.patients).toHaveLength(1); expect(data.events).toHaveLength(2);
    expect(data.activation.enabled).toBe(false);
});
test('empty, error and partial observations never discharge or create archive jobs', async () => {
    const { service } = setup(); await service.ingest(observation());
    await service.ingest(observation({ patients: [] }));
    await service.ingest(observation({ patients: [], status: 'error', complete: false }));
    expect((await service.dashboard()).patients[0].discharge_at).toBeNull();
    expect(await service.archiveJobs()).toEqual([]);
});
test('explicit discharge creates durable retriable job and details survive census removal', async () => {
    const { service, store } = setup();
    const input = observation(); input.patients[0].discharge_at = '2026-09-18T09:00:00+07:00'; input.patients[0].discharge_confirmed = true;
    await service.ingest(input);
    const restarted = new ClinicHospitalMonitor({ store, identity: async () => ({ cohort, external: [] }), now: service.now, config: {} });
    expect(await restarted.archiveJobs()).toHaveLength(1);
    expect(await restarted.archiveJobs()).toHaveLength(0);
    const data = await restarted.dashboard();
    expect((await restarted.eventDetails(data.events[0].id)).patient.patient_id).toBe('P1');
});
test('archive content checksum, totals and section completeness enforced', () => {
    const file = { source_id: 'a', category: 'resume', filename: 'a.pdf', mime_type: 'application/pdf', byte_size: 3, sha256: crypto.createHash('sha256').update('abc').digest('hex'), content_base64: 'YWJj' };
    const input = { status: 'ready', snapshot: {}, sections: { resume: 'present', penunjang: 'not_applicable', operasi: 'not_applicable' }, files: [file], warnings: [] };
    expect(validateArchive(input).files[0].buffer.toString()).toBe('abc');
    expect(() => validateArchive({ ...input, files: [{ ...file, sha256: '0'.repeat(64) }] })).toThrow();
    expect(validateArchive({ ...input, sections: { ...input.sections, resume: 'pending' } }).status).toBe('partial');
});
test('pairing is private, expires, single use; forged secret blocked', async () => {
    const { service } = setup({ config: { ownerId: 'owner', botToken: 'test', botUsername: 'test_bot', webhookSecret: 'secret' } });
    const pair = await service.pair(); const token = new URL(pair.url).searchParams.get('start');
    const message = { message: { text: `/start ${token}`, chat: { id: 123, type: 'private' } } };
    await expect(service.webhook(message, 'wrong')).rejects.toThrow();
    await expect(service.webhook({ message: { ...message.message, chat: { id: 123, type: 'group' } } }, 'secret')).rejects.toThrow();
    await service.webhook(message, 'secret');
    await expect(service.webhook(message, 'secret')).rejects.toThrow();
    expect((await service.dashboard()).telegram.connected).toBe(true);
});

module.exports = { MemoryStore };

test('Telegram Start confirms pairing and reports connected status without activating patient alerts', async () => {
    const { service } = setup({ config: { ownerId: 'owner', botToken: 'test', botUsername: 'test_bot', webhookSecret: 'secret' } });
    const pair = await service.pair();
    const token = new URL(pair.url).searchParams.get('start');
    await service.webhook({ message: { text: `/start ${token}`, chat: { id: 123, type: 'private' } } }, 'secret');
    expect(service.sendTelegram).toHaveBeenCalledWith(123, expect.objectContaining({ text: expect.stringContaining('tersambung') }));
    service.sendTelegram.mockClear();
    await service.webhook({ message: { text: '/start', chat: { id: 123, type: 'private' } } }, 'secret');
    expect(service.sendTelegram).toHaveBeenCalledWith(123, expect.objectContaining({ text: expect.stringContaining('belum aktif') }));
    expect((await service.dashboard()).activation.enabled).toBe(false);
    await service.webhook({ message: { text: '/start', chat: { id: 456, type: 'private' } } }, 'secret');
    expect(service.sendTelegram).toHaveBeenLastCalledWith(456, expect.objectContaining({ text: expect.stringContaining('COMM') }));
});

test('Telegram reply failure does not undo successful pairing', async () => {
    const { service } = setup({ config: { ownerId: 'owner', botToken: 'test', botUsername: 'test_bot', webhookSecret: 'secret' }, sendTelegram: jest.fn().mockRejectedValue(new Error('offline')) });
    const pair = await service.pair();
    await service.webhook({ message: { text: `/start ${new URL(pair.url).searchParams.get('start')}`, chat: { id: 123, type: 'private' } } }, 'secret');
    expect(service.sendTelegram).toHaveBeenCalled();
    expect((await service.dashboard()).telegram.connected).toBe(true);
});

test('owner confirmation has a stable episode identity and survives later observations', async () => {
    const { service } = setup(); const input = observation(); delete input.patients[0].birth_date;
    await service.ingest(input); const pending = (await service.dashboard()).pending_matches[0];
    expect(pending.candidates[0].patient_id).toBe('P1');
    await service.confirmMatch(pending.id, 'P1');
    const first = (await service.dashboard()).patients[0];
    expect(first.id).not.toBe(pending.id);
    await service.ingest(input);
    expect((await service.dashboard()).pending_matches).toHaveLength(0);
    expect((await service.dashboard()).patients[0].id).toBe(first.id);
});
test('later conflicting identity blocks icon, new events and archive work', async () => {
    const { service } = setup(); await service.ingest(observation());
    const input = observation(); input.patients[0].birth_date = '1991-02-01';
    await service.ingest(input);
    expect((await service.dashboard()).patients[0].is_private_clinic_patient).toBe(false);
    expect((await service.dashboard()).pending_matches[0].reason).toBe('identity_conflict');
});
test('identity conflict stays blocked when old identity later reports discharge until valid owner confirmation', async () => {
    const { service } = setup(); await service.ingest(observation());
    const conflict = observation(); conflict.patients[0].birth_date = '1991-02-01';
    await service.ingest(conflict);
    const pendingId = (await service.dashboard()).pending_matches[0].id;
    await expect(service.confirmMatch(pendingId, 'P1')).rejects.toThrow('IDENTITY_CONFLICT');
    const oldDischarge = observation({complete:false});
    Object.assign(oldDischarge.patients[0], { discharge_confirmed:true, discharge_at:'2026-09-18T09:00:00+07:00' });
    await service.ingest(oldDischarge);
    const blocked = await service.dashboard();
    expect(blocked.patients[0].identity_conflict).toBe(true);
    expect(blocked.patients[0].is_private_clinic_patient).toBe(false);
    expect(blocked.patients[0].discharge_at).toBeNull();
    expect(blocked.events).toHaveLength(1);
    expect(await service.archiveJobs()).toEqual([]);
    expect(blocked.pending_matches[0].id).toBe(pendingId);
    expect(blocked.pending_matches[0].conflict_evidence.birth_date).toBe('1991-02-01');
    await service.confirmMatch(pendingId, 'P1');
    const confirmed = await service.dashboard();
    expect(confirmed.patients[0].identity_conflict).toBe(false);
    expect(confirmed.patients[0].is_private_clinic_patient).toBe(true);
    expect(await service.archiveJobs()).toHaveLength(1);
});
test('explicit collector identity conflict retracts an existing match even in an error snapshot', async () => {
    const {service} = setup(); await service.ingest(observation());
    const error = observation({status:'error',complete:false}); error.patients[0].identity_conflict = true;
    await service.ingest(error);
    const state = await service.dashboard();
    expect(state.patients[0].identity_conflict).toBe(true);
    expect(state.patients[0].is_private_clinic_patient).toBe(false);
    expect(state.patients[0].active).toBe(false);
    expect(state.pending_matches[0].reason).toBe('identity_conflict');
    expect(state.sources.find(s => s.facility === 'gambiran' && s.unit === 'IGD').status).toBe('error');
    expect(await service.archiveJobs()).toEqual([]);
    error.patients[0].identity_conflict = 'true';
    await expect(service.ingest(error)).rejects.toThrow('INVALID_IDENTITY_CONFLICT');
});
test('archive results are idempotent and retries do not consume retry slots', async () => {
    const storage = { uploadBuffer: jest.fn().mockResolvedValue({}), getSignedDownloadUrl: jest.fn().mockResolvedValue('signed') };
    const { service } = setup({ storage }); const input = observation();
    Object.assign(input.patients[0], { discharge_at: '2026-09-18T09:00:00+07:00', discharge_confirmed: true });
    await service.ingest(input); const episodeId = (await service.dashboard()).patients[0].id;
    const [job] = await service.archiveJobs();
    const result = { job_token: job.job_token, status: 'partial', snapshot: { episode: 'case1' }, sections: { resume: 'pending', penunjang: 'not_applicable', operasi: 'not_applicable' }, files: [], warnings: [] };
    const first = await service.archiveResult(episodeId, result); const second = await service.archiveResult(episodeId, result);
    expect(second.archive_id).toBe(first.archive_id); expect(second.next_attempt_at).toBe(first.next_attempt_at);
    expect(await service.patientArchives('P1')).toHaveLength(1);
    expect(storage.uploadBuffer).toHaveBeenCalledTimes(1);
    await service.retryArchive(episodeId);
    expect(await service.archiveJobs()).toHaveLength(1);
});
test('binary archive upload preserves originals and rejects cross-episode reference', async () => {
    const storage = { uploadBuffer: jest.fn().mockResolvedValue({}) };
    const { service } = setup({ storage }); const input = observation();
    Object.assign(input.patients[0], { discharge_at: '2026-09-18T09:00:00+07:00', discharge_confirmed: true });
    input.patients.push({ ...input.patients[0], case_id: 'case2' }); await service.ingest(input);
    const episodes = (await service.dashboard()).patients; const buffer = Buffer.from('original PDF bytes');
    const jobs = await service.archiveJobs();
    const file = await service.uploadFile(episodes[0].id, { job_token: jobs[0].job_token, source_id: 'f1', category: 'resume', filename: 'resume.pdf', mime_type: 'application/pdf', sha256: crypto.createHash('sha256').update(buffer).digest('hex') }, buffer);
    expect(storage.uploadBuffer.mock.calls[0][1]).toEqual(buffer);
    const result = { job_token: jobs[0].job_token, status: 'ready', snapshot: {}, sections: { resume: 'present', penunjang: 'not_applicable', operasi: 'not_applicable' }, files: [file], warnings: [] };
    await expect(service.archiveResult(episodes[1].id, {...result,job_token:jobs[1].job_token})).rejects.toThrow('INVALID_UPLOAD_REFERENCE');
    await service.archiveResult(episodes[0].id, result);
    expect((await service.patientArchives('P1'))[0].files[0].sha256).toBe(file.sha256);
});
test('expired/reclaimed archive lease cannot publish stale result or upload', async () => {
    let now = new Date('2026-09-18T03:00:00Z'); const storage = { uploadBuffer: jest.fn().mockResolvedValue({}) };
    const { service } = setup({ now: () => now, storage }); const input = observation();
    Object.assign(input.patients[0], { discharge_at: '2026-09-18T09:00:00+07:00', discharge_confirmed: true });
    await service.ingest(input); const [oldJob] = await service.archiveJobs();
    now = new Date(now.getTime()+16*60000); const [newJob] = await service.archiveJobs();
    expect(newJob.job_token).not.toBe(oldJob.job_token);
    const result = { job_token:newJob.job_token,status:'ready',snapshot:{},sections:{resume:'present',penunjang:'not_applicable',operasi:'not_applicable'},files:[],warnings:[] };
    await service.archiveResult(newJob.episode_id,result);
    await expect(service.archiveResult(oldJob.episode_id,{...result,job_token:oldJob.job_token,status:'partial'})).rejects.toThrow('ARCHIVE_LEASE_EXPIRED');
    expect((await service.dashboard()).patients[0].archive_status).toBe('ready');
});
test('source evidence cannot self-verify and all six sources gate notification baseline', async () => {
    const config = { ownerId: 'owner', botToken: 'test', botUsername: 'test_bot', webhookSecret: 'secret', commUrl: 'https://comm.example', enabled: true };
    const sendTelegram = jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({});
    let now = new Date('2026-09-18T03:00:00Z');
    const { service, store } = setup({ config, sendTelegram, now: () => now });
    await service.ingest({ ...observation(), verified: true });
    await store.transact(r => { r['connection:owner'] = { owner_id: 'owner', chat_id: 123 }; });
    await service.tick(); expect(sendTelegram).not.toHaveBeenCalled();
    for (const facility of ['gambiran','melinda','bhayangkara']) for (const unit of ['IGD','RI']) await service.verifySource(facility, unit, { verified_by: 'operator', evidence_ref: 'test-coverage-record' });
    await service.tick(); expect(sendTelegram).toHaveBeenCalledTimes(1);
    now = new Date(now.getTime() + 120000);
    const restarted = new ClinicHospitalMonitor({ store, identity: service.identity, config, sendTelegram, now: () => now });
    await restarted.tick(); expect(sendTelegram).toHaveBeenCalledTimes(2);
    await restarted.tick(); expect(sendTelegram).toHaveBeenCalledTimes(2);
    expect(sendTelegram.mock.calls[1][1].text).toMatch(/Pemantauan Klinik Privat aktif/);
});
test('unrelated hospital registry is discarded and source errors preserve source verification evidence', async () => {
    const { service } = setup(); const input = observation(); input.patients[0].patient_name = 'Unrelated synthetic person';
    await service.ingest(input); const data = await service.dashboard(); expect(data.patients).toEqual([]); expect(data.pending_matches).toEqual([]);
    await service.verifySource('gambiran','IGD',{verified_by:'operator',evidence_ref:'reviewed-report'});
    await service.ingest(observation({status:'error',patients:[],complete:false}));
    const source = (await service.dashboard()).sources.find(s => s.facility === 'gambiran' && s.unit === 'IGD');
    expect(source.verified).toBe(true); expect(source.status).toBe('error');
});
test('snapshot upload never holds the monitor transaction lock, and commit revalidates lease', async () => {
    let releaseUpload; let uploadStarted;
    const started = new Promise(resolve => { uploadStarted = resolve; });
    const storage = { uploadBuffer: jest.fn(() => { uploadStarted(); return new Promise(resolve => { releaseUpload = resolve; }); }) };
    const { service } = setup({storage}); const input = observation();
    Object.assign(input.patients[0], { discharge_at:'2026-09-18T09:00:00+07:00',discharge_confirmed:true });
    await service.ingest(input); const [job] = await service.archiveJobs();
    const publishing = service.archiveResult(job.episode_id, {job_token:job.job_token,status:'ready',snapshot:{},sections:{resume:'present',penunjang:'not_applicable',operasi:'not_applicable'},files:[],warnings:[]});
    await started;
    const dashboard = await service.dashboard(); expect(dashboard.patients).toHaveLength(1);
    releaseUpload({}); await publishing;
    expect((await service.patientArchives('P1'))[0].files[0].filename).toBe('snapshot.json.gz');
});
test('pairing expires and cannot be redeemed after ten minutes', async () => {
    let now = new Date('2026-09-18T03:00:00Z');
    const {service} = setup({now:()=>now,config:{ownerId:'owner',botToken:'test',botUsername:'test_bot',webhookSecret:'secret'}});
    const pair = await service.pair(); const token = new URL(pair.url).searchParams.get('start'); now = new Date(now.getTime()+600001);
    await expect(service.webhook({message:{text:`/start ${token}`,chat:{type:'private',id:123}}},'secret')).rejects.toThrow('PAIRING_EXPIRED');
});
test('inline result replay is idempotent and source updates version catalog without duplicate originals', async () => {
    const storage = {uploadBuffer:jest.fn().mockResolvedValue({})};
    const {service} = setup({storage}); const input = observation();
    Object.assign(input.patients[0],{discharge_at:'2026-09-18T09:00:00+07:00',discharge_confirmed:true});
    await service.ingest(input); const [job] = await service.archiveJobs();
    const buffer = Buffer.from('unchanged original');
    const payload = {job_token:job.job_token,status:'ready',snapshot:{revision:1},sections:{resume:'present',penunjang:'not_applicable',operasi:'not_applicable'},warnings:[],files:[{source_id:'resume1',category:'resume',filename:'original.pdf',mime_type:'application/pdf',sha256:crypto.createHash('sha256').update(buffer).digest('hex'),byte_size:buffer.length,content_base64:buffer.toString('base64')}]};
    const first = await service.archiveResult(job.episode_id,payload);
    expect((await service.archiveResult(job.episode_id,payload)).archive_id).toBe(first.archive_id);
    expect(storage.uploadBuffer).toHaveBeenCalledTimes(2);
    await service.retryArchive(job.episode_id); const [next] = await service.archiveJobs();
    const updated = await service.archiveResult(job.episode_id,{...payload,job_token:next.job_token,snapshot:{revision:2}});
    expect(updated.archive_id).not.toBe(first.archive_id);
    expect(storage.uploadBuffer).toHaveBeenCalledTimes(3);
    expect(await service.patientArchives('P1')).toHaveLength(2);
});
