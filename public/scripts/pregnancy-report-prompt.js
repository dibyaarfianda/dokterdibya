/* Asks a patient whose pregnancy is past its HPL how it ended.
   GET  /api/patient/pregnancy-report/status -> { ask, hpht }
   POST /api/patient/pregnancy-report        -> closes (or snoozes) the pregnancy; the server is authoritative.
   All text goes through textContent; sizes are fixed px (no vh, WebView-safe). */
(function (global) {
    'use strict';

    var STATUS_URL = '/api/patient/pregnancy-report/status';
    var SUBMIT_URL = '/api/patient/pregnancy-report';
    var MAX_PLACE = 120;
    var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
        'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    var ANSWERS = {
        lahir_sehat: 'Lahir sehat',
        keguguran: 'Keguguran',
        ektopik: 'Hamil di luar kandungan'
    };
    var DELIVERY = { normal: 'Normal', sc: 'SC (Caesar)' };
    var CSS = [
        '.ppr-overlay{position:fixed;left:0;top:0;right:0;bottom:0;z-index:95;background:rgba(17,17,17,0.32);}',
        '.ppr-card{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:96;box-sizing:border-box;',
        'width:430px;max-width:calc(100% - 28px);max-height:600px;overflow:auto;background:#fff;color:#111;',
        'border:1px solid rgba(17,17,17,0.09);border-radius:24px;box-shadow:0 14px 38px rgba(17,17,17,0.12);',
        'padding:18px;font-family:inherit;}',
        '.ppr-title{margin:0 0 6px;font-size:20px;line-height:1.25;font-weight:900;letter-spacing:-0.02em;}',
        '.ppr-sub{margin:0 0 14px;font-size:13px;line-height:1.5;color:#3f3f3f;font-weight:600;}',
        '.ppr-stack{display:grid;gap:8px;}',
        '.ppr-answer{width:100%;min-height:52px;border-radius:15px;border:1px solid rgba(17,17,17,0.16);',
        'background:rgba(17,17,17,0.035);color:#111;font:inherit;font-size:15px;font-weight:800;padding:0 14px;text-align:left;cursor:pointer;}',
        '.ppr-quiet{width:100%;min-height:40px;margin-top:4px;border:0;background:transparent;color:#717171;',
        'font:inherit;font-size:13px;font-weight:700;cursor:pointer;}',
        '.ppr-field{display:grid;gap:6px;margin-bottom:12px;}',
        '.ppr-label{color:#717171;font-size:10px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;}',
        '.ppr-input{box-sizing:border-box;width:100%;min-height:42px;border-radius:13px;border:1px solid rgba(17,17,17,0.16);',
        'background:#fff;color:#111;padding:0 12px;font:inherit;font-size:14px;font-weight:700;}',
        '.ppr-toggle{display:flex;gap:8px;}',
        '.ppr-chip{flex:1;min-height:40px;border-radius:13px;border:1px solid rgba(17,17,17,0.16);background:#fff;',
        'color:#111;font:inherit;font-size:13px;font-weight:800;cursor:pointer;}',
        '.ppr-chip[aria-pressed="true"]{background:#111;color:#fff;border-color:#111;}',
        '.ppr-error{min-height:18px;margin:0 0 8px;color:#b3261e;font-size:12px;font-weight:700;}',
        '.ppr-actions{display:flex;gap:10px;margin-top:6px;}',
        '.ppr-btn{flex:1;min-height:44px;border-radius:14px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;',
        'border:1px solid rgba(17,17,17,0.16);background:#fff;color:#111;}',
        '.ppr-btn.ppr-primary{background:#111;border-color:#111;color:#fff;}',
        '.ppr-btn[disabled],.ppr-answer[disabled],.ppr-quiet[disabled]{opacity:0.55;cursor:default;}',
        '.ppr-summary{display:grid;gap:8px;margin:0 0 12px;padding:12px;border-radius:15px;background:rgba(17,17,17,0.035);}',
        '.ppr-row{display:flex;justify-content:space-between;gap:12px;font-size:13px;line-height:1.4;}',
        '.ppr-row span{color:#717171;font-weight:700;}',
        '.ppr-row strong{text-align:right;font-weight:800;word-break:break-word;}',
        '.ppr-done{margin:4px 0 14px;font-size:15px;line-height:1.55;font-weight:700;}'
    ].join('');

    var ui = null;
    var checking = false;

    function el(tag, className, text) {
        var node = global.document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function tagged(node, name) {
        node.setAttribute('data-ppr', name);
        return node;
    }

    function button(className, text, name, onClick) {
        var b = tagged(el('button', className, text), name);
        b.setAttribute('type', 'button');
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function todayString() {
        var d = new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function isDateString(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    }

    function formatDate(value) {
        if (!isDateString(value)) return '-';
        var parts = value.split('-');
        var month = MONTHS[Number(parts[1]) - 1];
        return month ? Number(parts[2]) + ' ' + month + ' ' + parts[0] : value;
    }

    function token() {
        var session = global.PatientSession;
        return session && typeof session.getToken === 'function' ? session.getToken() : null;
    }

    function headers(json) {
        var h = { 'Authorization': 'Bearer ' + token(), 'Cache-Control': 'no-cache' };
        if (json) h['Content-Type'] = 'application/json';
        return h;
    }

    function ensureStyle() {
        if (global.document.getElementById('ppr-style')) return;
        var style = el('style');
        style.setAttribute('id', 'ppr-style');
        style.textContent = CSS;
        (global.document.head || global.document.body).appendChild(style);
    }

    function close(reload) {
        if (ui) {
            if (ui.overlay.parentNode) ui.overlay.parentNode.removeChild(ui.overlay);
            if (ui.card.parentNode) ui.card.parentNode.removeChild(ui.card);
            if (global.document.body && global.document.body.style) global.document.body.style.overflow = ui.prevOverflow || '';
        }
        ui = null;
        if (reload && global.location && typeof global.location.reload === 'function') global.location.reload();
    }

    function setBusy(busy) {
        if (!ui) return;
        ui.busy = busy;
        ui.buttons.forEach(function (b) { b.disabled = busy; });
    }

    function render(nodes) {
        ui.card.textContent = '';
        ui.buttons = [];
        nodes.forEach(function (n) {
            ui.card.appendChild(n);
            collectButtons(n);
        });
    }

    function collectButtons(node) {
        if (node.tagName === 'BUTTON') ui.buttons.push(node);
        // Element.children is an HTMLCollection (no forEach in browsers).
        Array.prototype.forEach.call(node.children || [], collectButtons);
    }

    function field(label, input) {
        var wrap = el('div', 'ppr-field');
        wrap.appendChild(el('label', 'ppr-label', label));
        wrap.appendChild(input);
        return wrap;
    }

    function input(type, name, value) {
        var i = tagged(el('input', 'ppr-input'), name);
        i.setAttribute('type', type);
        i.type = type;
        i.value = value === undefined || value === null ? '' : String(value);
        return i;
    }

    // ---- Step 1: choose -------------------------------------------------------------------

    function showChoose() {
        var list = el('div', 'ppr-stack');
        Object.keys(ANSWERS).forEach(function (key) {
            list.appendChild(button('ppr-answer', ANSWERS[key], 'answer-' + key, function () {
                if (ui.busy) return;
                if (ui.form.answer !== key) ui.form = blankForm(key);
                showForm();
            }));
        });
        list.appendChild(button('ppr-quiet', 'Masih hamil', 'answer-masih_hamil', function () {
            if (ui.busy) return;
            submitStillPregnant();
        }));
        ui.chooseError = tagged(el('p', 'ppr-error'), 'error');
        render([
            el('h2', 'ppr-title', 'Bagaimana kabar kehamilan Ibu?'),
            el('p', 'ppr-sub', 'Perkiraan lahir (HPL) di catatan kami sudah lewat. Jawaban Ibu membantu dokter menjaga catatan Ibu tetap terbaru.'),
            ui.chooseError,
            list
        ]);
    }

    function blankForm(answer) {
        return { answer: answer, ended_on: '', place: '', delivery: '', count: 1, weights: [''] };
    }

    // ---- Step 2: form ---------------------------------------------------------------------

    function readForm() {
        var f = ui.form;
        if (!ui.inputs) return f;
        f.ended_on = String(ui.inputs.ended_on.value || '').trim();
        f.place = String(ui.inputs.place.value || '');
        if (ui.inputs.weights) {
            ui.inputs.weights.forEach(function (w, i) { f.weights[i] = String(w.value || '').trim(); });
        }
        return f;
    }

    function showForm(errorText) {
        var f = ui.form;
        var birth = f.answer === 'lahir_sehat';
        var nodes = [el('h2', 'ppr-title', ANSWERS[f.answer])];
        ui.inputs = {};

        var place = input('text', 'place', f.place);
        place.setAttribute('maxlength', String(MAX_PLACE));
        place.setAttribute('autocomplete', 'off');
        ui.inputs.place = place;
        var date = input('date', 'ended_on', f.ended_on);
        date.setAttribute('max', todayString());
        if (isDateString(ui.hpht)) date.setAttribute('min', ui.hpht);
        ui.inputs.ended_on = date;

        if (birth) {
            nodes.push(field('Tempat lahir', place));
            nodes.push(field('Tanggal lahir', date));

            var method = el('div', 'ppr-toggle');
            Object.keys(DELIVERY).forEach(function (key) {
                var chip = button('ppr-chip', key === 'sc' ? 'SC' : 'Normal', 'delivery-' + key, function () {
                    readForm();
                    f.delivery = key;
                    showForm();
                });
                chip.setAttribute('aria-pressed', f.delivery === key ? 'true' : 'false');
                method.appendChild(chip);
            });
            nodes.push(field('Cara lahir', method));

            var count = el('div', 'ppr-toggle');
            [1, 2, 3].forEach(function (n) {
                var chip = button('ppr-chip', String(n), 'count-' + n, function () {
                    readForm();
                    f.count = n;
                    while (f.weights.length < n) f.weights.push('');
                    f.weights = f.weights.slice(0, n);
                    showForm();
                });
                chip.setAttribute('aria-pressed', f.count === n ? 'true' : 'false');
                count.appendChild(chip);
            });
            nodes.push(field('Jumlah bayi', count));

            ui.inputs.weights = [];
            for (var i = 0; i < f.count; i += 1) {
                var w = input('number', 'weight-' + i, f.weights[i]);
                w.setAttribute('inputmode', 'numeric');
                w.setAttribute('min', '500');
                w.setAttribute('max', '6000');
                w.setAttribute('step', '1');
                ui.inputs.weights.push(w);
                nodes.push(field(f.count > 1 ? 'Berat bayi ' + (i + 1) + ' (gram)' : 'Berat bayi (gram)', w));
            }
        } else {
            nodes.push(field('Tanggal', date));
            nodes.push(field('Tempat (opsional)', place));
        }

        ui.formError = tagged(el('p', 'ppr-error', errorText || ''), 'error');
        nodes.push(ui.formError);
        var actions = el('div', 'ppr-actions');
        actions.appendChild(button('ppr-btn', 'Kembali', 'back', function () {
            readForm();
            ui.inputs = null;
            showChoose();
        }));
        actions.appendChild(button('ppr-btn ppr-primary', 'Lanjut', 'next', function () {
            readForm();
            var problem = validate(f);
            if (problem) {
                ui.formError.textContent = problem;
                return;
            }
            showSummary();
        }));
        nodes.push(actions);
        render(nodes);
    }

    function validate(f) {
        var birth = f.answer === 'lahir_sehat';
        var place = f.place.trim();
        if (birth && !place) return 'Tempat lahir wajib diisi.';
        if (place.length > MAX_PLACE) return 'Tempat maksimal 120 karakter.';
        if (!isDateString(f.ended_on)) return birth ? 'Tanggal lahir wajib diisi.' : 'Tanggal wajib diisi.';
        if (f.ended_on > todayString()) return 'Tanggal tidak boleh setelah hari ini.';
        if (isDateString(ui.hpht) && f.ended_on < ui.hpht) return 'Tanggal tidak boleh sebelum HPHT.';
        if (!birth) return null;
        if (!Object.prototype.hasOwnProperty.call(DELIVERY, f.delivery)) return 'Pilih cara lahir.';
        if (!(f.count >= 1 && f.count <= 3)) return 'Pilih jumlah bayi.';
        for (var i = 0; i < f.count; i += 1) {
            var raw = f.weights[i] || '';
            var n = Number(raw);
            if (!/^\d+$/.test(raw) || n < 500 || n > 6000) return 'Berat bayi ' + (i + 1) + ' harus 500–6000 gram.';
        }
        return null;
    }

    // ---- Step 3: summary ------------------------------------------------------------------

    function row(label, value) {
        var r = el('div', 'ppr-row');
        r.appendChild(el('span', '', label));
        r.appendChild(el('strong', '', value));
        return r;
    }

    function showSummary() {
        var f = ui.form;
        var birth = f.answer === 'lahir_sehat';
        var place = f.place.trim();
        var box = tagged(el('div', 'ppr-summary'), 'summary');
        box.appendChild(row('Jawaban', ANSWERS[f.answer]));
        box.appendChild(row(birth ? 'Tanggal lahir' : 'Tanggal', formatDate(f.ended_on)));
        box.appendChild(row(birth ? 'Tempat lahir' : 'Tempat', place || '-'));
        if (birth) {
            box.appendChild(row('Cara lahir', DELIVERY[f.delivery]));
            box.appendChild(row('Jumlah bayi', String(f.count)));
            for (var i = 0; i < f.count; i += 1) {
                box.appendChild(row(f.count > 1 ? 'Berat bayi ' + (i + 1) : 'Berat bayi', Number(f.weights[i]) + ' gram'));
            }
        }
        ui.inputs = null;
        ui.summaryError = tagged(el('p', 'ppr-error'), 'error');
        var actions = el('div', 'ppr-actions');
        actions.appendChild(button('ppr-btn', 'Ubah', 'edit', function () {
            if (ui.busy) return;
            showForm();
        }));
        actions.appendChild(button('ppr-btn ppr-primary', 'Ya, benar', 'confirm', function () {
            if (ui.busy) return;
            submitAnswer();
        }));
        render([
            el('h2', 'ppr-title', 'Apakah data ini sudah benar?'),
            box,
            ui.summaryError,
            actions
        ]);
    }

    // ---- Sending --------------------------------------------------------------------------

    function bodyFor(f) {
        var place = f.place.trim();
        var body = { answer: f.answer, ended_on: f.ended_on, place: place || null };
        if (f.answer === 'lahir_sehat') {
            body.delivery = f.delivery;
            body.babies = f.weights.slice(0, f.count).map(function (w) { return { weight_g: Number(w) }; });
        }
        return body;
    }

    function post(body) {
        return global.fetch(SUBMIT_URL + '?_t=' + Date.now(), {
            method: 'POST',
            headers: headers(true),
            cache: 'no-store',
            body: JSON.stringify(body)
        }).then(function (response) {
            return Promise.resolve(response.json ? response.json() : {}).catch(function () { return {}; })
                .then(function (data) { return { status: response.status, ok: response.ok, data: data || {} }; });
        });
    }

    function handleFailure(result, onMessage) {
        if (result && result.status === 409) {
            close(true);
            return;
        }
        var message = result && result.status === 400 && result.data && typeof result.data.message === 'string'
            ? result.data.message
            : 'Gagal menyimpan. Coba lagi.';
        onMessage(message);
    }

    function submitAnswer() {
        var f = ui.form;
        var current = ui;
        setBusy(true);
        post(bodyFor(f)).then(function (result) {
            if (ui !== current) return;
            setBusy(false);
            if (result.ok && result.data.success) {
                showDone(f.answer === 'lahir_sehat'
                    ? 'Terima kasih, Ibu. Semoga Ibu dan buah hati selalu sehat.'
                    : 'Terima kasih sudah memberi tahu kami. Semoga Ibu diberi kekuatan.', true);
                return;
            }
            handleFailure(result, function (message) {
                if (result.status === 400) {
                    showForm(message);
                } else {
                    ui.summaryError.textContent = message;
                }
            });
        }).catch(function () {
            if (ui !== current) return;
            setBusy(false);
            ui.summaryError.textContent = 'Gagal menyimpan. Coba lagi.';
        });
    }

    function submitStillPregnant() {
        var current = ui;
        setBusy(true);
        post({ answer: 'masih_hamil' }).then(function (result) {
            if (ui !== current) return;
            setBusy(false);
            if (result.ok && result.data.success) {
                showDone('Terima kasih, Ibu.', false);
                return;
            }
            handleFailure(result, function (message) { ui.chooseError.textContent = message; });
        }).catch(function () {
            if (ui !== current) return;
            setBusy(false);
            ui.chooseError.textContent = 'Gagal menyimpan. Coba lagi.';
        });
    }

    // ---- Step 4: done ---------------------------------------------------------------------

    function showDone(text, reloadOnClose) {
        ui.form = blankForm('');
        var actions = el('div', 'ppr-actions');
        actions.appendChild(button('ppr-btn ppr-primary', 'Tutup', 'close', function () { close(reloadOnClose); }));
        render([tagged(el('p', 'ppr-done', text), 'done'), actions]);
    }

    // ---- Entry ----------------------------------------------------------------------------

    function open(hpht) {
        ensureStyle();
        var body = global.document.body;
        var overlay = el('div', 'ppr-overlay');
        var card = tagged(el('div', 'ppr-card'), 'card');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        ui = {
            overlay: overlay,
            card: card,
            hpht: isDateString(hpht) ? hpht : null,
            form: blankForm(''),
            buttons: [],
            busy: false,
            prevOverflow: body.style ? body.style.overflow : ''
        };
        body.appendChild(overlay);
        body.appendChild(card);
        if (body.style) body.style.overflow = 'hidden';
        try {
            showChoose();
        } catch (error) {
            // Never leave a locked page behind an empty overlay.
            close(false);
            throw error;
        }
    }

    function check() {
        if (ui || checking) return Promise.resolve(false);
        var session = global.PatientSession;
        if (!token() || (session && typeof session.isDemoMode === 'function' && session.isDemoMode())) {
            return Promise.resolve(false);
        }
        checking = true;
        return global.fetch(STATUS_URL + '?_t=' + Date.now(), { headers: headers(false), cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) return null;
                return response.json();
            })
            .then(function (data) {
                checking = false;
                if (!data || !data.success || data.ask !== true || ui) return false;
                open(data.hpht);
                return true;
            })
            .catch(function () {
                checking = false;
                return false;
            });
    }

    global.PregnancyReportPrompt = { check: check };
})(typeof window !== 'undefined' ? window : this);
