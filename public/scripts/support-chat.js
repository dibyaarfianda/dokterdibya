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
        // Phase 6: rating state
        requiresRating: false,
        rated: false,
        submittingRating: false,
        cooldown: null     // { active, remaining_seconds, last_rating_at }
    };

    // ==================== UTIL ====================
    function formatRemaining(seconds) {
        var s = Math.max(0, Math.floor(Number(seconds) || 0));
        var mins = Math.ceil(s / 60);
        if (mins < 60) return mins + ' menit';
        var hr = Math.floor(mins / 60);
        var rem = mins % 60;
        return hr + ' jam' + (rem > 0 ? ' ' + rem + ' menit' : '');
    }

    // ==================== DOM REFS ====================
    var fab, panel, messagesContainer, inputEl, sendBtn, statusBar;

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
        var body = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            var err = new Error((body && body.message) || 'Request failed');
            err.status = resp.status;
            err.body = body || {};
            throw err;
        }
        return body;
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
                if (typeof data.session.rated === 'boolean') state.rated = data.session.rated;
                if (typeof data.session.requires_rating === 'boolean') state.requiresRating = data.session.requires_rating;
                if (data.cooldown) state.cooldown = data.cooldown;
                updateStatusBar();
                if (state.session.status === 'resolved') {
                    stopMessagePolling();
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
            if (!state.rated) state.requiresRating = true;
            updateStatusBar();
            stopMessagePolling();

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
            statusBar.textContent = state.rated ? '✅ Selesai · Terima kasih atas ratingnya' : '✅ Selesai';
            statusBar.className = 'sc-status sc-status--resolved';
        }
        applyResolvedRatingGate();
    }

    // ---------- Phase 6: rating gate ----------
    function applyResolvedRatingGate() {
        if (!state.session) return;
        var needsRating = state.session.status === 'resolved' && state.requiresRating && !state.rated;

        if (inputEl) inputEl.disabled = needsRating || inputEl.disabled === true && state.sendingMessage;
        if (sendBtn) sendBtn.disabled = needsRating || state.sendingMessage;

        // Close button gating
        var closeBtn = document.getElementById('sc-close-btn');
        if (closeBtn) {
            if (needsRating) {
                closeBtn.dataset.scLocked = '1';
                closeBtn.title = 'Beri rating dulu untuk menutup percakapan';
                closeBtn.style.opacity = '0.5';
            } else {
                if (closeBtn.dataset.scLocked) {
                    delete closeBtn.dataset.scLocked;
                    closeBtn.title = '';
                    closeBtn.style.opacity = '';
                }
            }
        }

        renderRatingPanel(needsRating);
    }

    function renderRatingPanel(show) {
        if (!panel) return;
        var existing = document.getElementById('sc-rating-panel');
        if (!show) {
            if (existing) existing.remove();
            return;
        }
        if (existing) return; // already shown

        var div = document.createElement('div');
        div.id = 'sc-rating-panel';
        div.className = 'sc-rating-panel';
        div.style.cssText = 'padding:16px;border-top:1px solid #e5e7eb;background:#f9fafb;text-align:center;';
        div.innerHTML = [
            '<div style="font-size:13px;color:#374151;margin-bottom:8px;font-weight:600;">Bagaimana pengalaman Anda dengan staff kami?</div>',
            '<div id="sc-rating-stars" style="display:flex;justify-content:center;gap:6px;margin-bottom:10px;">',
            [1,2,3,4,5].map(function (n) {
                return '<button type="button" class="sc-star" data-rating="' + n + '" style="background:none;border:none;cursor:pointer;font-size:28px;color:#d1d5db;padding:2px 4px;line-height:1;" aria-label="Beri ' + n + ' bintang">★</button>';
            }).join(''),
            '</div>',
            '<div id="sc-rating-status" style="font-size:11px;color:#6b7280;">Wajib memberi rating sebelum menutup percakapan.</div>'
        ].join('');

        // Append above input area
        var inputArea = document.querySelector('#sc-panel .sc-input-area');
        if (inputArea && inputArea.parentNode) {
            inputArea.parentNode.insertBefore(div, inputArea);
        } else {
            panel.appendChild(div);
        }

        // Bind stars
        var stars = div.querySelectorAll('.sc-star');
        stars.forEach(function (btn) {
            btn.addEventListener('mouseenter', function () {
                highlightStars(stars, Number(btn.dataset.rating));
            });
            btn.addEventListener('mouseleave', function () {
                highlightStars(stars, 0);
            });
            btn.addEventListener('click', function () {
                submitRating(Number(btn.dataset.rating));
            });
        });
    }

    function highlightStars(stars, upTo) {
        stars.forEach(function (s) {
            var n = Number(s.dataset.rating);
            s.style.color = (n <= upTo) ? '#f59e0b' : '#d1d5db';
        });
    }

    async function submitRating(rating) {
        if (state.submittingRating || state.rated || !state.session) return;
        var sid = state.session.id;
        state.submittingRating = true;
        var statusEl = document.getElementById('sc-rating-status');
        if (statusEl) statusEl.textContent = 'Mengirim rating...';

        try {
            var data = await apiFetch('/sessions/' + sid + '/rating', {
                method: 'POST',
                body: JSON.stringify({ rating: rating })
            });
            state.rated = true;
            state.requiresRating = false;
            if (data && data.cooldown) state.cooldown = data.cooldown;

            // Persist star color
            var stars = document.querySelectorAll('#sc-rating-stars .sc-star');
            highlightStars(stars, rating);
            stars.forEach(function (s) { s.disabled = true; });

            if (statusEl) statusEl.textContent = 'Terima kasih atas ratingnya! 🙏';
            updateStatusBar();

            // Auto-close panel after a short delay
            setTimeout(function () {
                renderRatingPanel(false);
                closePanel();
            }, 1500);

        } catch (err) {
            console.error('[support-chat] submitRating error:', err);
            if (err && err.status === 409) {
                // Already rated
                state.rated = true;
                state.requiresRating = false;
                updateStatusBar();
                renderRatingPanel(false);
            } else {
                if (statusEl) statusEl.textContent = 'Gagal mengirim rating. Coba lagi.';
            }
        } finally {
            state.submittingRating = false;
        }
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
        if (!state.initialized || !state.session) {
            initChat();
        }
    }

    function closePanel() {
        // Phase 6: block close when rating is required
        if (state.session && state.session.status === 'resolved' && state.requiresRating && !state.rated) {
            var statusEl = document.getElementById('sc-rating-status');
            if (statusEl) {
                statusEl.textContent = 'Beri rating dulu untuk menutup percakapan. 👇';
                statusEl.style.color = '#ef4444';
                setTimeout(function () { statusEl.style.color = ''; }, 1500);
            }
            return;
        }
        state.isOpen = false;
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
        renderMessages([]);
        appendSystemMessage('Memuat percakapan...');

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

            // Phase 6: read rating + cooldown flags
            state.rated = !!(state.session && state.session.rated);
            state.requiresRating = !!(state.session && state.session.requires_rating);
            if (data.cooldown) state.cooldown = data.cooldown;

            renderMessages(state.session.messages);
            updateLastMessageId(state.session.messages);
            updateStatusBar();
            joinSessionRoom(state.session.id);
            startMessagePolling();

        } catch (err) {
            console.error('[support-chat] init error:', err);
            state.session = null;
            state.initialized = false;
            if (!getToken()) {
                appendSystemMessage('Silakan login terlebih dahulu untuk menggunakan fitur chat bantuan.');
            } else {
                appendSystemMessage('Gagal memuat chat. Coba muat ulang halaman.');
            }
        }
    }

    // ==================== SEND MESSAGE ====================
    async function sendMessage() {
        if (!inputEl) return;
        if (state.sendingMessage) return;

        var content = inputEl.value.trim();
        if (!content) return;
        if (!state.session) return;

        var targetSessionId = state.session.id;
        state.sendingMessage = true;
        inputEl.disabled = true;
        if (sendBtn) sendBtn.disabled = true;

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

            // Phase 6: cooldown active — staff escalation blocked, bot replied politely
            if (data.cooldown && data.cooldown.active) {
                state.cooldown = data.cooldown;
            }

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
            if (err && err.status === 429 && err.body && err.body.cooldown_remaining_seconds) {
                state.cooldown = {
                    active: true,
                    remaining_seconds: err.body.cooldown_remaining_seconds
                };
                appendSystemMessage('Anda baru saja terhubung dengan staff. Coba lagi dalam ' + formatRemaining(err.body.cooldown_remaining_seconds) + '.');
            } else {
                appendSystemMessage('Gagal mengirim pesan. Coba lagi.');
            }
        } finally {
            state.sendingMessage = false;
            inputEl.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
            inputEl.focus();
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
            '<div class="sc-messages" id="sc-messages"></div>',
            '<div class="sc-input-area">',
            '  <textarea class="sc-input" id="sc-input" placeholder="Ketik pertanyaan..." rows="1"></textarea>',
            '  <button class="sc-send-btn" id="sc-send-btn" aria-label="Kirim">',
            '    <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
            '  </button>',
            '</div>'
        ].join('');
        document.body.appendChild(panel);

        // Bind refs
        messagesContainer = document.getElementById('sc-messages');
        inputEl = document.getElementById('sc-input');
        sendBtn = document.getElementById('sc-send-btn');
        statusBar = document.getElementById('sc-status-bar');

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
