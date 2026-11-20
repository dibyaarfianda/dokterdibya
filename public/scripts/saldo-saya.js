(function () {
    'use strict';

    // Portal "Saldo Saya": the patient's deposit saldo (live, or "Saldo uji" for Duitku review
    // accounts), its history, and requests to withdraw live saldo to a bank account. The server
    // is the authority on every rule; the checks here only save a round trip. Everything from the
    // server is written with textContent.

    var session = window.PatientSession;
    if (!session || !session.getToken()) {
        window.location.replace('/patient-login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search));
        return;
    }

    var shell = window.PatientToolShell;
    shell.init({ activeNav: 'aplikasi', unlockOnReady: true });

    var root = document.getElementById('prepay-app');
    var heroStatus = document.getElementById('prepay-hero-status');

    var MIN_AMOUNT = 10000;
    var BANKS = ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'CIMB Niaga', 'Permata', 'Lainnya'];
    var OTHER_BANK = 'Lainnya';
    var KEY_STORAGE = 'saldo_saya_refund_key_v1';
    var KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var ENTRY_LABELS = {
        prepay: 'Deposit',
        usage: 'Dipotong untuk tagihan',
        return_credit: 'Retur ke saldo',
        refund: 'Dicairkan'
    };
    var STATUS_LABELS = {
        pending: 'Diproses',
        done: 'Selesai',
        rejected: 'Ditolak',
        cancelled: 'Dibatalkan'
    };

    var moneyFormat = new Intl.NumberFormat('id-ID');
    var state = { saldo: null, busy: false };

    function rupiah(amount) {
        return 'Rp' + moneyFormat.format(Number(amount) || 0);
    }

    function formatDate(value) {
        return window.DibyaDateTime ? window.DibyaDateTime.date(value) : '-';
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function toast(message) {
        var container = document.getElementById('toast-container');
        if (!container) return;
        var node = el('div', 'toast', message);
        container.appendChild(node);
        window.setTimeout(function () { node.remove(); }, 2600);
    }

    // ---------------------------------------------------------------- API

    function ApiError(message, status, code) {
        var error = new Error(message);
        error.status = status;
        error.code = code;
        return error;
    }

    async function api(path, options) {
        options = options || {};
        var separator = path.indexOf('?') === -1 ? '?' : '&';
        var headers = { Authorization: 'Bearer ' + session.getToken(), 'Cache-Control': 'no-cache' };
        var init = { method: options.method || 'GET', headers: headers, cache: 'no-store' };
        if (options.body) {
            headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(options.body);
        }
        var response = await fetch('/api/patient/checkup-prepay' + path + separator + '_t=' + Date.now(), init);
        if (response.status === 401) {
            session.clearAuth();
            window.location.replace('/patient-login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search));
            throw ApiError('Sesi berakhir', 401);
        }
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok || data.success === false) {
            throw ApiError(data.message || 'Terjadi kesalahan. Silakan coba lagi.', response.status, data.code);
        }
        return data;
    }

    // ---------------------------------------------------------------- Retry key

    function randomKey() {
        var bytes = new Uint8Array(32);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(bytes);
        } else {
            for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
        }
        var key = '';
        for (var j = 0; j < bytes.length; j += 1) key += KEY_ALPHABET.charAt(bytes[j] % KEY_ALPHABET.length);
        return key;
    }

    // The same request_key is reused only while the payload is identical, so retrying the same
    // submit is safe and any change gets a new key (the server refuses a key reused for other data).
    function keyFor(payload) {
        var serialized = JSON.stringify([payload.amount_idr, payload.bank_name, payload.account_number, payload.account_holder]);
        try {
            var saved = JSON.parse(window.sessionStorage.getItem(KEY_STORAGE) || 'null');
            if (saved && saved.payload === serialized && typeof saved.key === 'string') return saved.key;
        } catch (error) { /* fall through to a new key */ }
        var key = randomKey();
        try {
            window.sessionStorage.setItem(KEY_STORAGE, JSON.stringify({ key: key, payload: serialized }));
        } catch (error) { /* storage blocked: the key still works for this attempt */ }
        return key;
    }

    function clearKey() {
        try { window.sessionStorage.removeItem(KEY_STORAGE); } catch (error) { /* ignore */ }
    }

    // ---------------------------------------------------------------- Views

    function setRoot(sections) {
        root.textContent = '';
        sections.forEach(function (section) { root.appendChild(section); });
    }

    function panel(title) {
        var section = el('section', 'section reveal');
        var box = el('div', 'tool-panel pm-panel');
        if (title) box.appendChild(el('h3', 'pm-heading', title));
        section.appendChild(box);
        return { section: section, box: box };
    }

    function messageSection(title, body) {
        var parts = panel(title);
        parts.box.appendChild(el('p', 'pm-note', body));
        return parts;
    }

    function setHero(text) {
        if (heroStatus) heroStatus.textContent = text;
    }

    function renderBalanceCard(saldo) {
        var parts = panel('Saldo deposit');
        var live = el('div', 'pm-total first');
        live.appendChild(el('span', '', 'Saldo'));
        live.appendChild(el('strong', '', rupiah(saldo.balances.live)));
        parts.box.appendChild(live);
        if (saldo.balances.sandbox > 0) {
            var sandbox = el('div', 'pm-total');
            sandbox.appendChild(el('span', '', 'Saldo uji'));
            sandbox.appendChild(el('strong', '', rupiah(saldo.balances.sandbox)));
            parts.box.appendChild(sandbox);
        }
        parts.box.appendChild(el('p', 'pm-note', 'Saldo dipotong dari tagihan kunjungan Klinik Privat Anda.'));
        return parts.section;
    }

    function historyLabel(entry) {
        var label = ENTRY_LABELS[entry.entry_type] || 'Mutasi saldo';
        if (entry.entry_type === 'usage') label += ' (' + formatDate(entry.created_at) + ')';
        return label;
    }

    function renderHistory(history) {
        if (!history.length) return null;
        var parts = panel('Riwayat saldo');
        history.forEach(function (entry) {
            var row = el('div', 'sd-row');
            var left = el('div');
            var title = el('span', '', historyLabel(entry));
            if (entry.gateway_mode === 'sandbox') title.appendChild(el('span', 'sd-tag', 'Saldo uji'));
            left.appendChild(title);
            var meta = [entry.category_label, formatDate(entry.created_at)].filter(Boolean).join(' · ');
            left.appendChild(el('small', '', meta));
            row.appendChild(left);
            var amount = Number(entry.amount_idr) || 0;
            row.appendChild(el('strong', '', (amount < 0 ? '−' : '+') + rupiah(Math.abs(amount))));
            parts.box.appendChild(row);
        });
        return parts.section;
    }

    function renderRequests(requests) {
        if (!requests.length) return null;
        var parts = panel('Pengajuan pencairan');
        requests.forEach(function (request) {
            var row = el('div', 'sd-row');
            var left = el('div');
            left.appendChild(el('span', '', rupiah(request.amount_idr) + ' · ' + (STATUS_LABELS[request.status] || request.status)));
            left.appendChild(el('small', '', request.bank_name + ' ' + request.account_number + ' a.n. ' + request.account_holder));
            left.appendChild(el('small', '', formatDate(request.created_at)));
            if (request.status === 'rejected' && request.decision_note) {
                left.appendChild(el('small', '', 'Alasan: ' + request.decision_note));
            }
            row.appendChild(left);
            if (request.status === 'pending') {
                var cancel = el('button', 'pm-btn secondary small', 'Batalkan');
                cancel.type = 'button';
                cancel.addEventListener('click', function () { cancelRequest(request.id, cancel); });
                row.appendChild(cancel);
            }
            parts.box.appendChild(row);
        });
        return parts.section;
    }

    function field(id, labelText, input) {
        var wrap = el('div', 'sd-field');
        var label = el('label', '', labelText);
        label.setAttribute('for', id);
        input.id = id;
        wrap.appendChild(label);
        wrap.appendChild(input);
        return wrap;
    }

    function renderForm(saldo, pending) {
        var live = saldo.balances.live;
        var sandboxOnly = live <= 0 && saldo.balances.sandbox > 0;
        var disabledNote = '';
        if (pending) disabledNote = 'Pengajuan sebelumnya masih diproses.';
        else if (sandboxOnly) disabledNote = 'Saldo uji tidak dapat dicairkan';
        else if (saldo.available_idr <= 0) {
            return messageSection('Cairkan ke rekening', 'Belum ada saldo yang dapat dicairkan.').section;
        }
        var disabled = !!disabledNote;

        var parts = panel('Cairkan ke rekening');
        var form = el('form', 'sd-form');
        form.setAttribute('novalidate', 'novalidate');

        var bank = document.createElement('select');
        BANKS.forEach(function (name) {
            var option = el('option', '', name);
            option.value = name;
            bank.appendChild(option);
        });
        var bankOther = document.createElement('input');
        bankOther.type = 'text';
        bankOther.maxLength = 60;
        bankOther.setAttribute('autocomplete', 'off');
        var bankOtherWrap = field('sd-bank-other', 'Nama bank', bankOther);
        bankOtherWrap.classList.add('sd-hidden');
        bank.addEventListener('change', function () {
            bankOtherWrap.classList.toggle('sd-hidden', bank.value !== OTHER_BANK);
        });

        var account = document.createElement('input');
        account.type = 'text';
        account.setAttribute('inputmode', 'numeric');
        account.setAttribute('autocomplete', 'off');
        account.maxLength = 20;

        var holder = document.createElement('input');
        holder.type = 'text';
        holder.maxLength = 120;
        holder.setAttribute('autocomplete', 'off');

        var amount = document.createElement('input');
        amount.type = 'text';
        amount.setAttribute('inputmode', 'numeric');
        amount.setAttribute('autocomplete', 'off');
        amount.value = saldo.available_idr > 0 ? String(saldo.available_idr) : '';

        var error = el('p', 'pm-error');
        error.setAttribute('role', 'alert');
        error.hidden = true;

        var submit = el('button', 'pm-btn primary', 'Ajukan pencairan');
        submit.type = 'submit';

        [bank, bankOther, account, holder, amount, submit].forEach(function (control) { control.disabled = disabled; });

        form.appendChild(field('sd-bank', 'Bank', bank));
        form.appendChild(bankOtherWrap);
        form.appendChild(field('sd-account', 'Nomor rekening', account));
        form.appendChild(field('sd-holder', 'Nama pemilik rekening', holder));
        form.appendChild(field('sd-amount', 'Nominal (Rp), tersedia ' + rupiah(saldo.available_idr), amount));
        form.appendChild(error);
        form.appendChild(submit);

        if (disabledNote) parts.box.appendChild(el('p', 'pm-note', disabledNote));
        parts.box.appendChild(form);
        parts.box.appendChild(el('p', 'pm-note', 'Pencairan diproses 1–2 hari kerja. Nominal yang Anda terima sama dengan nominal yang diajukan; biaya transfer ditanggung klinik. Nama pemilik rekening boleh berbeda dari nama Anda.'));

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (disabled || state.busy) return;
            var bankName = bank.value === OTHER_BANK ? bankOther.value.replace(/\s+/g, ' ').trim() : bank.value;
            var payload = {
                amount_idr: Number(amount.value.replace(/[.\s]/g, '')),
                bank_name: bankName,
                account_number: account.value.trim(),
                account_holder: holder.value.replace(/\s+/g, ' ').trim()
            };
            var problem = validate(payload, saldo.available_idr);
            if (problem) {
                showError(error, problem);
                return;
            }
            error.hidden = true;
            submitRequest(payload, error, submit);
        });

        return parts.section;
    }

    function validate(payload, available) {
        if (!Number.isSafeInteger(payload.amount_idr) || payload.amount_idr < MIN_AMOUNT) {
            return 'Nominal pencairan minimal ' + rupiah(MIN_AMOUNT) + ' dan harus bilangan bulat rupiah.';
        }
        if (payload.amount_idr > available) return 'Nominal melebihi saldo yang dapat dicairkan (' + rupiah(available) + ').';
        if (payload.bank_name.length < 2 || payload.bank_name.length > 60) return 'Nama bank wajib diisi (2–60 karakter).';
        if (!/^\d{6,20}$/.test(payload.account_number)) return 'Nomor rekening harus 6–20 digit angka.';
        if (payload.account_holder.length < 3 || payload.account_holder.length > 120) return 'Nama pemilik rekening wajib diisi (3–120 karakter).';
        return '';
    }

    function showError(node, message) {
        node.textContent = message;
        node.hidden = false;
    }

    function render() {
        var saldo = state.saldo;
        var history = saldo.history || [];
        var requests = saldo.requests || [];
        var live = saldo.balances.live;
        if (!history.length && !requests.length) {
            setHero('Belum ada saldo');
            setRoot([messageSection('Saldo deposit', 'Belum ada saldo deposit.').section]);
            return;
        }
        setHero(rupiah(live) + (saldo.balances.sandbox > 0 ? ' · Saldo uji ' + rupiah(saldo.balances.sandbox) : ''));
        var pending = requests.some(function (request) { return request.status === 'pending'; });
        setRoot([
            renderBalanceCard(saldo),
            renderForm(saldo, pending),
            renderRequests(requests),
            renderHistory(history)
        ].filter(Boolean));
    }

    function renderDemo() {
        setRoot([messageSection('Mode dummy', 'Saldo tidak tersedia pada mode dummy.').section]);
        setHero('Mode dummy');
    }

    function renderLoadError() {
        var parts = messageSection('Saldo belum dapat dimuat', 'Periksa koneksi Anda, lalu coba lagi.');
        var retry = el('button', 'pm-btn secondary', 'Coba lagi');
        retry.type = 'button';
        retry.addEventListener('click', load);
        parts.box.appendChild(retry);
        setRoot([parts.section]);
        setHero('Tidak tersedia');
    }

    // ---------------------------------------------------------------- Actions

    async function load() {
        setRoot([messageSection('Memuat saldo...', 'Sebentar.').section]);
        try {
            state.saldo = await api('/saldo');
        } catch (error) {
            renderLoadError();
            return;
        }
        render();
    }

    async function submitRequest(payload, errorNode, button) {
        state.busy = true;
        button.disabled = true;
        button.textContent = 'Mengajukan...';
        var body = {
            amount_idr: payload.amount_idr,
            bank_name: payload.bank_name,
            account_number: payload.account_number,
            account_holder: payload.account_holder,
            request_key: keyFor(payload)
        };
        try {
            await api('/refund-requests', { method: 'POST', body: body });
            clearKey();
            state.busy = false;
            toast('Pengajuan pencairan dikirim');
            await load();
        } catch (error) {
            state.busy = false;
            button.disabled = false;
            button.textContent = 'Ajukan pencairan';
            showError(errorNode, error.message || 'Gagal mengajukan pencairan. Silakan coba lagi.');
            if (error.status === 409) {
                // Already one pending, or the key belongs to other data: start clean on reload.
                clearKey();
            }
        }
    }

    async function cancelRequest(id, button) {
        if (state.busy) return;
        state.busy = true;
        button.disabled = true;
        try {
            await api('/refund-requests/' + encodeURIComponent(id) + '/cancel', { method: 'POST', body: {} });
            state.busy = false;
            toast('Pengajuan dibatalkan');
            await load();
        } catch (error) {
            state.busy = false;
            button.disabled = false;
            toast(error.message || 'Gagal membatalkan pengajuan.');
        }
    }

    if (session.isDemoMode && session.isDemoMode()) {
        renderDemo();
    } else {
        load();
    }
})();
