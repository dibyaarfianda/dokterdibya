# Billing Real-time Notification Debugging Guide

## Status Saat Ini

### ✅ Backend (Working)
- Socket.IO server running
- Broadcast berhasil ke 4 clients
- Log menunjukkan: `[RealTimeSync] Broadcasted revision_requested to 4 clients`

### ❌ Frontend (Not Working)
- Event tidak sampai ke client atau listener tidak trigger
- Dialog tidak muncul di dokter

## Cara Debug di Browser

### 1. Buka Browser Console (F12)

**Di Browser Dokter:**
```
Cari log berikut:
- [SundayClinic] Real-time billing notifications initialized
- [SundayClinic] Setting up billing event listeners  
- [BillingNotifications] Socket.IO connected, socket ID: xxx
```

Jika tidak ada log di atas, berarti:
- Module tidak ter-load
- Class tidak ter-instantiate
- Socket.IO client tidak connect

### 2. Manual Test Socket.IO di Console

Paste di console browser:
```javascript
// Cek apakah Socket.IO loaded
console.log('io available?', typeof io !== 'undefined');

// Cek apakah realtimeSync exists
console.log('realtimeSync:', window.realtimeSync);

// Cek socket connection
if (window.realtimeSync && window.realtimeSync.socket) {
    console.log('Socket connected?', window.realtimeSync.socket.connected);
    console.log('Socket ID:', window.realtimeSync.socket.id);
}

// Manual listen test
if (typeof io !== 'undefined') {
    const testSocket = io();
    testSocket.on('connect', () => console.log('TEST: Socket connected!'));
    testSocket.on('revision_requested', (data) => console.log('TEST: Got revision_requested:', data));
}
```

### 3. Test Broadcast Manually

Di terminal server:
```bash
# Watch logs in real-time
pm2 logs sunday-clinic --lines 20
```

Lalu ajukan perubahan dari browser user. Seharusnya muncul:
```
[RealTimeSync] Broadcasted revision_requested to X clients
```

### 4. Check Network Tab

1. Buka DevTools → Network tab
2. Filter: "socket.io"
3. Refresh page
4. Cari request ke `/socket.io/?EIO=4&transport=polling`
5. Status harus 200 OK

## Kemungkinan Masalah

### A. Socket.IO Client Tidak Loaded
**Symptom:** `typeof io === 'undefined'`
**Fix:** Pastikan di HTML ada `<script src="/socket.io/socket.io.js"></script>` SEBELUM script lainnya

### B. Module Tidak Ter-import
**Symptom:** `window.realtimeSync === undefined`
**Check:** 
```javascript
console.log('BillingNotifications imported?', typeof BillingNotifications);
```

### C. Event Listener Tidak Setup
**Symptom:** Socket connected tapi event tidak diterima
**Check:**
```javascript
// Di console, trigger manual
window.realtimeSync.broadcast({
    type: 'revision_requested',
    mrId: 'TEST',
    patientName: 'Test',
    message: 'test'
});
```

### D. Browser Cache
**Fix:** Hard refresh
- Chrome: Ctrl+Shift+R
- Firefox: Ctrl+Shift+R
- Clear cache completely

## Quick Fix Commands

```bash
# Reset state
mysql -u root -pDibyaKlinik2024! dibyaklinik -e "UPDATE sunday_clinic_billings SET status = 'draft', confirmed_at = NULL, confirmed_by = NULL WHERE mr_id = 'DRD0001'"

# Restart backend
pm2 restart sunday-clinic

# Watch logs
pm2 logs sunday-clinic --lines 50
```

## Test Sequence

1. **Refresh kedua browser (hard refresh)**
2. **Browser Dokter:** Buka console, verify Socket.IO connected
3. **Browser User:** Buka console, verify Socket.IO connected  
4. **User:** Ajukan perubahan
5. **Check PM2 log:** Harus ada "Broadcasted revision_requested to X clients"
6. **Browser Dokter console:** Harus ada log menerima event
7. **Dialog:** Harus muncul

## Contact Point

Jika setelah debug masih tidak jalan:
1. Screenshot browser console (F12)
2. Copy semua log dari console
3. Screenshot Network tab → socket.io requests
4. Kirim ke developer

---

Last updated: 2025-11-24
