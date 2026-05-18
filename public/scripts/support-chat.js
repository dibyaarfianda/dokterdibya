/**
 * support-chat.js — Patient Portal Support Chat Widget
 * Floating FAB button that opens a chat panel.
 * Bot answers FAQ first; if bot can't answer → escalates to staff via Socket.IO.
 *
 * Loaded on: patient-menu.html (and other patient portal pages)
 */
(function () {
    'use strict';

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
        initialized: false
    };

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

    function joinSessionRoom(sessionId) {
        var socket = getSocket();
        if (!socket) return;
        var room = 'support:' + sessionId;
        if (state.socketRoom === room) return;
        state.socketRoom = room;
        socket.emit('support:join', { sessionId: sessionId });

        // Listen for real-time messages from staff
        socket.off('support:new_message');
        socket.on('support:new_message', function (msg) {
            // Only process if it's for this session and it's a staff message
            if (!state.session || msg.session_id !== state.session.id) return;
            if (msg.sender_type === 'patient') return; // We already show patient msgs immediately
            appendMessage(msg);
            // Auto-open if closed and message is from staff
            if (!state.isOpen && msg.sender_type === 'staff') {
                openPanel();
            }
        });

        socket.off('support:resolved');
        socket.on('support:resolved', function (data) {
            if (!state.session || data.sessionId !== state.session.id) return;
            state.session.status = 'resolved';
            updateStatusBar();
            appendSystemMessage('Sesi bantuan telah diselesaikan. Terima kasih! 🙏');
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

        var labelMap = { bot: '🤖 Asisten', staff: '👤 ' + (msg.sender_name || 'Staff'), patient: 'Anda' };
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
            statusBar.textContent = '⏳ Menunggu staff...';
            statusBar.className = 'sc-status sc-status--escalated';
        } else if (status === 'resolved') {
            statusBar.textContent = '✅ Selesai';
            statusBar.className = 'sc-status sc-status--resolved';
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
        if (!state.initialized) {
            initChat();
        }
    }

    function closePanel() {
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

            renderMessages(state.session.messages);
            updateStatusBar();
            joinSessionRoom(state.session.id);

        } catch (err) {
            console.error('[support-chat] init error:', err);
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
        var content = inputEl.value.trim();
        if (!content) return;
        if (!state.session) return;

        inputEl.value = '';
        inputEl.disabled = true;
        if (sendBtn) sendBtn.disabled = true;

        // Optimistic render
        var optimistic = {
            id: 'opt_' + Date.now(),
            session_id: state.session.id,
            sender_type: 'patient',
            sender_name: state.patientName || 'Anda',
            content: content,
            created_at: new Date()
        };
        appendMessage(optimistic);

        try {
            var data = await apiFetch('/sessions/' + state.session.id + '/message', {
                method: 'POST',
                body: JSON.stringify({ content: content })
            });

            // Update session status if escalated
            if (data.escalated) {
                state.session.status = 'escalated';
                updateStatusBar();
            }

            // Bot reply was already emitted via socket, but also handle via REST response
            if (data.botReply) {
                // Avoid duplicate if socket already delivered it
                var existing = messagesContainer && messagesContainer.querySelector('[data-msg-id="' + data.botReply.id + '"]');
                if (!existing) appendMessage(data.botReply);
            }

        } catch (err) {
            console.error('[support-chat] send error:', err);
            appendSystemMessage('Gagal mengirim pesan. Coba lagi.');
        } finally {
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
            '.sc-fab--open{background:linear-gradient(135deg,#374151,#1f2937);}',
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
            if (e.key === 'Enter' && !e.shiftKey) {
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

        buildWidget();

        // Listen for incoming staff messages even when panel is closed (for notification badge)
        var socket = getSocket();
        if (socket) {
            socket.on('support:new_message', function (msg) {
                if (!state.session || msg.session_id !== state.session.id) return;
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
