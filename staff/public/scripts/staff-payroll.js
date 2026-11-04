/**
 * staff-payroll.js - Gajian karyawan per siklus 4 minggu praktik.
 * Jumlah tanggal per siklus mengikuti hari praktik aktif di Pengaturan Booking.
 */
(function () {
    'use strict';

    var state = {
        loading: false,
        practiceDates: [],
        latestCycle: [],
        cycleSize: 4,
        practiceDays: [],
        lastCycleEnd: null,
        settings: null,
        batches: [],
        currentBatch: null,
        driverPayrolls: [],
        currentDriverPayroll: null
    };

    function hasAccountPermission(permission) {
        return typeof window.hasAccountPermission !== 'function'
            || window.hasAccountPermission(permission);
    }

    function getToken() {
        if (typeof window.getAuthToken === 'function') return window.getAuthToken();
        return (typeof window !== 'undefined' && typeof window.getAuthToken === 'function' ? window.getAuthToken() : '') || '';
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
        return parts[2] + '-' + parts[1] + '-' + parts[0];
    }

    function todayLocalDate() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function defaultDriverPayrollMonth() {
        var d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - 1);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }

    var DRIVER_FIXED_SALARY = 1000000;
    var DRIVER_DEFAULT_DOCTOR_BONUS = 500000;
    var DRIVER_MAX_DOCTOR_BONUS = 10000000;

    function normalizeDriverBonus(value) {
        if (value === undefined || value === null || String(value).trim() === '') return DRIVER_DEFAULT_DOCTOR_BONUS;
        var bonus = Math.trunc(Number(value));
        if (!Number.isFinite(bonus)) return DRIVER_DEFAULT_DOCTOR_BONUS;
        return Math.max(0, Math.min(DRIVER_MAX_DOCTOR_BONUS, bonus));
    }

    function calculateDriverPreview(month, absenceDays, doctorBonus) {
        var match = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
        if (!match) return null;
        var year = Number(match[1]);
        var monthNumber = Number(match[2]);
        var calendarDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
        var sundayCount = 0;
        for (var day = 1; day <= calendarDays; day += 1) {
            if (new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay() === 0) sundayCount += 1;
        }
        var workingDays = calendarDays - sundayCount;
        var absence = Math.max(0, Math.min(workingDays, Math.trunc(Number(absenceDays) || 0)));
        var bonus = normalizeDriverBonus(doctorBonus);
        var monthlySalary = DRIVER_FIXED_SALARY + bonus;
        var dailyDeduction = Math.ceil((monthlySalary / workingDays) / 1000) * 1000;
        var deductionAmount = Math.min(monthlySalary, absence * dailyDeduction);
        var totalAmount = monthlySalary - deductionAmount;
        return {
            payroll_month: month + '-01',
            calendar_days: calendarDays,
            sunday_count: sundayCount,
            working_days: workingDays,
            fixed_salary: DRIVER_FIXED_SALARY,
            doctor_bonus: bonus,
            monthly_salary: monthlySalary,
            absence_days: absence,
            daily_deduction: dailyDeduction,
            deduction_amount: deductionAmount,
            total_amount: totalAmount,
            doctor_paid_amount: Math.max(0, totalAmount - DRIVER_FIXED_SALARY)
        };
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

    function getPrintModule() {
        if (!window.staffPayrollPrint) {
            throw new Error('Modul cetak slip gaji belum tersedia. Silakan refresh halaman.');
        }
        return window.staffPayrollPrint;
    }

    function openPrintWindow(html, title) {
        var printWindow = window.open('', '_blank', 'width=900,height=750');
        if (!printWindow) {
            throw new Error('Popup cetak diblokir browser. Izinkan popup untuk situs ini.');
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.document.title = title || 'Slip Gaji';
        printWindow.focus();
        window.setTimeout(function () { printWindow.print(); }, 250);
    }

    function setBusy(isBusy) {
        state.loading = isBusy;
        document.querySelectorAll('[data-payroll-action]').forEach(function (btn) {
            btn.disabled = isBusy;
        });
    }

    function driverMonthKey(value) {
        return String(value || '').slice(0, 7);
    }

    function renderDriverHistory() {
        var tbody = document.getElementById('driver-payroll-history');
        if (!tbody) return;
        if (!state.driverPayrolls.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">Belum ada gaji driver tersimpan.</td></tr>';
            return;
        }

        tbody.innerHTML = state.driverPayrolls.map(function (item) {
            var month = driverMonthKey(item.payroll_month);
            var active = state.currentDriverPayroll && driverMonthKey(state.currentDriverPayroll.payroll_month) === month;
            var badge = item.status === 'finalized' ? 'badge-success' : 'badge-warning';
            return '<tr data-driver-payroll-month="' + escapeHtml(month) + '" class="' + (active ? 'table-active' : '') + '" style="cursor:pointer;">' +
                '<td>' + escapeHtml(item.driver_name || '-') + '</td>' +
                '<td><strong>' + escapeHtml(month) + '</strong></td>' +
                '<td class="text-right">' + Number(item.working_days || 0) + '</td>' +
                '<td class="text-right">' + Number(item.absence_days || 0) + '</td>' +
                '<td class="text-right">' + escapeHtml(formatRp(item.doctor_bonus)) + '</td>' +
                '<td class="text-right">' + escapeHtml(formatRp(item.daily_deduction)) + '</td>' +
                '<td class="text-right font-weight-bold">' + escapeHtml(formatRp(item.total_amount)) + '</td>' +
                '<td><span class="badge ' + badge + '">' + escapeHtml(item.status) + '</span></td>' +
                '<td class="text-center">' + (item.status === 'finalized' && hasAccountPermission('staff_payroll.export') ?
                    '<button type="button" class="btn btn-xs btn-outline-primary" data-payroll-action="driver-history-print" data-driver-slip-month="' + escapeHtml(month) + '" title="Cetak slip gaji driver"' + (state.loading || !String(item.driver_name || '').trim() ? ' disabled' : '') + '><i class="fas fa-print mr-1"></i>Cetak Slip</button>' :
                    '<span class="text-muted small">Finalize dulu</span>') + '</td>' +
                '</tr>';
        }).join('');

        tbody.querySelectorAll('[data-driver-payroll-month]').forEach(function (row) {
            row.addEventListener('click', function () {
                selectDriverPayroll(row.getAttribute('data-driver-payroll-month'));
            });
        });
        tbody.querySelectorAll('[data-driver-slip-month]').forEach(function (button) {
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                printDriverSlip(button.getAttribute('data-driver-slip-month'));
            });
        });
    }

    function renderDriverPreview() {
        var monthInput = document.getElementById('driver-payroll-month');
        var absenceInput = document.getElementById('driver-payroll-absence-days');
        var nameInput = document.getElementById('driver-payroll-name');
        var bonusInput = document.getElementById('driver-payroll-doctor-bonus');
        if (!monthInput || !absenceInput || !nameInput) return;
        if (!monthInput.value) monthInput.value = defaultDriverPayrollMonth();

        var preview = calculateDriverPreview(monthInput.value, absenceInput.value, bonusInput ? bonusInput.value : undefined);
        if (!preview) return;
        absenceInput.max = String(preview.working_days);
        if (Number(absenceInput.value || 0) !== preview.absence_days) {
            absenceInput.value = String(preview.absence_days);
        }

        var values = {
            'driver-payroll-calendar-days': preview.calendar_days,
            'driver-payroll-sundays': preview.sunday_count,
            'driver-payroll-working-days': preview.working_days,
            'driver-payroll-daily-deduction': formatRp(preview.daily_deduction),
            'driver-payroll-deduction': formatRp(preview.deduction_amount),
            'driver-payroll-doctor-paid': formatRp(preview.doctor_paid_amount),
            'driver-payroll-total': formatRp(preview.total_amount)
        };
        Object.keys(values).forEach(function (id) {
            var element = document.getElementById(id);
            if (element) element.textContent = values[id];
        });

        var selectedMonth = monthInput.value;
        var stored = state.driverPayrolls.find(function (item) {
            return driverMonthKey(item.payroll_month) === selectedMonth;
        }) || null;
        state.currentDriverPayroll = stored;
        var finalized = Boolean(stored && stored.status === 'finalized');
        absenceInput.disabled = finalized;
        var status = document.getElementById('driver-payroll-status');
        if (status) {
            status.className = 'badge ' + (finalized ? 'badge-success' : stored ? 'badge-warning' : 'badge-light');
            status.textContent = finalized ? 'Finalized' : stored ? 'Draft' : 'Draft baru';
        }
        var saveButton = document.querySelector('[data-payroll-action="driver-save"]');
        var finalizeButton = document.querySelector('[data-payroll-action="driver-finalize"]');
        var deleteButton = document.querySelector('[data-payroll-action="driver-delete"]');
        var printButton = document.querySelector('[data-payroll-action="driver-print"]');
        if (saveButton) saveButton.style.display = hasAccountPermission('staff_payroll.write') ? '' : 'none';
        if (finalizeButton) finalizeButton.style.display = hasAccountPermission('staff_payroll.finalize') ? '' : 'none';
        if (deleteButton) deleteButton.style.display = hasAccountPermission('staff_payroll.delete') ? '' : 'none';
        if (printButton) printButton.style.display = hasAccountPermission('staff_payroll.export') ? '' : 'none';
        absenceInput.disabled = finalized || !hasAccountPermission('staff_payroll.write');
        if (bonusInput) bonusInput.disabled = finalized || !hasAccountPermission('staff_payroll.write');
        nameInput.disabled = !hasAccountPermission('staff_payroll.write');
        if (saveButton) {
            saveButton.disabled = state.loading || (finalized && !stored);
            saveButton.innerHTML = finalized
                ? '<i class="fas fa-save mr-1"></i>Simpan Nama'
                : '<i class="fas fa-save mr-1"></i>Simpan Draft';
        }
        if (finalizeButton) finalizeButton.disabled = state.loading || finalized;
        if (deleteButton) deleteButton.disabled = state.loading || finalized || !stored;
        if (printButton) printButton.disabled = state.loading || !finalized || !String(stored && stored.driver_name || '').trim();
        renderDriverHistory();
    }

    function printDriverSlip(month) {
        if (!hasAccountPermission('staff_payroll.export')) return;
        try {
            var selectedMonth = month || driverMonthKey(state.currentDriverPayroll && state.currentDriverPayroll.payroll_month);
            var record = state.driverPayrolls.find(function (item) {
                return driverMonthKey(item.payroll_month) === selectedMonth;
            }) || state.currentDriverPayroll;
            var html = getPrintModule().buildDriverSlipDocument(record);
            openPrintWindow(html, 'Slip Gaji Driver - ' + selectedMonth);
        } catch (err) {
            console.error('[staff-payroll] driver slip print error:', err);
            showMessage(err.message || 'Gagal mencetak slip gaji driver', 'error');
        }
    }

    function selectDriverPayroll(month) {
        var monthInput = document.getElementById('driver-payroll-month');
        var absenceInput = document.getElementById('driver-payroll-absence-days');
        var nameInput = document.getElementById('driver-payroll-name');
        if (!monthInput || !absenceInput || !nameInput) return;
        var record = state.driverPayrolls.find(function (item) {
            return driverMonthKey(item.payroll_month) === month;
        }) || null;
        monthInput.value = month;
        nameInput.value = record ? String(record.driver_name || '') : '';
        absenceInput.value = String(record ? Number(record.absence_days || 0) : 0);
        var bonusInput = document.getElementById('driver-payroll-doctor-bonus');
        if (bonusInput) {
            bonusInput.value = String(record && record.doctor_bonus !== undefined && record.doctor_bonus !== null
                ? Number(record.doctor_bonus)
                : DRIVER_DEFAULT_DOCTOR_BONUS);
        }
        state.currentDriverPayroll = record;
        renderDriverPreview();
    }

    function bindDriverPayrollInputs() {
        var monthInput = document.getElementById('driver-payroll-month');
        var absenceInput = document.getElementById('driver-payroll-absence-days');
        var nameInput = document.getElementById('driver-payroll-name');
        if (monthInput && monthInput.dataset.bound !== 'true') {
            monthInput.dataset.bound = 'true';
            monthInput.addEventListener('change', function () {
                selectDriverPayroll(monthInput.value);
            });
        }
        if (absenceInput && absenceInput.dataset.bound !== 'true') {
            absenceInput.dataset.bound = 'true';
            absenceInput.addEventListener('input', renderDriverPreview);
            absenceInput.addEventListener('change', renderDriverPreview);
        }
        if (nameInput && nameInput.dataset.bound !== 'true') {
            nameInput.dataset.bound = 'true';
            nameInput.addEventListener('input', renderDriverPreview);
        }
        var bonusInput = document.getElementById('driver-payroll-doctor-bonus');
        if (bonusInput && bonusInput.dataset.bound !== 'true') {
            bonusInput.dataset.bound = 'true';
            bonusInput.addEventListener('input', renderDriverPreview);
            bonusInput.addEventListener('change', renderDriverPreview);
        }
    }

    function renderCyclePicker() {
        var el = document.getElementById('staff-payroll-cycle-dates');
        if (!el) return;
        var size = Math.max(1, Number(state.cycleSize) || 4);
        var dates = state.latestCycle.slice(0, size);
        while (dates.length < size) dates.push('');
        var title = document.getElementById('staff-payroll-cycle-title');
        if (title) {
            title.textContent = 'Siklus ' + size + ' Praktik' +
                (state.practiceDays.length ? ' (4 minggu \u00b7 ' + state.practiceDays.join(', ') + ')' : '');
        }
        var filled = state.latestCycle.length;
        var hint = filled < size
            ? '<div class="col-12 small text-warning mb-2"><i class="fas fa-info-circle mr-1"></i>Siklus belum lengkap: baru ' + filled + ' dari ' + size +
              ' tanggal praktik' + (state.lastCycleEnd ? ' sejak batch terakhir (' + escapeHtml(formatDate(state.lastCycleEnd)) + ')' : '') +
              '. Tanggal kosong boleh diisi manual atau dibiarkan.</div>'
            : '<div class="col-12 small text-muted mb-2">Tanggal diambil dari booking' +
              (state.lastCycleEnd ? ' setelah batch terakhir (' + escapeHtml(formatDate(state.lastCycleEnd)) + ')' : '') + '; bisa dikoreksi.</div>';
        el.innerHTML = hint + dates.map(function (date, index) {
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
            tbody.innerHTML = '<tr><td colspan="14" class="text-center text-muted py-4">Belum ada batch dipilih.</td></tr>';
            renderActions();
            return;
        }

        var dates = batch.practice_dates || [];
        var readonly = batch.status === 'finalized' || !hasAccountPermission('staff_payroll.write');
        var attendanceHead = document.getElementById('staff-payroll-attendance-head');
        if (attendanceHead) attendanceHead.setAttribute('colspan', String(Math.max(1, dates.length)));
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
            var allowanceAmount = Number(item.allowance_amount) || 0;
            return '<tr data-staff-id="' + escapeHtml(item.staff_id) + '" data-allowance="' + allowanceAmount + '">' +
                '<td><div class="font-weight-bold">' + escapeHtml(item.staff_name) + '</div><div class="text-muted small">' + escapeHtml(item.staff_id) + '</div></td>' +
                '<td>' + escapeHtml(item.role_display || item.role_name || '-') + '</td>' +
                dateCells +
                '<td class="text-right payroll-attendance-count">' + (item.attendance_count || 0) + '</td>' +
                '<td class="text-right payroll-base">' + escapeHtml(formatRp(item.base_amount)) + '</td>' +
                '<td class="text-right payroll-additional">' + escapeHtml(formatRp(item.additional_amount)) + '</td>' +
                '<td class="text-right"><span class="payroll-allowance">' + escapeHtml(formatRp(item.allowance_paid)) + '</span>' +
                    (item.allowance_label ? '<div class="text-muted small">' + escapeHtml(item.allowance_label) + '</div>' : '') + '</td>' +
                '<td style="min-width:130px;"><input type="number" step="1" class="form-control form-control-sm text-right staff-payroll-adjustment" value="' + (Number(item.adjustment_amount) || 0) + '"' + (readonly ? ' disabled' : '') + '></td>' +
                '<td class="text-right font-weight-bold payroll-total">' + escapeHtml(formatRp(item.total_amount)) + '</td>' +
                '<td style="min-width:150px;"><input type="text" class="form-control form-control-sm staff-payroll-notes" value="' + escapeHtml(item.notes || '') + '"' + (readonly ? ' disabled' : '') + '></td>' +
                '<td class="text-center" style="min-width:110px;">' + (readonly && Number(item.total_amount) > 0 ?
                    '<button type="button" class="btn btn-xs btn-outline-primary" data-staff-slip-id="' + escapeHtml(item.staff_id) + '"><i class="fas fa-print mr-1"></i>Cetak Slip</button>' :
                    '<span class="text-muted small">' + (readonly ? 'Tidak dibayar' : 'Finalize dulu') + '</span>') + '</td>' +
                '</tr>';
        }).join('');

        tbody.querySelectorAll('[data-staff-slip-id]').forEach(function (button) {
            button.addEventListener('click', function () {
                printStaffSlip(button.getAttribute('data-staff-slip-id'));
            });
        });

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
        var batch = state.currentBatch || {};
        var baseRate = batch.base_rate != null ? Number(batch.base_rate) : 150000;
        var additionalRate = batch.additional_rate != null ? Number(batch.additional_rate) : 100000;
        var base = attendance > 0 ? baseRate : 0;
        var additional = attendance > 0 ? Math.max(0, attendance - 1) * additionalRate : 0;
        var allowance = attendance > 0 ? (Number(row.getAttribute('data-allowance')) || 0) : 0;
        var total = attendance > 0 ? base + additional + allowance + adjustment : 0;
        if (attendance === 0 && adjustmentInput && Number(adjustmentInput.value || 0) !== 0) {
            adjustmentInput.value = 0;
        }
        row.querySelector('.payroll-attendance-count').textContent = attendance;
        row.querySelector('.payroll-base').textContent = formatRp(base);
        row.querySelector('.payroll-additional').textContent = formatRp(additional);
        var allowanceEl = row.querySelector('.payroll-allowance');
        if (allowanceEl) allowanceEl.textContent = formatRp(allowance);
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
                '<strong class="mr-2">Total: <span id="staff-payroll-live-total">' + escapeHtml(formatRp(batch.total_amount)) + '</span></strong>' +
                (hasAccountPermission('staff_payroll.export') ? '<button type="button" class="btn btn-sm btn-outline-primary" data-payroll-action="print-all" onclick="if(window.staffPayroll) window.staffPayroll.printAllStaffSlips()"><i class="fas fa-print mr-1"></i>Cetak Semua Slip</button>' : '');
            return;
        }

        el.innerHTML =
            '<strong class="mr-3">Total: <span id="staff-payroll-live-total">' + escapeHtml(formatRp(batch.total_amount)) + '</span></strong>' +
            (hasAccountPermission('staff_payroll.write') ? '<button type="button" class="btn btn-sm btn-primary mr-2" data-payroll-action="save" onclick="if(window.staffPayroll) window.staffPayroll.save()"><i class="fas fa-save mr-1"></i>Simpan Draft</button>' : '') +
            (hasAccountPermission('staff_payroll.finalize') ? '<button type="button" class="btn btn-sm btn-success mr-2" data-payroll-action="finalize" onclick="if(window.staffPayroll) window.staffPayroll.finalize()"><i class="fas fa-check mr-1"></i>Finalize</button>' : '') +
            (hasAccountPermission('staff_payroll.delete') ? '<button type="button" class="btn btn-sm btn-outline-danger" data-payroll-action="delete" onclick="if(window.staffPayroll) window.staffPayroll.removeDraft()"><i class="fas fa-trash mr-1"></i>Hapus Draft</button>' : '');
    }

    function printStaffSlip(staffId) {
        if (!hasAccountPermission('staff_payroll.export')) return;
        try {
            var batch = state.currentBatch;
            var item = batch && (batch.items || []).find(function (candidate) {
                return String(candidate.staff_id) === String(staffId);
            });
            var html = getPrintModule().buildStaffSlipDocument(batch, item);
            openPrintWindow(html, 'Slip Gaji - ' + (item ? item.staff_name : 'Pegawai'));
        } catch (err) {
            console.error('[staff-payroll] staff slip print error:', err);
            showMessage(err.message || 'Gagal mencetak slip gaji pegawai', 'error');
        }
    }

    function printAllStaffSlips() {
        if (!hasAccountPermission('staff_payroll.export')) return;
        try {
            var html = getPrintModule().buildBatchSlipDocument(state.currentBatch);
            openPrintWindow(html, 'Slip Gaji Pegawai Sunday Clinic');
        } catch (err) {
            console.error('[staff-payroll] batch slip print error:', err);
            showMessage(err.message || 'Gagal mencetak seluruh slip gaji', 'error');
        }
    }

    async function loadDriverPayrolls() {
        var result = await api('/driver-payrolls?limit=24');
        state.driverPayrolls = result.data || [];
        bindDriverPayrollInputs();
        var monthInput = document.getElementById('driver-payroll-month');
        var selectedMonth = monthInput && monthInput.value ? monthInput.value : defaultDriverPayrollMonth();
        selectDriverPayroll(selectedMonth);
    }

    function collectDriverPayrollInput() {
        var month = (document.getElementById('driver-payroll-month') || {}).value || defaultDriverPayrollMonth();
        var absenceDays = Number((document.getElementById('driver-payroll-absence-days') || {}).value || 0);
        var driverName = String((document.getElementById('driver-payroll-name') || {}).value || '').replace(/\s+/g, ' ').trim();
        if (!driverName) throw new Error('Nama driver wajib diisi');
        var bonusRaw = String((document.getElementById('driver-payroll-doctor-bonus') || {}).value || '').trim();
        var doctorBonus = bonusRaw === '' ? DRIVER_DEFAULT_DOCTOR_BONUS : Number(bonusRaw);
        if (!Number.isInteger(doctorBonus) || doctorBonus < 0 || doctorBonus > DRIVER_MAX_DOCTOR_BONUS) {
            throw new Error('Tambahan dari dokterdibya harus bilangan bulat antara 0 dan ' + formatRp(DRIVER_MAX_DOCTOR_BONUS));
        }
        return { month: month, driver_name: driverName, absence_days: absenceDays, doctor_bonus: doctorBonus };
    }

    async function persistDriverDraft(showSuccess) {
        var input = collectDriverPayrollInput();
        var result = await api('/driver-payrolls/' + encodeURIComponent(input.month), {
            method: 'PUT',
            body: JSON.stringify({
                driver_name: input.driver_name,
                absence_days: input.absence_days,
                doctor_bonus: input.doctor_bonus
            })
        });
        state.currentDriverPayroll = result.data;
        await loadDriverPayrolls();
        selectDriverPayroll(input.month);
        if (showSuccess) showMessage('Draft gaji driver berhasil disimpan', 'success');
        return result.data;
    }

    async function saveDriver() {
        if (!hasAccountPermission('staff_payroll.write')) return;
        setBusy(true);
        try {
            var input = collectDriverPayrollInput();
            var stored = state.driverPayrolls.find(function (item) {
                return driverMonthKey(item.payroll_month) === input.month;
            });
            if (stored && stored.status === 'finalized') {
                await api('/driver-payrolls/' + encodeURIComponent(input.month) + '/name', {
                    method: 'PATCH',
                    body: JSON.stringify({ driver_name: input.driver_name })
                });
                await loadDriverPayrolls();
                selectDriverPayroll(input.month);
                showMessage('Nama driver berhasil disimpan', 'success');
            } else {
                await persistDriverDraft(true);
            }
        } catch (err) {
            console.error('[staff-payroll] driver save error:', err);
            showMessage(err.message || 'Gagal menyimpan gaji driver', 'error');
        } finally {
            setBusy(false);
            renderDriverPreview();
        }
    }

    async function finalizeDriver() {
        if (!hasAccountPermission('staff_payroll.finalize')) return;
        var input = collectDriverPayrollInput();
        if (!confirm('Finalize gaji driver ' + input.driver_name + ' bulan ' + input.month + '? Setelah finalized, nilai gaji tidak bisa diubah dan akan mengurangi Analisa Keuangan.')) return;
        setBusy(true);
        try {
            await persistDriverDraft(false);
            var result = await api('/driver-payrolls/' + encodeURIComponent(input.month) + '/finalize', {
                method: 'POST',
                body: JSON.stringify({})
            });
            state.currentDriverPayroll = result.data;
            await loadDriverPayrolls();
            selectDriverPayroll(input.month);
            showMessage('Gaji driver berhasil difinalkan', 'success');
        } catch (err) {
            console.error('[staff-payroll] driver finalize error:', err);
            showMessage(err.message || 'Gagal finalisasi gaji driver', 'error');
        } finally {
            setBusy(false);
            renderDriverPreview();
        }
    }

    async function removeDriverDraft() {
        if (!hasAccountPermission('staff_payroll.delete')) return;
        var input = collectDriverPayrollInput();
        if (!confirm('Hapus draft gaji driver bulan ' + input.month + '?')) return;
        setBusy(true);
        try {
            await api('/driver-payrolls/' + encodeURIComponent(input.month), { method: 'DELETE' });
            state.currentDriverPayroll = null;
            await loadDriverPayrolls();
            selectDriverPayroll(input.month);
            showMessage('Draft gaji driver berhasil dihapus', 'success');
        } catch (err) {
            console.error('[staff-payroll] driver delete error:', err);
            showMessage(err.message || 'Gagal menghapus draft gaji driver', 'error');
        } finally {
            setBusy(false);
            renderDriverPreview();
        }
    }

    async function loadPracticeDates() {
        var result = await api('/practice-dates');
        var data = result.data || {};
        state.practiceDates = data.practice_dates || [];
        state.latestCycle = data.latest_cycle || [];
        state.cycleSize = Number(data.cycle_size) || 4;
        state.practiceDays = data.practice_days || [];
        state.lastCycleEnd = data.last_cycle_end || null;
        renderCyclePicker();
    }

    async function loadSettings() {
        var result = await api('/settings');
        state.settings = result.data || null;
        renderSettings();
    }

    function staffOptions(selectedId) {
        var staff = (state.settings && state.settings.staff) || [];
        return '<option value="">- Pilih staff -</option>' + staff.map(function (s) {
            return '<option value="' + escapeHtml(s.staff_id) + '"' + (String(s.staff_id) === String(selectedId) ? ' selected' : '') + '>' +
                escapeHtml(s.name) + (s.role_display ? ' (' + escapeHtml(s.role_display) + ')' : '') + '</option>';
        }).join('');
    }

    function allowanceRowHtml(allowance, readonly) {
        var a = allowance || {};
        var dis = readonly ? ' disabled' : '';
        return '<div class="form-row align-items-center mb-2 staff-payroll-allowance-row">' +
            '<div class="col-md-4 col-12 mb-1 mb-md-0"><select class="form-control form-control-sm staff-payroll-allowance-staff"' + dis + '>' + staffOptions(a.staff_id) + '</select></div>' +
            '<div class="col-md-3 col-6"><input type="text" maxlength="100" class="form-control form-control-sm staff-payroll-allowance-label" placeholder="Tugas (mis. Stok Obat)" value="' + escapeHtml(a.label || '') + '"' + dis + '></div>' +
            '<div class="col-md-3 col-4"><input type="number" min="0" step="1000" class="form-control form-control-sm text-right staff-payroll-allowance-amount" value="' + (a.amount != null ? Number(a.amount) : 100000) + '"' + dis + '></div>' +
            '<div class="col-md-2 col-2 text-right">' + (readonly ? '' : '<button type="button" class="btn btn-sm btn-outline-danger staff-payroll-allowance-remove" title="Hapus"><i class="fas fa-times"></i></button>') + '</div>' +
            '</div>';
    }

    function renderSettings() {
        var el = document.getElementById('staff-payroll-settings-body');
        if (!el) return;
        var settings = state.settings;
        if (!settings) {
            el.innerHTML = '<div class="text-muted small">Pengaturan gaji tidak tersedia.</div>';
            return;
        }
        var readonly = !hasAccountPermission('staff_payroll.write');
        var dis = readonly ? ' disabled' : '';
        var rates = settings.rates || {};
        el.innerHTML =
            '<div class="form-row">' +
            '<div class="col-md-3 col-6 mb-2"><label class="small text-muted mb-1">Hadir pertama (Rp)</label>' +
            '<input type="number" min="0" step="1000" id="staff-payroll-rate-base" class="form-control form-control-sm text-right" value="' + (Number(rates.base_amount) || 0) + '"' + dis + '></div>' +
            '<div class="col-md-3 col-6 mb-2"><label class="small text-muted mb-1">Tiap hadir tambahan (Rp)</label>' +
            '<input type="number" min="0" step="1000" id="staff-payroll-rate-additional" class="form-control form-control-sm text-right" value="' + (Number(rates.additional_rate) || 0) + '"' + dis + '></div>' +
            '<div class="col-md-6 mb-2 d-flex align-items-end"><div class="small text-muted">Perubahan tarif & tunjangan berlaku untuk draft gaji yang dibuat berikutnya. Batch yang sudah ada tidak berubah.</div></div>' +
            '</div>' +
            '<label class="small text-muted mb-1">Tunjangan tugas per siklus (dibayar jika hadir minimal 1x)</label>' +
            '<div id="staff-payroll-allowance-list">' +
            ((settings.allowances || []).map(function (a) { return allowanceRowHtml(a, readonly); }).join('') ||
                '<div class="text-muted small mb-2 staff-payroll-allowance-empty">Belum ada tunjangan.</div>') +
            '</div>' +
            (readonly ? '' :
                '<div class="mt-2">' +
                '<button type="button" class="btn btn-sm btn-outline-secondary mr-2" id="staff-payroll-allowance-add"><i class="fas fa-plus mr-1"></i>Tambah Tunjangan</button>' +
                '<button type="button" class="btn btn-sm btn-info" id="staff-payroll-settings-save"><i class="fas fa-save mr-1"></i>Simpan Pengaturan</button>' +
                '</div>');

        var formula = document.getElementById('staff-payroll-formula');
        if (formula) {
            formula.textContent = 'Rumus: hadir pertama ' + formatRp(rates.base_amount) + ', hadir berikutnya ' +
                formatRp(rates.additional_rate) + ' per hadir, + tunjangan tugas (jika hadir) + penyesuaian opsional. ' +
                'Draft memakai tarif saat draft dibuat.';
        }

        if (readonly) return;
        var list = document.getElementById('staff-payroll-allowance-list');
        list.addEventListener('click', function (e) {
            var btn = e.target.closest('.staff-payroll-allowance-remove');
            if (btn) btn.closest('.staff-payroll-allowance-row').remove();
        });
        document.getElementById('staff-payroll-allowance-add').addEventListener('click', function () {
            var empty = list.querySelector('.staff-payroll-allowance-empty');
            if (empty) empty.remove();
            list.insertAdjacentHTML('beforeend', allowanceRowHtml(null, false));
        });
        document.getElementById('staff-payroll-settings-save').addEventListener('click', saveSettings);
    }

    function collectSettings() {
        return {
            rates: {
                base_amount: Number((document.getElementById('staff-payroll-rate-base') || {}).value || 0),
                additional_rate: Number((document.getElementById('staff-payroll-rate-additional') || {}).value || 0)
            },
            allowances: Array.from(document.querySelectorAll('#staff-payroll-allowance-list .staff-payroll-allowance-row')).map(function (row) {
                return {
                    staff_id: row.querySelector('.staff-payroll-allowance-staff').value,
                    label: row.querySelector('.staff-payroll-allowance-label').value,
                    amount: Number(row.querySelector('.staff-payroll-allowance-amount').value || 0)
                };
            })
        };
    }

    async function saveSettings() {
        if (!hasAccountPermission('staff_payroll.write')) return;
        setBusy(true);
        try {
            var result = await api('/settings', { method: 'PUT', body: JSON.stringify(collectSettings()) });
            state.settings = Object.assign({}, state.settings, result.data || {});
            renderSettings();
            showMessage(result.message || 'Pengaturan gaji disimpan', 'success');
        } catch (err) {
            console.error('[staff-payroll] settings save error:', err);
            showMessage(err.message || 'Gagal menyimpan pengaturan gaji', 'error');
        } finally {
            setBusy(false);
        }
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
            renderDriverPreview();
        }
    }

    function collectCycleDates() {
        return Array.from(document.querySelectorAll('.staff-payroll-cycle-input'))
            .map(function (input) { return input.value; })
            .filter(Boolean);
    }

    async function createDraft() {
        if (!hasAccountPermission('staff_payroll.write')) return;
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
        if (!hasAccountPermission('staff_payroll.write')) return;
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
        if (!hasAccountPermission('staff_payroll.finalize')) return;
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
        if (!hasAccountPermission('staff_payroll.delete')) return;
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
        var createButton = document.querySelector('[data-payroll-action="create"]');
        if (createButton) createButton.style.display = hasAccountPermission('staff_payroll.write') ? '' : 'none';
        setBusy(true);
        try {
            await loadDriverPayrolls();
            await loadPracticeDates();
            await loadSettings();
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
            if (tbody) tbody.innerHTML = '<tr><td colspan="14" class="text-center text-danger py-4">' + escapeHtml(err.message || 'Gagal memuat payroll') + '</td></tr>';
        } finally {
            setBusy(false);
            renderDriverPreview();
        }
    }

    window.staffPayroll = {
        init: init,
        refresh: init,
        createDraft: createDraft,
        save: save,
        finalize: finalize,
        removeDraft: removeDraft,
        saveSettings: saveSettings,
        loadBatch: loadBatch,
        saveDriver: saveDriver,
        finalizeDriver: finalizeDriver,
        removeDriverDraft: removeDriverDraft,
        printDriverSlip: printDriverSlip,
        printStaffSlip: printStaffSlip,
        printAllStaffSlips: printAllStaffSlips
    };
})();
