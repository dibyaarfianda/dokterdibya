/**
 * support-chat-staff.js — Staff Panel for Support Chat
 * Shows escalated patient sessions and allows staff to reply in real-time.
 * Loaded in staff/public/index-adminlte.html
 */
(function () {
    'use strict';

    var API_BASE = '/api/support-chat';
    var POLL_INTERVAL = 15000; // 15 seconds fallback polling

    var state = {
        sessions: [],           // List of pending escalated sessions
        activeSessionId: null,  // Currently open session
        activeMessages: [],
        pollTimer: null,
        badgeCount: 0,
        joinedRoom: null,
        socketConnectHandler: null,
        messagePollTimer: null,
        lastMessageId: 0,
        sendingReply: false
    };

    function sameSessionId(a, b) {
        return String(a || '') === String(b || '');
    }

    function getCurrentStaffName() {
        if (window.currentUserName) return String(window.currentUserName);
        if (window.auth && window.auth.currentUser) {
            return String(
                window.auth.currentUser.name ||
                window.auth.currentUser.displayName ||
                window.auth.currentUser.email ||
                'Staff'
            );
        }
        return 'Staff';
    }

    // ==================== TOKEN ====================
    function getToken() {
        if (typeof window.getAuthToken === 'function') return window.getAuthToken();
        return localStorage.getItem('vps_auth_token') || '';
    }

    // ==================== API ====================
    async function apiFetch(path, options) {
        var token = getToken();
        var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
        var resp = await fetch(API_BASE + path, Object.assign({ headers: headers }, options || {}));
        if (!resp.ok) {
            var err = await resp.json().catch(() => ({}));
            throw new Error(err.message || 'Request failed');
        }
        return resp.json();
    }

    // ==================== SOCKET ====================
    function getSocket() {
        if (window.__realtimeSyncState && window.__realtimeSyncState.socket) {
            return window.__realtimeSyncState.socket;
        }
        return null;
    }

    function bindSocketEvents() {
        var socket = getSocket();
        if (!socket) return;

        // New escalation from a patient
        socket.off('support:escalated');
        socket.on('support:escalated', function (data) {
            // Update badge and reload list
            state.badgeCount++;
            updateBadge(state.badgeCount);
            loadPendingSessions();
            // Notification toast
            showToast('💬 Pasien ' + (data.patientName || 'baru') + ' membutuhkan bantuan');
        });

        // Patient sent a new message in escalated session
        socket.off('support:escalated_message');
        socket.on('support:escalated_message', function (data) {
            // Reload if it's for the currently open session
            if (sameSessionId(state.activeSessionId, data.sessionId)) {
                loadSessionMessages(data.sessionId);
            } else {
                showToast('💬 Pesan baru dari ' + (data.patientName || 'pasien'));
            }
        });

        // Another staff resolved a session
        socket.off('support:session_resolved');
        socket.on('support:session_resolved', function (data) {
            if (sameSessionId(state.activeSessionId, data.sessionId)) {
                state.activeSessionId = null;
                renderEmptyPanel();
                stopActiveSessionPolling();
            }
            loadPendingSessions();
        });

        // Real-time message delivery in open session
        socket.off('support:new_message');
        socket.on('support:new_message', function (msg) {
            if (!sameSessionId(state.activeSessionId, msg.session_id)) return;

            var msgId = Number(msg && msg.id ? msg.id : 0);
            if (msgId > 0 && msgId <= state.lastMessageId) return;
            if (msgId > state.lastMessageId) state.lastMessageId = msgId;

            if (msg.sender_type === 'staff') {
                // Ignore local optimistic duplicate, but allow staff replies from others if needed.
                var exists = document.querySelector('#sc-staff-messages [data-msg-id="' + msg.id + '"]');
                if (exists) return;
            }
            appendMessageToPanel(msg);
        });
    }

    function joinSessionRoom(sessionId) {
        var socket = getSocket();
        if (!socket || !sessionId) return;

        // Leave previous
        if (state.joinedRoom) {
            socket.emit('support:leave', { sessionId: state.joinedRoom });
        }
        state.joinedRoom = sessionId;
        socket.emit('support:join', { sessionId: sessionId });

        // Rejoin after reconnect (rooms are not persistent across reconnects)
        if (state.socketConnectHandler) {
            socket.off('connect', state.socketConnectHandler);
        }
        state.socketConnectHandler = function () {
            if (!state.activeSessionId) return;
            socket.emit('support:join', { sessionId: state.activeSessionId });
        };
        socket.on('connect', state.socketConnectHandler);
    }

    // ==================== BADGE ====================
    function updateBadge(count) {
        state.badgeCount = count;
        var badge = document.getElementById('support-chat-badge');
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        }
    }

    async function refreshBadge() {
        try {
            var data = await apiFetch('/staff/count');
            updateBadge(data.count || 0);
        } catch (e) { /* ignore */ }
    }

    // ==================== LIST ====================
    async function loadPendingSessions() {
        try {
            var data = await apiFetch('/staff/pending');
            state.sessions = data.sessions || [];
            renderSessionList();
            updateBadge(state.sessions.length);
        } catch (err) {
            console.error('[support-staff] loadPendingSessions error:', err);
        }
    }

    function renderSessionList() {
        var listEl = document.getElementById('sc-staff-list');
        if (!listEl) return;

        if (state.sessions.length === 0) {
            listEl.innerHTML = '<div class="sc-staff-empty"><i class="fa fa-check-circle text-success"></i><span>Tidak ada sesi yang perlu ditangani</span></div>';
            return;
        }

        listEl.innerHTML = state.sessions.map(function (s) {
            var isActive = sameSessionId(s.id, state.activeSessionId);
            var sessionIdExpr = JSON.stringify(s.id);
            var preview = (s.last_message || '').slice(0, 80);
            var timeAgo = s.updated_at ? relativeTime(new Date(s.updated_at)) : '';
            return '<div class="sc-staff-item' + (isActive ? ' sc-staff-item--active' : '') + '" data-session-id="' + escapeHtml(String(s.id)) + '" onclick="window.supportChatStaff.openSession(' + sessionIdExpr + ')">' +
                '<div class="sc-staff-item-header">' +
                '<span class="sc-staff-item-name">' + escapeHtml(s.patient_name || 'Pasien') + '</span>' +
                '<span class="sc-staff-item-time">' + timeAgo + '</span>' +
                '</div>' +
                '<div class="sc-staff-item-preview">' + escapeHtml(preview) + '</div>' +
                (s.assigned_staff_name ? '<div class="sc-staff-item-assigned">Ditangani: ' + escapeHtml(s.assigned_staff_name) + '</div>' : '') +
                '</div>';
        }).join('');
    }

    // ==================== SESSION PANEL ====================
    async function openSession(sessionId) {
        state.activeSessionId = sessionId;
        renderSessionList(); // Re-render to show active state

        try {
            var data = await apiFetch('/staff/session/' + sessionId);
            state.activeMessages = data.session.messages || [];
            state.lastMessageId = 0;
            state.activeMessages.forEach(function (m) {
                var idNum = Number(m && m.id ? m.id : 0);
                if (idNum > state.lastMessageId) state.lastMessageId = idNum;
            });
            renderActiveSession(data.session);
            joinSessionRoom(sessionId);
            startActiveSessionPolling();
        } catch (err) {
            console.error('[support-staff] openSession error:', err);
        }
    }

    async function loadSessionMessages(sessionId) {
        if (!sameSessionId(state.activeSessionId, sessionId)) return;
        try {
            var data = await apiFetch('/staff/session/' + sessionId);
            state.activeMessages = data.session.messages || [];
            renderMessagesInPanel(state.activeMessages);
            state.lastMessageId = 0;
            state.activeMessages.forEach(function (m) {
                var idNum = Number(m && m.id ? m.id : 0);
                if (idNum > state.lastMessageId) state.lastMessageId = idNum;
            });
        } catch (e) { /* ignore */ }
    }

    function startActiveSessionPolling() {
        stopActiveSessionPolling();
        state.messagePollTimer = setInterval(function () {
            if (!state.activeSessionId) return;
            loadSessionMessages(state.activeSessionId);
        }, 3000);
    }

    function stopActiveSessionPolling() {
        if (!state.messagePollTimer) return;
        clearInterval(state.messagePollTimer);
        state.messagePollTimer = null;
    }

    function renderActiveSession(session) {
        var panel = document.getElementById('sc-staff-panel');
        if (!panel) return;

        var resolveSessionExpr = JSON.stringify(session.id);

        panel.innerHTML = [
            '<div class="sc-staff-panel-header">',
            '  <div class="sc-staff-panel-title">',
            '    <i class="fa fa-user-circle"></i>',
            '    <span>' + escapeHtml(session.patient_name || 'Pasien') + '</span>',
            '    <span class="badge badge-warning" style="font-size:10px;margin-left:8px;">Eskalasi</span>',
            '  </div>',
            '  <div class="sc-staff-panel-actions">',
            '    <button class="btn btn-sm btn-success" onclick="window.supportChatStaff.resolveSession(' + resolveSessionExpr + ')" title="Selesaikan"><i class="fa fa-check"></i> Selesai</button>',
            '  </div>',
            '</div>',
            '<div class="sc-staff-messages" id="sc-staff-messages"></div>',
            '<div class="sc-staff-input-area">',
            '  <textarea class="sc-staff-input" id="sc-staff-input" placeholder="Ketik balasan..." rows="2"></textarea>',
            '  <button class="btn btn-primary btn-sm sc-staff-send-btn" id="sc-staff-send-btn" onclick="window.supportChatStaff.sendReply()"><i class="fa fa-paper-plane"></i> Kirim</button>',
            '</div>'
        ].join('');

        renderMessagesInPanel(session.messages || []);

        // Bind enter key
        var inp = document.getElementById('sc-staff-input');
        if (inp) {
            inp.addEventListener('keydown', function (e) {
                var keyText = (e.key || '').toLowerCase();
                var isEnter = e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13 || e.which === 13 || keyText === 'send' || keyText === 'go';
                if (isEnter && !e.shiftKey && !e.isComposing) {
                    e.preventDefault();
                    window.supportChatStaff.sendReply();
                }
            });
        }
    }

    function renderEmptyPanel() {
        var panel = document.getElementById('sc-staff-panel');
        if (!panel) return;
        panel.innerHTML = '<div class="sc-staff-panel-empty"><i class="fa fa-comments fa-3x text-muted"></i><p>Pilih sesi untuk mulai membalas</p></div>';
    }

    function renderMessagesInPanel(messages) {
        var container = document.getElementById('sc-staff-messages');
        if (!container) return;
        container.innerHTML = '';
        (messages || []).forEach(function (msg) {
            appendMessageToPanel(msg);
        });
    }

    function appendMessageToPanel(msg) {
        var container = document.getElementById('sc-staff-messages');
        if (!container) return;

        var div = document.createElement('div');
        div.className = 'sc-staff-msg sc-staff-msg--' + msg.sender_type;
        div.dataset.msgId = msg.id;

        var labelMap = { bot: '🤖 Asisten', staff: '👤 ' + (msg.sender_name || 'Staff'), patient: '🧑 ' + (msg.sender_name || 'Pasien') };
        var label = labelMap[msg.sender_type] || msg.sender_name;
        var timeStr = formatTime(msg.created_at);

        div.innerHTML =
            '<div class="sc-staff-msg__bubble">' +
            '<div class="sc-staff-msg__meta"><strong>' + escapeHtml(label) + '</strong><span class="sc-staff-msg__time">' + timeStr + '</span></div>' +
            '<div class="sc-staff-msg__content">' + formatContent(msg.content) + '</div>' +
            '</div>';

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        var idNum = Number(msg && msg.id ? msg.id : 0);
        if (idNum > state.lastMessageId) state.lastMessageId = idNum;
    }

    // ==================== ACTIONS ====================
    async function sendReply() {
        if (!state.activeSessionId) return;
        if (state.sendingReply) return;

        var inp = document.getElementById('sc-staff-input');
        if (!inp) return;

        var content = inp.value.trim();
        if (!content) return;
        var targetSessionId = state.activeSessionId;

        var sendBtn = document.getElementById('sc-staff-send-btn');
        state.sendingReply = true;
        if (sendBtn) sendBtn.disabled = true;
        inp.disabled = true;

        try {
            var data = await apiFetch('/staff/' + targetSessionId + '/reply', {
                method: 'POST',
                body: JSON.stringify({ content: content })
            });

            var savedMessage = data && data.message ? data.message : null;
            if (savedMessage && sameSessionId(state.activeSessionId, targetSessionId)) {
                var existing = document.querySelector('#sc-staff-messages [data-msg-id="' + savedMessage.id + '"]');
                if (!existing) {
                    appendMessageToPanel(savedMessage);
                }
            }

            inp.value = '';
        } catch (err) {
            console.error('[support-staff] sendReply error:', err);
            showToast('Gagal mengirim pesan', 'error');
        } finally {
            state.sendingReply = false;
            if (sendBtn) sendBtn.disabled = false;
            inp.disabled = false;
            inp.focus();
        }
    }

    async function resolveSession(sessionId) {
        if (!confirm('Tandai sesi ini sebagai selesai?')) return;

        try {
            await apiFetch('/staff/' + sessionId + '/resolve', { method: 'PUT' });
            state.activeSessionId = null;
            renderEmptyPanel();
            stopActiveSessionPolling();
            loadPendingSessions();
            showToast('Sesi diselesaikan', 'success');
        } catch (err) {
            console.error('[support-staff] resolveSession error:', err);
            showToast('Gagal menyelesaikan sesi', 'error');
        }
    }

    // ==================== HELPERS ====================
    function escapeHtml(text) {
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(text || ''));
        return d.innerHTML;
    }

    function formatContent(text) {
        return escapeHtml(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    function formatTime(dateVal) {
        var d = new Date(dateVal);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    function relativeTime(date) {
        var now = Date.now();
        var diff = now - date.getTime();
        if (diff < 60000) return 'Baru saja';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' mnt lalu';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' jam lalu';
        return date.toLocaleDateString('id-ID');
    }

    function showToast(msg, type) {
        // Use existing toastr if available
        if (window.toastr) {
            type === 'success' ? window.toastr.success(msg) :
            type === 'error' ? window.toastr.error(msg) :
            window.toastr.info(msg);
            return;
        }
        // Fallback simple toast
        var toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#374151;color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:13px;font-family:Poppins,sans-serif;';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(function () { toast.remove(); }, 3000);
    }

    // ==================== INJECT STYLES ====================
    function injectStyles() {
        if (document.getElementById('support-chat-staff-styles')) return;
        var style = document.createElement('style');
        style.id = 'support-chat-staff-styles';
        var containerSelector = '#content-support-chat-page';
        style.textContent = [
            '#content-support-chat .sc-staff-layout{display:flex;gap:0;height:calc(100vh - 200px);min-height:400px;border:1px solid #dee2e6;border-radius:8px;overflow:hidden;background:#fff;}',
            '#content-support-chat .sc-staff-sidebar{width:280px;border-right:1px solid #dee2e6;display:flex;flex-direction:column;flex-shrink:0;}',
            '#content-support-chat .sc-staff-sidebar-header{padding:12px 16px;border-bottom:1px solid #dee2e6;background:#f8f9fa;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;}',
            '#content-support-chat #sc-staff-list{flex:1;overflow-y:auto;}',
            '#content-support-chat .sc-staff-empty{padding:20px;text-align:center;color:#6c757d;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:13px;}',
            '#content-support-chat .sc-staff-item{padding:12px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;transition:background .15s;}',
            '#content-support-chat .sc-staff-item:hover{background:#f8f9fa;}',
            '#content-support-chat .sc-staff-item--active{background:#e8f4fd;border-left:3px solid #007bff;}',
            '#content-support-chat .sc-staff-item-header{display:flex;justify-content:space-between;margin-bottom:4px;}',
            '#content-support-chat .sc-staff-item-name{font-weight:600;font-size:13px;color:#212529;}',
            '#content-support-chat .sc-staff-item-time{font-size:11px;color:#6c757d;}',
            '#content-support-chat .sc-staff-item-preview{font-size:12px;color:#6c757d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '#content-support-chat .sc-staff-item-assigned{font-size:11px;color:#28a745;margin-top:2px;}',
            '#content-support-chat #sc-staff-panel{flex:1;display:flex;flex-direction:column;overflow:hidden;align-items:stretch;}',
            '#content-support-chat .sc-staff-panel-header{padding:12px 16px;border-bottom:1px solid #dee2e6;background:#f8f9fa;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;width:100%;max-width:none;margin:0;align-self:stretch;box-sizing:border-box;}',
            '#content-support-chat .sc-staff-panel-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;}',
            '#content-support-chat .sc-staff-panel-actions{display:flex;gap:8px;}',
            '#content-support-chat .sc-staff-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}',
            '#content-support-chat .sc-staff-msg{display:flex;}',
            '#content-support-chat .sc-staff-msg--patient{justify-content:flex-start;}',
            '#content-support-chat .sc-staff-msg--staff{justify-content:flex-end;}',
            '#content-support-chat .sc-staff-msg--bot{justify-content:flex-start;}',
            '#content-support-chat .sc-staff-msg__bubble{max-width:75%;}',
            '#content-support-chat .sc-staff-msg--patient .sc-staff-msg__bubble .sc-staff-msg__content{background:#f1f5f9;color:#1e293b;border-radius:12px 12px 12px 4px;}',
            '#content-support-chat .sc-staff-msg--staff .sc-staff-msg__bubble .sc-staff-msg__content{background:#2563eb;color:#fff;border-radius:12px 12px 4px 12px;}',
            '#content-support-chat .sc-staff-msg--bot .sc-staff-msg__bubble .sc-staff-msg__content{background:#fef9c3;color:#713f12;border-radius:12px 12px 12px 4px;}',
            '#content-support-chat .sc-staff-msg__content{padding:9px 13px;font-size:13px;line-height:1.55;word-break:break-word;}',
            '#content-support-chat .sc-staff-msg__meta{display:flex;gap:8px;margin-bottom:3px;font-size:11px;color:#64748b;}',
            '#content-support-chat .sc-staff-msg__time{color:#94a3b8;}',
            '#content-support-chat .sc-staff-input-area{padding:12px 16px 12px 20px;border-top:1px solid #dee2e6;display:flex;gap:10px;align-items:flex-end;flex-shrink:0;}',
            '#content-support-chat .sc-staff-input{flex:1;border:1px solid #dee2e6;border-radius:8px;padding:8px 12px 8px 14px;font-size:13px;resize:none;outline:none;font-family:inherit;}',
            '#content-support-chat .sc-staff-input:focus{border-color:#007bff;}',
            '#content-support-chat .sc-staff-send-btn{flex-shrink:0;}',
            '#content-support-chat .sc-staff-panel-empty{flex:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;color:#6c757d;gap:12px;padding-left:48px;box-sizing:border-box;text-align:left;}',
        ].join('').replace(/#content-support-chat/g, containerSelector);
        document.head.appendChild(style);
    }

    // ==================== INIT ====================
    function init() {
        injectStyles();
        bindSocketEvents();
        loadPendingSessions();
        refreshBadge();

        // Periodic polling as fallback for Socket.IO
        if (state.pollTimer) clearInterval(state.pollTimer);
        state.pollTimer = setInterval(function () {
            loadPendingSessions();
            refreshBadge();
        }, POLL_INTERVAL);
    }

    // ==================== PUBLIC API ====================
    window.supportChatStaff = {
        init: init,
        openSession: openSession,
        sendReply: sendReply,
        resolveSession: resolveSession,
        refresh: loadPendingSessions
    };

})();
