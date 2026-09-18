const crypto = require('crypto');
const zlib = require('zlib');

const FACILITIES = ['gambiran', 'melinda', 'bhayangkara'];
const ALIASES = { rsud_gambiran: 'gambiran', rsia_melinda: 'melinda', rs_bhayangkara: 'bhayangkara' };
const SECTIONS = ['resume', 'penunjang', 'operasi'];
const STATES = ['present', 'pending', 'not_applicable', 'error'];
const HOSPITAL_LABELS = { gambiran: 'RSUD Gambiran', melinda: 'RSIA Melinda', bhayangkara: 'RS Bhayangkara' };
const EVENT_LABELS = { IGD: 'Terpantau di IGD', RI: 'Terpantau rawat inap', discharged: 'Pulang terkonfirmasi', archive_ready: 'Arsip rawat RS tersedia' };
const MAX_FILE = 100 * 1024 * 1024;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const id = () => crypto.randomUUID();
const values = (records, kind) => Object.entries(records).filter(([key]) => key.startsWith(`${kind}:`)).map(([, value]) => value);
const normalizeName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('id-ID');
const facilityName = value => ALIASES[value] || value;
// Medify displays the same numeric RM with separators and padded leading zeros.
// Preserve source values; compare only these verified numeric aliases.
const mrKey = (facility, value) => {
    const raw = String(value || '').trim();
    return ['gambiran', 'melinda'].includes(facility) && /^[\d -]+$/.test(raw) ? raw.replace(/[ -]/g, '').replace(/^0+(?=\d)/, '') : raw;
};
function fail(code = 'INVALID_REQUEST', status = 400) { const error = new Error(code); error.status = status; error.code = code; throw error; }
function text(value, max = 255, required = false) {
    if (value == null || value === '') { if (required) fail(); return null; }
    if (typeof value !== 'string' || value.length > max || /[\x00-\x1f]/.test(value) || required && !value.trim()) fail();
    return value.trim();
}
function dateOnly(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('INVALID_DATE');
    return value;
}
function instant(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > 40 || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('INVALID_TIME');
    dateOnly(value.slice(0, 10));
    return new Date(value).toISOString();
}
function validateObservation(input, now) {
    if (!input || !FACILITIES.includes(input.facility) || !['IGD', 'RI'].includes(input.unit) || !['ok', 'error', 'unsupported'].includes(input.status) || typeof input.complete !== 'boolean' || !Array.isArray(input.patients) || input.patients.length > 10000) fail();
    const observed_at = instant(input.observed_at);
    if (!observed_at || Date.parse(observed_at) > now.getTime() + 300000 || Date.parse(observed_at) < now.getTime() - 7 * 86400000) fail('INVALID_OBSERVATION_TIME');
    const seen = new Set();
    const patients = input.patients.map(row => {
        if (row.identity_conflict !== undefined && typeof row.identity_conflict !== 'boolean') fail('INVALID_IDENTITY_CONFLICT');
        const case_id = text(row.case_id, 128, true);
        if (seen.has(case_id)) fail('DUPLICATE_CASE'); seen.add(case_id);
        const patient = { case_id, patient_name: text(row.patient_name, 255, true), birth_date: dateOnly(row.birth_date), hospital_mr_id: text(row.hospital_mr_id, 50), hospital_patient_id: text(row.hospital_patient_id, 128), ward: text(row.ward), dpjp: text(row.dpjp), admission_at: instant(row.admission_at), discharge_at: instant(row.discharge_at), discharge_confirmed: row.discharge_confirmed === true, identity_conflict: row.identity_conflict === true };
        if (patient.discharge_at && Date.parse(patient.discharge_at) > Date.parse(observed_at) + 300000) fail('INVALID_DISCHARGE_TIME');
        if (patient.discharge_confirmed && !patient.discharge_at) fail('DISCHARGE_DATE_REQUIRED');
        return patient;
    });
    return { facility: input.facility, unit: input.unit, status: input.status, complete: input.complete, observed_at, patients };
}
function matchPatient(row, facility, cohort, external) {
    const sameName = cohort.filter(p => normalizeName(p.full_name) === normalizeName(row.patient_name));
    const exact = row.birth_date ? sameName.filter(p => dateOnly(p.birth_date) === row.birth_date) : [];
    const mapped = external.filter(p => facilityName(p.facility) === facility && row.hospital_mr_id && mrKey(facility, p.hospital_mr_id) === mrKey(facility, row.hospital_mr_id));
    const mappedIds = [...new Set(mapped.map(p => p.patient_id))];
    if (mappedIds.length) {
        const patient = cohort.find(p => p.id === mappedIds[0]);
        if (mappedIds.length !== 1 || !patient || (row.birth_date && dateOnly(patient.birth_date) && row.birth_date !== dateOnly(patient.birth_date)) || exact.some(p => p.id !== patient.id)) return { patient_id: null, reason: 'identity_conflict', candidates: sameName.map(p => p.id), relevant: !!patient || sameName.length > 0 };
        return { patient_id: patient.id, reason: 'external_id', candidates: [patient.id], relevant: true };
    }
    return { patient_id: exact.length === 1 ? exact[0].id : null, reason: exact.length === 1 ? 'exact_name_birth_date' : exact.length > 1 ? 'ambiguous' : 'missing_exact_identity', candidates: sameName.map(p => p.id), relevant: sameName.length > 0 };
}
function descriptor(file) {
    if (!file || !SECTIONS.includes(file.category)) fail('INVALID_FILE_CATEGORY');
    const d = { source_id: text(file.source_id, 255, true), category: file.category, filename: text(file.filename, 255, true), mime_type: text(file.mime_type, 128, true), sha256: text(file.sha256, 64, true), byte_size: file.byte_size };
    if (!/^[a-f0-9]{64}$/.test(d.sha256) || !Number.isSafeInteger(d.byte_size) || d.byte_size < 1 || d.byte_size > MAX_FILE || /[\/\\]/.test(d.filename) || !/^[\w.+-]+\/[\w.+-]+$/.test(d.mime_type)) fail('INVALID_FILE');
    return d;
}
function validateArchive(input) {
    if (!input || !['ready', 'partial', 'error'].includes(input.status) || !input.snapshot || typeof input.snapshot !== 'object' || Array.isArray(input.snapshot) || !input.sections || !SECTIONS.every(key => STATES.includes(input.sections[key])) || !Array.isArray(input.files) || input.files.length > 200 || !Array.isArray(input.warnings) || input.warnings.length > 100) fail('INVALID_ARCHIVE');
    if (Buffer.byteLength(JSON.stringify(input.snapshot)) > 1024 * 1024) fail('SNAPSHOT_TOO_LARGE');
    let total = 0;
    const files = input.files.map(file => {
        const d = descriptor(file);
        if (file.upload_id) return { ...d, upload_id: text(file.upload_id, 36, true) };
        if (typeof file.content_base64 !== 'string' || file.content_base64.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content_base64)) fail('INVALID_FILE_CONTENT');
        const buffer = Buffer.from(file.content_base64, 'base64'); total += buffer.length;
        if (buffer.toString('base64') !== file.content_base64 || total > 6 * 1024 * 1024 || buffer.length !== d.byte_size || hash(buffer) !== d.sha256) fail('FILE_CHECKSUM_MISMATCH');
        return { ...d, buffer };
    });
    const complete = SECTIONS.every(key => ['present', 'not_applicable'].includes(input.sections[key]));
    return { status: input.status === 'ready' && !complete ? 'partial' : input.status, snapshot: input.snapshot, sections: Object.fromEntries(SECTIONS.map(key => [key, input.sections[key]])), warnings: input.warnings.map(w => text(w, 500, true)), files };
}

class ClinicHospitalMonitor {
    constructor({ store, identity, storage, now = () => new Date(), config = {}, sendTelegram } = {}) {
        this.store = store; this.identity = identity; this.storage = storage; this.now = now; this.config = config;
        this.sendTelegram = sendTelegram || (async (chat, body) => {
            const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, ...body }), signal: AbortSignal.timeout(15000) });
            const result = await response.json(); if (!response.ok || !result.ok) fail('TELEGRAM_DELIVERY_FAILED', 502);
        });
    }
    configured() {
        let validUrl = false;
        try { const url = new URL(this.config.commUrl); validUrl = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch (_) { /* Unconfigured. */ }
        return !!(this.config.ownerId && this.config.botToken && /^[A-Za-z0-9_]{5,32}$/.test(this.config.botUsername || '') && this.config.webhookSecret && validUrl);
    }
    activeFacilities() {
        return FACILITIES.filter(f => !(this.config.skippedFacilities || []).includes(f));
    }
    activation(r) {
        const blockers = [];
        const activeFacilities = this.activeFacilities();
        if (!activeFacilities.length) blockers.push('no_active_hospitals');
        for (const facility of activeFacilities) for (const unit of ['IGD', 'RI']) if (!r[`source:${facility}:${unit}`]?.verified) blockers.push(`unverified:${facility}:${unit}`);
        if (!this.config.ownerId) blockers.push('owner_not_configured');
        if (!this.configured()) blockers.push('telegram_not_configured');
        if (!r['connection:owner']?.chat_id || r['connection:owner'].owner_id !== this.config.ownerId) blockers.push('telegram_not_connected');
        return { ready: blockers.length === 0, enabled: this.config.enabled === true && blockers.length === 0, blockers, active_facilities: activeFacilities, skipped_facilities: FACILITIES.filter(f => !activeFacilities.includes(f)) };
    }
    emit(r, episode, type, time) {
        const key = `event:${episode.id}:${type}`;
        if (r[key]) return;
        const event = { id: id(), episode_id: episode.id, patient_id: episode.patient_id, event_type: type, occurred_at: time, facility: episode.facility, ward: episode.ward, patient_name: episode.patient_name };
        r[key] = event; episode.latest_event_id = event.id;
        if (this.activeFacilities().includes(episode.facility) && this.activation(r).enabled && r['activation:baseline']) r[`outbox:${event.id}`] = { id: event.id, event_id: event.id, status: 'pending', attempts: 0, next_attempt_at: this.now().toISOString() };
    }
    upsert(r, row, observation, patientId, reason) {
        const key = `episode:${hash(`${observation.facility}\0${row.case_id}`)}`;
        let episode = r[key];
        if (episode && episode.patient_id !== patientId) fail('EPISODE_IDENTITY_CONFLICT', 409);
        if (episode?.identity_conflict && reason !== 'owner_confirmed') fail('EPISODE_IDENTITY_CONFLICT', 409);
        if (episode && Date.parse(episode.last_seen_at) > Date.parse(observation.observed_at)) return;
        if (!episode) episode = r[key] = { id: id(), patient_id: patientId, facility: observation.facility, case_id: row.case_id, first_seen_at: observation.observed_at, discharge_at: null, archive_status: 'not_requested', match_method: reason };
        const discharged = episode.discharge_at;
        const fields = ['patient_name', 'birth_date', 'hospital_mr_id', 'hospital_patient_id', 'ward', 'dpjp', 'admission_at'];
        for (const field of fields) if (row[field] != null) episode[field] = row[field];
        Object.assign(episode, { unit: observation.unit, last_seen_at: observation.observed_at, active: true, identity_conflict: false, is_private_clinic_patient: true, discharge_at: discharged || (row.discharge_confirmed ? row.discharge_at : null) });
        delete episode.discharge_confirmed;
        this.emit(r, episode, observation.unit, observation.observed_at);
        if (episode.discharge_at) {
            episode.active = false; this.emit(r, episode, 'discharged', episode.discharge_at);
            if (!r[`job:${episode.id}`]) r[`job:${episode.id}`] = { episode_id: episode.id, attempts: 0, status: 'pending', next_attempt_at: this.now().toISOString() };
        }
    }
    async ingest(input) {
        const observation = validateObservation(input, this.now());
        const identity = await this.identity();
        return this.store.transact(async r => {
            const sourceKey = `source:${observation.facility}:${observation.unit}`;
            const previous = r[sourceKey];
            if (previous?.last_observed_at && Date.parse(previous.last_observed_at) > Date.parse(observation.observed_at)) return { accepted: 0, ignored: 'older_snapshot' };
            r[sourceKey] = { ...previous, facility: observation.facility, unit: observation.unit, status: observation.status, verified: previous?.verified || false, last_observed_at: observation.observed_at, last_success_at: observation.status === 'ok' && observation.complete ? observation.observed_at : previous?.last_success_at || null, message: observation.status === 'ok' ? observation.complete ? 'complete' : 'partial' : observation.status };
            if (observation.status === 'unsupported') return { accepted: 0 };
            let accepted = 0;
            // Failed enrichment may explicitly report conflicting source identities.
            // Process those retractions, but never accept positive rows from failures.
            for (const row of observation.patients.filter(p => observation.status === 'ok' || p.identity_conflict)) {
                const match = matchPatient(row, observation.facility, identity.cohort, identity.external);
                const pendingKey = `pending:${hash(`${observation.facility}\0${row.case_id}`)}`;
                const existing = r[`episode:${hash(`${observation.facility}\0${row.case_id}`)}`];
                // Once source identities disagree, old cached identity cannot silently
                // restore ownership. Only checked, audited owner confirmation may do so.
                const conflict = row.identity_conflict || existing && (existing.identity_conflict || (row.hospital_mr_id && existing.hospital_mr_id && mrKey(observation.facility, row.hospital_mr_id) !== mrKey(observation.facility, existing.hospital_mr_id)) || (row.birth_date && existing.birth_date && row.birth_date !== existing.birth_date) || (match.patient_id && existing.patient_id !== match.patient_id) || match.reason === 'identity_conflict');
                if (conflict) {
                    match.patient_id = null; match.reason = 'identity_conflict'; match.relevant = !!existing || match.relevant;
                    if (existing) { existing.identity_conflict = true; existing.is_private_clinic_patient = false; existing.active = false; }
                }
                else if (existing?.match_method === 'owner_confirmed' && !existing.identity_conflict && identity.cohort.some(p => p.id === existing.patient_id)) { match.patient_id = existing.patient_id; match.reason = 'owner_confirmed'; }
                if (match.patient_id) { this.upsert(r, row, observation, match.patient_id, match.reason); delete r[pendingKey]; accepted++; }
                else if (match.relevant) r[pendingKey] = { id: r[pendingKey]?.id || id(), facility: observation.facility, unit: observation.unit, observed_at: observation.observed_at, ...row, reason: match.reason, conflict_evidence: r[pendingKey]?.conflict_evidence || (match.reason === 'identity_conflict' ? { ...row, observed_at: observation.observed_at } : undefined), candidate_patient_ids: match.candidates, candidates: identity.cohort.filter(p => match.candidates.includes(p.id)).map(p => ({ patient_id: p.id, patient_name: p.full_name, birth_date: dateOnly(p.birth_date) })) };
            }
            // Absence changes freshness only. It NEVER constitutes discharge.
            if (observation.status === 'ok' && observation.complete) {
                const seen = new Set(observation.patients.map(p => p.case_id));
                for (const episode of values(r, 'episode')) if (episode.facility === observation.facility && episode.unit === observation.unit && !seen.has(episode.case_id) && Date.parse(episode.last_seen_at) <= Date.parse(observation.observed_at)) episode.active = false;
            }
            return { accepted };
        });
    }
    async dashboard() {
        return this.store.transact(r => ({ patients: values(r, 'episode').map(e => ({ ...e, active: !!e.active && this.now().getTime() - Date.parse(e.last_seen_at) < 3600000 })), events: values(r, 'event').sort((a,b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 500), pending_matches: values(r, 'pending'), sources: FACILITIES.flatMap(facility => ['IGD', 'RI'].map(unit => r[`source:${facility}:${unit}`] || { facility, unit, status: 'unsupported', verified: false, last_success_at: null, message: 'not_observed' })), telegram: { configured: this.configured(), connected: !!r['connection:owner']?.chat_id, bot_username: this.config.botUsername || undefined }, activation: this.activation(r) }));
    }
    async eventDetails(eventId) {
        return this.store.transact(r => { const event = values(r, 'event').find(e => e.id === eventId); if (!event) fail('NOT_FOUND', 404); return { event, patient: values(r, 'episode').find(e => e.id === event.episode_id), archives: values(r, 'archive').filter(a => a.episode_id === event.episode_id) }; });
    }
    async patientArchives(patientId) { return this.store.transact(r => values(r, 'archive').filter(a => a.patient_id === patientId)); }
    async confirmMatch(pendingId, patientId) {
        const identity = await this.identity();
        return this.store.transact(r => {
            const entry = Object.entries(r).find(([k,v]) => k.startsWith('pending:') && v.id === pendingId); if (!entry) fail('NOT_FOUND', 404);
            const pending = entry[1];
            if (!identity.cohort.some(p => p.id === patientId)) fail('NOT_CLINIC_PATIENT', 409);
            const mapped = identity.external.filter(p => facilityName(p.facility) === pending.facility && pending.hospital_mr_id && mrKey(pending.facility, p.hospital_mr_id) === mrKey(pending.facility, pending.hospital_mr_id));
            const existing = r[`episode:${hash(`${pending.facility}\0${pending.case_id}`)}`];
            const patient = identity.cohort.find(p => p.id === patientId);
            if (mapped.some(p => p.patient_id !== patientId) || existing && (existing.patient_id !== patientId || existing.hospital_mr_id && pending.hospital_mr_id && mrKey(pending.facility, existing.hospital_mr_id) !== mrKey(pending.facility, pending.hospital_mr_id)) || pending.birth_date && dateOnly(patient.birth_date) && pending.birth_date !== dateOnly(patient.birth_date)) fail('IDENTITY_CONFLICT', 409);
            this.upsert(r, pending, pending, patientId, 'owner_confirmed');
            r[`audit:${id()}`] = { action: 'confirm_match', owner_id: this.config.ownerId, patient_id: patientId, pending_id: pendingId, conflict_evidence: pending.conflict_evidence || null, at: this.now().toISOString() };
            delete r[entry[0]]; return { confirmed: true };
        });
    }
    async pair() {
        if (!this.config.ownerId || !this.config.botToken || !this.config.botUsername || !this.config.webhookSecret) fail('TELEGRAM_NOT_CONFIGURED', 503);
        const token = crypto.randomBytes(24).toString('base64url');
        const expires_at = new Date(this.now().getTime() + 600000).toISOString();
        await this.store.transact(r => { for (const key of Object.keys(r)) if (key.startsWith('pair:')) delete r[key]; r[`pair:${hash(token)}`] = { expires_at }; });
        return { url: `https://t.me/${this.config.botUsername}?start=${token}`, expires_at };
    }
    async webhook(update, secret) {
        const expected = this.config.webhookSecret;
        if (!expected || typeof secret !== 'string' || !crypto.timingSafeEqual(hashBuffer(secret), hashBuffer(expected))) fail('FORBIDDEN', 403);
        const message = update?.message;
        const token = message?.text?.match(/^\/start ([A-Za-z0-9_-]{32})$/)?.[1];
        const plainStart = /^\/start(?:@[A-Za-z0-9_]+)?\s*$/.test(message?.text || '');
        if ((!token && !plainStart) || message.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) || message.chat.id <= 0) fail('INVALID_PAIRING');
        if (plainStart) return this.replyTelegramStatus(message.chat.id);
        const result = await this.store.transact(r => {
            const key = `pair:${hash(token)}`; const pair = r[key];
            if (!pair || Date.parse(pair.expires_at) <= this.now().getTime()) fail('PAIRING_EXPIRED');
            r['connection:owner'] = { chat_id: message.chat.id, paired_at: this.now().toISOString(), owner_id: this.config.ownerId };
            delete r[key]; return { connected: true };
        });
        await this.replyTelegramStatus(message.chat.id);
        return result;
    }
    async replyTelegramStatus(chatId) {
        const status = await this.store.transact(r => ({
            connected: r['connection:owner']?.chat_id === chatId && r['connection:owner']?.owner_id === this.config.ownerId,
            enabled: this.activation(r).enabled
        }));
        const message = status.connected
            ? `Telegram pribadi sudah tersambung ke COMM. ${status.enabled ? 'Notifikasi pasien aktif.' : 'Notifikasi pasien belum aktif; cakupan sumber RS dan pengaturan aktivasi masih perlu diselesaikan.'}`
            : 'Untuk menghubungkan Telegram pribadi, buka COMM mode Spesialis lalu pilih sambungkan Telegram pada Monitor Klinik Privat.';
        try { await this.sendTelegram(chatId, { text: message }); }
        catch (_) { /* Pairing remains saved; another Start can retry the confirmation. */ }
        return { connected: status.connected };
    }
    async disconnect() { return this.store.transact(r => { delete r['connection:owner']; for (const key of Object.keys(r)) if (key.startsWith('pair:')) delete r[key]; return { connected: false }; }); }
    async archiveJobs() {
        return this.store.transact(r => {
            const result = [];
            for (const job of values(r, 'job')) {
                if (result.length >= 2 || !job.next_attempt_at || Date.parse(job.next_attempt_at) > this.now().getTime() || job.lease_until && Date.parse(job.lease_until) > this.now().getTime()) continue;
                const episode = values(r, 'episode').find(e => e.id === job.episode_id);
                if (!episode?.discharge_at || episode.identity_conflict) continue;
                job.lease_until = new Date(this.now().getTime() + 900000).toISOString();
                job.job_token = id();
                result.push({ episode_id: episode.id, job_token: job.job_token, patient_id: episode.patient_id, facility: episode.facility, case_id: episode.case_id, hospital_mr_id: episode.hospital_mr_id, hospital_patient_id: episode.hospital_patient_id, discharge_at: episode.discharge_at });
            }
            return result;
        });
    }
    async uploadFile(episodeId, metadata, buffer) {
        if (!Buffer.isBuffer(buffer)) fail('INVALID_FILE_CONTENT');
        const file = descriptor({ ...metadata, byte_size: buffer.length });
        if (hash(buffer) !== file.sha256) fail('FILE_CHECKSUM_MISMATCH');
        const scope = await this.store.transact(r => { const e = values(r, 'episode').find(e => e.id === episodeId); if (!e?.discharge_at || e.identity_conflict) fail('EPISODE_NOT_DISCHARGED', 409); this.checkArchiveLease(r, episodeId, metadata.job_token); return { patient_id: e.patient_id, facility: e.facility }; });
        const key = `hospital-archives/${hash(`${scope.patient_id}\0${scope.facility}`)}/objects/${file.sha256}`;
        const blobKey = `blob:${hash(`${scope.patient_id}\0${scope.facility}\0${file.sha256}`)}`;
        const blob = await this.store.transact(r => r[blobKey]);
        if (!blob) await this.putArchiveObject(key, buffer, file.mime_type);
        const upload = { upload_id: id(), episode_id: episodeId, ...file, storage_key: key, retrieved_at: this.now().toISOString() };
        await this.store.transact(r => { this.checkArchiveLease(r, episodeId, metadata.job_token); r[`upload:${upload.upload_id}`] = upload; r[blobKey] = { storage_key: key, sha256: file.sha256, byte_size: file.byte_size }; });
        const { storage_key, episode_id, retrieved_at, ...publicFile } = upload; return publicFile;
    }
    async archiveResult(episodeId, input) {
        const archive = validateArchive(input);
        const fingerprint = hash(JSON.stringify({ status: archive.status, snapshot: archive.snapshot, sections: archive.sections, files: archive.files.map(f => ({ source_id: f.source_id, category: f.category, filename: f.filename, mime_type: f.mime_type, byte_size: f.byte_size, sha256: f.sha256 })), warnings: archive.warnings }));
        const prior = await this.store.transact(r => {
            const job = r[`job:${episodeId}`];
            if (!input.job_token || !job || job.job_token !== input.job_token) fail('ARCHIVE_LEASE_EXPIRED', 409);
            const episode = values(r, 'episode').find(e => e.id === episodeId);
            if (!episode || episode.identity_conflict) fail('EPISODE_IDENTITY_CONFLICT', 409);
            if (!job.lease_until && job.result_fingerprint === fingerprint) {
                const catalog = values(r, 'archive').find(a => a.episode_id === episodeId && a.fingerprint === fingerprint);
                if (catalog) return { archive_id: catalog.id, status: job.status, next_attempt_at: job.next_attempt_at };
            }
            this.checkArchiveLease(r, episodeId, input.job_token);
            return null;
        });
        if (prior) return prior;
        for (const file of archive.files) if (file.buffer) {
            const uploaded = await this.uploadFile(episodeId, { ...file, job_token: input.job_token }, file.buffer); file.upload_id = uploaded.upload_id; delete file.buffer;
        }
        const prepared = await this.store.transact(r => {
            const episode = values(r, 'episode').find(e => e.id === episodeId);
            if (!episode?.discharge_at || episode.identity_conflict || !r[`job:${episodeId}`]) fail('EPISODE_NOT_DISCHARGED', 409);
            const job = r[`job:${episodeId}`];
            if (!input.job_token || job.job_token !== input.job_token) fail('ARCHIVE_LEASE_EXPIRED', 409);
            const files = archive.files.map(file => {
                const upload = r[`upload:${file.upload_id}`];
                if (!upload || upload.episode_id !== episodeId || ['source_id', 'category', 'filename', 'mime_type', 'sha256', 'byte_size'].some(key => upload[key] !== file[key])) fail('INVALID_UPLOAD_REFERENCE');
                return upload;
            });
            const catalog = values(r, 'archive').find(a => a.episode_id === episodeId && a.fingerprint === fingerprint);
            if (catalog && !job.lease_until && job.status !== 'pending' && job.result_fingerprint === fingerprint) return { duplicate: { archive_id: catalog.id, status: job.status, next_attempt_at: job.next_attempt_at } };
            this.checkArchiveLease(r, episodeId, input.job_token);
            return { episode: { ...episode }, files, fingerprint, catalog };
        });
        if (prepared.duplicate) return prepared.duplicate;
        const { episode, files } = prepared;
        const archiveId = prepared.catalog?.id || id();
        let snapshotFile;
        if (!prepared.catalog) {
            const manifest = { episode_id: episodeId, patient_id: episode.patient_id, facility: episode.facility, case_id: episode.case_id, hospital_mr_id: episode.hospital_mr_id, discharge_at: episode.discharge_at, retrieved_at: this.now().toISOString(), sections: archive.sections, warnings: archive.warnings, snapshot: archive.snapshot, files: files.map(({ upload_id, ...f }) => f) };
            const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(manifest)));
            const key = `hospital-archives/${hash(`${episode.patient_id}\0${episode.facility}`)}/manifests/${archiveId}.json.gz`;
            // R2 is outside the monitor lock. Commit rechecks the lease fence.
            await this.putArchiveObject(key, compressed, 'application/gzip');
            snapshotFile = { id: id(), filename: 'snapshot.json.gz', mime_type: 'application/gzip', sha256: hash(compressed), byte_size: compressed.length, storage_key: key, episode_id: episodeId };
        }
        return this.store.transact(r => {
            const job = r[`job:${episodeId}`];
            const current = values(r, 'episode').find(e => e.id === episodeId);
            if (!current || current.identity_conflict || current.patient_id !== episode.patient_id) fail('EPISODE_IDENTITY_CONFLICT', 409);
            const existingCatalog = values(r, 'archive').find(a => a.episode_id === episodeId && a.fingerprint === fingerprint);
            if (input.job_token === job.job_token && !job.lease_until && job.result_fingerprint === fingerprint && existingCatalog) return { archive_id: existingCatalog.id, status: job.status, next_attempt_at: job.next_attempt_at };
            this.checkArchiveLease(r, episodeId, input.job_token);
            let catalog = existingCatalog;
            if (!catalog) {
                r[`file:${snapshotFile.id}`] = snapshotFile;
                const publicFiles = files.map(file => { const stored = { ...file, id: id() }; r[`file:${stored.id}`] = stored; const { storage_key, upload_id, ...visible } = stored; return visible; });
                const { storage_key, ...publicSnapshot } = snapshotFile;
                catalog = { id: archiveId, episode_id: episodeId, patient_id: episode.patient_id, facility: episode.facility, case_id: episode.case_id, status: archive.status, sections: archive.sections, warnings: archive.warnings, created_at: this.now().toISOString(), fingerprint, files: [...publicFiles, publicSnapshot] };
                r[`archive:${archiveId}`] = catalog;
            }
            job.attempts++; job.lease_until = null; job.status = archive.status;
            job.result_fingerprint = fingerprint;
            const hours = [24, 72, 168];
            job.next_attempt_at = archive.status === 'ready' || job.attempts > hours.length ? null : new Date(Math.max(this.now().getTime() + 60000, Date.parse(episode.discharge_at) + hours[job.attempts - 1] * 3600000)).toISOString();
            current.archive_status = archive.status;
            if (archive.status === 'ready') this.emit(r, current, 'archive_ready', this.now().toISOString());
            return { archive_id: catalog.id, status: archive.status, next_attempt_at: job.next_attempt_at };
        });
    }
    async download(fileId) {
        const file = await this.store.transact(r => {
            const item = r[`file:${fileId}`]; if (!item) fail('NOT_FOUND', 404);
            const episode = values(r, 'episode').find(e => e.id === item.episode_id);
            if (!episode || episode.identity_conflict) fail('EPISODE_IDENTITY_CONFLICT', 409);
            return item;
        });
        const encoded = encodeURIComponent(file.filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
        return { download_url: await this.storage.getSignedDownloadUrl(file.storage_key, 300, undefined, { contentType: 'application/octet-stream', contentDisposition: `attachment; filename*=UTF-8''${encoded}` }), filename: file.filename };
    }
    checkArchiveLease(r, episodeId, token) {
        const job = r[`job:${episodeId}`];
        if (!token || !job || job.job_token !== token || !job.lease_until || Date.parse(job.lease_until) <= this.now().getTime()) fail('ARCHIVE_LEASE_EXPIRED', 409);
    }
    async putArchiveObject(key, buffer, mimeType) {
        return this.storage.uploadBuffer(key, buffer, mimeType, undefined, { abortSignal: AbortSignal.timeout(90000) });
    }
    async retryArchive(episodeId) {
        return this.store.transact(r => {
            const episode = values(r, 'episode').find(e => e.id === episodeId);
            const job = r[`job:${episodeId}`];
            if (!episode?.discharge_at || episode.identity_conflict || !job) fail('EPISODE_NOT_DISCHARGED', 409);
            if (job.lease_until && Date.parse(job.lease_until) > this.now().getTime()) fail('ARCHIVE_JOB_BUSY', 409);
            job.status = 'pending'; job.next_attempt_at = this.now().toISOString();
            r[`audit:${id()}`] = { action: 'archive_retry', episode_id: episodeId, owner_id: this.config.ownerId, at: this.now().toISOString() };
            return { queued: true };
        });
    }
    // Local operations command only. Never exposed to census ingestion or browser.
    async verifySource(facility, unit, evidence) {
        if (!FACILITIES.includes(facility) || !['IGD','RI'].includes(unit)) fail();
        const verified_by = text(evidence?.verified_by, 100, true);
        const evidence_ref = text(evidence?.evidence_ref, 255, true);
        return this.store.transact(r => {
            const key = `source:${facility}:${unit}`;
            r[key] = { facility, unit, status: 'unsupported', ...r[key], verified: true, verified_at: this.now().toISOString(), verified_by, evidence_ref };
            r[`audit:${id()}`] = { action: 'verify_source', facility, unit, verified_by, evidence_ref, at: this.now().toISOString() };
            return { verified: true };
        });
    }
    async tick() {
        const jobs = await this.store.transact(r => {
            if (!this.activation(r).enabled) return [];
            if (!r['activation:baseline']) {
                r['activation:baseline'] = { at: this.now().toISOString() };
                r['outbox:baseline'] = { id: 'baseline', status: 'pending', attempts: 0, count: values(r, 'episode').filter(e => this.activeFacilities().includes(e.facility) && e.active && !e.discharge_at).length, next_attempt_at: this.now().toISOString() };
            }
            return values(r, 'outbox').filter(j => j.status !== 'sent' && Date.parse(j.next_attempt_at) <= this.now().getTime() && (!j.lease_until || Date.parse(j.lease_until) <= this.now().getTime())).slice(0, 10).map(j => {
                // Ten sequential sends, each bounded at 15 seconds, fit this lease.
                j.lease_until = new Date(this.now().getTime() + 300000).toISOString();
                return { ...j, chat: r['connection:owner'].chat_id, event: values(r, 'event').find(e => e.id === j.event_id) };
            });
        });
        for (const job of jobs) {
            try {
                // Recheck destination and activation immediately before network send.
                const allowed = await this.store.transact(r => this.activation(r).enabled && r['connection:owner']?.chat_id === job.chat && (!job.event || (this.activeFacilities().includes(job.event.facility) && !values(r, 'episode').find(e => e.id === job.event.episode_id)?.identity_conflict)));
                if (!allowed) continue;
                const e = job.event;
                const body = e ? { text: `${e.patient_name}\n${HOSPITAL_LABELS[e.facility]} — ${e.ward || '-'}\n${EVENT_LABELS[e.event_type]}\n${new Date(e.occurred_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`, reply_markup: { inline_keyboard: [[{ text: 'Buka di COMM', url: `${this.config.commUrl.replace(/\/$/, '')}/?clinicAlert=${e.id}` }]] } } : { text: `Pemantauan Klinik Privat aktif untuk ${this.activeFacilities().map(f => HOSPITAL_LABELS[f]).join(' dan ')}. ${job.count} episode terpantau saat aktivasi.` };
                await this.sendTelegram(job.chat, body);
                await this.store.transact(r => { const stored = r[`outbox:${job.id}`]; stored.status = 'sent'; stored.sent_at = this.now().toISOString(); stored.lease_until = null; });
            } catch (_) {
                await this.store.transact(r => { const stored = r[`outbox:${job.id}`]; stored.attempts++; stored.lease_until = null; stored.next_attempt_at = new Date(this.now().getTime() + Math.min(3600000, 30000 * 2 ** Math.min(stored.attempts, 7))).toISOString(); });
            }
        }
    }
}
const hashBuffer = value => crypto.createHash('sha256').update(value).digest();
module.exports = { ClinicHospitalMonitor, matchPatient, validateObservation, validateArchive, MAX_FILE };
