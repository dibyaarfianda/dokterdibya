(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PatientStoryDrafts = api;
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    const empty = () => ({ title: '', body: '', category: 'kehamilan', author_mode: 'nickname' });
    const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const id = () => globalThis.crypto.randomUUID();
    function createController(options) {
        const initialOwner = options.owner();
        const prefix = 'sisiwanita:story-draft:v1:' + encodeURIComponent(initialOwner || '') + ':';
        const localId = id();
        let record = null;
        let remote = { version: 0, state: 'empty', content: null };
        let conflict = null, locked = !initialOwner, destroyed = false, localSaved = false;
        let networkFailed = false, busy = null, submitting = false, timer = null, maxTimer = null;
        const storage = options.storage;
        const hasText = c => c && (c.title.length || c.body.length);
        const stamp = () => Math.max(Date.now(), (record?.updated_at || 0) + 1);
        function guard() {
            if (options.owner() !== initialOwner || !initialOwner) locked = true;
            return !locked && !destroyed;
        }
        function records() {
            const found = [];
            try {
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (!key?.startsWith(prefix)) continue;
                    try {
                        const r = JSON.parse(storage.getItem(key));
                        if (r?.local_id && typeof r.content?.title === 'string' && typeof r.content?.body === 'string' && typeof r.draft_id === 'string' && Number.isSafeInteger(r.base_version)) found.push(r);
                    } catch (_) { /* A damaged copy never blocks the other copies. */ }
                }
            } catch (_) { /* Storage can be denied in private browsing. */ }
            return found.sort((a, b) => b.updated_at - a.updated_at);
        }
        function persist() {
            localSaved = false;
            if (!record || !guard()) return;
            try { storage.setItem(prefix + localId, JSON.stringify({ ...record, local_id: localId })); localSaved = true; }
            catch (_) { /* Report the failure; keep the in-memory text. */ }
        }
        function alternatives() {
            const seen = new Set([JSON.stringify(record?.content)]);
            return records().filter(r => {
                const value = JSON.stringify(r.content);
                if (!r.dirty || r.action === 'DELETE' || !hasText(r.content) || seen.has(value)) return false;
                seen.add(value); return true;
            });
        }
        function state() {
            guard();
            let status = 'empty';
            if (locked) status = 'locked';
            else if (conflict) status = 'conflict';
            else if (submitting) status = 'sending';
            else if (record?.action === 'SUBMIT') status = 'delivery';
            else if (busy) status = 'saving';
            else if (record && (record.dirty || networkFailed)) status = localSaved ? 'local' : 'error';
            else if (record && remote.state === 'active') status = 'synced';
            return { content: locked ? empty() : copy(record?.content || empty()), status, locked, dirty: Boolean(record?.dirty),
                conflict: locked ? null : copy(conflict), alternatives: locked ? [] : copy(alternatives()),
                updated_at: remote.updated_at || null, localSaved, pendingDelete: record?.action === 'DELETE' && record.dirty, pendingSubmit: record?.action === 'SUBMIT' };
        }
        function emit() { options.onChange?.(state()); }
        function schedule() {
            clearTimeout(timer);
            if (!destroyed && !conflict && record?.dirty && record.action !== 'SUBMIT') {
                timer = setTimeout(() => { sync(); }, 1200);
                if (!maxTimer) maxTimer = setTimeout(() => { sync(); }, 10000);
            }
        }
        function cleanCopies(sent) {
            for (const r of records()) {
                if (r.draft_id !== sent.draft_id) continue;
                if (r.local_id !== localId && (!r.dirty || (r.mutation_id === sent.mutation_id && equal(r.content, sent.content)))) {
                    try { storage.removeItem(prefix + r.local_id); } catch (_) { /* Safe to leave a recovery copy. */ }
                }
            }
        }
        function adopt(s) {
            remote = copy(s); conflict = null;
            if (s.state !== 'active') {
                // An observed server deletion/submission retires acknowledged copies too.
                // Unsynced variants remain available as explicit recovery choices.
                for (const r of records()) {
                    if (!r.dirty || r.local_id === localId) {
                        try { storage.removeItem(prefix + r.local_id); } catch (_) { /* No false claim about device erasure. */ }
                    }
                }
            }
            record = s.state === 'active' ? { local_id: localId, draft_id: s.draft_id, content: copy(s.content), base_version: s.version,
                mutation_id: s.mutation_id || id(), updated_at: Date.now(), dirty: false, action: 'PUT' } : null;
            if (record) persist();
        }
        function reconcile(s) {
            if (s.version < remote.version) return; // Ignore a GET that started before our latest save.
            remote = copy(s);
            if (!record) { adopt(s); return; }
            if (record.action === 'SUBMIT') return; // Only a delivery receipt may clear this text.
            if (record.action === 'DELETE' && !record.dirty) {
                if (s.state === 'active') adopt(s);
                return;
            }
            if (s.draft_id === record.draft_id && s.mutation_id === record.mutation_id && (s.state === 'active' || s.state === 'deleted')) {
                record.base_version = s.version; record.dirty = false; persist(); return;
            }
            if (!record.dirty) { adopt(s); return; }
            if (s.version !== record.base_version || (s.draft_id === record.draft_id && ['deleted', 'submitted'].includes(s.state))) conflict = copy(s);
        }
        async function refresh() {
            if (!guard() || busy || submitting) { emit(); return; }
            try {
                const s = await options.api('GET');
                if (!guard()) { emit(); return; }
                networkFailed = false; reconcile(s);
                if (!conflict) schedule();
            } catch (_) { networkFailed = true; }
            emit();
        }
        async function init() {
            const found = records();
            // Unsynced edits take priority over an older acknowledged copy.
            const chosen = found.find(r => r.dirty) || found[0];
            if (chosen) { record = { ...copy(chosen), local_id: localId }; persist(); }
            emit(); await refresh();
        }
        function edit(content) {
            if (!guard() || submitting || record?.action === 'SUBMIT') { emit(); return; }
            if (!record || record.action === 'DELETE') record = { local_id: localId, draft_id: id(), base_version: remote.version, content: empty() };
            record = { ...record, content: copy(content), mutation_id: id(), updated_at: stamp(), dirty: true, action: 'PUT' };
            persist(); emit(); schedule();
        }
        async function sync() {
            clearTimeout(timer); clearTimeout(maxTimer); maxTimer = null;
            if (!guard()) { emit(); return; }
            if (busy) { await busy; if (record?.dirty && !conflict && record.action !== 'SUBMIT') return sync(); return; }
            if (!record?.dirty || conflict || record.action === 'SUBMIT') return;
            const sent = copy(record);
            busy = (async () => {
                try {
                    const s = await options.api(sent.action, sent);
                    if (!guard()) return;
                    networkFailed = false; remote = copy(s);
                    if (record?.draft_id !== sent.draft_id) { conflict = copy(s); return; }
                    record.base_version = s.version;
                    if (record.mutation_id === sent.mutation_id) { record.dirty = false; cleanCopies(sent); }
                    persist();
                } catch (error) {
                    if (!guard()) return;
                    networkFailed = true;
                    if (error.code === 'DRAFT_CONFLICT') { conflict = copy(error.data); remote = copy(error.data); }
                }
            })();
            emit(); await busy; busy = null; emit();
            if (record?.dirty && !conflict && !networkFailed) schedule();
        }
        async function keepMine() {
            if (!guard() || !record || record.action === 'SUBMIT') return;
            const latest = await options.api('GET');
            if (!guard()) { emit(); return; }
            remote = copy(latest); record.base_version = latest.version;
            if (['submitted', 'deleted'].includes(latest.state) && latest.draft_id === record.draft_id) record.draft_id = id();
            record.mutation_id = id(); record.dirty = true; conflict = null; persist(); await sync();
        }
        async function useServer() {
            if (!guard() || submitting || record?.action === 'SUBMIT') return;
            const latest = await options.api('GET');
            if (!guard()) { emit(); return; }
            // Preserve the displaced unsynced copy under its own recovery key.
            if (record?.dirty) {
                const recoveryId = id();
                try { storage.setItem(prefix + recoveryId, JSON.stringify({ ...record, local_id: recoveryId })); } catch (_) { throw new Error('Salinan perangkat gagal disimpan. Salin tulisan sebelum mengganti versi.'); }
            }
            adopt(latest); emit();
        }
        function useAlternative(selectedId) {
            if (!guard() || submitting || record?.action === 'SUBMIT') return;
            const selected = records().find(r => r.local_id === selectedId);
            if (!selected) return;
            if (record?.dirty) {
                const recoveryId = id();
                try { storage.setItem(prefix + recoveryId, JSON.stringify({ ...record, local_id: recoveryId })); } catch (_) { return; }
            }
            record = { ...copy(selected), local_id: localId }; persist(); reconcile(remote); emit(); schedule();
        }
        async function remove() {
            if (!guard() || submitting || record?.action === 'SUBMIT') throw new Error('Pastikan status pengiriman sebelum menghapus draft.');
            if (busy) await busy;
            if (!guard()) return;
            if (conflict) throw new Error('Pilih versi draft terlebih dahulu sebelum menghapus.');
            const previous = copy(record);
            record = { local_id: localId, draft_id: record?.draft_id || id(), base_version: remote.version, mutation_id: id(), content: empty(), updated_at: stamp(), dirty: true, action: 'DELETE' };
            persist();
            if (localSaved && previous) {
                for (const r of records()) {
                    if (r.local_id !== localId && r.draft_id === previous.draft_id && equal(r.content, previous.content)) {
                        try { storage.removeItem(prefix + r.local_id); } catch (_) { /* Server tombstone still blocks resurrection. */ }
                    }
                }
            }
            emit(); await sync();
        }
        async function submit() {
            if (!guard() || submitting) throw new Error('Sesi berubah atau pengiriman sedang berlangsung.');
            if (record?.action !== 'SUBMIT') {
                await sync();
                if (!guard() || !record || record.dirty || conflict) throw new Error('Draft belum tersinkron. Periksa koneksi dan selesaikan konflik terlebih dahulu.');
                if (!record.content.title.trim() || !record.content.body.trim()) throw new Error('Judul dan isi cerita wajib diisi.');
                record.action = 'SUBMIT'; record.mutation_id = id(); record.dirty = true; persist();
            }
            const sent = copy(record); submitting = true; emit();
            try {
                const receipt = await options.api('SUBMIT', sent);
                if (!guard()) throw new Error('Sesi berubah. Periksa cerita dari akun asal.');
                if (!receipt.story_id) throw new Error('Tanda terima belum tersedia. Draft tetap dipertahankan.');
                for (const r of records()) {
                    if (r.draft_id === sent.draft_id && (!r.dirty || equal(r.content, sent.content))) {
                        try { storage.removeItem(prefix + r.local_id); } catch (_) { /* Receipt still prevents duplicates. */ }
                    }
                }
                record = null; remote = copy(receipt); conflict = null; return receipt;
            } catch (error) {
                // A definitive rejection did not create a story. A network failure remains uncertain.
                if (guard() && ['DRAFT_CONFLICT', 'INCOMPLETE_DRAFT', 'INVALID_DRAFT'].includes(error.code)) {
                    record.action = 'PUT'; record.dirty = true; record.mutation_id = id();
                    if (error.code === 'DRAFT_CONFLICT') { conflict = copy(error.data); remote = copy(error.data); }
                    persist();
                }
                throw error;
            } finally { submitting = false; emit(); }
        }
        function destroy() { destroyed = true; clearTimeout(timer); clearTimeout(maxTimer); }
        return { init, state, edit, sync, refresh, keepMine, useServer, useAlternative, remove, submit, destroy, deviceChanged: emit, checkOwner: () => { guard(); emit(); } };
    }
    return { createController };
});
