// Compact Chat Popup Widget (customized to Dr. Dibya Private Clinic)
// Implements in-bubble name + timestamp, #737373 incoming bubbles, blue outgoing,
// balanced padding, line-height 1.2, and fixed max-width.
// Preserves original auth, history loading, and realtime hooks.

(function () {
  'use strict';

  // ---------- UTIL: color per name + avatar ----------
  const namePalette = [
    "#ffd6a5", "#b5ead7", "#a0c4ff", "#fdffb6", 
    "#cdb4db", "#fbc4ab", "#d0f4de", "#ffc6ff"
  ];
  
  function colorFromName(name = '') {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return namePalette[h % namePalette.length];
  }

  function getInitials(name = '') {
    return name
      .split(' ')
      .map(p => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  // ---------- HTML ----------
  const chatHTML = `
    <div id="chat-popup-container">
      <!-- Floating Chat Button -->
      <div id="chat-toggle-btn" class="chat-toggle-btn">
        <i class="fas fa-comments"></i>
        <span class="chat-badge" style="display:none;">0</span>
      </div>

      <!-- Chat Box -->
      <div id="chat-box" class="chat-box" style="display:none;">
        <div class="chat-header">
          <div class="chat-header-content">
            <div>
              <div class="chat-header-title">Team Chat</div>
              <div class="chat-header-online" id="chat-online-users">
                <i class="fas fa-circle" style="font-size: 8px; color: #4ade80;"></i>
                <span id="online-names"></span>
              </div>
            </div>
          </div>
          <button id="chat-close-btn" class="chat-close-btn" aria-label="Tutup">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="chat-messages" id="chat-messages">
          <!-- Messages will be loaded here -->
        </div>

        <div class="chat-input-container">
          <input type="text" id="chat-input" class="chat-input" placeholder="Ketik pesan...">
          <button id="chat-send-btn" class="chat-send-btn" aria-label="Kirim">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  // ---------- CSS ----------
  const chatCSS = `
    <style>
      #chat-popup-container {
        position: fixed; bottom: 20px; right: 20px; z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }

      .chat-toggle-btn {
        width: 56px; height: 56px; border-radius: 50%;
        background: linear-gradient(135deg, #007BFF 0%, #007BFF 100%);
        color: #fff; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; box-shadow: 0 4px 12px rgba(102,126,234,.4);
        transition: all .3s ease; position: relative;
      }
      .chat-toggle-btn:hover { transform: scale(1.1); box-shadow: 0 6px 16px rgba(102,126,234,.5); }
      .chat-toggle-btn:active { transform: scale(.95); }

      .chat-badge {
        position: absolute; top: -5px; right: -5px;
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: #fff; border-radius: 12px; padding: 2px 6px;
        font-size: 11px; font-weight: bold; min-width: 20px; text-align: center;
      }

      .chat-box {
        width: 340px; height: 480px; background: #fff; border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,.12);
        display: flex; flex-direction: column; overflow: hidden;
        animation: slideUp .3s ease;
      }
      @keyframes slideUp { from {opacity:0; transform: translateY(20px);} to {opacity:1; transform:translateY(0);} }

      /* Header compact per request */
      .chat-header {
        background: linear-gradient(135deg, #007BFF 0%, #007BFF 100%);
        color: #fff; padding: 10px 12px; /* compact vertically */
        display: flex; justify-content: space-between; align-items: center;
        box-shadow: 0 2px 8px rgba(0,0,0,.1);
      }
      .chat-header-content { display: flex; align-items: center; }
      .chat-header-title { font-weight: 600; font-size: 15px; line-height: 1.2; }
      .chat-header-online { 
        font-size: 11px; line-height: 1.2; margin-top: 2px; 
        opacity: 0.9; display: flex; align-items: center; gap: 4px;
      }

      .chat-close-btn {
        background: rgba(255,255,255,.2); border: none; color: #fff;
        width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
        display:flex; align-items:center; justify-content:center; transition: all .2s ease;
      }
      .chat-close-btn:hover { background: rgba(255,255,255,.3); transform: rotate(90deg); }

      /* Background di belakang bubble = abu-abu */
      .chat-messages {
        flex: 1; overflow-y: auto; padding: 12px;
        background: #e5e7eb; /* gray-300 */
      }
      .chat-messages::-webkit-scrollbar { width: 6px; }
      .chat-messages::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, #007BFF 0%, #007BFF 100%); border-radius: 10px;
      }

      .chat-message {
        margin-bottom: 8px; display: flex; flex-flow: row nowrap; gap: 8px;
        animation: fadeIn .3s ease; width: 100%; align-items: flex-start;
      }
      @keyframes fadeIn { from {opacity:0; transform: translateY(10px);} to {opacity:1; transform: translateY(0);} }

      .chat-message.sent { justify-content: flex-end; }
      .chat-message.received { justify-content: flex-start; }

      /* Avatar */
      .chat-avatar {
        width: 36px; height: 36px; min-width: 36px; min-height: 36px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-weight: 600; font-size: 14px; color: #111827;
        box-shadow: 0 1px 2px rgba(0,0,0,.1); flex-shrink: 0;
        overflow: hidden; background-size: cover; background-position: center;
      }
      
      .chat-avatar img {
        width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
      }
      
      .chat-avatar-spacer { width: 36px; min-width: 36px; flex-shrink: 0; }

      .chat-message-wrapper { display: flex; flex-direction: column; max-width: 65%; }

      /* BUBBLE BASE — padding 10px semua sisi */
      .chat-message-content {
        padding: 10px; border-radius: 6px; font-size: 15.4px; font-weight: 400; line-height: 1.2;
        letter-spacing: 0.1px; word-wrap: break-word; word-break: break-word; white-space: normal;
        overflow-wrap: break-word; display: inline-block; min-width: 64px;
        writing-mode: horizontal-tb; direction: ltr;
        box-shadow: 0 1px 2px rgba(0,0,0,.1);
      }

      /* Incoming: #737373, teks putih; Outgoing: biru */
      .chat-message.received .chat-message-content {
        background: #737373; color: #fff; text-align: left;
      }
      .chat-message.sent .chat-message-content {
        background: #007bff; color: #fff; text-align: right;
      }

      /* Nama di dalam bubble (bold, kecil) + warna */
      .chat-name {
        font-size: 14.1px; font-weight: 700; margin-bottom: 1px; line-height: 1.1;
      }
      
      /* Text content */
      .chat-text {
        display: block; line-height: 1.2; margin: 0; padding: 0;
      }

      /* Timestamp di dalam bubble, spasi sedikit ke bawah */
      .chat-message-time {
        font-size: 11px; margin-top: 2px; line-height: 1.1;
      }
      .chat-message.received .chat-message-time { color: #d1d5db; } /* gray-300 */
      .chat-message.sent .chat-message-time { color: #dbeafe; }     /* blue-100 */

      .chat-input-container {
        display: flex; padding: 12px; background: #fff; border-top: 1px solid #e9ecef; gap: 8px;
      }
      .chat-input {
        flex: 1; border: 1px solid #e9ecef; border-radius: 20px; padding: 10px 16px; font-size: 16px;
        outline: none; transition: all .2s ease; background: #fff;
      }
      .chat-input:focus { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,.1); }

      .chat-send-btn {
        width: 40px; height: 40px; border-radius: 50%;
        background: linear-gradient(135deg, #007BFF 0%, #007BFF 100%);
        color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: all .2s ease;
      }
      .chat-send-btn:hover { transform: scale(1.1); box-shadow: 0 2px 8px rgba(102,126,234,.3); }
      .chat-send-btn:active { transform: scale(.95); }
      .chat-send-btn:disabled { opacity: .5; cursor: not-allowed; }

      @media (max-width: 480px) {
        .chat-box { width: calc(100vw - 40px); height: calc(100vh - 100px); }
      }
    </style>
  `;

    // Initialize chat popup
    async function initChatPopup() {
        // Wait for auth to be ready
        let user = window.auth?.currentUser;
        
        // If auth not ready, wait for it
        if (!user) {
            await new Promise((resolve) => {
                const checkAuth = setInterval(() => {
                    if (window.auth?.currentUser) {
                        clearInterval(checkAuth);
                        resolve();
                    }
                }, 100);
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    clearInterval(checkAuth);
                    resolve();
                }, 10000);
            });
            
            user = window.auth?.currentUser;
        }
        
        // Check if user has chat permission (all roles have permission by default)
        if (!user || !user.role) {
            console.warn('Chat not initialized: User not authenticated');
            return;
        }

        // All roles have chat permission
        const allowedRoles = ['superadmin', 'admin', 'doctor', 'doctorassistant', 'manager'];
        if (!allowedRoles.includes(user.role)) {
            console.warn('Chat not initialized: User role not allowed');
            return;
        }

        // Inject CSS
        document.head.insertAdjacentHTML('beforeend', chatCSS);

        // Inject HTML
        document.body.insertAdjacentHTML('beforeend', chatHTML);

        // Get elements
        const toggleBtn = document.getElementById('chat-toggle-btn');
        const closeBtn = document.getElementById('chat-close-btn');
        const chatBox = document.getElementById('chat-box');
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('chat-send-btn');
        const messagesContainer = document.getElementById('chat-messages');
        const chatBadge = document.querySelector('.chat-badge');
        const onlineNamesEl = document.getElementById('online-names');

        let isChatOpen = false;
        let lastSender = null; // Track last message sender for avatar grouping
  const userPhotoCache = new Map();

        // Function to update online users
    function updateOnlineUsers(users) {
      if (!onlineNamesEl) return;

      if (!users || users.length === 0) {
        onlineNamesEl.textContent = 'No one online';
        return;
      }

      const uniqueUsers = [];
      const seen = new Set();

      users.forEach((u) => {
        if (!u) return;
        const key = `${u.userId || u.id || ''}-${u.name || ''}`;
        if (!key || seen.has(key)) return;
        seen.add(key);
        uniqueUsers.push(u);
      });

      if (uniqueUsers.length === 0) {
        onlineNamesEl.textContent = 'No one online';
        return;
      }

      uniqueUsers.forEach((u) => {
        if (!u || !u.userId) return;
        if (u.photo) {
          userPhotoCache.set(u.userId, u.photo);
        }
      });

      onlineNamesEl.textContent = uniqueUsers.map((u) => u.name).join(', ');
    }

        // Listen for online users updates via Socket.IO
        if (window.socket) {
            // Initial users list
            window.socket.on('users:list', (users) => {
                updateOnlineUsers(users);
            });
            
            // User connected
            window.socket.on('user:connected', (data) => {
                window.socket.emit('users:get-list');
            });
            
            // User disconnected
            window.socket.on('user:disconnected', (data) => {
                window.socket.emit('users:get-list');
            });
            
            // Request initial list
            window.socket.emit('users:get-list');
        }

        // Load chat history
        await loadChatHistory();

    // Toggle
    toggleBtn.addEventListener('click', () => {
      isChatOpen = !isChatOpen;
      chatBox.style.display = isChatOpen ? 'flex' : 'none';
      toggleBtn.style.display = isChatOpen ? 'none' : 'flex';
      if (isChatOpen) {
        chatInput.focus();
        chatBadge.style.display = 'none';
        chatBadge.textContent = '0';
      }
    });

    // Close
    closeBtn.addEventListener('click', () => {
      isChatOpen = false;
      chatBox.style.display = 'none';
      toggleBtn.style.display = 'flex';
    });

    // Send
    async function sendMessage() {
      const message = chatInput.value.trim();
      if (!message) return;
  const curUser = window.auth?.currentUser;
      if (!curUser) { console.error('User not authenticated'); return; }

  const userPhoto = curUser.photo_url || curUser.photoURL || null;

      // Show immediately
  addMessage(message, 'sent', null, curUser.name || curUser.email, userPhoto, curUser.id);
      chatInput.value = '';

      // Send to backend
      try {
        const token = await window.getIdToken();
        const response = await fetch('https://praktekdrdibya.com/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            message,
            user_id: curUser.id,
            user_name: curUser.name || curUser.email,
            user_photo: userPhoto
          })
        });
        if (!response.ok) console.error('Failed to send chat message');
      } catch (err) {
        console.error('Error sending chat message:', err);
      }
    }
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

        // Load chat history
        async function loadChatHistory() {
            try {
                const token = await window.getIdToken();
                const response = await fetch('https://praktekdrdibya.com/api/chat/messages', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.data) {
                        messagesContainer.innerHTML = '';
                        resetChatState(); // Reset block tracking
            result.data.forEach(msg => {
              const type = msg.user_id === user.id ? 'sent' : 'received';
              addMessage(msg.message, type, msg.created_at, msg.user_name, msg.user_photo, msg.user_id);
                        });
                    }
                }
            } catch (error) {
                console.error('Error loading chat history:', error);
                messagesContainer.innerHTML = '<div class="text-center text-muted p-3">Gagal memuat riwayat chat</div>';
            }
        }

    // Add message with avatar support
    function addMessage(text, type, timestamp = null, userName = null, userPhoto = null, userId = null) {
      const time = timestamp
        ? new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
        : new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' });

      const isSelf = type === 'sent';
      const isBlockStart = lastSender !== userName;
      lastSender = userName;

      if (userId && userPhoto) {
        userPhotoCache.set(userId, userPhoto);
      }

      // Color for name and avatar
      const nameColor = isSelf ? '#dbeafe' : colorFromName(userName || '');
      const avatarBg = isSelf ? '#111827' : colorFromName(userName || '');

      let messageHTML = `<div class="chat-message ${type}">`;

      // Avatar for all messages (only at block start)
      if (isBlockStart) {
        if (isSelf) {
          messageHTML += `<div class="chat-avatar-spacer"></div>`;
        } else {
          const photoUrl = userPhoto || (userId ? userPhotoCache.get(userId) : null);

          if (photoUrl) {
            messageHTML += `<div class="chat-avatar" title="${escapeHtml(userName || '')}"><img src="${photoUrl}" alt="${escapeHtml(userName || '')}"></div>`;
          } else {
            const initials = getInitials(userName || '');
            messageHTML += `<div class="chat-avatar" style="background: ${avatarBg}" title="${escapeHtml(userName || '')}">${initials}</div>`;
          }
        }
      } else {
        messageHTML += `<div class="chat-avatar-spacer"></div>`;
      }

      // Message bubble
      messageHTML += `
        <div class="chat-message-wrapper">
          <div class="chat-message-content">
            ${isBlockStart && userName && !isSelf ? `<div class="chat-name" style="color:${nameColor}">${escapeHtml(userName)}</div>` : ''}
            <span class="chat-text" style="text-align: ${isSelf ? 'right' : 'left'}">${escapeHtml(text)}</span>
            <div class="chat-message-time">${time}</div>
          </div>
        </div>
      </div>`;

      messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // Badge if closed + received
      if (!isChatOpen && type === 'received') {
        const currentCount = parseInt(chatBadge.textContent) || 0;
        chatBadge.textContent = currentCount + 1;
        chatBadge.style.display = 'block';
      }
    }
    
    // Reset last sender when loading history
    function resetChatState() {
      lastSender = null;
    }

    // Escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text == null ? '' : String(text);
      return div.innerHTML;
    }

        // Listen for real-time chat messages via Socket.IO
        if (window.socket) {
      window.socket.on('chat:message', (data) => {
        if (data.user_id !== user.id) {
          addMessage(data.message, 'received', data.created_at, data.user_name, data.user_photo, data.user_id);
                }
            });
        }

        // Expose addMessage globally for external use
        window.addChatMessage = addMessage;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChatPopup);
    } else {
        initChatPopup();
    }

})();
