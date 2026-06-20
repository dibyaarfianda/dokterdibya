/**
 * staff-briefing.js — Briefing Poli Minggu
 * Daily checklist of active staff + "Mari Bekerja" log to staff_duty_logs.
 */
(function () {
    'use strict';

    var state = { loading: false, data: null, savingChecklist: false };

    function getToken() {
        if (typeof window.getAuthToken === 'function') return window.getAuthToken();
        return localStorage.getItem('vps_auth_token') || '';
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtDate(ymd) {
        if (!ymd) return '';
        try {
            var parts = String(ymd).split('-');
            var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } catch (e) { return ymd; }
    }

    async function api(path, options) {
        var token = getToken();
        var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache' };
        var resp = await fetch('/api/staff-briefing' + path, Object.assign({ headers: headers }, options || {}));
        var body = await resp.json().catch(function () { return {}; });
        if (!resp.ok) {
            var err = new Error(body.message || 'Request failed');
            err.status = resp.status; err.body = body;
            throw err;
        }
        return body;
    }

    function renderHeader() {
        var el = document.getElementById('staff-briefing-header');
        if (!el || !state.data) return;
        var d = state.data;
        el.innerHTML =
            '<div class="row">' +
            '<div class="col-md-6"><div class="info-box bg-info"><span class="info-box-icon"><i class="fas fa-calendar-day"></i></span><div class="info-box-content"><span class="info-box-text">Tanggal</span><span class="info-box-number" style="font-size:16px;">' + escapeHtml(fmtDate(d.date)) + '</span></div></div></div>' +
            '<div class="col-md-6"><div class="info-box bg-success"><span class="info-box-icon"><i class="fas fa-user-injured"></i></span><div class="info-box-content"><span class="info-box-text">Pasien Hari Ini</span><span class="info-box-number">' + (d.patient_count || 0) + '</span></div></div></div>' +
            '</div>' +
            (d.started ? '<div class="alert alert-success mb-0"><i class="fas fa-check-circle mr-1"></i> Briefing hari ini sudah dimulai.</div>' : '');
    }

    function renderChecklist() {
        var el = document.getElementById('staff-briefing-checklist');
        if (!el || !state.data) return;
        var d = state.data;
        var checked = new Set((d.checked_staff_ids || []).map(String));
        var started = new Set((d.started_staff_ids || []).map(String));
        var staff = d.active_staff || [];

        if (staff.length === 0) {
            el.innerHTML = '<div class="alert alert-warning">Belum ada staff aktif.</div>';
            return;
        }

        el.innerHTML =
            '<div class="card">' +
            '<div class="card-header"><h5 class="mb-0"><i class="fas fa-check-square mr-1"></i> Checklist Hadir</h5></div>' +
            '<div class="card-body p-2"><div class="row">' +
            staff.map(function (s) {
                var id = String(s.staff_id || s.id || s.new_id);
                var name = s.name || s.full_name || '-';
                var role = s.role_display || s.role || '';
                var isStarted = started.has(id);
                var isChecked = checked.has(id) || isStarted;
                return '<div class="col-md-6 col-lg-4 mb-2">' +
                    '<label class="d-flex align-items-center p-2 mb-0" style="background:#f9fafb;border-radius:6px;cursor:' + (isStarted ? 'not-allowed' : 'pointer') + ';">' +
                    '<input type="checkbox" class="staff-briefing-cb mr-2" data-staff-id="' + escapeHtml(id) + '"' + (isChecked ? ' checked' : '') + (isStarted ? ' disabled' : '') + '>' +
                    '<div><div style="font-weight:600;">' + escapeHtml(name) + '</div>' +
                    (role ? '<div class="text-muted" style="font-size:11px;">' + escapeHtml(role) + '</div>' : '') +
                    '</div></label></div>';
            }).join('') +
            '</div></div></div>';

        // Bind checkboxes
        el.querySelectorAll('.staff-briefing-cb').forEach(function (cb) {
            cb.addEventListener('change', function () {
                onChecklistChange(cb.dataset.staffId, cb.checked);
            });
        });

        // Update start button state
        var btn = document.getElementById('staff-briefing-start-btn');
        if (btn) {
            if (d.can_start !== true) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-lock mr-1"></i> Hanya dokter';
                btn.classList.remove('btn-success');
                btn.classList.add('btn-secondary');
            } else if (d.started) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-check mr-1"></i> Sudah dimulai';
                btn.classList.remove('btn-success');
                btn.classList.add('btn-secondary');
            } else {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-play mr-1"></i> Mari Bekerja';
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-success');
            }
        }
    }

    async function onChecklistChange(staffId, isChecked) {
        if (state.savingChecklist) return;
        state.savingChecklist = true;
        try {
            var payload = {};
            payload[staffId] = !!isChecked;
            await api('/today/checklist', {
                method: 'POST',
                body: JSON.stringify({ checklist: payload })
            });
            // Update local state
            var arr = state.data.checked_staff_ids || [];
            var setIds = new Set(arr.map(String));
            if (isChecked) setIds.add(String(staffId));
            else setIds.delete(String(staffId));
            state.data.checked_staff_ids = Array.from(setIds);
        } catch (err) {
            console.error('[staff-briefing] checklist save error:', err);
            alert(err.message || 'Gagal menyimpan checklist');
            // revert
            await load();
        } finally {
            state.savingChecklist = false;
        }
    }

    async function start() {
        if (!state.data) return;
        if (state.data.can_start !== true) {
            alert('Hanya dokter yang dapat memulai briefing.');
            return;
        }
        var checked = state.data.checked_staff_ids || [];
        if (checked.length === 0) {
            alert('Tandai minimal satu staff sebelum memulai briefing.');
            return;
        }
        var btn = document.getElementById('staff-briefing-start-btn');
        if (btn) btn.disabled = true;
        try {
            var res = await api('/today/start', {
                method: 'POST',
                body: JSON.stringify({ staff_ids: checked })
            });
            var msg = 'Briefing dimulai. ' + (res.inserted || 0) + ' staff baru dicatat.';
            if (typeof window.showToast === 'function') window.showToast(msg, 'success');
            else alert(msg);
            await load();
        } catch (err) {
            console.error('[staff-briefing] start error:', err);
            alert(err.message || 'Gagal memulai briefing');
            if (btn) btn.disabled = false;
        }
    }

    async function load() {
        if (state.loading) return;
        state.loading = true;
        try {
            var data = await api('/today');
            state.data = data;
            renderHeader();
            renderChecklist();
        } catch (err) {
            console.error('[staff-briefing] load error:', err);
            var el = document.getElementById('staff-briefing-checklist');
            if (el) el.innerHTML = '<div class="alert alert-danger">' + escapeHtml(err.message || 'Gagal memuat') + '</div>';
        } finally {
            state.loading = false;
        }
    }

    function init() { load(); }
    function refresh() { load(); }

    window.staffBriefing = { init: init, refresh: refresh, start: start };
})();
