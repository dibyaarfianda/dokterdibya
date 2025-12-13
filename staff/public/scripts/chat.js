import { getIdToken } from './vps-auth-v2.js';

const CHAT_EDGE_THRESHOLD_PX = 4; // when mouse near right edge
const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

// Popular emojis for quick access
const EMOJI_LIST = [
    '😊', '😂', '❤️', '👍', '👏', '🙏', '💯', '🔥', '✨', '🎉',
    '😍', '🤗', '😎', '🤔', '😅', '😢', '😭', '😡', '🥰', '😘',
    '👋', '✌️', '🤝', '💪', '🙌', '👌', '🤞', '🎊', '🎈', '🎁',
    '💊', '💉', '🏥', '⚕️', '🩺', '📋', '📝', '📅', '⏰', '✅',
    '❌', '⚠️', '🔔', '📞', '💬', '📧', '🔍', '📊', '📈', '💰',
    '🌟', '⭐', '🌈', '☀️', '🌙', '💡', '🎯', '✔️', '➕', '➖'
];

// Import Socket.io client dynamically
let io = null;
let chatInitialized = false;

function $(id) { return document.getElementById(id); }

function openChat() {
    const panel = $('chat-slide'); if (!panel) return;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
}
function closeChat() {
    const panel = $('chat-slide'); if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
}
function toggleChat() {
    const panel = $('chat-slide'); if (!panel) return;
    if (panel.classList.contains('open')) closeChat(); else openChat();
}

function colorFromName(name) {
    // Hash simple to lighter HSL colors for better readability
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    // Use higher lightness (75%) and saturation (85%) for more vibrant, readable colors
    return `hsl(${hue}, 85%, 75%)`;
}

function renderMessage(list, { text, name, time, me }) {
    const el = document.createElement('div');
    el.className = `chat-msg ${me ? 'me' : 'other'}`;
    const nameColor = me ? '#e0e7ff' : colorFromName(name || 'User');
    const ts = time instanceof Date ? time : new Date();
    
    // Convert text emoticons to emojis
    const enhancedText = enhanceTextWithEmojis(text);
    
    el.innerHTML = `
        <div class="chat-meta">
            <span class="chat-name" style="color:${nameColor}">${name || (me ? 'Saya' : 'User')}</span>
            <span style="color: rgba(255,255,255,0.7); font-size: 11px;">${ts.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</span>
        </div>
        <div style="line-height: 1.6; font-size: 15px; color: #ffffff;">${enhancedText}</div>
    `;
    list.appendChild(el);
    // trigger appear animation
    requestAnimationFrame(() => el.classList.add('appear'));
}

function enhanceTextWithEmojis(text) {
    // Convert common emoticons to emojis
    const emoticons = {
        ':)': '😊', '(:': '😊', ':D': '😃', ':d': '😃',
        ':(': '😢', '):': '😢', ';)': '😉', ':P': '😛',
        ':p': '😛', '<3': '❤️', '</3': '💔', ':*': '😘',
        'XD': '😆', 'xD': '😆', 'xd': '😆', ':o': '😮',
        ':O': '😮', '-_-': '😑', '^_^': '😊', '>:(': '😠',
        ':thumbsup:': '👍', ':fire:': '🔥', ':star:': '⭐',
        ':heart:': '❤️', ':check:': '✅', ':x:': '❌'
    };
    
    let enhanced = text;
    for (const [emoticon, emoji] of Object.entries(emoticons)) {
        enhanced = enhanced.replace(new RegExp(escapeRegExp(emoticon), 'g'), emoji);
    }
    return enhanced;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function initChatSlide() {
    if (chatInitialized) return; // Prevent duplicate initialization
    chatInitialized = true;
    
    const tab = $('chat-tab');
    const closeBtn = $('chat-close-btn');
    const form = $('chat-mini-form');
    const input = $('chat-mini-input');
    const list = $('chat-messages-list');
    const panel = $('chat-slide');
    const emojiToggleBtn = $('emoji-toggle-btn');
    const emojiPicker = $('emoji-picker');
    const emojiGrid = $('emoji-grid');
    const typingIndicator = $('typing-indicator');
    let autoCloseTimer = null;
    let typingTimeout = null;

    // Initialize emoji picker
    if (emojiGrid) {
        EMOJI_LIST.forEach(emoji => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'emoji-btn';
            btn.textContent = emoji;
            btn.title = emoji;
            btn.addEventListener('click', () => {
                input.value += emoji;
                input.focus();
                emojiPicker.classList.remove('show');
            });
            emojiGrid.appendChild(btn);
        });
    }

    // Toggle emoji picker
    if (emojiToggleBtn && emojiPicker) {
        emojiToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            emojiPicker.classList.toggle('show');
        });

        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && e.target !== emojiToggleBtn) {
                emojiPicker.classList.remove('show');
            }
        });
    }

    if (tab) tab.addEventListener('click', toggleChat);
    if (closeBtn) closeBtn.addEventListener('click', closeChat);

    // Edge detection: open when mouse hits right edge
    window.addEventListener('mousemove', (e) => {
        try {
            const fromRight = window.innerWidth - e.clientX;
            if (fromRight <= CHAT_EDGE_THRESHOLD_PX) {
                openChat();
            }
        } catch (err) {}
    });

    // Use existing socket from realtime-sync.js
    // DO NOT create our own socket - use window.socket from realtime-sync
    try {
        if (window.socket) {
            io = window.socket;
            window.socketIoInstance = io; // For backwards compatibility
            console.log('Chat using existing socket from realtime-sync');
        } else if (!window.socketIoInstance) {
            console.warn('Chat: Socket not ready yet - realtime features may be delayed');
            // Fallback: poll for socket availability
            const checkInterval = setInterval(() => {
                if (window.socket) {
                    clearInterval(checkInterval);
                    io = window.socket;
                    window.socketIoInstance = io;
                    console.log('Chat: Socket now available from realtime-sync');
                }
            }, 500);
            setTimeout(() => clearInterval(checkInterval), 10000);
        } else {
            io = window.socketIoInstance;
            console.log('Chat using existing socketIoInstance');
        }
        
        // Load chat history
        await loadChatHistory(list);
        
        // Listen for new messages from other users
        io.on('newMessage', (message) => {
            const isMe = message.user_id === window.currentUserId;
            const ts = new Date(message.timestamp);
            renderMessage(list, {
                text: message.message,
                name: message.user_name,
                time: ts,
                me: isMe
            });
            list.scrollTop = list.scrollHeight;
            
            // Play sound for incoming messages from others
            if (!isMe) {
                const incomingAudio = document.getElementById('chat-incoming-sound');
                playForce(incomingAudio);
            }
        });

        // Listen for typing indicators
        io.on('userTyping', (data) => {
            if (data.user_id !== window.currentUserId && typingIndicator) {
                typingIndicator.classList.add('show');
            }
        });

        io.on('userStoppedTyping', (data) => {
            if (typingIndicator) {
                typingIndicator.classList.remove('show');
            }
        });
        
        io.on('disconnect', () => {
            console.log('Chat WebSocket disconnected');
        });
    } catch (err) {
        console.error('Failed to load Socket.io:', err);
        // Fallback to local echo mode
        list.innerHTML = '<div class="chat-msg other">Chat server unavailable. Local mode only.</div>';
    }

    const sendAudio = document.getElementById('chat-send-sound');
    const incomingAudio = document.getElementById('chat-incoming-sound');

    function playForce(audioEl) {
        if (!audioEl || !audioEl.play) return;
        try { audioEl.currentTime = 0; } catch(e) {}
        const p = audioEl.play();
        if (p && typeof p.catch === 'function') {
            p.catch(() => {
                // try again on next user gesture
                const retry = () => {
                    audioEl.play().catch(()=>{});
                    document.removeEventListener('pointerdown', retry);
                    document.removeEventListener('keydown', retry);
                    document.removeEventListener('click', retry);
                };
                document.addEventListener('pointerdown', retry, { once: true });
                document.addEventListener('keydown', retry, { once: true });
                document.addEventListener('click', retry, { once: true });
            });
        }
    }

    if (form && input && list) {
        // Show typing indicator when user is typing
        input.addEventListener('input', () => {
            clearTimeout(typingTimeout);
            if (io && input.value.trim()) {
                io.emit('typing', {
                    user_id: window.currentUserId || 'guest',
                    user_name: window.currentUserName || 'User'
                });
            }
            typingTimeout = setTimeout(() => {
                if (io) {
                    io.emit('stopTyping', {
                        user_id: window.currentUserId || 'guest'
                    });
                }
            }, 1000);
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;
            
            // Stop typing indicator
            clearTimeout(typingTimeout);
            if (io) {
                io.emit('stopTyping', {
                    user_id: window.currentUserId || 'guest'
                });
            }
            
            // Send message via API
            try {
                const response = await fetch(`${VPS_API_BASE}/api/chat/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: window.currentUserId || 'guest',
                        user_name: window.currentUserName || 'User',
                        message: text
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to send message');
                }
            } catch (err) {
                console.error('Failed to send message:', err);
                // Render locally anyway
                renderMessage(list, { text, name: 'Saya', time: new Date(), me: true });
            }
            
            input.value = '';
            list.scrollTop = list.scrollHeight;
            playForce(sendAudio);
            
            // Close emoji picker if open
            if (emojiPicker) emojiPicker.classList.remove('show');
        });
    }

    // Auto-close if cursor leaves panel for > 1 second
    function scheduleAutoClose() {
        if (!panel || !panel.classList.contains('open')) return;
        clearTimeout(autoCloseTimer);
        autoCloseTimer = setTimeout(() => {
            const active = document.activeElement;
            if (active === input) return;
            closeChat();
        }, 1000);
    }
    function cancelAutoClose() {
        clearTimeout(autoCloseTimer);
    }
    if (panel) {
        panel.addEventListener('mouseenter', cancelAutoClose);
        panel.addEventListener('mouseleave', scheduleAutoClose);
    }
    if (input) {
        input.addEventListener('focus', cancelAutoClose);
        input.addEventListener('blur', scheduleAutoClose);
    }
}

// Load chat history from server
async function loadChatHistory(list) {
    try {
        const token = await getIdToken();
        if (!token) return;
        
        const response = await fetch(`${VPS_API_BASE}/api/chat/messages?limit=50`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        
        const result = await response.json();
        if (!result.success || !result.data) return;
        
        // Clear existing messages (except welcome)
        const welcomeMsg = list.querySelector('.chat-msg.other');
        list.innerHTML = '';
        if (welcomeMsg) list.appendChild(welcomeMsg);
        
        // Render history
        result.data.forEach(msg => {
            const isMe = msg.user_id === window.currentUserId;
            const ts = new Date(msg.timestamp);
            renderMessage(list, {
                text: msg.message,
                name: msg.user_name,
                time: ts,
                me: isMe
            });
        });
        
        list.scrollTop = list.scrollHeight;
    } catch (err) {
        console.error('Failed to load chat history:', err);
    }
}


