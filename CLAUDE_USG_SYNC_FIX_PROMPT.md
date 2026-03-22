# Prompt: Fix USG Photo Sync Between Staff DRD and Patient Portal

## Konteks

Sistem DokterDibya memiliki dua portal:
1. **Staff Portal** (`staff/public/`) — Dokter mengisi DRD (rekam medis) termasuk upload/hapus foto USG
2. **Patient Portal** (`public/`) — Pasien melihat foto USG yang sudah dipublish di Album USG

Saat dokter **upload** foto USG baru, foto otomatis muncul di portal pasien (auto-publish sudah bekerja). Tapi saat dokter **menghapus** foto USG (baik hapus satu per satu maupun Reset All USG), foto tetap muncul di portal pasien — **tidak tersinkronisasi**.

---

## Akar Masalah

Ada **dua endpoint** untuk menyimpan data USG:

| Endpoint | File | Auto-Publish? |
|----------|------|---------------|
| `POST /api/sunday-clinic/records/:mrId/usg` | `staff/backend/routes/sunday-clinic.js` | **YA** — Otomatis sync ke `patient_documents` |
| `POST /api/medical-records` | `staff/backend/routes/medical-records.js` | **TIDAK** — Hanya simpan ke `medical_records` |

### Gap 1: `removePhoto()` menggunakan endpoint yang SALAH

Tiga komponen frontend USG (ginekologi, obstetri, gyn_repro) memiliki fungsi `savePhotosToDatabase()` yang dipanggil setelah `removePhoto()`. Fungsi ini mengirim ke `POST /api/medical-records` yang **TIDAK** memiliki logic auto-publish, sehingga foto yang dihapus staff tetap ada di `patient_documents`.

### Gap 2: Reset All USG tidak membersihkan `patient_documents`

Endpoint `DELETE /api/medical-records/by-type/usg` hanya menghapus dari tabel `medical_records`, tidak membersihkan entri terkait di `patient_documents`.

---

## File yang Perlu Dimodifikasi

### Frontend (3 file — pola yang sama)

1. **`staff/public/scripts/sunday-clinic/components/shared/usg-ginekologi.js`**
   - Fungsi `savePhotosToDatabase()` di line ~893
2. **`staff/public/scripts/sunday-clinic/components/obstetri/usg-obstetri.js`**
   - Fungsi `savePhotosToDatabase()` di line ~1216
3. **`staff/public/scripts/sunday-clinic/components/gyn_repro/usg-gyn_repro.js`**
   - Fungsi `savePhotosToDatabase()` di line ~148

### Backend (1 file)

4. **`staff/backend/routes/medical-records.js`**
   - Handler `DELETE /api/medical-records/by-type/:recordType` di line ~512

---

## Instruksi Implementasi Detail

### STEP 1: Fix `savePhotosToDatabase()` di usg-ginekologi.js

**Lokasi:** `staff/public/scripts/sunday-clinic/components/shared/usg-ginekologi.js`

**Kode SAAT INI (line ~893):**
```javascript
async savePhotosToDatabase(photos) {
    try {
        const state = stateManager.getState();
        const patientId = state.derived?.patientId ||
                         state.recordData?.patientId ||
                         state.patientData?.id;
        const mrId = state.currentMrId ||
                    state.recordData?.mrId ||
                    state.recordData?.mr_id;

        if (!patientId || !mrId) {
            console.warn('[USG] Patient ID or MR ID not found, skipping database save');
            return;
        }

        const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
        if (!token) {
            console.warn('[USG] No auth token, skipping database save');
            return;
        }

        // Get current USG data from state
        const usg = state.recordData?.usg || {};

        const response = await fetch('/api/medical-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                patientId: patientId,
                visitId: mrId,
                type: 'usg',
                data: {
                    ...usg,
                    photos: photos
                },
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[USG] Failed to save photos to database:', errText);
        } else {
            console.log('[USG] Photos saved to database successfully');
        }
    } catch (error) {
        console.error('[USG] Error saving photos to database:', error);
    }
},
```

**Ubah menjadi:**
```javascript
async savePhotosToDatabase(photos) {
    try {
        const state = stateManager.getState();
        const patientId = state.derived?.patientId ||
                         state.recordData?.patientId ||
                         state.patientData?.id;
        const mrId = state.currentMrId ||
                    state.recordData?.mrId ||
                    state.recordData?.mr_id;

        if (!patientId || !mrId) {
            console.warn('[USG] Patient ID or MR ID not found, skipping database save');
            return;
        }

        const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
        if (!token) {
            console.warn('[USG] No auth token, skipping database save');
            return;
        }

        // Get current USG data from state
        const usg = state.recordData?.usg || {};

        // Use sunday-clinic endpoint which has auto-publish logic
        // This ensures patient_documents is synced when photos are added/removed
        const response = await fetch(`/api/sunday-clinic/records/${mrId}/usg`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                ...usg,
                photos: photos
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[USG] Failed to save photos to database:', errText);
        } else {
            console.log('[USG] Photos saved to database successfully (with auto-publish)');
        }
    } catch (error) {
        console.error('[USG] Error saving photos to database:', error);
    }
},
```

**Perubahan kunci:**
- Endpoint: `/api/medical-records` → `/api/sunday-clinic/records/${mrId}/usg`
- Body: `{ patientId, visitId, type, data: { ...usg, photos }, timestamp }` → `{ ...usg, photos }`
- Endpoint sunday-clinic menerima `req.body` langsung sebagai `data`, dan membaca `data.photos` untuk auto-publish

---

### STEP 2: Fix `savePhotosToDatabase()` di usg-obstetri.js

**Lokasi:** `staff/public/scripts/sunday-clinic/components/obstetri/usg-obstetri.js`

**Kode SAAT INI (line ~1216):**
```javascript
async savePhotosToDatabase(photos) {
    try {
        const { default: stateManager } = await import('../../utils/state-manager.js');
        const state = stateManager.getState();
        const patientId = state.derived?.patientId || state.recordData?.patientId || state.patientData?.id;
        const mrId = state.currentMrId || state.recordData?.mrId || state.recordData?.mr_id;

        if (!patientId || !mrId) return;

        const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
        if (!token) return;

        // Get existing USG data
        const { getMedicalRecordContext } = await import('../../utils/helpers.js');
        const context = getMedicalRecordContext(state, 'usg');
        const existingData = context?.data || {};

        await fetch('/api/medical-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                patientId,
                visitId: mrId,
                type: 'usg',
                data: { ...existingData, photos },
                timestamp: new Date().toISOString()
            })
        });
        console.log('[USG Obstetri] Photos saved to database');
    } catch (error) {
        console.error('[USG Obstetri] Error saving photos:', error);
    }
},
```

**Ubah menjadi:**
```javascript
async savePhotosToDatabase(photos) {
    try {
        const { default: stateManager } = await import('../../utils/state-manager.js');
        const state = stateManager.getState();
        const patientId = state.derived?.patientId || state.recordData?.patientId || state.patientData?.id;
        const mrId = state.currentMrId || state.recordData?.mrId || state.recordData?.mr_id;

        if (!patientId || !mrId) return;

        const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
        if (!token) return;

        // Get existing USG data
        const { getMedicalRecordContext } = await import('../../utils/helpers.js');
        const context = getMedicalRecordContext(state, 'usg');
        const existingData = context?.data || {};

        // Use sunday-clinic endpoint which has auto-publish logic
        await fetch(`/api/sunday-clinic/records/${mrId}/usg`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                ...existingData,
                photos
            })
        });
        console.log('[USG Obstetri] Photos saved to database (with auto-publish)');
    } catch (error) {
        console.error('[USG Obstetri] Error saving photos:', error);
    }
},
```

---

### STEP 3: Fix `savePhotosToDatabase()` di usg-gyn_repro.js

**Lokasi:** `staff/public/scripts/sunday-clinic/components/gyn_repro/usg-gyn_repro.js`

**Kode SAAT INI (line ~148):**
```javascript
async function savePhotosToDatabase(photos) {
    try {
        const state = stateManager.getState();
        const patientId = state.derived?.patientId || state.recordData?.patientId || state.patientData?.id;
        const mrId = state.currentMrId || state.recordData?.mrId || state.recordData?.mr_id;

        if (!patientId || !mrId) return;

        const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
        if (!token) return;

        const context = getMedicalRecordContext(state, 'usg');
        const existingData = context?.data || {};

        await fetch('/api/medical-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                patientId,
                visitId: mrId,
                type: 'usg',
                data: { ...existingData, photos },
                timestamp: new Date().toISOString()
            })
        });
        console.log('[USG GynRepro] Photos saved to database');
    } catch (error) {
        console.error('[USG GynRepro] Error saving photos:', error);
    }
}
```

**Ubah menjadi:**
```javascript
async function savePhotosToDatabase(photos) {
    try {
        const state = stateManager.getState();
        const patientId = state.derived?.patientId || state.recordData?.patientId || state.patientData?.id;
        const mrId = state.currentMrId || state.recordData?.mrId || state.recordData?.mr_id;

        if (!patientId || !mrId) return;

        const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
        if (!token) return;

        const context = getMedicalRecordContext(state, 'usg');
        const existingData = context?.data || {};

        // Use sunday-clinic endpoint which has auto-publish logic
        await fetch(`/api/sunday-clinic/records/${mrId}/usg`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                ...existingData,
                photos
            })
        });
        console.log('[USG GynRepro] Photos saved to database (with auto-publish)');
    } catch (error) {
        console.error('[USG GynRepro] Error saving photos:', error);
    }
}
```

---

### STEP 4: Fix Reset USG cleanup di medical-records.js

**Lokasi:** `staff/backend/routes/medical-records.js`

**Kode SAAT INI (line ~512):**
```javascript
router.delete('/api/medical-records/by-type/:recordType', verifyToken, async (req, res) => {
    try {
        const { recordType } = req.params;
        const { patientId, mrId } = req.query;
        
        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID is required'
            });
        }
        
        // Build query - if mrId provided, use it; otherwise delete all for patient+type
        let query = 'DELETE FROM medical_records WHERE patient_id = ? AND record_type = ?';
        let params = [patientId, recordType];
        
        if (mrId && mrId !== 'null' && mrId !== 'undefined') {
            query += ' AND (mr_id = ? OR mr_id IS NULL)';
            params.push(mrId);
        }
        
        console.log('DELETE Query:', query);
        console.log('DELETE Params:', params);
        
        const [result] = await db.query(query, params);
        
        console.log('DELETE Result:', result.affectedRows, 'rows deleted');
        logger.info(`Medical records deleted: Type ${recordType}, Patient ${patientId}, MR ${mrId || 'none'}, Count: ${result.affectedRows}`);

        // Log activity
        if (result.affectedRows > 0) {
            await activityLogger.logFromRequest(req, activityLogger.ACTIONS.DELETE_MR,
                `Deleted ${result.affectedRows} ${recordType} record(s) for MR: ${mrId || 'N/A'}`);
        }

        res.json({
            success: true,
            message: `${result.affectedRows} record(s) deleted successfully`,
            deletedCount: result.affectedRows
        });

    } catch (error) {
        logger.error('Error deleting medical records by type:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete medical records',
            error: error.message 
        });
    }
});
```

**Ubah menjadi:**
```javascript
router.delete('/api/medical-records/by-type/:recordType', verifyToken, async (req, res) => {
    try {
        const { recordType } = req.params;
        const { patientId, mrId } = req.query;
        
        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID is required'
            });
        }
        
        // Build query - if mrId provided, use it; otherwise delete all for patient+type
        let query = 'DELETE FROM medical_records WHERE patient_id = ? AND record_type = ?';
        let params = [patientId, recordType];
        
        if (mrId && mrId !== 'null' && mrId !== 'undefined') {
            query += ' AND (mr_id = ? OR mr_id IS NULL)';
            params.push(mrId);
        }
        
        console.log('DELETE Query:', query);
        console.log('DELETE Params:', params);
        
        const [result] = await db.query(query, params);
        
        console.log('DELETE Result:', result.affectedRows, 'rows deleted');
        logger.info(`Medical records deleted: Type ${recordType}, Patient ${patientId}, MR ${mrId || 'none'}, Count: ${result.affectedRows}`);

        // Log activity
        if (result.affectedRows > 0) {
            await activityLogger.logFromRequest(req, activityLogger.ACTIONS.DELETE_MR,
                `Deleted ${result.affectedRows} ${recordType} record(s) for MR: ${mrId || 'N/A'}`);
        }

        // Clean up patient_documents when USG records are deleted (Reset All USG)
        if (recordType === 'usg' && result.affectedRows > 0) {
            try {
                let cleanupQuery = `DELETE FROM patient_documents WHERE patient_id = ? AND document_type IN ('usg_photo', 'usg_2d', 'usg_4d', 'patient_usg')`;
                let cleanupParams = [patientId];

                if (mrId && mrId !== 'null' && mrId !== 'undefined') {
                    cleanupQuery += ' AND mr_id = ?';
                    cleanupParams.push(mrId);
                }

                const [cleanupResult] = await db.query(cleanupQuery, cleanupParams);
                logger.info(`USG patient_documents cleaned up: Patient ${patientId}, MR ${mrId || 'all'}, Deleted: ${cleanupResult.affectedRows}`);

                // Broadcast Socket.IO event for real-time refresh on patient side
                try {
                    const realtimeSync = require('../realtime-sync');
                    realtimeSync.broadcast({
                        type: 'usg:patient_updated',
                        patient_id: patientId,
                        mr_id: mrId || null,
                        added: 0,
                        removed: cleanupResult.affectedRows
                    });
                } catch (socketErr) {
                    logger.warn('Socket broadcast error during USG cleanup:', socketErr.message);
                }
            } catch (cleanupError) {
                logger.warn('USG patient_documents cleanup warning:', cleanupError);
                // Don't fail the main delete operation
            }
        }

        res.json({
            success: true,
            message: `${result.affectedRows} record(s) deleted successfully`,
            deletedCount: result.affectedRows
        });

    } catch (error) {
        logger.error('Error deleting medical records by type:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete medical records',
            error: error.message 
        });
    }
});
```

**Perubahan kunci:**
- Setelah delete `medical_records`, jika `recordType === 'usg'`, juga hapus entri dari `patient_documents` dengan document_type USG
- Broadcast Socket.IO event `usg:patient_updated` agar portal pasien auto-refresh
- Wrapped dalam try-catch agar error cleanup tidak menggagalkan operasi utama

---

## Referensi: Auto-Publish Logic yang Sudah Bekerja

Berikut logic auto-publish di `staff/backend/routes/sunday-clinic.js` (line ~978-1050) yang sudah bekerja dengan benar saat endpoint `POST /api/sunday-clinic/records/:mrId/usg` dipanggil:

```javascript
// Auto-publish USG photos to patient portal when USG section is saved
if (section === 'usg') {
    try {
        const photos = data.photos || [];
        const patientId = recordRow.patient_id;

        // 1. Get currently published USG docs for this MR
        const [existingDocs] = await db.query(
            `SELECT id, file_url FROM patient_documents
             WHERE patient_id = ? AND mr_id = ? AND document_type = 'usg_photo' AND status = 'published'`,
            [patientId, normalizedMrId]
        );

        // 2. Build sets for comparison
        const existingUrls = new Set(existingDocs.map(d => d.file_url));
        const currentUrls = new Set(photos.map(p => p.url));

        // 3. Delete removed photos from patient_documents
        const toDelete = existingDocs.filter(d => !currentUrls.has(d.file_url));
        if (toDelete.length > 0) {
            await db.query(
                `DELETE FROM patient_documents WHERE id IN (?)`,
                [toDelete.map(d => d.id)]
            );
        }

        // 4. Insert new photos into patient_documents
        const toInsert = photos.filter(p => !existingUrls.has(p.url));
        for (const photo of toInsert) {
            await db.query(
                `INSERT INTO patient_documents ...`,
                [patientId, normalizedMrId, photo.name || 'Foto USG', ...]
            );
        }

        // 5. Send notification if new photos added
        // 6. Broadcast Socket.IO event
    }
}
```

**PENTING:** Endpoint ini membaca `data = req.body` lalu `photos = data.photos || []`. Jadi body request harus berformat `{ photos: [...], ...otherUsgFields }` — BUKAN `{ data: { photos: [...] } }`.

---

## Format Body Request

### SEBELUM (salah — ke /api/medical-records):
```javascript
body: JSON.stringify({
    patientId: patientId,
    visitId: mrId,
    type: 'usg',
    data: {
        ...usg,
        photos: photos
    },
    timestamp: new Date().toISOString()
})
```

### SESUDAH (benar — ke /api/sunday-clinic/records/:mrId/usg):
```javascript
body: JSON.stringify({
    ...usg,
    photos: photos
})
```

Backend `sunday-clinic.js` membaca:
- `data = req.body` (seluruh body)
- `photos = data.photos || []` (langsung dari top-level)

Jadi field USG lain (misalnya `findings`, `impression`, dll) tetap tersimpan karena di-spread dari `usg` object.

---

## Verifikasi & Testing

Setelah implementasi, lakukan:

1. **Build check** — Pastikan tidak ada syntax error
2. **Restart server:**
   ```bash
   ssh root@dokterdibya.com "cd /var/www/dokterdibya && git pull origin main && pm2 restart all"
   ```
3. **Test hapus foto:** Buka DRD pasien → Tab USG → Hapus 1 foto → Cek Album USG di portal pasien → Foto harus hilang tanpa refresh
4. **Test Reset All USG:** Buka DRD pasien → Reset All USG → Cek Album USG pasien → Semua foto harus hilang
5. **Test upload foto:** Buka DRD pasien → Upload foto baru → Cek Album USG pasien → Foto harus muncul (pastikan tidak rusak)

---

## Catatan Penting

- **JANGAN** mengubah logic auto-publish di `sunday-clinic.js` — itu sudah bekerja dengan benar
- **JANGAN** menghapus endpoint `POST /api/medical-records` — masih dipakai untuk record type lain (anamnesa, diagnosis, etc.)
- `savePhotosToDatabase()` juga dipanggil setelah upload foto baru (bukan hanya setelah delete), jadi perubahan ini juga memastikan upload baru tetap ter-publish
- Selalu baca file terlebih dahulu sebelum edit untuk memastikan line number masih akurat
- Bump `CACHE_VERSION` di `public/sw.js` setelah deploy untuk force refresh PWA cache
