# Prompt: Fix Badge Lonceng (Bell Notification) Tidak Hilang Setelah Notifikasi Dibaca

## Konteks

Portal pasien DokterDibya memiliki badge lonceng (bell notification) di navbar yang menunjukkan jumlah notifikasi yang belum dibaca. Badge ini tetap menunjukkan angka meskipun pasien sudah membuka halaman notifikasi dan semua notifikasi sudah ditandai "dibaca" (Belum Dibaca: 0).

---

## Akar Masalah

### 1. Fetch tanpa cache-busting

Fungsi `loadNotificationCount()` di `patient-menu.html` melakukan fetch ke `/api/patient-notifications/count` **tanpa cache-busting parameter**. Browser atau service worker bisa menyajikan response lama (cached).

**Perbandingan:**
```javascript
// loadUnreadDocCounts — BENAR (pakai cache-busting)
const response = await fetch('/api/patient-documents/unread-counts?_t=' + Date.now(), {
    headers: { 'Authorization': 'Bearer ' + token }
});

// loadNotificationCount — SALAH (tanpa cache-busting)
const response = await fetch('/api/patient-notifications/count', {
    headers: { 'Authorization': 'Bearer ' + token }
});
```

### 2. Backend tidak kirim no-cache headers

Endpoint `GET /api/patient-notifications/count` tidak mengirim header anti-cache. Sesuai aturan project, patient-facing API endpoint **harus** kirim no-cache headers.

---

## File yang Perlu Dimodifikasi

### 1. Frontend: `public/patient-menu.html`

**Lokasi:** Fungsi `loadNotificationCount()` sekitar line 2144

**Kode SAAT INI:**
```javascript
        async function loadNotificationCount() {
            const token = getToken();
            try {
                const response = await fetch('/api/patient-notifications/count', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await response.json();
                const badge = document.getElementById('notif-badge');

                if (data.success && data.count > 0) {
                    badge.textContent = data.count > 99 ? '99+' : data.count;
                    badge.style.display = 'flex';
                } else if (badge) {
                    badge.style.display = 'none';
                }
            } catch (error) {
                // Silently fail
            }
        }
```

**Ubah menjadi:**
```javascript
        async function loadNotificationCount() {
            const token = getToken();
            try {
                const response = await fetch('/api/patient-notifications/count?_t=' + Date.now(), {
                    headers: { 'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache' }
                });
                const data = await response.json();
                const badge = document.getElementById('notif-badge');

                if (data.success && data.count > 0) {
                    badge.textContent = data.count > 99 ? '99+' : data.count;
                    badge.style.display = 'flex';
                } else if (badge) {
                    badge.style.display = 'none';
                }
            } catch (error) {
                // Silently fail
            }
        }
```

**Perubahan:**
- Tambah `?_t=' + Date.now()` ke URL untuk cache-busting
- Tambah `'Cache-Control': 'no-cache'` di headers

---

### 2. Backend: `staff/backend/routes/patient-notifications.js`

**Lokasi:** Handler `GET /count` sekitar line 61

**Kode SAAT INI:**
```javascript
router.get('/count', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        const [countResult] = await db.query(
            'SELECT COUNT(*) as count FROM patient_notifications WHERE patient_id = ? AND is_read = 0',
            [patientId]
        );

        res.json({
            success: true,
            count: countResult[0].count
        });

    } catch (error) {
        console.error('Error fetching patient notification count:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil jumlah notifikasi' });
    }
});
```

**Ubah menjadi:**
```javascript
router.get('/count', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        const [countResult] = await db.query(
            'SELECT COUNT(*) as count FROM patient_notifications WHERE patient_id = ? AND is_read = 0',
            [patientId]
        );

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.json({
            success: true,
            count: countResult[0].count
        });

    } catch (error) {
        console.error('Error fetching patient notification count:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil jumlah notifikasi' });
    }
});
```

**Perubahan:**
- Tambah 3 baris no-cache headers sebelum `res.json()`

---

### 3. PWA Cache: `public/sw.js`

**Bump `CACHE_VERSION`** supaya pasien yang sudah install PWA mendapatkan file JavaScript terbaru:

```javascript
// Ubah dari:
const CACHE_VERSION = '20260322e';

// Menjadi:
const CACHE_VERSION = '20260322f';
```

---

## Deployment

Setelah edit semua file:

```bash
git add public/patient-menu.html staff/backend/routes/patient-notifications.js public/sw.js
git commit -m "Fix bell notification badge cache - add cache-busting and no-cache headers"
git push origin main
ssh root@dokterdibya.com "cd /var/www/dokterdibya && git pull origin main && pm2 restart all"
```

## Verifikasi

1. Buka portal pasien akun Nanda Ananda
2. Pastikan badge lonceng menunjukkan angka yang benar
3. Buka halaman Notifikasi → semua ditandai sudah dibaca
4. Kembali ke Home → badge lonceng harus hilang (tanpa perlu hard refresh)
