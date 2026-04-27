(function() {
    'use strict';

    const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api'
        : 'https://dokterdibya.com/api';
    const MIN_OPTIONS = 2;
    const MAX_OPTIONS = 10;

    let socket = null;
    let initialized = false;
    let pollsById = new Map();

    function getToken() {
        return localStorage.getItem('vps_auth_token') ||
               sessionStorage.getItem('vps_auth_token') ||
               localStorage.getItem('token') ||
               localStorage.getItem('auth_token');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text || '');
        return div.innerHTML;
    }

    function formatDate(value) {
        if (!value) return '-';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString('id-ID', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getOptionsListEl() {
        return document.getElementById('voting-options-list');
    }

    function getEditOptionsListEl() {
        return document.getElementById('voting-edit-options-list');
    }

    function updateOptionRowsUI() {
        const listEl = getOptionsListEl();
        if (!listEl) return;

        const rows = Array.from(listEl.querySelectorAll('.voting-option-row'));
        rows.forEach((row, index) => {
            const indexEl = row.querySelector('.voting-option-index');
            const inputEl = row.querySelector('.voting-option-input');
            const removeBtn = row.querySelector('.btn-remove-voting-option');

            if (indexEl) {
                indexEl.textContent = String(index + 1);
            }

            if (inputEl) {
                inputEl.placeholder = `Isi jawaban ${index + 1}`;
            }

            if (removeBtn) {
                removeBtn.style.display = rows.length > MIN_OPTIONS ? 'inline-flex' : 'none';
            }
        });

        const addBtn = document.getElementById('btn-add-voting-option');
        if (addBtn) {
            addBtn.disabled = rows.length >= MAX_OPTIONS;
        }
    }

    function addOptionRow(value = '') {
        const listEl = getOptionsListEl();
        if (!listEl) return;

        const totalRows = listEl.querySelectorAll('.voting-option-row').length;
        if (totalRows >= MAX_OPTIONS) {
            toastr.warning(`Maksimal ${MAX_OPTIONS} opsi jawaban`);
            return;
        }

        const row = document.createElement('div');
        row.className = 'input-group input-group-sm mb-2 voting-option-row';
        row.innerHTML = `
            <div class="input-group-prepend">
                <span class="input-group-text" style="min-width: 66px;">
                    <input type="radio" name="voting-option-preview" class="mr-1" ${totalRows === 0 ? 'checked' : ''}>
                    <span class="voting-option-index">${totalRows + 1}</span>
                </span>
            </div>
            <input type="text" class="form-control voting-option-input" maxlength="255" placeholder="Isi jawaban ${totalRows + 1}" value="${escapeHtml(value)}">
            <div class="input-group-append">
                <button class="btn btn-outline-danger btn-remove-voting-option" type="button" title="Hapus opsi">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        const removeBtn = row.querySelector('.btn-remove-voting-option');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                row.remove();
                updateOptionRowsUI();
            });
        }

        listEl.appendChild(row);
        updateOptionRowsUI();
    }

    function collectOptions() {
        const listEl = getOptionsListEl();
        if (!listEl) return [];

        const raw = Array.from(listEl.querySelectorAll('.voting-option-input'))
            .map((input) => String(input.value || '').trim())
            .filter((value) => value.length > 0);

        return raw.filter((value, index) => raw.indexOf(value) === index).slice(0, MAX_OPTIONS);
    }

    function updateEditOptionRowsUI() {
        const listEl = getEditOptionsListEl();
        if (!listEl) return;

        const rows = Array.from(listEl.querySelectorAll('.voting-edit-option-row'));
        rows.forEach((row, index) => {
            const indexEl = row.querySelector('.voting-edit-option-index');
            const inputEl = row.querySelector('.voting-edit-option-input');
            const removeBtn = row.querySelector('.btn-remove-voting-edit-option');

            if (indexEl) {
                indexEl.textContent = String(index + 1);
            }

            if (inputEl) {
                inputEl.placeholder = `Isi jawaban ${index + 1}`;
            }

            if (removeBtn) {
                removeBtn.style.display = rows.length > MIN_OPTIONS ? 'inline-flex' : 'none';
            }
        });

        const addBtn = document.getElementById('btn-add-voting-edit-option');
        if (addBtn) {
            addBtn.disabled = rows.length >= MAX_OPTIONS;
        }
    }

    function addEditOptionRow(option = {}) {
        const listEl = getEditOptionsListEl();
        if (!listEl) return;

        const totalRows = listEl.querySelectorAll('.voting-edit-option-row').length;
        if (totalRows >= MAX_OPTIONS) {
            toastr.warning(`Maksimal ${MAX_OPTIONS} opsi jawaban`);
            return;
        }

        const optionId = Number(option.id);
        const normalizedId = Number.isInteger(optionId) && optionId > 0 ? optionId : null;
        const optionText = String(option.option_text || '').trim();

        const row = document.createElement('div');
        row.className = 'input-group input-group-sm mb-2 voting-edit-option-row';
        if (normalizedId) {
            row.setAttribute('data-option-id', String(normalizedId));
        }
        row.innerHTML = `
            <div class="input-group-prepend">
                <span class="input-group-text" style="min-width: 66px;">
                    <input type="radio" name="voting-edit-option-preview" class="mr-1" ${totalRows === 0 ? 'checked' : ''}>
                    <span class="voting-edit-option-index">${totalRows + 1}</span>
                </span>
            </div>
            <input type="text" class="form-control voting-edit-option-input" maxlength="255" placeholder="Isi jawaban ${totalRows + 1}" value="${escapeHtml(optionText)}">
            <div class="input-group-append">
                <button class="btn btn-outline-danger btn-remove-voting-edit-option" type="button" title="Hapus opsi">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        const removeBtn = row.querySelector('.btn-remove-voting-edit-option');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                row.remove();
                updateEditOptionRowsUI();
            });
        }

        listEl.appendChild(row);
        updateEditOptionRowsUI();
    }

    function collectEditOptions() {
        const listEl = getEditOptionsListEl();
        if (!listEl) return [];

        const rows = Array.from(listEl.querySelectorAll('.voting-edit-option-row'));
        const seen = new Set();
        const options = [];

        rows.forEach((row) => {
            const inputEl = row.querySelector('.voting-edit-option-input');
            const optionText = String(inputEl ? inputEl.value : '').trim();
            if (!optionText) return;

            const dedupeKey = optionText.toLowerCase();
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);

            const payload = { option_text: optionText };
            const rawId = Number(row.getAttribute('data-option-id'));
            if (Number.isInteger(rawId) && rawId > 0) {
                payload.id = rawId;
            }

            options.push(payload);
        });

        return options.slice(0, MAX_OPTIONS);
    }

    function resetOptionRows() {
        const listEl = getOptionsListEl();
        if (!listEl) return;

        listEl.innerHTML = '';
        addOptionRow('');
        addOptionRow('');
    }

    function initOptionEditor() {
        const addBtn = document.getElementById('btn-add-voting-option');
        if (addBtn && !addBtn.dataset.boundVoting) {
            addBtn.addEventListener('click', () => addOptionRow(''));
            addBtn.dataset.boundVoting = 'true';
        }

        const listEl = getOptionsListEl();
        if (listEl && !listEl.dataset.readyVoting) {
            resetOptionRows();
            listEl.dataset.readyVoting = 'true';
            return;
        }

        if (listEl && !listEl.querySelector('.voting-option-row')) {
            resetOptionRows();
        }
    }

    function ensureEditModal() {
        if (document.getElementById('voting-edit-modal')) {
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'voting-edit-modal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title"><i class="fas fa-edit mr-2"></i>Edit Voting</h5>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <form id="voting-edit-form" style="display:flex;flex-direction:column;max-height:calc(100vh - 180px);">
                        <div class="modal-body" style="overflow-y:auto;">
                            <input type="hidden" id="voting-edit-poll-id">
                            <div class="form-group">
                                <label for="voting-edit-title">Judul Voting</label>
                                <input type="text" class="form-control" id="voting-edit-title" maxlength="180" required>
                            </div>
                            <div class="form-group">
                                <label for="voting-edit-description">Deskripsi (Opsional)</label>
                                <textarea class="form-control" id="voting-edit-description" rows="3" maxlength="1000"></textarea>
                            </div>
                            <div class="form-group">
                                <label>Opsi Jawaban</label>
                                <div id="voting-edit-options-list" class="mb-2"></div>
                                <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-add-voting-edit-option">
                                    <i class="fas fa-plus mr-1"></i>Tambah Opsi
                                </button>
                                <small class="form-text text-muted">Minimal 2 opsi, maksimal 10 opsi.</small>
                            </div>
                            <div class="form-group mb-0">
                                <div class="custom-control custom-switch">
                                    <input type="checkbox" class="custom-control-input" id="voting-edit-show-on-open">
                                    <label class="custom-control-label" for="voting-edit-show-on-open">Tampilkan popup saat pasien membuka portal</label>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
                            <button type="submit" class="btn btn-warning" id="btn-save-voting-edit">
                                <i class="fas fa-save mr-1"></i>Simpan Perubahan
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const addBtn = document.getElementById('btn-add-voting-edit-option');
        if (addBtn && !addBtn.dataset.boundVotingEdit) {
            addBtn.addEventListener('click', () => addEditOptionRow({ option_text: '' }));
            addBtn.dataset.boundVotingEdit = 'true';
        }

        const editForm = document.getElementById('voting-edit-form');
        if (editForm && !editForm.dataset.boundVotingEdit) {
            editForm.addEventListener('submit', saveVotingEdit);
            editForm.dataset.boundVotingEdit = 'true';
        }
    }

    function openVotingEditPoll(pollId) {
        const poll = pollsById.get(Number(pollId));
        if (!poll) {
            toastr.warning('Data voting tidak ditemukan. Silakan refresh.');
            return;
        }

        ensureEditModal();

        const pollIdEl = document.getElementById('voting-edit-poll-id');
        const titleEl = document.getElementById('voting-edit-title');
        const descriptionEl = document.getElementById('voting-edit-description');
        const showOnOpenEl = document.getElementById('voting-edit-show-on-open');
        const optionsListEl = getEditOptionsListEl();

        if (!pollIdEl || !titleEl || !descriptionEl || !showOnOpenEl || !optionsListEl) {
            toastr.error('Form edit voting tidak tersedia');
            return;
        }

        pollIdEl.value = String(poll.id);
        titleEl.value = String(poll.title || '');
        descriptionEl.value = String(poll.description || '');
        showOnOpenEl.checked = poll.show_on_open !== 0;

        optionsListEl.innerHTML = '';
        const existingOptions = Array.isArray(poll.options) ? poll.options : [];
        existingOptions.forEach((option) => addEditOptionRow(option));

        if (existingOptions.length < MIN_OPTIONS) {
            while (optionsListEl.querySelectorAll('.voting-edit-option-row').length < MIN_OPTIONS) {
                addEditOptionRow({ option_text: '' });
            }
        }

        $('#voting-edit-modal').modal('show');
    }

    async function saveVotingEdit(event) {
        event.preventDefault();

        const pollIdEl = document.getElementById('voting-edit-poll-id');
        const titleEl = document.getElementById('voting-edit-title');
        const descriptionEl = document.getElementById('voting-edit-description');
        const showOnOpenEl = document.getElementById('voting-edit-show-on-open');
        const submitBtn = document.getElementById('btn-save-voting-edit');

        const pollId = Number(pollIdEl ? pollIdEl.value : 0);
        const title = String(titleEl ? titleEl.value : '').trim();
        const description = String(descriptionEl ? descriptionEl.value : '').trim();
        const showOnOpen = showOnOpenEl ? showOnOpenEl.checked : true;
        const options = collectEditOptions();

        if (!Number.isInteger(pollId) || pollId <= 0) {
            toastr.error('ID voting tidak valid');
            return;
        }

        if (!title) {
            toastr.warning('Judul voting wajib diisi');
            return;
        }

        if (options.length < MIN_OPTIONS) {
            toastr.warning('Minimal 2 opsi jawaban');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';
        }

        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/polls/staff/${pollId}/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title,
                    description,
                    options,
                    show_on_open: showOnOpen
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal memperbarui voting');
            }

            toastr.success('Voting berhasil diperbarui');
            $('#voting-edit-modal').modal('hide');
            await loadVotingList();
        } catch (error) {
            toastr.error(error.message || 'Gagal memperbarui voting');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save mr-1"></i>Simpan Perubahan';
            }
        }
    }

    function setupSocket() {
        if (socket) {
            return;
        }

        const socketUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : 'https://dokterdibya.com';

        socket = io(socketUrl, {
            transports: ['polling'],
            upgrade: false
        });

        socket.on('poll:created', () => loadVotingList());
        socket.on('poll:voted', () => loadVotingList());
        socket.on('poll:updated', () => loadVotingList());
        socket.on('poll:closed', () => loadVotingList());
    }

    function renderPollCard(poll) {
        const totalVotes = Number(poll.total_votes || 0);
        const optionsHtml = (poll.options || []).map((option) => {
            const percent = Number(option.vote_percent || 0);
            return `
                <div class="mb-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <small>${escapeHtml(option.option_text)}</small>
                        <small><strong>${option.vote_count}</strong> (${percent.toFixed(2)}%)</small>
                    </div>
                    <div class="progress progress-xs">
                        <div class="progress-bar bg-info" role="progressbar" style="width: ${Math.min(100, Math.max(0, percent))}%;"></div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="card card-outline ${poll.status === 'active' ? 'card-warning' : 'card-secondary'} mb-3">
                <div class="card-header py-2 d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${escapeHtml(poll.title)}</strong>
                        <div class="text-muted small">Dibuat: ${formatDate(poll.created_at)} • Oleh: ${escapeHtml(poll.created_by_name || 'Staff')}</div>
                    </div>
                    <div class="text-right">
                        <span class="badge badge-${poll.status === 'active' ? 'warning' : 'secondary'}">${poll.status === 'active' ? 'Aktif' : 'Ditutup'}</span>
                        <div class="small mt-1"><i class="fas fa-users"></i> ${totalVotes} vote</div>
                    </div>
                </div>
                <div class="card-body py-3">
                    ${poll.description ? `<p class="text-muted mb-3">${escapeHtml(poll.description)}</p>` : ''}
                    ${optionsHtml || '<div class="text-muted small">Belum ada opsi.</div>'}
                    <div class="mt-2 d-flex flex-wrap" style="gap:8px;">
                        <button class="btn btn-sm btn-outline-warning" onclick="window.openVotingEditPoll(${poll.id})">
                            <i class="fas fa-edit mr-1"></i>Edit Voting
                        </button>
                        ${poll.status === 'active' ? `
                            <button class="btn btn-sm btn-outline-danger" onclick="window.closeVotingPoll(${poll.id})">
                                <i class="fas fa-stop-circle mr-1"></i>Tutup Voting
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    async function createVoting(event) {
        event.preventDefault();

        const titleEl = document.getElementById('voting-title');
        const descriptionEl = document.getElementById('voting-description');
        const showOnOpenEl = document.getElementById('voting-show-on-open');
        const submitBtn = document.getElementById('btn-create-voting');

        if (!titleEl || !submitBtn) {
            return;
        }

        const title = titleEl.value.trim();
        const description = descriptionEl ? descriptionEl.value.trim() : '';
        const options = collectOptions();
        const showOnOpen = showOnOpenEl ? showOnOpenEl.checked : true;

        if (!title) {
            toastr.warning('Judul voting wajib diisi');
            return;
        }

        if (options.length < MIN_OPTIONS) {
            toastr.warning('Minimal 2 opsi jawaban');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';

        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/polls/staff/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title,
                    description,
                    options,
                    show_on_open: showOnOpen
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal membuat voting');
            }

            toastr.success('Voting baru berhasil dibuat');
            titleEl.value = '';
            if (descriptionEl) descriptionEl.value = '';
            resetOptionRows();
            await loadVotingList();
        } catch (error) {
            toastr.error(error.message || 'Gagal membuat voting');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-plus mr-1"></i>Buat Voting';
        }
    }

    async function loadVotingList() {
        const listEl = document.getElementById('voting-list-container');
        if (!listEl) return;

        listEl.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="fas fa-spinner fa-spin"></i> Memuat voting...
            </div>
        `;

        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/polls/staff/list`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal memuat voting');
            }

            const polls = result.data || [];
            pollsById = new Map(polls.map((poll) => [Number(poll.id), poll]));
            const activeCount = polls.filter((poll) => poll.status === 'active').length;
            const activeCountEl = document.getElementById('voting-active-count');
            if (activeCountEl) {
                activeCountEl.textContent = String(activeCount);
            }

            if (!polls.length) {
                listEl.innerHTML = `
                    <div class="alert alert-light mb-0">
                        <i class="fas fa-info-circle mr-1"></i>Belum ada voting. Buat voting pertama di panel kiri.
                    </div>
                `;
                return;
            }

            listEl.innerHTML = polls.map(renderPollCard).join('');
        } catch (error) {
            listEl.innerHTML = `
                <div class="alert alert-danger mb-0">
                    <i class="fas fa-exclamation-triangle mr-1"></i>${escapeHtml(error.message || 'Gagal memuat voting')}
                </div>
            `;
        }
    }

    async function closeVotingPoll(pollId) {
        const confirmed = window.confirm('Tutup voting ini? Pasien tidak bisa vote lagi setelah ditutup.');
        if (!confirmed) return;

        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/polls/staff/${pollId}/close`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal menutup voting');
            }

            toastr.success('Voting berhasil ditutup');
            await loadVotingList();
        } catch (error) {
            toastr.error(error.message || 'Gagal menutup voting');
        }
    }

    function initKelolaVoting() {
        setupSocket();
        initOptionEditor();
        ensureEditModal();

        const formEl = document.getElementById('voting-create-form');
        const refreshBtn = document.getElementById('btn-refresh-voting');

        if (formEl && !formEl.dataset.boundVoting) {
            formEl.addEventListener('submit', createVoting);
            formEl.dataset.boundVoting = 'true';
        }

        if (refreshBtn && !refreshBtn.dataset.boundVoting) {
            refreshBtn.addEventListener('click', loadVotingList);
            refreshBtn.dataset.boundVoting = 'true';
        }

        loadVotingList();

        if (!initialized) {
            initialized = true;
            window.closeVotingPoll = closeVotingPoll;
            window.openVotingEditPoll = openVotingEditPoll;
        }
    }

    window.initKelolaVoting = initKelolaVoting;
})();
