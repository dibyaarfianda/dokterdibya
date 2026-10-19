(function () {
    'use strict';
    window.PatientStoryEditor = { mount };
    function mount({ apiRequest, showToast, onSubmitted }) {
        const $ = id => document.getElementById(id);
        const form = $('storyForm'), modal = $('submitModal');
        const fields = [$('storyTitle'), $('storyBody'), $('storyCategory'), ...form.querySelectorAll('[name="authorMode"]')];
        const owner = () => {
            const s = window.PatientSession, u = s?.getUser();
            return s?.getToken() && u?.id ? (s.isDemoMode() ? 'demo:' + (u.demo_session_id || u.id) : 'patient:' + u.id) : null;
        };
        let storage;
        try { storage = window.localStorage; } catch (_) { storage = { length: 0, setItem() { throw new Error('storage denied'); } }; }
        const controller = window.PatientStoryDrafts.createController({ owner, storage, onChange: render,
            async api(method, body) {
                const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 12000);
                try {
                    const result = await apiRequest('/api/patient-stories/draft' + (method === 'SUBMIT' ? '/submit' : ''), {
                        method: method === 'SUBMIT' ? 'POST' : method, signal: abort.signal,
                        ...(body ? { body: JSON.stringify({ draft_id: body.draft_id, mutation_id: body.mutation_id, base_version: body.base_version, ...(method === 'PUT' ? { content: body.content } : {}) }) } : {})
                    });
                    if (!result?.success) throw Object.assign(new Error(result?.message || 'Sesi berakhir atau draft belum tersimpan.'), { code: result?.code, data: result?.data });
                    return result.data;
                } finally { clearTimeout(timer); }
            }
        });
        function time(value) {
            return value ? new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date(value)).replace('.', ':') + ' WIB' : '';
        }
        function render(s) {
            if ($('storyTitle').value !== s.content.title) $('storyTitle').value = s.content.title;
            if ($('storyBody').value !== s.content.body) $('storyBody').value = s.content.body;
            if ($('storyCategory').value !== s.content.category) $('storyCategory').value = s.content.category;
            form.querySelectorAll('[name="authorMode"]').forEach(r => { r.checked = r.value === s.content.author_mode; });
            $('titleCount').textContent = s.content.title.length; $('bodyCount').textContent = s.content.body.length;
            const messages = {
                empty: 'Draft bersifat privat. Tulisan tersimpan otomatis saat Anda mengetik.',
                locked: 'Sesi akun berubah. Masuk kembali dengan akun asal untuk melanjutkan draft.',
                saving: s.localSaved ? 'Tersimpan di perangkat • Menyinkronkan ke server…' : 'Menyimpan ke server…',
                synced: (s.localSaved ? 'Tersimpan di perangkat dan server' : 'Tersimpan di server; penyimpanan perangkat bermasalah') + (s.updated_at ? ' • ' + time(s.updated_at) : ''),
                local: s.pendingDelete ? 'Penghapusan disimpan di perangkat; menunggu koneksi untuk menghapus di server.' : s.dirty ? 'Tersimpan di perangkat • Menunggu koneksi ke server' : 'Salinan perangkat tersedia • Server sedang tidak terhubung',
                error: 'Penyimpanan perangkat dan server gagal. Jangan tutup halaman; salin tulisan Anda agar tidak hilang.',
                conflict: 'Ada versi berbeda. Tulisan Anda dipertahankan; pilih versi sebelum melanjutkan sinkronisasi.',
                sending: 'Mengirim cerita… Draft dipertahankan sampai server memberi tanda terima.',
                delivery: 'Status pengiriman belum pasti. Draft tetap disimpan. Tekan “Periksa Pengiriman” untuk memeriksa tanpa membuat kiriman ganda.'
            };
            $('draftStatus').textContent = messages[s.status]; $('draftStatus').dataset.state = s.status;
            const active = Boolean(s.content.title || s.content.body || s.pendingDelete || s.pendingSubmit);
            $('draftResume').hidden = !active || s.locked;
            $('draftResumeTime').textContent = s.updated_at ? 'Terakhir tersimpan di server ' + time(s.updated_at) : 'Salinan tulisan tersedia di perangkat ini';
            $('draftConflict').hidden = !s.conflict;
            $('draftServerPreview').textContent = s.conflict?.state === 'active' ? s.conflict.content.title + '\n\n' + s.conflict.content.body : 'Draft di server sudah dihapus atau dikirim. Tulisan Anda tetap tersedia di formulir.';
            $('draftAlternatives').hidden = !s.alternatives.length;
            const select = $('draftAlternativeSelect'), selected = select.value;
            select.replaceChildren(...s.alternatives.map(r => new Option((r.content.title || 'Tanpa judul') + ' • ' + time(r.updated_at), r.local_id)));
            if ([...select.options].some(o => o.value === selected)) select.value = selected;
            const frozen = s.locked || s.status === 'sending' || s.pendingSubmit;
            fields.forEach(field => { field.disabled = frozen; });
            $('submitStoryBtn').disabled = s.locked || s.status === 'sending' || s.status === 'saving' || Boolean(s.conflict);
            $('submitStoryBtn').textContent = s.status === 'sending' ? 'Mengirim…' : s.pendingSubmit ? 'Periksa Pengiriman' : 'Kirim untuk Review';
            $('deleteDraftBtn').disabled = frozen || Boolean(s.conflict) || !active;
            ['draftKeepMine', 'draftUseServer', 'draftUseAlternative'].forEach(key => { $(key).disabled = frozen; });
        }
        function readForm() {
            controller.edit({ title: $('storyTitle').value, body: $('storyBody').value, category: $('storyCategory').value, author_mode: form.querySelector('[name="authorMode"]:checked')?.value || 'nickname' });
        }
        form.addEventListener('input', readForm); form.addEventListener('change', readForm);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            try { await controller.submit(); showToast('Cerita terkirim dan menunggu review', 'success'); close(); await onSubmitted(); }
            catch (error) { showToast(error.message || 'Pengiriman belum pasti. Draft tetap disimpan.', 'warning'); }
        });
        const safely = fn => async () => { try { await fn(); } catch (error) { showToast(error.message || 'Belum berhasil. Tulisan tetap dipertahankan.', 'warning'); } };
        $('draftResumeBtn').addEventListener('click', open);
        $('draftKeepMine').addEventListener('click', safely(() => controller.keepMine()));
        $('draftUseServer').addEventListener('click', safely(() => controller.useServer()));
        $('draftUseAlternative').addEventListener('click', () => controller.useAlternative($('draftAlternativeSelect').value));
        $('deleteDraftBtn').addEventListener('click', () => $('deleteDraftDialog').showModal());
        $('cancelDeleteDraft').addEventListener('click', () => $('deleteDraftDialog').close());
        $('confirmDeleteDraft').addEventListener('click', safely(async () => { $('deleteDraftDialog').close(); await controller.remove(); }));
        function open() { modal.classList.add('active'); document.body.style.overflow = 'hidden'; render(controller.state()); controller.refresh(); }
        function close() { controller.sync(); modal.classList.remove('active'); document.body.style.overflow = ''; }
        document.addEventListener('visibilitychange', () => document.hidden ? controller.sync() : controller.refresh());
        window.addEventListener('pagehide', () => controller.sync());
        window.addEventListener('pageshow', () => controller.refresh());
        window.addEventListener('online', () => controller.refresh());
        window.addEventListener('storage', event => { if (event.key?.startsWith('sisiwanita:story-draft:')) controller.deviceChanged(); });
        window.addEventListener('auth:credentials-changed', () => controller.checkOwner());
        window.addEventListener('beforeunload', event => { const s = controller.state(); if (s.dirty && !s.localSaved) { event.preventDefault(); event.returnValue = ''; } });
        setInterval(() => { if (!document.hidden) controller.refresh(); }, 15000);
        controller.init();
        return { open, close };
    }
})();
