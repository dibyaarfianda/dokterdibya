/**
 * staff-payroll.js - Gajian karyawan per 4 kali praktik.
 */
(function () {
    'use strict';

    var state = {
        loading: false,
        practiceDates: [],
        latestCycle: [],
        batches: [],
        currentBatch: null
    };

    function getToken() {
        if (typeof window.getAuthToken === 'function') return window.getAuthToken();
        return localStorage.getItem('vps_auth_token') || '';
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatRp(value) {
        return 'Rp ' + Math.round(Number(value) || 0).toLocaleString('id-ID');
    }

    function formatDate(ymd) {
        if (!ymd) return '-';
        var parts = String(ymd).split('-');
        if (parts.length !== 3) return ymd;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    function todayLocalDate() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    async function api(path, options) {
        var token = getToken();
        var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache' };
        var resp = await fetch('/api/staff-payroll' + path, Object.assign({ headers: headers }, options || {}));
        var body = await resp.json().catch(function () { return {}; });
        if (!resp.ok) {
            var err = new Error(body.message || 'Request failed');
            err.status = resp.status;
            err.body = body;
            throw err;
        }
        return body;
    }

    function showMessage(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'success');
        } else {
            alert(message);
        }
    }

    function setBusy(isBusy) {
        state.loading = isBusy;
        document.querySelectorAll('[data-payroll-action]').forEach(function (btn) {
            btn.disabled = isBusy;
        });
    }

    function renderCyclePicker() {
        var el = document.getElementById('staff-payroll-cycle-dates');
        if (!el) return;
        var dates = state.latestCycle.length === 4 ? state.latestCycle : ['', '', '', ''];
        el.innerHTML = dates.map(function (date, index) {
            return '<div class="col-md-3 col-6 mb-2">' +
                '<label class="small text-muted mb-1">Praktik ' + (index + 1) + '</label>' +
                '<input type="date" class="form-control form-control-sm staff-payroll-cycle-input" value="' + escapeHtml(date) + '">' +
                '</div>';
        }).join('');

        var payrollDate = document.getElementById('staff-payroll-date');
        if (payrollDate && !payrollDate.value) payrollDate.value = todayLocalDate();
    }

    function renderBatchList() {
        var el = document.getElementById('staff-payroll-batches');
        if (!el) return;
        if (!state.batches.length) {
            el.innerHTML = '<div class="text-muted small">Belum ada batch gaji.</div>';
            return;
        }

        el.innerHTML = state.batches.map(function (batch) {
            var active = state.currentBatch && Number(state.currentBatch.id) === Number(batch.id);
            var statusClass = batch.status === 'finalized' ? 'badge-success' : 'badge-warning';
            return '<button type="button" class="list-group-item list-group-item-action ' + (active ? 'active' : '') + '" data-payroll-batch-id="' + batch.id + '">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<strong>' + escapeHtml(batch.cycle_label || '-') + '</strong>' +
                '<span class="badge ' + statusClass + '">' + escapeHtml(batch.status) + '</span>' +
                '</div>' +
                '<div class="small ' + (active ? 'text-white-50' : 'text-muted') + '">' +
                'Gajian ' + escapeHtml(formatDate(batch.payroll_date)) + ' - ' + escapeHtml(formatRp(batch.total_amount)) +
                '</div>' +
                '</button>';
        }).join('');

        el.querySelectorAll('[data-payroll-batch-id]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                loadBatch(btn.getAttribute('data-payroll-batch-id'));
            });
        });
    }

    function renderSummary() {
        var el = document.getElementById('staff-payroll-summary');
        if (!el) return;
        var batch = state.currentBatch;
        if (!batch) {
            el.innerHTML = '<div class="alert alert-info mb-0">Buat atau pilih batch gaji untuk mulai menghitung.</div>';
            return;
        }

        var paidStaff = (batch.items || []).filter(function (item) { return Number(item.total_amount) > 0; }).length;
        var attendance = (batch.items || []).reduce(function (sum, item) { return sum + (Number(item.attendance_count) || 0); }, 0);
        el.innerHTML =
            '<div class="row">' +
            '<div class="col-md-3 col-6"><div class="info-box bg-info"><span class="info-box-icon"><i class="fas fa-calendar-check"></i></span><div class="info-box-content"><span class="info-box-text">Siklus</span><span class="info-box-number" style="font-size:14px;">' + escapeHtml(batch.cycle_label) + '</span></div></div></div>' +
            '<div class="col-md-3 col-6"><div class="info-box bg-primary"><span class="info-box-icon"><i class="fas fa-users"></i></span><div class="info-box-content"><span class="info-box-text">Staff Dibayar</span><span class="info-box-number">' + paidStaff + '</span></div></div></div>' +
            '<div class="col-md-3 col-6"><div class="info-box bg-warning"><span class="info-box-icon"><i class="fas fa-user-clock"></i></span><div class="info-box-content"><span class="info-box-text">Total Hadir</span><span class="info-box-number">' + attendance + '</span></div></div></div>' +
            '<div class="col-md-3 col-6"><div class="info-box bg-success"><span class="info-box-icon"><i class="fas fa-money-bill-wave"></i></span><div class="info-box-content"><span class="info-box-text">Total Gaji</span><span class="info-box-number">' + escapeHtml(formatRp(batch.total_amount)) + '</span></div></div></div>' +
            '</div>';
    }

    function renderTable() {
        var tbody = document.getElementById('staff-payroll-tbody');
        var thead = document.getElementById('staff-payroll-date-head');
        if (!tbody || !thead) return;

        var batch = state.currentBatch;
        if (!batch) {
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4">Belum ada batch dipilih.</td></tr>';
            renderActions();
            return;
        }

        var dates = batch.practice_dates || [];
        var readonly = batch.status === 'finalized';
        thead.innerHTML = dates.map(function (date) {
            return '<th class="text-center">' + escapeHtml(formatDate(date)) + '</th>';
        }).join('');

        tbody.innerHTML = (batch.items || []).map(function (item) {
            var checked = new Set((item.attendance_dates || []).map(String));
            var dateCells = dates.map(function (date) {
                return '<td class="text-center">' +
                    '<input type="checkbox" class="staff-payroll-attendance" data-date="' + escapeHtml(date) + '"' + (checked.has(date) ? ' checked' : '') + (readonly ? ' disabled' : '') + '>' +
                    '</td>';
            }).join('');
            return '<tr data-staff-id="' + escapeHtml(item.staff_id) + '">' +
                '<td><div class="font-weight-bold">' + escapeHtml(item.staff_name) + '</div><div class="text-muted small">' + escapeHtml(item.staff_id) + '</div></td>' +
                '<td>' + escapeHtml(item.role_display || item.role_name || '-') + '</td>' +
                dateCells +
                '<td class="text-right payroll-attendance-count">' + (item.attendance_count || 0) + '</td>' +
                '<td class="text-right payroll-base">' + escapeHtml(formatRp(item.base_amount)) + '</td>' +
                '<td class="text-right payroll-additional">' + escapeHtml(formatRp(item.additional_amount)) + '</td>' +
                '<td style="min-width:130px;"><input type="number" step="1" class="form-control form-control-sm text-right staff-payroll-adjustment" value="' + (Number(item.adjustment_amount) || 0) + '"' + (readonly ? ' disabled' : '') + '></td>' +
                '<td class="text-right font-weight-bold payroll-total">' + escapeHtml(formatRp(item.total_amount)) + '</td>' +
                '<td style="min-width:150px;"><input type="text" class="form-control form-control-sm staff-payroll-notes" value="' + escapeHtml(item.notes || '') + '"' + (readonly ? ' disabled' : '') + '></td>' +
                '</tr>';
        }).join('');

        tbody.querySelectorAll('input').forEach(function (input) {
            input.addEventListener('change', recalcClientTotals);
            input.addEventListener('input', recalcClientTotals);
        });

        renderActions();
    }

    function calculateClientRow(row) {
        var attendance = row.querySelectorAll('.staff-payroll-attendance:checked').length;
        var adjustmentInput = row.querySelector('.staff-payroll-adjustment');
        var adjustment = Number(adjustmentInput && adjustmentInput.value ? adjustmentInput.value : 0);
        var base = attendance > 0 ? 150000 : 0;
        var additional = attendance > 0 ? Math.max(0, attendance - 1) * 100000 : 0;
        var total = attendance > 0 ? base + additional + adjustment : 0;
        if (attendance === 0 && adjustmentInput && Number(adjustmentInput.value || 0) !== 0) {
            adjustmentInput.value = 0;
        }
        row.querySelector('.payroll-attendance-count').textContent = attendance;
        row.querySelector('.payroll-base').textContent = formatRp(base);
        row.querySelector('.payroll-additional').textContent = formatRp(additional);
        row.querySelector('.payroll-total').textContent = formatRp(total);
        return total;
    }

    function recalcClientTotals() {
        var total = 0;
        document.querySelectorAll('#staff-payroll-tbody tr[data-staff-id]').forEach(function (row) {
            total += calculateClientRow(row);
        });
        var totalEl = document.getElementById('staff-payroll-live-total');
        if (totalEl) totalEl.textContent = formatRp(total);
    }

    function renderActions() {
        var el = document.getElementById('staff-payroll-actions');
        if (!el) return;
        var batch = state.currentBatch;
        if (!batch) {
            el.innerHTML = '';
            return;
        }

        if (batch.status === 'finalized') {
            el.innerHTML = '<span class="badge badge-success mr-2"><i class="fas fa-lock mr-1"></i>Finalized</span>' +
                '<strong>Total: <span id="staff-payroll-live-total">' + escapeHtml(formatRp(batch.total_amount)) + '</span></strong>';
            return;
        }

        el.innerHTML =
            '<strong class="mr-3">Total: <span id="staff-payroll-live-total">' + escapeHtml(formatRp(batch.total_amount)) + '</span></strong>' +
            '<button type="button" class="btn btn-sm btn-primary mr-2" data-payroll-action="save" onclick="if(window.staffPayroll) window.staffPayroll.save()"><i class="fas fa-save mr-1"></i>Simpan Draft</button>' +
            '<button type="button" class="btn btn-sm btn-success mr-2" data-payroll-action="finalize" onclick="if(window.staffPayroll) window.staffPayroll.finalize()"><i class="fas fa-check mr-1"></i>Finalize</button>' +
            '<button type="button" class="btn btn-sm btn-outline-danger" data-payroll-action="delete" onclick="if(window.staffPayroll) window.staffPayroll.removeDraft()"><i class="fas fa-trash mr-1"></i>Hapus Draft</button>';
    }

    async function loadPracticeDates() {
        var result = await api('/practice-dates?limit=12');
        state.practiceDates = result.data && result.data.practice_dates ? result.data.practice_dates : [];
        state.latestCycle = result.data && result.data.latest_cycle ? result.data.latest_cycle : [];
        renderCyclePicker();
    }

    async function loadBatches() {
        var result = await api('/batches?limit=20');
        state.batches = result.data || [];
        renderBatchList();
    }

    async function loadBatch(id) {
        setBusy(true);
        try {
            var result = await api('/batches/' + encodeURIComponent(id));
            state.currentBatch = result.data;
            renderBatchList();
            renderSummary();
            renderTable();
            recalcClientTotals();
        } catch (err) {
            console.error('[staff-payroll] load batch error:', err);
            showMessage(err.message || 'Gagal memuat batch', 'error');
        } finally {
            setBusy(false);
        }
    }

    function collectCycleDates() {
        return Array.from(document.querySelectorAll('.staff-payroll-cycle-input'))
            .map(function (input) { return input.value; })
            .filter(Boolean);
    }

    async function createDraft() {
        setBusy(true);
        try {
            var result = await api('/batches', {
                method: 'POST',
                body: JSON.stringify({
                    practice_dates: collectCycleDates(),
                    payroll_date: (document.getElementById('staff-payroll-date') || {}).value || todayLocalDate()
                })
            });
            state.currentBatch = result.data;
            await loadBatches();
            renderSummary();
            renderTable();
            recalcClientTotals();
            showMessage('Draft gaji berhasil dibuat', 'success');
        } catch (err) {
            if (err.status === 409 && err.body && err.body.data && err.body.data.id) {
                await loadBatch(err.body.data.id);
            }
            console.error('[staff-payroll] create draft error:', err);
            showMessage(err.message || 'Gagal membuat draft', 'error');
        } finally {
            setBusy(false);
        }
    }

    function collectItems() {
        return Array.from(document.querySelectorAll('#staff-payroll-tbody tr[data-staff-id]')).map(function (row) {
            var attendanceDates = Array.from(row.querySelectorAll('.staff-payroll-attendance:checked')).map(function (cb) {
                return cb.getAttribute('data-date');
            });
            var adjustment = Number((row.querySelector('.staff-payroll-adjustment') || {}).value || 0);
            return {
                staff_id: row.getAttribute('data-staff-id'),
                attendance_dates: attendanceDates,
                adjustment_amount: adjustment,
                notes: (row.querySelector('.staff-payroll-notes') || {}).value || ''
            };
        });
    }

    async function save() {
        if (!state.currentBatch) return;
        setBusy(true);
        try {
            var result = await api('/batches/' + encodeURIComponent(state.currentBatch.id), {
                method: 'PUT',
                body: JSON.stringify({ items: collectItems() })
            });
            state.currentBatch = result.data;
            await loadBatches();
            renderSummary();
            renderTable();
            recalcClientTotals();
            showMessage('Draft gaji berhasil disimpan', 'success');
        } catch (err) {
            console.error('[staff-payroll] save error:', err);
            showMessage(err.message || 'Gagal menyimpan draft', 'error');
        } finally {
            setBusy(false);
        }
    }

    async function finalize() {
        if (!state.currentBatch) return;
        if (!confirm('Finalize gaji ini? Setelah finalized, data tidak bisa diubah dan akan mengurangi Analisa Keuangan sesuai tanggal gajian.')) return;
        setBusy(true);
        try {
            await api('/batches/' + encodeURIComponent(state.currentBatch.id), {
                method: 'PUT',
                body: JSON.stringify({ items: collectItems() })
            });
            var result = await api('/batches/' + encodeURIComponent(state.currentBatch.id) + '/finalize', {
                method: 'POST',
                body: JSON.stringify({
                    payroll_date: (document.getElementById('staff-payroll-date') || {}).value || state.currentBatch.payroll_date
                })
            });
            state.currentBatch = result.data;
            await loadBatches();
            renderSummary();
            renderTable();
            showMessage('Gaji berhasil difinalkan', 'success');
        } catch (err) {
            console.error('[staff-payroll] finalize error:', err);
            showMessage(err.message || 'Gagal finalisasi gaji', 'error');
        } finally {
            setBusy(false);
        }
    }

    async function removeDraft() {
        if (!state.currentBatch) return;
        if (!confirm('Hapus draft gaji ini?')) return;
        setBusy(true);
        try {
            await api('/batches/' + encodeURIComponent(state.currentBatch.id), { method: 'DELETE' });
            state.currentBatch = null;
            await loadBatches();
            renderSummary();
            renderTable();
            showMessage('Draft gaji berhasil dihapus', 'success');
        } catch (err) {
            console.error('[staff-payroll] delete error:', err);
            showMessage(err.message || 'Gagal menghapus draft', 'error');
        } finally {
            setBusy(false);
        }
    }

    async function init() {
        if (state.loading) return;
        setBusy(true);
        try {
            await loadPracticeDates();
            await loadBatches();
            if (!state.currentBatch && state.batches.length > 0) {
                await loadBatch(state.batches[0].id);
            } else {
                renderSummary();
                renderTable();
            }
        } catch (err) {
            console.error('[staff-payroll] init error:', err);
            var tbody = document.getElementById('staff-payroll-tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="text-center text-danger py-4">' + escapeHtml(err.message || 'Gagal memuat payroll') + '</td></tr>';
        } finally {
            setBusy(false);
        }
    }

    window.staffPayroll = {
        init: init,
        refresh: init,
        createDraft: createDraft,
        save: save,
        finalize: finalize,
        removeDraft: removeDraft,
        loadBatch: loadBatch
    };
})();
