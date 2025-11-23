# Global Chat Implementation

## Overview
Chat box sekarang tersedia di **semua halaman staff** dan tetap terkoneksi saat berpindah halaman.

## Features
✅ **Persistent Connection** - Socket.IO tetap connect di semua halaman
✅ **Real-time Messaging** - Pesan instant antar staff
✅ **Popup Widget** - Floating button di kanan bawah
✅ **Unread Badge** - Counter notifikasi pesan baru
✅ **Sound Notifications** - Suara saat kirim/terima pesan
✅ **Chat History** - Muat riwayat chat otomatis
✅ **Multi-role Support** - Dokter, admin, staff semua bisa chat

## Implementation

### Files Modified
1. **`/staff/public/scripts/global-chat-loader.js`** (NEW)
   - Global loader script
   - Auth compatibility layer
   - Socket.IO checker
   - Auto-loads chat-popup.js

2. **HTML Pages Updated:**
   - index-adminlte.html
   - sunday-clinic.html
   - kelola-pasien.html
   - kelola-tindakan.html
   - kelola-obat.html
   - kelola-appointment.html
   - kelola-jadwal.html
   - kelola-announcement.html
   - patient-intake-review.html
   - medical-record.html
   - finance-analysis.html
   - management.html
   - profile-settings.html
   - appointment-archive.html

### How It Works

1. **Page Load:**
   ```
   Page loads → global-chat-loader.js runs
   → Sets up auth context
   → Loads Socket.IO (if not loaded)
   → Loads chat-popup.js
   → Chat widget appears
   ```

2. **Auth Setup:**
   ```javascript
   window.auth.currentUser = {
       uid: staffId,
       name: staffName,
       role: staffRole,
       email: staffEmail
   }
   ```

3. **Socket.IO Connection:**
   - Reuses existing Socket.IO from page
   - Or creates new connection
   - Persistent across page navigation

4. **Chat API:**
   - GET `/api/chat` - Load history
   - POST `/api/chat` - Send message
   - Socket events: `new-message`, `user-typing`

## Usage

### For Users
1. Click floating button (💬) di kanan bawah
2. Type message and press Enter or click Send
3. Chat history loaded otomatis
4. Unread count shown di badge
5. Sound notification saat ada pesan baru

### For Developers

**Check if chat loaded:**
```javascript
console.log('Chat loaded?', window.chatPopupLoaded);
```

**Manual trigger:**
```javascript
// Open chat
document.getElementById('chat-toggle-btn').click();

// Send message programmatically
window.sendChatMessage?.('Hello from code!');
```

**Listen to chat events:**
```javascript
// Chat opened
document.addEventListener('chat-opened', () => {
    console.log('Chat box opened');
});

// Chat closed
document.addEventListener('chat-closed', () => {
    console.log('Chat box closed');
});

// New message received
document.addEventListener('chat-message-received', (e) => {
    console.log('New message:', e.detail);
});
```

## Installation Script

To add chat to new pages:
```bash
/var/www/dokterdibya/install-global-chat.sh
```

Or manually add before `</body>`:
```html
<!-- Global Chat Loader -->
<script src="/staff/public/scripts/global-chat-loader.js"></script>
```

## Requirements

1. **Socket.IO**: Must be loaded (auto-loaded if not present)
2. **Authentication**: Token in localStorage/sessionStorage
3. **Backend**: Chat API routes must be available
4. **Role**: Any authenticated staff role

## Backend Routes

- `GET /api/chat` - Load chat history
- `POST /api/chat` - Send message
- Socket.IO namespace: default (`/`)
- Socket events:
  - `chat:message` (server → client)
  - `new-message` (server → client)
  - `user-typing` (bidirectional)

## Troubleshooting

### Chat Not Appearing
1. Check browser console for errors
2. Verify token exists: `localStorage.getItem('token')`
3. Check Socket.IO loaded: `typeof io !== 'undefined'`
4. Check auth set: `window.auth?.currentUser`

### Messages Not Sending
1. Check Socket.IO connected: `io().connected`
2. Check auth token valid
3. Check backend running
4. Check network tab for API errors

### No Sound Notifications
1. Browser may block autoplay
2. Check audio files exist:
   - `/staff/public/sounds/send.mp3`
   - `/staff/public/sounds/incoming.mp3`
3. User must interact with page first (browser policy)

## Future Enhancements

- [ ] File sharing
- [ ] Image upload
- [ ] Voice messages
- [ ] Video call
- [ ] Group chats
- [ ] Chat rooms per patient
- [ ] Message reactions
- [ ] Message search
- [ ] Chat archive
- [ ] Admin moderation

---

Last updated: 2025-11-24
