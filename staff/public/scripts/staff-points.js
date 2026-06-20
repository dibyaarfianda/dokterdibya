/**
 * staff-points.js — Staff Points dashboard (rating-based)
 * Shows monthly point totals per staff from support_chat_ratings.
 */
(function () {
    'use strict';

    var state = { initialized: false, currentMonth: null, loading: false };

    function getToken() {
        if (typeof window.getAuthToken === 'function') return window.getAuthToken();
        return localStorage.getItem('vps_auth_token') || '';
    }

    function todayLocalYM() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }

    function lastMonthsOptions(n) {
        var now = new Date();
        var out = [];
        for (var i = 0; i < n; i++) {
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            var ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            var label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
            out.push({ value: ym, label: label });
        }
        return out;
    }

    function fmtNum(n) {
        var v = Number(n);
        return isFinite(v) ? v.toLocaleString('id-ID') : '0';
    }

    function fmtAvg(n) {
        var v = Number(n);
        return isFinite(v) && v > 0 ? v.toFixed(2) : '-';
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function fetchPoints(month) {
        var token = getToken();
        var resp = await fetch('/api/staff-points?month=' + encodeURIComponent(month), {
            headers: { 'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache' }
        });
        var body = await resp.json().catch(function () { return {}; });
        if (!resp.ok) throw new Error(body.message || 'Gagal memuat data');
        return body;
    }

    function render(data) {
        var tbody = document.getElementById('staff-points-tbody');
        var summary = document.getElementById('staff-points-summary');
        if (!tbody) return;

        var rows = (data && data.staff) || [];
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Belum ada data untuk bulan ini.</td></tr>';
        } else {
            tbody.innerHTML = rows.map(function (r) {
                return '<tr>' +
                    '<td>' + escapeHtml(r.name) + '</td>' +
                    '<td>' + escapeHtml(r.role_display || r.role || '-') + '</td>' +
                    '<td class="text-right"><strong>' + fmtNum(r.total_points) + '</strong></td>' +
                    '<td class="text-right">' + fmtNum(r.duty_points || r.duty_count) + '</td>' +
                    '<td class="text-right">' + fmtNum(r.rated_sessions) + '</td>' +
                    '<td class="text-right">' + fmtAvg(r.avg_rating) + '</td>' +
                    '<td class="text-right">' + fmtNum(r.resolved_sessions) + '</td>' +
                    '<td class="text-right">' + fmtNum(r.duty_count) + '</td>' +
                '</tr>';
            }).join('');
        }

        if (summary) {
            var totalPoints = rows.reduce(function (a, b) { return a + Number(b.total_points || 0); }, 0);
            var totalRated = rows.reduce(function (a, b) { return a + Number(b.rated_sessions || 0); }, 0);
            var period = (data && data.period && data.period.month) || state.currentMonth;
            summary.innerHTML =
                '<div class="row">' +
                '<div class="col-md-4"><div class="info-box bg-warning"><span class="info-box-icon"><i class="fas fa-star"></i></span><div class="info-box-content"><span class="info-box-text">Periode</span><span class="info-box-number">' + escapeHtml(period) + '</span></div></div></div>' +
                '<div class="col-md-4"><div class="info-box bg-info"><span class="info-box-icon"><i class="fas fa-trophy"></i></span><div class="info-box-content"><span class="info-box-text">Total Point</span><span class="info-box-number">' + fmtNum(totalPoints) + '</span></div></div></div>' +
                '<div class="col-md-4"><div class="info-box bg-success"><span class="info-box-icon"><i class="fas fa-comments"></i></span><div class="info-box-content"><span class="info-box-text">Sesi Dirating</span><span class="info-box-number">' + fmtNum(totalRated) + '</span></div></div></div>' +
                '</div>';
        }
    }

    async function load() {
        if (state.loading) return;
        state.loading = true;
        var tbody = document.getElementById('staff-points-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Memuat...</td></tr>';
        try {
            var data = await fetchPoints(state.currentMonth);
            render(data);
        } catch (err) {
            console.error('[staff-points] load error:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">' + escapeHtml(err.message || 'Gagal memuat') + '</td></tr>';
        } finally {
            state.loading = false;
        }
    }

    function buildMonthDropdown() {
        var sel = document.getElementById('staff-points-month');
        if (!sel || sel.dataset.scBuilt === '1') return;
        var options = lastMonthsOptions(12);
        sel.innerHTML = options.map(function (o) {
            return '<option value="' + o.value + '">' + o.label + '</option>';
        }).join('');
        sel.value = state.currentMonth;
        sel.addEventListener('change', function () {
            state.currentMonth = sel.value;
            load();
        });
        sel.dataset.scBuilt = '1';
    }

    function init() {
        if (!state.currentMonth) state.currentMonth = todayLocalYM();
        buildMonthDropdown();
        load();
        state.initialized = true;
    }

    function refresh() {
        load();
    }

    window.staffPoints = { init: init, refresh: refresh };
})();
