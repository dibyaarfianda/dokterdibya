(function() {
    'use strict';

    const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api'
        : 'https://dokterdibya.com/api';
    const MIN_OPTIONS = 2;
    const MAX_OPTIONS = 10;

    let socket = null;
    let initialized = false;

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
                    ${poll.status === 'active' ? `
                        <button class="btn btn-sm btn-outline-danger mt-2" onclick="window.closeVotingPoll(${poll.id})">
                            <i class="fas fa-stop-circle mr-1"></i>Tutup Voting
                        </button>
                    ` : ''}
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
        }
    }

    window.initKelolaVoting = initKelolaVoting;
})();
