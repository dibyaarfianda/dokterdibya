/**
 * support-chat.js — Patient Portal Support Chat Widget
 * Floating FAB button that opens a chat panel.
 * Bot answers FAQ first; if bot can't answer → escalates to staff via Socket.IO.
 *
 * Loaded on: patient-menu.html (and other patient portal pages)
 */
(function () {
    'use strict';

    if (window.__supportChatWidgetBooted) {
        return;
    }
    window.__supportChatWidgetBooted = true;

    // ==================== CONFIG ====================
    var API_BASE = '/api/support-chat';
    var SOCKET_RECONNECT_DELAY = 3000;

    // ==================== STATE ====================
    var state = {
        isOpen: false,
        session: null,     // { id, status, messages }
        token: null,
        patientName: '',
        socketRoom: null,  // joined room name
        initialized: false,
        socketConnectHandler: null,
        pollTimer: null,
        lastMessageId: 0,
        hasStaffReply: false,
        sendingMessage: false,
        submittingRating: false,
        archiveSessions: []
    };

    // ==================== DOM REFS ====================
    var fab, panel, messagesContainer, inputEl, sendBtn, statusBar, ratingArea, archiveList, archiveModal;

    // ==================== TOKEN ====================
    function getToken() {
        // Prefer global helper from patient-menu.html
        if (typeof window.getPatientToken === 'function') {
            return window.getPatientToken();
        }
        // Fallback: common patient token storage keys
        var keys = ['vps_auth_token', 'patient_token', 'patientToken', 'auth_token', 'token'];
        for (var i = 0; i < keys.length; i++) {
            var t = localStorage.getItem(keys[i]);
            if (t) return t;
        }
        return null;
    }

    function getPatientProfile() {
        try {
            var raw = localStorage.getItem('patient_user');
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            return null;
        }
    }

    function isSupportChatEnabledForCurrentPatient(profile) {
        var p = profile || getPatientProfile();
        if (!p) return false;

        var patientId = String(p.id || p.medicalRecordId || '').trim();
        var patientName = String(p.full_name || p.fullname || p.name || '').toLowerCase().replace(/\s+/g, ' ').trim();

        return patientId === 'P2025091' || patientName === 'nanda ananda';
    }

    // ==================== API HELPERS ====================
    async function apiFetch(path, options) {
        var token = getToken();
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        var resp = await fetch(API_BASE + path, Object.assign({ headers: headers }, options || {}));
        if (!resp.ok) {
            var err = await resp.json().catch(() => ({}));
            throw new Error(err.message || 'Request failed');
        }
        return resp.json();
    }

    // ==================== SOCKET ====================
    function getSocket() {
        // Reuse existing Socket.IO instance from realtime-sync or window
        if (window.__realtimeSyncState && window.__realtimeSyncState.socket) {
            return window.__realtimeSyncState.socket;
        }
        return window._supportChatSocket || null;
    }

    function sameSessionId(a, b) {
        return String(a || '') === String(b || '');
    }

    function updateLastMessageId(messages) {
        var maxId = state.lastMessageId || 0;
        (messages || []).forEach(function (m) {
            var idNum = Number(m && m.id ? m.id : 0);
            if (idNum > maxId) maxId = idNum;
            if (m && m.sender_type === 'staff') {
                state.hasStaffReply = true;
            }
        });
        state.lastMessageId = maxId;
    }

    function appendMissingMessages(messages) {
        var hasNew = false;
        (messages || []).forEach(function (msg) {
            var msgId = Number(msg && msg.id ? msg.id : 0);
            if (msgId <= state.lastMessageId) return;
            appendMessage(msg);
            if (msg && msg.sender_type === 'staff') {
                state.hasStaffReply = true;
            }
            if (msgId > state.lastMessageId) state.lastMessageId = msgId;
            hasNew = true;
        });
        return hasNew;
    }

    function startMessagePolling() {
        stopMessagePolling();
        state.pollTimer = setInterval(async function () {
            if (!state.session || !state.session.id) return;
            try {
                var data = await apiFetch('/sessions/current?include_recent_resolved=1');
                if (!data || !data.session) return;
                if (!sameSessionId(data.session.id, state.session.id)) return;
                appendMissingMessages(data.session.messages);
                if ((data.session.messages || []).some(function (m) {
                    return m && m.sender_type === 'staff';
                })) {
                    state.hasStaffReply = true;
                }
                state.session.status = data.session.status;
                state.session.rating_score = data.session.rating_score || null;
                state.session.rated_at = data.session.rated_at || null;
                updateStatusBar();
                if (state.session.status === 'resolved') {
                    stopMessagePolling();
                    loadArchiveSessions();
                }
            } catch (e) {
                // Silent fallback polling errors.
            }
        }, 3000);
    }

    function stopMessagePolling() {
        if (!state.pollTimer) return;
        clearInterval(state.pollTimer);
        state.pollTimer = null;
    }

    function joinSessionRoom(sessionId) {
        var socket = getSocket();
        if (!socket) return;
        var room = 'support:' + sessionId;
        if (state.socketRoom === room) return;
        state.socketRoom = room;
        socket.emit('support:join', { sessionId: sessionId });

        // Socket rooms are lost on reconnect; rejoin automatically.
        if (state.socketConnectHandler) {
            socket.off('connect', state.socketConnectHandler);
        }
        state.socketConnectHandler = function () {
            if (!state.session || !state.session.id) return;
            socket.emit('support:join', { sessionId: state.session.id });
        };
        socket.on('connect', state.socketConnectHandler);

        // Listen for real-time messages from staff
        socket.off('support:new_message');
        socket.on('support:new_message', function (msg) {
            // Only process if it's for this session and it's a staff message
            if (!state.session || !sameSessionId(msg.session_id, state.session.id)) return;
            if (msg.sender_type === 'patient') return; // We already show patient msgs immediately
            if (msg.sender_type === 'staff') {
                state.hasStaffReply = true;
                updateStatusBar();
            }
            appendMessage(msg);
            updateLastMessageId([msg]);
            // Auto-open if closed and message is from staff
            if (!state.isOpen && msg.sender_type === 'staff') {
                openPanel();
            }
        });

        socket.off('support:resolved');
        socket.on('support:resolved', function (data) {
            if (!state.session || !sameSessionId(data.sessionId, state.session.id)) return;
            state.session.status = 'resolved';
            state.session.rating_score = null;
            state.session.rated_at = null;
            updateStatusBar();
            stopMessagePolling();
            loadArchiveSessions();

            // Fallback: if the closing message event was missed, add it from resolved payload.
            var closingId = Number(data && data.closingMessageId ? data.closingMessageId : 0);
            var hasClosingMessage = false;
            if (closingId > 0 && messagesContainer) {
                hasClosingMessage = !!messagesContainer.querySelector('[data-msg-id="' + closingId + '"]');
            }

            if (!hasClosingMessage && data && data.closingMessage) {
                var fallbackMsg = {
                    id: closingId > 0 ? closingId : ('closing_' + Date.now()),
                    session_id: state.session.id,
                    sender_type: 'staff',
                    sender_name: data.closingSenderName || 'Staff',
                    content: String(data.closingMessage),
                    created_at: data.closingCreatedAt || new Date()
                };
                appendMessage(fallbackMsg);
                if (closingId > 0) {
                    updateLastMessageId([fallbackMsg]);
                }
            }
        });
    }

    // ==================== RENDER ====================
    function escapeHtml(text) {
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(text || ''));
        return d.innerHTML;
    }

    function formatContent(text) {
        // Convert **bold** and *italic* markdown-lite, newlines to <br>
        return escapeHtml(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    function formatTime(dateVal) {
        var d = new Date(dateVal);
        return d.getHours().toString().padStart(2, '0') + ':' +
            d.getMinutes().toString().padStart(2, '0');
    }

    function formatDateTime(dateVal) {
        var d = new Date(dateVal);
        return d.toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function isSessionRated() {
        if (!state.session) return false;
        return !!(state.session.rated_at || state.session.rating_score || state.session.rating);
    }

    function isSessionResolvedAndUnrated() {
        if (!state.session) return false;
        return state.session.status === 'resolved' && !isSessionRated();
    }

    function applyComposerState() {
        if (!inputEl || !sendBtn) return;

        var canSend = !!state.session && state.session.status !== 'resolved' && !state.sendingMessage;
        inputEl.disabled = !canSend;
        sendBtn.disabled = !canSend;

        if (!state.session) {
            inputEl.placeholder = 'Memuat sesi bantuan...';
            return;
        }

        if (state.session.status === 'resolved') {
            inputEl.placeholder = 'Sesi selesai. Silakan beri rating atau mulai sesi baru.';
            return;
        }

        inputEl.placeholder = 'Ketik pertanyaan...';
    }

    function renderRatingArea() {
        if (!ratingArea) return;

        if (!state.session || state.session.status !== 'resolved') {
            ratingArea.style.display = 'none';
            ratingArea.innerHTML = '';
            return;
        }

        if (isSessionRated()) {
            ratingArea.style.display = 'block';
            ratingArea.innerHTML = '<div class="sc-rating-done">Terima kasih, rating Anda sudah tersimpan.</div>';
            return;
        }

        ratingArea.style.display = 'block';
        ratingArea.innerHTML = [
            '<div class="sc-rating-title">Bagaimana bantuan staff kami?</div>',
            '<div class="sc-rating-stars">',
            '  <button class="sc-rating-star" data-score="1" aria-label="Rating 1">1</button>',
            '  <button class="sc-rating-star" data-score="2" aria-label="Rating 2">2</button>',
            '  <button class="sc-rating-star" data-score="3" aria-label="Rating 3">3</button>',
            '  <button class="sc-rating-star" data-score="4" aria-label="Rating 4">4</button>',
            '  <button class="sc-rating-star" data-score="5" aria-label="Rating 5">5</button>',
            '</div>',
            '<div class="sc-rating-hint">Pilih nilai 1-5 untuk menutup sesi bantuan.</div>'
        ].join('');

        Array.prototype.forEach.call(ratingArea.querySelectorAll('.sc-rating-star'), function (btn) {
            btn.addEventListener('click', function () {
                if (state.submittingRating) return;
                var score = parseInt(String(btn.getAttribute('data-score') || ''), 10);
                if (!Number.isFinite(score)) return;
                submitRating(score);
            });
        });
    }

    async function submitRating(score) {
        if (!state.session || state.session.status !== 'resolved') return;
        if (state.submittingRating) return;

        state.submittingRating = true;
        if (ratingArea) {
            ratingArea.classList.add('sc-rating-loading');
        }

        try {
            var data = await apiFetch('/sessions/' + state.session.id + '/rating', {
                method: 'POST',
                body: JSON.stringify({ rating: score })
            });

            if (!state.session) return;
            var ratingData = data && data.rating ? data.rating : {};
            state.session.rating_score = Number(ratingData.rating || score);
            state.session.rated_at = ratingData.rated_at || new Date();

            renderRatingArea();
            await loadArchiveSessions();
            appendSystemMessage('Terima kasih atas rating Anda. Sesi bantuan telah diarsipkan.');
            applyComposerState();

            setTimeout(function () {
                closePanel();
            }, 600);
        } catch (err) {
            console.error('[support-chat] submit rating error:', err);
            appendSystemMessage('Gagal menyimpan rating. Coba lagi.');
        } finally {
            state.submittingRating = false;
            if (ratingArea) {
                ratingArea.classList.remove('sc-rating-loading');
            }
        }
    }

    async function loadArchiveSessions() {
        if (!archiveList) return;
        try {
            var data = await apiFetch('/sessions/archive?limit=20');
            state.archiveSessions = data && data.sessions ? data.sessions : [];
            renderArchiveSessions();
        } catch (err) {
            state.archiveSessions = [];
            renderArchiveSessions();
        }
    }

    function renderArchiveSessions() {
        if (!archiveList) return;

        if (!state.archiveSessions || state.archiveSessions.length === 0) {
            archiveList.innerHTML = '<div class="sc-archive-empty">Belum ada riwayat bantuan.</div>';
            return;
        }

        archiveList.innerHTML = state.archiveSessions.map(function (session) {
            var ratedAt = session.rated_at || session.resolved_at || session.updated_at || session.created_at;
            var rating = Number(session.rating || 0);
            var preview = String(session.last_message || '').trim();
            return [
                '<button type="button" class="sc-archive-item" data-session-id="' + escapeHtml(String(session.id)) + '">',
                '  <div class="sc-archive-item-top">',
                '    <span class="sc-archive-item-date">' + escapeHtml(formatDateTime(ratedAt)) + '</span>',
                '    <span class="sc-archive-item-rating">⭐ ' + escapeHtml(String(rating)) + '/5</span>',
                '  </div>',
                '  <div class="sc-archive-item-preview">' + escapeHtml(preview || 'Lihat transcript percakapan') + '</div>',
                '</button>'
            ].join('');
        }).join('');
    }

    async function openArchiveTranscript(sessionId) {
        if (!archiveModal) return;
        var numericId = parseInt(String(sessionId || ''), 10);
        if (!Number.isFinite(numericId)) return;

        var titleEl = archiveModal.querySelector('#sc-archive-modal-title');
        var metaEl = archiveModal.querySelector('#sc-archive-modal-meta');
        var bodyEl = archiveModal.querySelector('#sc-archive-modal-body');
        if (!titleEl || !metaEl || !bodyEl) return;

        titleEl.textContent = 'Memuat transcript...';
        metaEl.textContent = '';
        bodyEl.innerHTML = '<div class="sc-archive-modal-loading">Memuat...</div>';
        archiveModal.style.display = 'flex';

        try {
            var data = await apiFetch('/sessions/archive/' + numericId);
            if (!data || !data.session) {
                throw new Error('Arsip tidak tersedia');
            }

            var session = data.session;
            var ratedAt = session.rated_at || session.resolved_at || session.updated_at || session.created_at;
            titleEl.textContent = 'Transcript Bantuan';
            metaEl.textContent = formatDateTime(ratedAt) + ' • Rating ' + String(session.rating || '-');

            var messageHtml = (session.messages || []).map(function (msg) {
                var labelMap = { bot: '🤖 Asisten', staff: '👤 staff', patient: 'Anda' };
                var label = labelMap[msg.sender_type] || msg.sender_name || '-';
                return [
                    '<div class="sc-archive-msg sc-archive-msg--' + escapeHtml(String(msg.sender_type || 'bot')) + '">',
                    '  <div class="sc-archive-msg-content">' + formatContent(msg.content || '') + '</div>',
                    '  <div class="sc-archive-msg-meta">' + escapeHtml(label) + ' • ' + escapeHtml(formatTime(msg.created_at)) + '</div>',
                    '</div>'
                ].join('');
            }).join('');

            bodyEl.innerHTML = messageHtml || '<div class="sc-archive-modal-loading">Transcript kosong.</div>';
        } catch (err) {
            bodyEl.innerHTML = '<div class="sc-archive-modal-loading">Gagal memuat transcript.</div>';
        }
    }

    function closeArchiveTranscript() {
        if (!archiveModal) return;
        archiveModal.style.display = 'none';
    }

    function appendMessage(msg) {
        if (!messagesContainer) return;

        var div = document.createElement('div');
        div.className = 'sc-msg sc-msg--' + msg.sender_type;
        div.dataset.msgId = msg.id;

        var labelMap = { bot: '🤖 Asisten', staff: '👤 staff', patient: 'Anda' };
        var label = labelMap[msg.sender_type] || msg.sender_name;
        var timeStr = formatTime(msg.created_at);

        div.innerHTML =
            '<div class="sc-msg__bubble">' +
            '<div class="sc-msg__content">' + formatContent(msg.content) + '</div>' +
            '<div class="sc-msg__meta"><span class="sc-msg__name">' + escapeHtml(label) + '</span><span class="sc-msg__time">' + timeStr + '</span></div>' +
            '</div>';

        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function appendSystemMessage(text) {
        if (!messagesContainer) return;
        var div = document.createElement('div');
        div.className = 'sc-msg sc-msg--system';
        div.innerHTML = '<div class="sc-msg__system-text">' + escapeHtml(text) + '</div>';
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function renderMessages(messages) {
        if (!messagesContainer) return;
        messagesContainer.innerHTML = '';
        (messages || []).forEach(function (msg) {
            appendMessage(msg);
        });
    }

    function updateStatusBar() {
        if (!statusBar || !state.session) return;
        var status = state.session.status;
        if (status === 'bot') {
            statusBar.textContent = '🤖 Asisten Virtual';
            statusBar.className = 'sc-status sc-status--bot';
        } else if (status === 'escalated') {
            if (state.hasStaffReply) {
                statusBar.textContent = '👤 Terhubung dengan staff';
                statusBar.className = 'sc-status sc-status--resolved';
            } else {
                statusBar.textContent = '⏳ Menunggu staff...';
                statusBar.className = 'sc-status sc-status--escalated';
            }
        } else if (status === 'resolved') {
            if (isSessionRated()) {
                statusBar.textContent = '✅ Selesai • Rated';
            } else {
                statusBar.textContent = '✅ Selesai • Menunggu Rating';
            }
            statusBar.className = 'sc-status sc-status--resolved';
        }

        renderRatingArea();
        applyComposerState();
    }

    // ==================== PANEL OPEN / CLOSE ====================
    function openPanel() {
        state.isOpen = true;
        if (panel) {
            panel.style.display = 'flex';
            // Slight delay for CSS transition
            requestAnimationFrame(function () {
                panel.classList.add('sc-panel--open');
            });
        }
        if (fab) fab.classList.add('sc-fab--open');
        loadArchiveSessions();
        if (!state.initialized || !state.session) {
            initChat();
        }
    }

    function closePanel() {
        state.isOpen = false;
        closeArchiveTranscript();
        if (panel) {
            panel.classList.remove('sc-panel--open');
            setTimeout(function () {
                if (!state.isOpen) panel.style.display = 'none';
            }, 280);
        }
        if (fab) fab.classList.remove('sc-fab--open');
    }

    // ==================== INIT CHAT (load or create session) ====================
    async function initChat() {
        state.initialized = true;
        state.hasStaffReply = false;
        state.lastMessageId = 0;
        renderMessages([]);
        appendSystemMessage('Memuat percakapan...');
        applyComposerState();

        try {
            // Try to load existing session first
            var data = await apiFetch('/sessions/current');
            if (data.session) {
                state.session = data.session;
            } else {
                // Create new session
                data = await apiFetch('/sessions', { method: 'POST' });
                state.session = data.session;
            }

            renderMessages(state.session.messages);
            updateLastMessageId(state.session.messages);
            updateStatusBar();
            joinSessionRoom(state.session.id);
            startMessagePolling();
            loadArchiveSessions();

        } catch (err) {
            console.error('[support-chat] init error:', err);
            state.session = null;
            state.initialized = false;
            if (!getToken()) {
                appendSystemMessage('Silakan login terlebih dahulu untuk menggunakan fitur chat bantuan.');
            } else {
                appendSystemMessage('Gagal memuat chat. Coba muat ulang halaman.');
            }
            applyComposerState();
        }
    }

    // ==================== SEND MESSAGE ====================
    async function sendMessage() {
        if (!inputEl) return;
        if (state.sendingMessage) return;

        var content = inputEl.value.trim();
        if (!content) return;
        if (!state.session) return;
        if (state.session.status === 'resolved') {
            appendSystemMessage('Sesi sudah selesai. Beri rating terlebih dahulu atau buka sesi baru.');
            return;
        }

        var targetSessionId = state.session.id;
        state.sendingMessage = true;
        applyComposerState();

        try {
            var data = await apiFetch('/sessions/' + targetSessionId + '/message', {
                method: 'POST',
                body: JSON.stringify({ content: content })
            });

            if (data.message && sameSessionId(state.session.id, targetSessionId)) {
                var existingPatient = messagesContainer && messagesContainer.querySelector('[data-msg-id="' + data.message.id + '"]');
                if (!existingPatient) {
                    appendMessage(data.message);
                    updateLastMessageId([data.message]);
                }
            }

            inputEl.value = '';

            // Update session status if escalated
            if (data.escalated) {
                state.session.status = 'escalated';
                updateStatusBar();
                startMessagePolling();
            }

            // Bot reply was already emitted via socket, but also handle via REST response
            if (data.botReply) {
                // Avoid duplicate if socket already delivered it
                var existing = messagesContainer && messagesContainer.querySelector('[data-msg-id="' + data.botReply.id + '"]');
                if (!existing) {
                    appendMessage(data.botReply);
                    updateLastMessageId([data.botReply]);
                }
            }

        } catch (err) {
            console.error('[support-chat] send error:', err);
            appendSystemMessage('Gagal mengirim pesan. Coba lagi.');
        } finally {
            state.sendingMessage = false;
            applyComposerState();
            if (!inputEl.disabled) {
                inputEl.focus();
            }
        }
    }

    // ==================== BUILD DOM ====================
    function buildWidget() {
        // Inject styles
        var style = document.createElement('style');
        style.textContent = [
            /* FAB Button */
            '.sc-fab{position:fixed;bottom:calc(80px + env(safe-area-inset-bottom,0px));right:20px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;cursor:pointer;z-index:8000;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 20px rgba(99,102,241,.5);transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent;}',
            '.sc-fab:hover,.sc-fab:active{transform:scale(1.1);box-shadow:0 6px 24px rgba(99,102,241,.7);}',
            '.sc-fab--open{background:linear-gradient(135deg,#374151,#1f2937);opacity:0;pointer-events:none;}',
            '.sc-fab-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:50%;width:18px;height:18px;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700;line-height:1;}',
            /* Panel */
            '.sc-panel{position:fixed;bottom:calc(80px + env(safe-area-inset-bottom,0px));right:20px;width:340px;max-width:calc(100vw - 40px);height:500px;max-height:calc(100vh - 160px);background:#1e1e2e;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.6);z-index:7999;display:none;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.08);transform:translateY(20px) scale(.97);opacity:0;transition:transform .28s cubic-bezier(.22,1,.36,1),opacity .28s ease;}',
            '.sc-panel--open{transform:translateY(0) scale(1);opacity:1;}',
            /* Panel header */
            '.sc-panel-header{background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
            '.sc-panel-title{color:#fff;font-weight:700;font-size:15px;font-family:Poppins,sans-serif;}',
            '.sc-panel-close{background:none;border:none;color:rgba(255,255,255,.8);font-size:20px;cursor:pointer;padding:0 4px;line-height:1;}',
            /* Status bar */
            '.sc-status{padding:6px 14px;font-size:12px;font-family:Poppins,sans-serif;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;}',
            '.sc-status--bot{background:#1a1a2e;color:#a5b4fc;}',
            '.sc-status--escalated{background:#1a1a2e;color:#fbbf24;}',
            '.sc-status--resolved{background:#1a1a2e;color:#34d399;}',
            /* Rating area */
            '.sc-rating-area{display:none;padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.08);background:#16162a;flex-shrink:0;}',
            '.sc-rating-loading{opacity:.7;pointer-events:none;}',
            '.sc-rating-title{font-size:12px;color:#e2e8f0;font-family:Poppins,sans-serif;font-weight:600;margin-bottom:7px;}',
            '.sc-rating-stars{display:flex;gap:6px;margin-bottom:6px;}',
            '.sc-rating-star{border:1px solid rgba(255,255,255,.2);background:#23233a;color:#fff;border-radius:8px;min-width:34px;height:34px;font-size:12px;font-weight:700;cursor:pointer;}',
            '.sc-rating-star:hover,.sc-rating-star:active{background:#2f2f4d;}',
            '.sc-rating-hint{font-size:11px;color:rgba(255,255,255,.55);font-family:Poppins,sans-serif;}',
            '.sc-rating-done{font-size:12px;color:#34d399;font-family:Poppins,sans-serif;font-weight:600;}',
            /* Messages */
            '.sc-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;}',
            '.sc-messages::-webkit-scrollbar{width:4px;}',
            '.sc-messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:4px;}',
            /* Message bubbles */
            '.sc-msg{display:flex;}',
            '.sc-msg--patient{justify-content:flex-end;}',
            '.sc-msg--bot,.sc-msg--staff{justify-content:flex-start;}',
            '.sc-msg--system{justify-content:center;}',
            '.sc-msg__system-text{background:rgba(255,255,255,.06);color:rgba(255,255,255,.5);border-radius:8px;padding:6px 12px;font-size:11px;font-family:Poppins,sans-serif;text-align:center;}',
            '.sc-msg__bubble{max-width:80%;}',
            '.sc-msg--patient .sc-msg__bubble .sc-msg__content{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:14px 14px 4px 14px;}',
            '.sc-msg--bot .sc-msg__bubble .sc-msg__content{background:#2d2d3e;color:#e2e8f0;border-radius:14px 14px 14px 4px;}',
            '.sc-msg--staff .sc-msg__bubble .sc-msg__content{background:#1e3a2f;color:#a7f3d0;border:1px solid rgba(52,211,153,.2);border-radius:14px 14px 14px 4px;}',
            '.sc-msg__content{padding:9px 13px;font-size:13px;line-height:1.55;font-family:Poppins,sans-serif;word-break:break-word;}',
            '.sc-msg__meta{display:flex;align-items:center;gap:6px;padding:3px 4px 0;justify-content:flex-end;}',
            '.sc-msg--patient .sc-msg__meta{justify-content:flex-end;}',
            '.sc-msg--bot .sc-msg__meta,.sc-msg--staff .sc-msg__meta{justify-content:flex-start;}',
            '.sc-msg__name{font-size:10px;color:rgba(255,255,255,.4);font-family:Poppins,sans-serif;}',
            '.sc-msg__time{font-size:10px;color:rgba(255,255,255,.3);font-family:Poppins,sans-serif;}',
            /* Input area */
            '.sc-input-area{padding:10px 12px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:8px;align-items:flex-end;flex-shrink:0;background:#1a1a2e;}',
            '.sc-input{flex:1;background:#2d2d3e;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:9px 14px;color:#e2e8f0;font-size:13px;font-family:Poppins,sans-serif;resize:none;outline:none;max-height:80px;overflow-y:auto;line-height:1.4;}',
            '.sc-input:focus{border-color:#6366f1;}',
            '.sc-input::placeholder{color:rgba(255,255,255,.3);}',
            '.sc-send-btn{background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;flex-shrink:0;transition:opacity .15s;}',
            '.sc-send-btn:disabled{opacity:.4;cursor:not-allowed;}',
            '.sc-send-btn svg{width:16px;height:16px;fill:currentColor;}',
            /* Archive list */
            '.sc-archive{padding:8px 10px;border-top:1px solid rgba(255,255,255,.08);background:#151528;flex-shrink:0;}',
            '.sc-archive-title{font-size:11px;color:rgba(255,255,255,.65);font-family:Poppins,sans-serif;font-weight:600;margin:0 0 6px 2px;letter-spacing:.02em;text-transform:uppercase;}',
            '.sc-archive-list{display:flex;flex-direction:column;gap:6px;max-height:120px;overflow-y:auto;}',
            '.sc-archive-empty{font-size:12px;color:rgba(255,255,255,.5);font-family:Poppins,sans-serif;padding:6px 4px;}',
            '.sc-archive-item{width:100%;display:block;text-align:left;background:#23233a;border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#e2e8f0;padding:8px 10px;min-height:44px;cursor:pointer;}',
            '.sc-archive-item:hover,.sc-archive-item:active{background:#2b2b47;}',
            '.sc-archive-item-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
            '.sc-archive-item-date{font-size:11px;color:#c7d2fe;font-family:Poppins,sans-serif;}',
            '.sc-archive-item-rating{font-size:11px;color:#fcd34d;font-family:Poppins,sans-serif;font-weight:600;}',
            '.sc-archive-item-preview{margin-top:3px;font-size:11px;color:rgba(255,255,255,.68);font-family:Poppins,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            /* Archive transcript modal */
            '.sc-archive-modal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:none;align-items:center;justify-content:center;padding:16px;z-index:8100;}',
            '.sc-archive-modal-card{width:100%;max-width:460px;max-height:80vh;background:#1f1f33;border:1px solid rgba(255,255,255,.12);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;}',
            '.sc-archive-modal-header{padding:12px 14px;background:#252541;display:flex;align-items:center;justify-content:space-between;gap:12px;}',
            '.sc-archive-modal-title{font-size:14px;color:#fff;font-family:Poppins,sans-serif;font-weight:700;}',
            '.sc-archive-modal-close{background:none;border:none;color:rgba(255,255,255,.8);font-size:18px;cursor:pointer;min-height:36px;min-width:36px;border-radius:8px;}',
            '.sc-archive-modal-close:hover,.sc-archive-modal-close:active{background:rgba(255,255,255,.08);}',
            '.sc-archive-modal-meta{padding:8px 14px;font-size:12px;color:#a5b4fc;font-family:Poppins,sans-serif;border-bottom:1px solid rgba(255,255,255,.08);}',
            '.sc-archive-modal-body{padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;min-height:120px;}',
            '.sc-archive-modal-footer{padding:10px 14px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:flex-end;}',
            '.sc-archive-modal-btn{border:1px solid rgba(255,255,255,.16);background:#2e2e4b;color:#fff;border-radius:9px;min-height:40px;padding:0 14px;font-size:12px;font-family:Poppins,sans-serif;cursor:pointer;}',
            '.sc-archive-modal-btn:hover,.sc-archive-modal-btn:active{background:#3a3a62;}',
            '.sc-archive-modal-loading{font-size:12px;color:rgba(255,255,255,.62);font-family:Poppins,sans-serif;text-align:center;padding:24px 0;}',
            '.sc-archive-msg{padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#25253d;}',
            '.sc-archive-msg--patient{background:#2d3a6b;}',
            '.sc-archive-msg--staff{background:#1f4a3b;}',
            '.sc-archive-msg--bot{background:#3d3a22;}',
            '.sc-archive-msg-content{font-size:12px;line-height:1.45;color:#e2e8f0;font-family:Poppins,sans-serif;}',
            '.sc-archive-msg-meta{margin-top:4px;font-size:10px;color:rgba(255,255,255,.5);font-family:Poppins,sans-serif;}',
        ].join('');
        document.head.appendChild(style);

        // FAB Button
        fab = document.createElement('button');
        fab.className = 'sc-fab';
        fab.id = 'support-chat-fab';
        fab.setAttribute('aria-label', 'Chat Bantuan');
        fab.innerHTML = '<span class="sc-fab-icon">💬</span>';
        fab.addEventListener('click', function () {
            if (state.isOpen) closePanel(); else openPanel();
        });
        document.body.appendChild(fab);

        // Panel
        panel = document.createElement('div');
        panel.className = 'sc-panel';
        panel.id = 'support-chat-panel';
        panel.innerHTML = [
            '<div class="sc-panel-header">',
            '  <span class="sc-panel-title">💬 Chat Bantuan</span>',
            '  <button class="sc-panel-close" aria-label="Tutup" id="sc-close-btn">✕</button>',
            '</div>',
            '<div class="sc-status sc-status--bot" id="sc-status-bar">🤖 Asisten Virtual</div>',
            '<div class="sc-rating-area" id="sc-rating-area"></div>',
            '<div class="sc-messages" id="sc-messages"></div>',
            '<div class="sc-input-area">',
            '  <textarea class="sc-input" id="sc-input" placeholder="Ketik pertanyaan..." rows="1"></textarea>',
            '  <button class="sc-send-btn" id="sc-send-btn" aria-label="Kirim">',
            '    <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
            '  </button>',
            '</div>',
            '<div class="sc-archive">',
            '  <div class="sc-archive-title">Arsip Bantuan</div>',
            '  <div class="sc-archive-list" id="sc-archive-list">',
            '    <div class="sc-archive-empty">Belum ada riwayat bantuan.</div>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(panel);

        archiveModal = document.createElement('div');
        archiveModal.className = 'sc-archive-modal';
        archiveModal.id = 'sc-archive-modal';
        archiveModal.innerHTML = [
            '<div class="sc-archive-modal-card">',
            '  <div class="sc-archive-modal-header">',
            '    <div class="sc-archive-modal-title" id="sc-archive-modal-title">Transcript Bantuan</div>',
            '    <button type="button" class="sc-archive-modal-close" id="sc-archive-close" aria-label="Tutup">✕</button>',
            '  </div>',
            '  <div class="sc-archive-modal-meta" id="sc-archive-modal-meta"></div>',
            '  <div class="sc-archive-modal-body" id="sc-archive-modal-body"></div>',
            '  <div class="sc-archive-modal-footer">',
            '    <button type="button" class="sc-archive-modal-btn" id="sc-archive-close-btn">Tutup</button>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(archiveModal);

        // Bind refs
        messagesContainer = document.getElementById('sc-messages');
        inputEl = document.getElementById('sc-input');
        sendBtn = document.getElementById('sc-send-btn');
        statusBar = document.getElementById('sc-status-bar');
        ratingArea = document.getElementById('sc-rating-area');
        archiveList = document.getElementById('sc-archive-list');

        // Events
        document.getElementById('sc-close-btn').addEventListener('click', closePanel);

        sendBtn.addEventListener('click', function () {
            sendMessage();
        });

        inputEl.addEventListener('keydown', function (e) {
            var keyText = (e.key || '').toLowerCase();
            var isEnter =
                e.key === 'Enter' ||
                e.code === 'Enter' ||
                e.keyCode === 13 ||
                e.which === 13 ||
                keyText === 'send' ||
                keyText === 'go';
            if (isEnter && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Auto-grow textarea
        inputEl.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 80) + 'px';
        });

        archiveList.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('.sc-archive-item') : null;
            if (!btn) return;
            var sessionId = btn.getAttribute('data-session-id');
            openArchiveTranscript(sessionId);
        });

        document.getElementById('sc-archive-close').addEventListener('click', closeArchiveTranscript);
        document.getElementById('sc-archive-close-btn').addEventListener('click', closeArchiveTranscript);
        archiveModal.addEventListener('click', function (e) {
            if (e.target === archiveModal) {
                closeArchiveTranscript();
            }
        });
    }

    // ==================== INIT ====================
    function init() {
        var token = getToken();
        if (!token) return; // No token = not logged in, skip widget

        var patientProfile = getPatientProfile();
        if (!isSupportChatEnabledForCurrentPatient(patientProfile)) {
            return;
        }

        state.patientName = (patientProfile && (patientProfile.full_name || patientProfile.fullname || patientProfile.name)) || 'Anda';

        buildWidget();
        loadArchiveSessions();

        // Listen for incoming staff messages even when panel is closed (for notification badge)
        var socket = getSocket();
        if (socket) {
            socket.on('support:new_message', function (msg) {
                if (!state.session || !sameSessionId(msg.session_id, state.session.id)) return;
                if (msg.sender_type !== 'staff') return;
                if (!state.isOpen) {
                    // Show notification badge on FAB
                    var badge = fab.querySelector('.sc-fab-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'sc-fab-badge';
                        badge.textContent = '1';
                        fab.appendChild(badge);
                    }
                }
            });
        }

        // Clear badge when panel opens
        var origOpen = openPanel;
        openPanel = function () {
            origOpen();
            var badge = fab && fab.querySelector('.sc-fab-badge');
            if (badge) badge.remove();
        };
    }

    // Wait for DOM + potential token availability
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 800); // Give auth state time to settle
        });
    } else {
        setTimeout(init, 800);
    }

    // Export for external control
    window.supportChat = {
        open: openPanel,
        close: closePanel,
        toggle: function () { if (state.isOpen) closePanel(); else openPanel(); }
    };

})();
