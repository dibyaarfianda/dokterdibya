(function () {
    'use strict';

    // Premium package page: choose a package, pay with QRIS or a bank virtual account.
    // The browser only ever reads our own API. A payment counts as paid when the server says so
    // (Duitku's signed callback), never because of anything this page sends.

    var session = window.PatientSession;
    if (!session || !session.getToken()) {
        window.location.replace('/patient-login.html');
        return;
    }

    var shell = window.PatientToolShell;
    shell.init({ activeNav: 'aplikasi', unlockOnReady: true });

    var root = document.getElementById('premium-app');
    var heroStatus = document.getElementById('premium-hero-status');
    var QR_LIBRARY_URL = '/scripts/vendor/qrcode-1.5.4.min.js?v=20261110premium1';
    var POLL_FAST_MS = 3000;
    var POLL_MEDIUM_MS = 10000;
    var POLL_SLOW_MS = 30000;
    var POLL_FAST_WINDOW_MS = 2 * 60 * 1000;
    var POLL_MEDIUM_WINDOW_MS = 10 * 60 * 1000;

    var state = {
        plans: [],
        methods: [],
        pkg: null,
        orders: [],
        selectedPlan: '',
        selectedMethod: 'qris',
        order: null,
        view: 'overview',
        busy: false,
        error: '',
        pollTimer: null,
        pollStartedAt: 0,
        checking: false,
        countdownTimer: null,
        qrLibrary: null
    };

    var moneyFormat = new Intl.NumberFormat('id-ID');

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    function rupiah(amount) {
        return 'Rp' + moneyFormat.format(Number(amount) || 0);
    }

    function durationLabel(days) {
        var value = Number(days) || 0;
        if (value >= 365 && value % 365 === 0) return (value / 365) + ' tahun';
        return value + ' hari';
    }

    function formatDate(value) {
        return window.DibyaDateTime ? window.DibyaDateTime.date(value) : '-';
    }

    function formatDateTime(value) {
        return window.DibyaDateTime ? window.DibyaDateTime.dateTime(value) : '-';
    }

    function planName(code) {
        var plan = state.plans.find(function (item) { return item.code === code; });
        return plan ? plan.name : code;
    }

    function toast(message) {
        var container = document.getElementById('toast-container');
        if (!container) return;
        var node = document.createElement('div');
        node.className = 'toast';
        node.textContent = message;
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
        var response = await fetch('/api/patient/premium' + path + separator + '_t=' + Date.now(), init);
        if (response.status === 401) {
            session.clearAuth();
            window.location.replace('/patient-login.html');
            throw ApiError('Sesi berakhir', 401);
        }
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok || data.success === false) {
            throw ApiError(data.message || 'Terjadi kesalahan. Silakan coba lagi.', response.status, data.code);
        }
        return data;
    }

    // ---------------------------------------------------------------- QR code

    function ensureQrLibrary() {
        if (window.QRCode) return Promise.resolve(window.QRCode);
        if (state.qrLibrary) return state.qrLibrary;
        state.qrLibrary = new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            var timer = window.setTimeout(function () { reject(new Error('timeout')); }, 10000);
            script.src = QR_LIBRARY_URL;
            script.async = true;
            script.onload = function () {
                window.clearTimeout(timer);
                if (window.QRCode) resolve(window.QRCode);
                else reject(new Error('missing'));
            };
            script.onerror = function () { window.clearTimeout(timer); reject(new Error('load')); };
            document.head.appendChild(script);
        }).catch(function (error) {
            state.qrLibrary = null;
            throw error;
        });
        return state.qrLibrary;
    }

    function drawQr(order) {
        var holder = document.getElementById('pm-qr-holder');
        if (!holder || !order.qr_string) return;
        ensureQrLibrary().then(function (QRCode) {
            var canvas = document.createElement('canvas');
            canvas.id = 'pm-qr-canvas';
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', 'Kode QRIS untuk membayar ' + rupiah(order.amount_idr));
            return new Promise(function (resolve, reject) {
                QRCode.toCanvas(canvas, order.qr_string, { width: 240, margin: 2, errorCorrectionLevel: 'M' }, function (error) {
                    if (error) reject(error); else resolve(canvas);
                });
            });
        }).then(function (canvas) {
            // The view may have changed while the library loaded.
            var current = document.getElementById('pm-qr-holder');
            if (!current || !state.order || state.order.order_ref !== order.order_ref) return;
            current.innerHTML = '';
            current.appendChild(canvas);
        }).catch(function () {
            var current = document.getElementById('pm-qr-holder');
            if (current) {
                current.innerHTML = '<p class="pm-note">Kode QR belum dapat ditampilkan. Periksa koneksi, atau pilih virtual account.</p>';
            }
        });
    }

    // ---------------------------------------------------------------- Views

    function setHeroStatus() {
        if (!heroStatus) return;
        if (state.pkg && state.pkg.active) heroStatus.textContent = 'Aktif sampai ' + formatDate(state.pkg.valid_until);
        else heroStatus.textContent = 'Belum ada paket';
    }

    function renderMessage(title, body, extra) {
        return '<section class="section reveal"><div class="tool-panel pm-panel">' +
            '<h3 class="pm-heading">' + escapeHtml(title) + '</h3>' +
            '<p class="pm-note">' + escapeHtml(body) + '</p>' + (extra || '') +
            '</div></section>';
    }

    function openOrders() {
        var now = Date.now();
        return state.orders.filter(function (order) {
            return order.status === 'pending' && new Date(order.expires_at).getTime() > now;
        });
    }

    function renderPackageStatus() {
        var pkg = state.pkg;
        if (!pkg || !pkg.active) {
            return '<section class="section reveal"><div class="tool-panel pm-panel pm-status">' +
                '<span class="pm-status-icon off"><i class="fa-solid fa-circle-minus"></i></span>' +
                '<div><h3 class="pm-heading">Belum ada paket aktif</h3>' +
                '<p class="pm-note">Paket yang sudah dibayar akan tampil di sini.</p></div></div></section>';
        }
        return '<section class="section reveal"><div class="tool-panel pm-panel pm-status">' +
            '<span class="pm-status-icon on"><i class="fa-solid fa-circle-check"></i></span>' +
            '<div><h3 class="pm-heading">' + escapeHtml(planName(pkg.plan_code)) + ' aktif</h3>' +
            '<p class="pm-note">Berlaku sampai ' + escapeHtml(formatDate(pkg.valid_until)) +
            ' (' + escapeHtml(pkg.days_left) + ' hari lagi).</p></div></div></section>';
    }

    function renderPendingNotice() {
        var pending = openOrders();
        if (!pending.length) return '';
        return pending.map(function (order) {
            return '<section class="section reveal"><div class="tool-panel pm-panel pm-pending">' +
                '<h3 class="pm-heading">Pembayaran belum selesai</h3>' +
                '<p class="pm-note">' + escapeHtml(planName(order.plan_code)) + ' · ' + escapeHtml(order.method_label) +
                ' · ' + escapeHtml(rupiah(order.amount_idr)) + '. Berlaku sampai ' + escapeHtml(formatDateTime(order.expires_at)) + '.</p>' +
                '<button type="button" class="pm-btn secondary" data-action="resume" data-ref="' + escapeHtml(order.order_ref) + '">Lanjutkan pembayaran</button>' +
                '</div></section>';
        }).join('');
    }

    function renderPlans() {
        if (!state.plans.length) {
            return renderMessage('Paket belum tersedia', 'Belum ada paket yang dibuka saat ini.');
        }
        var plan = state.plans.find(function (item) { return item.code === state.selectedPlan; }) || state.plans[0];
        var hasPackage = state.pkg && state.pkg.active;

        var planCards = state.plans.map(function (item) {
            var selected = item.code === plan.code;
            return '<button type="button" class="pm-plan' + (selected ? ' selected' : '') + '" data-action="plan" data-code="' + escapeHtml(item.code) + '" aria-pressed="' + selected + '">' +
                '<span class="pm-plan-main"><strong>' + escapeHtml(item.name) + '</strong>' +
                (item.description ? '<small>' + escapeHtml(item.description) + '</small>' : '') +
                '<small>Berlaku ' + escapeHtml(durationLabel(item.duration_days)) + '</small></span>' +
                '<span class="pm-plan-price">' + escapeHtml(rupiah(item.price_idr)) + '</span></button>';
        }).join('');

        var methodCards = state.methods.map(function (method) {
            var selected = method.key === state.selectedMethod;
            var icon = method.type === 'qris' ? 'fa-qrcode' : 'fa-building-columns';
            return '<button type="button" class="pm-method' + (selected ? ' selected' : '') + '" data-action="method" data-key="' + escapeHtml(method.key) + '" aria-pressed="' + selected + '">' +
                '<i class="fa-solid ' + icon + '"></i><span>' + escapeHtml(method.label) + '</span></button>';
        }).join('');

        var renewNote = hasPackage
            ? '<p class="pm-note">Paket Anda masih aktif. Masa berlaku paket baru dihitung setelah paket yang berjalan berakhir.</p>'
            : '';
        var error = state.error ? '<p class="pm-error" role="alert">' + escapeHtml(state.error) + '</p>' : '';

        return '<section class="section reveal">' +
            '<div class="section-head"><div><div class="section-kicker">Paket</div><h2 class="section-title">Pilih paket</h2></div></div>' +
            '<div class="tool-panel pm-panel">' +
            '<div class="pm-plans">' + planCards + '</div>' +
            '<h3 class="pm-label">Bayar dengan</h3>' +
            '<div class="pm-methods">' + methodCards + '</div>' +
            '<div class="pm-total"><span>Total</span><strong>' + escapeHtml(rupiah(plan.price_idr)) + '</strong></div>' +
            renewNote + error +
            '<button type="button" class="pm-btn primary" data-action="checkout"' + (state.busy ? ' disabled' : '') + '>' +
            (state.busy ? 'Membuat pembayaran...' : (hasPackage ? 'Perpanjang paket' : 'Bayar sekarang')) + '</button>' +
            '</div></section>';
    }

    function renderOverview() {
        root.innerHTML = renderPackageStatus() + renderPendingNotice() + renderPlans();
    }

    function instructionsFor(order) {
        if (order.method_type === 'qris') {
            return '<ol class="pm-steps"><li>Buka aplikasi bank atau e-wallet yang mendukung QRIS.</li>' +
                '<li>Pilih bayar dengan scan QR, lalu scan kode di atas.</li>' +
                '<li>Pastikan nominal ' + escapeHtml(rupiah(order.amount_idr)) + ', lalu konfirmasi.</li></ol>';
        }
        return '<ol class="pm-steps"><li>Buka aplikasi mobile banking atau ATM ' + escapeHtml(order.method_label.replace('VA ', '')) + '.</li>' +
            '<li>Pilih transfer ke virtual account, lalu masukkan nomor di atas.</li>' +
            '<li>Pastikan nominal ' + escapeHtml(rupiah(order.amount_idr)) + ', lalu konfirmasi.</li></ol>';
    }

    function renderPayment() {
        var order = state.order;
        var target;
        if (order.method_type === 'qris') {
            target = '<div class="pm-qr" id="pm-qr-holder"><p class="pm-note">Menyiapkan kode QR...</p></div>';
        } else {
            target = '<div class="pm-va"><span class="pm-label">Nomor virtual account ' + escapeHtml(order.method_label.replace('VA ', '')) + '</span>' +
                '<strong id="pm-va-number">' + escapeHtml(order.va_number || '-') + '</strong>' +
                '<button type="button" class="pm-btn secondary small" data-action="copy">Salin nomor</button></div>';
        }
        root.innerHTML = '<section class="section reveal">' +
            '<div class="section-head"><div><div class="section-kicker">' + escapeHtml(order.method_label) + '</div><h2 class="section-title">Selesaikan pembayaran</h2></div></div>' +
            '<div class="tool-panel pm-panel">' +
            '<div class="pm-total first"><span>' + escapeHtml(planName(order.plan_code)) + '</span><strong>' + escapeHtml(rupiah(order.amount_idr)) + '</strong></div>' +
            target +
            '<div class="pm-countdown"><span>Selesaikan dalam</span><strong id="pm-countdown">--:--</strong></div>' +
            '<p class="pm-waiting"><i class="fa-solid fa-spinner fa-spin"></i> Menunggu pembayaran. Halaman ini diperbarui otomatis.</p>' +
            instructionsFor(order) +
            '<button type="button" class="pm-btn secondary" data-action="back">Ganti metode pembayaran</button>' +
            '</div></section>';
        if (order.method_type === 'qris') drawQr(order);
        updateCountdown();
    }

    function renderPaid() {
        var order = state.order;
        root.innerHTML = '<section class="section reveal"><div class="tool-panel pm-panel pm-done">' +
            '<span class="pm-status-icon on large"><i class="fa-solid fa-circle-check"></i></span>' +
            '<h3 class="pm-heading">Pembayaran diterima</h3>' +
            '<p class="pm-note">' + escapeHtml(planName(order.plan_code)) + ' sebesar ' + escapeHtml(rupiah(order.amount_idr)) + ' sudah aktif.</p>' +
            '<button type="button" class="pm-btn primary" data-action="done">Lihat paket saya</button>' +
            '</div></section>';
    }

    function renderExpired() {
        root.innerHTML = '<section class="section reveal"><div class="tool-panel pm-panel pm-done">' +
            '<span class="pm-status-icon off large"><i class="fa-solid fa-clock"></i></span>' +
            '<h3 class="pm-heading">Pembayaran kedaluwarsa</h3>' +
            '<p class="pm-note">Batas waktu pembayaran sudah lewat. Jika Anda sudah membayar, paket akan aktif otomatis setelah pembayaran terkonfirmasi. Jika belum, buat pembayaran baru.</p>' +
            '<button type="button" class="pm-btn primary" data-action="done">Buat pembayaran baru</button>' +
            '</div></section>';
    }

    function renderDemo() {
        root.innerHTML = renderMessage('Mode dummy', 'Pembayaran tidak tersedia pada mode dummy.');
        if (heroStatus) heroStatus.textContent = 'Mode dummy';
    }

    function renderLoadError() {
        root.innerHTML = renderMessage('Paket belum dapat dimuat', 'Periksa koneksi Anda, lalu coba lagi.',
            '<button type="button" class="pm-btn secondary" data-action="reload">Coba lagi</button>');
        if (heroStatus) heroStatus.textContent = 'Tidak tersedia';
    }

    // ---------------------------------------------------------------- Timers

    function formatCountdown(ms) {
        var total = Math.max(0, Math.floor(ms / 1000));
        var hours = Math.floor(total / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        var seconds = total % 60;
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : pad(minutes) + ':' + pad(seconds);
    }

    function updateCountdown() {
        var node = document.getElementById('pm-countdown');
        if (!node || !state.order) return;
        var left = new Date(state.order.expires_at).getTime() - Date.now();
        node.textContent = formatCountdown(left);
        if (left <= 0) handleLocalExpiry();
    }

    function stopTimers() {
        if (state.pollTimer) window.clearTimeout(state.pollTimer);
        if (state.countdownTimer) window.clearInterval(state.countdownTimer);
        state.pollTimer = null;
        state.countdownTimer = null;
    }

    function nextPollDelay() {
        var elapsed = Date.now() - state.pollStartedAt;
        if (elapsed < POLL_FAST_WINDOW_MS) return POLL_FAST_MS;
        if (elapsed < POLL_MEDIUM_WINDOW_MS) return POLL_MEDIUM_MS;
        return POLL_SLOW_MS;
    }

    function schedulePoll() {
        if (state.pollTimer) window.clearTimeout(state.pollTimer);
        state.pollTimer = window.setTimeout(pollOrder, nextPollDelay());
    }

    async function pollOrder() {
        state.pollTimer = null;
        if (state.view !== 'payment' || !state.order) return;
        if (document.hidden) return; // resumes from visibilitychange
        if (state.checking) return schedulePoll();
        state.checking = true;
        var ref = state.order.order_ref;
        try {
            var data = await api('/orders/' + encodeURIComponent(ref));
            if (state.view === 'payment' && state.order && state.order.order_ref === ref) applyOrderUpdate(data.order);
        } catch (error) {
            // Network blips are normal on mobile; keep polling.
        } finally {
            state.checking = false;
        }
        if (state.view === 'payment') schedulePoll();
    }

    function startWatching() {
        stopTimers();
        state.pollStartedAt = Date.now();
        state.countdownTimer = window.setInterval(updateCountdown, 1000);
        schedulePoll();
    }

    function applyOrderUpdate(order) {
        if (!order) return;
        state.order = order;
        if (order.status === 'paid') {
            stopTimers();
            state.view = 'paid';
            renderPaid();
            toast('Pembayaran diterima');
            refreshStatus();
        } else if (order.status === 'expired' || order.status === 'failed') {
            stopTimers();
            state.view = 'expired';
            renderExpired();
        }
    }

    async function handleLocalExpiry() {
        if (state.view !== 'payment' || !state.order || state.checking) return;
        state.checking = true;
        stopTimers();
        var ref = state.order.order_ref;
        try {
            var data = await api('/orders/' + encodeURIComponent(ref));
            if (data.order && data.order.status === 'paid') {
                applyOrderUpdate(data.order);
                return;
            }
        } catch (error) { /* fall through to the expired view */ } finally {
            state.checking = false;
        }
        if (state.view === 'payment') {
            state.view = 'expired';
            renderExpired();
            refreshStatus();
        }
    }

    // ---------------------------------------------------------------- Data

    async function refreshStatus() {
        try {
            var data = await api('/status');
            state.pkg = data.package;
            state.orders = data.orders || [];
            setHeroStatus();
        } catch (error) { /* status refreshes again on the next visit */ }
    }

    async function load() {
        stopTimers();
        state.view = 'overview';
        root.innerHTML = renderMessage('Memuat paket...', 'Sebentar.');
        try {
            var results = await Promise.all([api('/plans'), api('/status')]);
            state.plans = results[0].plans || [];
            state.methods = results[0].payment_methods || [];
            state.pkg = results[1].package;
            state.orders = results[1].orders || [];
            if (!state.plans.some(function (plan) { return plan.code === state.selectedPlan; })) {
                state.selectedPlan = state.plans.length ? state.plans[0].code : '';
            }
            if (!state.methods.some(function (method) { return method.key === state.selectedMethod; })) {
                state.selectedMethod = state.methods.length ? state.methods[0].key : '';
            }
            setHeroStatus();
            renderOverview();
        } catch (error) {
            renderLoadError();
        }
    }

    function showPayment(order) {
        state.order = order;
        if (order.status === 'paid') {
            state.view = 'paid';
            renderPaid();
            return;
        }
        if (order.status !== 'pending') {
            state.view = 'expired';
            renderExpired();
            return;
        }
        state.view = 'payment';
        renderPayment();
        startWatching();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function checkout() {
        if (state.busy || !state.selectedPlan || !state.selectedMethod) return;
        state.busy = true;
        state.error = '';
        renderOverview();
        try {
            var data = await api('/checkout', { method: 'POST', body: { plan_code: state.selectedPlan, payment_method: state.selectedMethod } });
            state.busy = false;
            showPayment(data.order);
        } catch (error) {
            state.busy = false;
            state.error = error.message || 'Gagal membuat pembayaran. Silakan coba lagi.';
            renderOverview();
        }
    }

    function copyVaNumber() {
        var number = state.order && state.order.va_number;
        if (!number) return;
        var done = function () { toast('Nomor virtual account disalin'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(number).then(done, function () { toast('Salin manual nomor di layar'); });
        } else {
            toast('Salin manual nomor di layar');
        }
    }

    // ---------------------------------------------------------------- Events

    root.addEventListener('click', function (event) {
        var target = event.target.closest('[data-action]');
        if (!target) return;
        var action = target.getAttribute('data-action');
        if (action === 'plan') {
            state.selectedPlan = target.getAttribute('data-code');
            state.error = '';
            renderOverview();
        } else if (action === 'method') {
            state.selectedMethod = target.getAttribute('data-key');
            state.error = '';
            renderOverview();
        } else if (action === 'checkout') {
            checkout();
        } else if (action === 'resume') {
            var ref = target.getAttribute('data-ref');
            var order = state.orders.find(function (item) { return item.order_ref === ref; });
            if (order) showPayment(order);
        } else if (action === 'copy') {
            copyVaNumber();
        } else if (action === 'back') {
            stopTimers();
            state.view = 'overview';
            state.order = null;
            refreshStatus().then(renderOverview);
        } else if (action === 'done') {
            load();
        } else if (action === 'reload') {
            load();
        }
    });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden || state.view !== 'payment') return;
        // Back from the banking app: check right away instead of waiting for the next tick.
        if (state.pollTimer) window.clearTimeout(state.pollTimer);
        state.pollTimer = null;
        pollOrder();
    });

    window.addEventListener('pagehide', stopTimers);

    if (session.isDemoMode && session.isDemoMode()) {
        renderDemo();
    } else {
        load();
    }
})();
