# Project Rules - Dokter Dibya

## CRITICAL: Verify Before Coding

**ALWAYS verify against the actual codebase before writing ANY code.**

Before using any method, class, API, or dependency:
1. **Read the actual file** to confirm method names, signatures, and return types
2. **Check build.gradle/package.json** for dependency versions before using features
3. **Never assume** - if you're not 100% sure, read the file first

**Examples of what to verify:**
- Repository method names → Read the Repository file
- API response structure → Read the ApiService/Model files
- Compose API availability → Check BOM version in build.gradle.kts
- JavaScript function names → Read the actual JS file

**DO NOT:**
- Assume method names based on similar patterns
- Use APIs without checking dependency versions
- Write code based on memory from previous sessions

**This rule exists because:**
- `getMyBillings()` vs `getVisitHistory()` - wrong method name caused build failure
- `PullToRefreshBox` requires Material3 1.3.0+ but project uses BOM 2024.02.00

## Code Standards

### 1. Authentication Token
**NEVER hardcode token storage keys.** Use the appropriate helper:

```javascript
// In index-adminlte.html inline scripts OR main.js
const token = getAuthToken();  // ✅ Globally available

// In ES Modules (other .js files)
import { TOKEN_KEY, getIdToken } from './vps-auth-v2.js';
const token = await getIdToken();
```

**Global `getAuthToken()` is defined in index-adminlte.html (line ~1214)** and available everywhere:
- In `<script>` tags inside index-adminlte.html ✅
- In main.js ✅
- In any inline JavaScript ✅

**DO NOT use:**
- `localStorage.getItem(TOKEN_KEY)` ❌ (TOKEN_KEY might not be defined)
- `localStorage.getItem('vps_auth_token')` ❌ (hardcoded, use getAuthToken() instead)

**ALWAYS use:**
- `getAuthToken()` ✅ (defined globally in index-adminlte.html)

### 2. Role Constants
**NEVER hardcode role names or IDs.** Always import from constants:

```javascript
// Backend
const { ROLE_IDS, ROLE_NAMES, ROLE_ID_TO_NAME } = require('../constants/roles');

// Usage
if (user.role === ROLE_NAMES.DOKTER) { ... }
if (user.role_id === ROLE_IDS.ADMIN) { ... }
```

**DO NOT use:**
- `role === 'dokter'`
- `role === 'administrasi'` (wrong name!)
- `role_id === 1`

### 3. Role Visibility (Menu Access)
Role names in `role_visibility` table MUST match `roles.name`:
- `dokter` (not "Dokter")
- `admin` (not "administrasi")
- `bidan` (not "Bidan")
- `managerial` (not "Manager")
- `front_office`

### 4. API Authorization
Use appropriate middleware:
- `verifyToken` - Basic authentication
- `requireMenuAccess('menu_key')` - Check visibility from `role_visibility` table
- `requireRoles('role1', 'role2')` - Allow specific roles
- `requireSuperadmin` - Dokter/superadmin only

## File Locations

| Purpose | Location |
|---------|----------|
| Backend role constants | `staff/backend/constants/roles.js` |
| Frontend auth & token | `staff/public/scripts/vps-auth-v2.js` |
| Auth middleware | `staff/backend/middleware/auth.js` |
| Role visibility table | MySQL `role_visibility` |

## Database

**Database name:** `dibyaklinik`

```bash
# Access database
mysql -u root dibyaklinik

# Example query
mysql -u root dibyaklinik -e "SELECT * FROM patients LIMIT 5;"
```

## Common Mistakes to Avoid

1. **Token key mismatch** - Use `TOKEN_KEY` constant
2. **Role name mismatch** - `admin` vs `administrasi`
3. **Hardcoding role IDs** - Use `ROLE_IDS.DOKTER` not `1`
4. **Case sensitivity** - Role names are lowercase in DB

### 5. Real-time Sync (Socket.IO)
The `realtime-sync.js` module uses a **window-level singleton pattern** to prevent multiple socket connections when the module is loaded from different cached versions.

**IMPORTANT:**
- State is stored in `window.__realtimeSyncState`
- Always use `state.socket`, `state.currentUser`, `state.onlineUsers` instead of local variables
- The service worker (`sw.js`) bypasses caching for `/scripts/*.js` files

```javascript
// Correct - use state object
if (!state.socket || !state.currentUser) return;
state.socket.emit('event', { userId: state.currentUser.id });

// WRONG - don't use local variables
if (!socket || !currentUser) return;
```

**Transport Configuration (CRITICAL):**
- Server uses **polling-only** mode (`transports: ['polling']`) because Indonesian mobile ISPs (Telkomsel, etc.) kill WebSocket connections immediately
- Client is also configured for polling-only, but cached versions may still try websocket
- If users see "WebSocket connection failed" errors, they need to hard-refresh (Ctrl+Shift+R)
- Server config in `server.js`:
  ```javascript
  const io = new Server(server, {
      transports: ['polling'], // POLLING ONLY
      allowUpgrades: false
  });
  ```

**Cache Versioning:**
- `CACHE_VERSION` in `index-adminlte.html` - increment to force localStorage clear
- Service worker cache versions in `sw.js` - increment to force SW update
- After changing socket config, ALWAYS bump both versions

### 6. File Permissions
Files created by Claude/root often have wrong permissions.

**BE SELECTIVE - only run fix-permissions when:**
- Creating NEW files (not editing existing)
- User reports "Permission denied" errors
- After batch operations on multiple files

**DO NOT run fix-permissions for:**
- Simple file edits (permissions usually preserved)
- Every single change (unnecessary overhead)

**Quick fix (when needed):**
```bash
/var/www/dokterdibya/fix-permissions.sh
```

**Auto-fix via git hooks (already configured):**
- `.git/hooks/post-checkout` - runs after git checkout
- `.git/hooks/post-merge` - runs after git pull

**Correct permissions:**
| Type | Permission | Numeric |
|------|------------|---------|
| Directories | rwxr-xr-x | 755 |
| Files | rw-r--r-- | 644 |
| Owner | www-data:www-data | - |

### 7. AdminLTE CSS Overrides
AdminLTE memiliki default styles dengan specificity tinggi. **Selalu gunakan `!important` saat override AdminLTE styles.**

**Contoh yang BENAR:**
```css
/* Override di section <style> dalam index-adminlte.html */
.nav-treeview .nav-link .nav-icon.fa-circle {
    font-size: 5px !important;
    width: 1.6rem !important;
}
```

**Contoh yang SALAH (tidak akan bekerja):**
```html
<!-- Inline style tanpa !important akan di-override AdminLTE -->
<i class="fas fa-circle nav-icon" style="font-size: 5px;"></i>
```

**Tips:**
- Tambahkan custom CSS di section `<style>` dalam `index-adminlte.html` (mulai line 42)
- Gunakan selector yang spesifik (misal: `.nav-treeview .nav-link .nav-icon`)
- Selalu tambahkan `!important` untuk override AdminLTE defaults

### 8. Mobile App (Future Plan)

**Pilihan: Capacitor** untuk membuat APK patient portal yang bisa di-publish ke Google Play Store dan App Store.

**Alasan:**

- Bisa pakai kode web patient portal (`/public/`) yang sudah ada
- Support Android + iOS dengan codebase yang sama
- Akses fitur native (push notification, kamera, dll)
- Bisa upgrade ke full native jika perlu

**Struktur yang akan dibuat:**

```text
dokterdibya-patient-app/
├── capacitor.config.ts
├── www/                    ← Copy dari /public/
├── android/                ← Auto-generated
└── ios/                    ← Auto-generated (butuh Mac)
```

**Requirements untuk publish:**

- Google Play Developer Account ($25)
- App Icon 512x512 PNG
- Feature Graphic 1024x500
- Screenshots (min 2)
- Privacy Policy URL
- Signing Key

**Native plugins yang akan digunakan:**

- `@capacitor/push-notifications` - Notifikasi
- `@capacitor/camera` - Upload foto
- `@capacitor/local-notifications` - Reminder janji
- `@capacitor/splash-screen` - Loading screen

**Note:** Admin panel tetap web-based (`/staff/public/`)

### 9. Testing Before Completion

**NEVER declare a task as "done" or "complete" until it has been tested and verified working.**

**Rules:**

1. After implementing a feature, ALWAYS test it before saying it's done
2. Run actual commands/tests to verify functionality
3. If the test fails, fix the issue first
4. Only mark a task as complete when the test passes without errors

**Examples of proper testing:**

- After modifying backend code → restart server and test the endpoint
- After adding database columns → verify with `DESCRIBE table_name`
- After implementing R2 upload → run a test upload and verify the URL works
- After fixing a bug → reproduce the original error case and confirm it's resolved

**DO NOT:**

- Say "done" based on code changes alone
- Assume code will work without testing
- Skip verification steps

### 10. Cloudflare R2 Storage

**PDFs (invoices, etikets, resume medis) are stored in Cloudflare R2**, not on local VPS filesystem.

**Folder Structure:**

```text
dokterdibya-medis (R2 Bucket)
├── invoices/
│   └── DDMMYYYY/           ← Date folder (e.g., 07122025)
│       └── {mrId}inv.pdf
├── etikets/
│   └── DDMMYYYY/
│       └── {mrId}e.pdf
└── resume-medis/
    └── DDMMYYYY/
        └── {mrId}rm.pdf
```

**R2 Service Location:**

- Backend service: `staff/backend/services/r2Storage.js`
- PDF generator: `staff/backend/utils/pdf-generator.js`

**Important: Use Signed URLs (Private Bucket)**
R2 bucket is private. Always use signed URLs for downloads:

```javascript
const r2Storage = require('../services/r2Storage');

// Upload file
const result = await r2Storage.uploadFile(
    buffer,
    filename,
    'application/pdf',
    'invoices/07122025'  // folder path
);

// Get download URL (expires in 1 hour)
const signedUrl = await r2Storage.getSignedDownloadUrl(result.key, 3600);
```

**CORS Considerations:**

- DO NOT use `fetch().blob()` then redirect to R2 URL - causes CORS error
- Instead: Return JSON with `downloadUrl`, then use `window.open(url, '_blank')`

```javascript
// Backend - CORRECT
res.json({ success: true, downloadUrl: signedUrl, filename });

// Frontend - CORRECT
const data = await response.json();
window.open(data.downloadUrl, '_blank');

// WRONG - will cause CORS error
const blob = await response.blob();  // ❌
res.redirect(signedUrl);             // ❌
```

**Database Columns:**

- `sunday_clinic_billings.invoice_url` - R2 key for invoice
- `sunday_clinic_billings.etiket_url` - R2 key for etiket

### 11. Window Exports for Page Functions

**When adding a new function used in `onclick` handlers, you MUST export it to `window`.**

Functions used in `onclick` handlers in HTML must be globally accessible.

**A. For `main.js`:**
Add window export at the bottom of the file (around line 4300+):

```javascript
// At the end of main.js, add:
window.showYourNewPage = showYourNewPage;
```

**B. For IIFE modules (kelola-jadwal.js, kelola-obat.js, etc.):**
Add window export inside the IIFE, before the closing `})();`:

```javascript
(function() {
    // ... module code ...

    function saveSchedule() { ... }
    function deleteSchedule() { ... }

    // CRITICAL: Export ALL functions used in onclick handlers
    window.initKelolaJadwal = initKelolaJadwal;
    window.saveSchedule = saveSchedule;      // ← Don't forget this!
    window.deleteSchedule = deleteSchedule;

})(); // End IIFE
```

**Common mistake:** Creating a new function but forgetting to add `window.functionName = functionName;`

**Error you'll see:**
```
Uncaught ReferenceError: saveSchedule is not defined
    at HTMLButtonElement.onclick
```

**Fix:** Add the missing window export for that function.

### 12. Cache Control for Patient Endpoints

**Patient-facing API endpoints MUST send no-cache headers** to ensure fresh data is always displayed.

**Backend (Express):**
```javascript
router.get('/api/patient/some-endpoint', verifyPatientToken, async (req, res) => {
    // Prevent browser caching - always fetch fresh data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    // ... endpoint logic
});
```

**Frontend (JavaScript):**
```javascript
// Add cache-busting timestamp to fetch requests
const response = await fetch('/api/patient/endpoint?_t=' + Date.now(), {
    headers: {
        'Authorization': 'Bearer ' + token,
        'Cache-Control': 'no-cache'
    }
});
```

**Nginx (for HTML pages):**
```nginx
# In /etc/nginx/sites-enabled/dokterdibya.com
location = /patient-dashboard.html {
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    add_header Pragma "no-cache";
    add_header Expires "0";
    try_files $uri =404;
}
```

### 13. Patient Access Control (Staff Route Protection)

**Patients MUST NOT access staff-only API routes.** This is enforced globally in `server.js`.

**Whitelist location:** `/var/www/dokterdibya/staff/backend/server.js` (line ~162)

```javascript
const PATIENT_ALLOWED_ROUTES = [
    '/api/patients',            // Patient auth & profile
    '/api/patient/',            // Patient-specific endpoints
    '/api/sunday-appointments', // Booking
    '/api/hospital-appointments',
    '/api/articles',
    '/api/patient-notifications',
    '/api/announcements',
];
```

**When adding a new patient-accessible endpoint:**
1. If path starts with `/api/patient/` → automatically allowed
2. If path starts with `/api/patients/` → automatically allowed
3. Otherwise → add to `PATIENT_ALLOWED_ROUTES` whitelist

**Middleware available:**
- `verifyToken` - Any authenticated user (staff or patient)
- `verifyPatientToken` - Patient only (blocks staff)
- `verifyStaffToken` - Staff only (blocks patients)

### 14. Timezone Handling (GMT+7 Indonesia)

**Server timezone is GMT+7 (WIB - Waktu Indonesia Barat).** Always handle dates carefully to avoid off-by-one day errors.

**NEVER use `toISOString()` for date-only fields:**
```javascript
// WRONG - will shift date by -7 hours (previous day in UTC)
const dateStr = record.some_date.toISOString().split('T')[0]; // ❌

// CORRECT - use local date components
const d = new Date(record.some_date);
const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // ✅
```

**Why this happens:**
- MySQL DATE field: `2025-12-15`
- JavaScript interprets as: `2025-12-15 00:00:00 GMT+7`
- `toISOString()` converts to UTC: `2025-12-14T17:00:00.000Z`
- Result: **Wrong date (previous day)**

**Helper function (recommended):**
```javascript
function formatDateLocal(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

**When to be careful:**
- Fetching DATE columns from MySQL
- Displaying dates on calendar/UI
- Comparing dates between frontend and backend

### 15. Medical Record (DRD) System

**CRITICAL: DRD = Kunjungan (Visit), NOT Patient ID**

```
DRD0001 = Kunjungan 1 (Pasien A di RS X)
DRD0002 = Kunjungan 2 (Pasien B di RS Y)
DRD0003 = Kunjungan 3 (Pasien A di RS Y) ← PASIEN SAMA, DRD BARU!
```

**Rules:**
- Setiap kunjungan baru = DRD baru (sequence terus bertambah)
- 1 pasien bisa punya BANYAK DRD (1 per kunjungan)
- DRD TIDAK sama untuk semua kunjungan pasien yang sama
- `mr_id` di `sunday_clinic_records` TIDAK lagi UNIQUE (sudah di-drop)

**Database:**
- `sunday_clinic_records.mr_id` - bisa duplikat (1 pasien banyak DRD)
- `sunday_clinic_records.visit_location` - lokasi RS kunjungan tersebut
- `sunday_clinic_records.mr_sequence` - sequence global untuk generate DRD berikutnya

**Bulk Upload USG Logic:**
1. Cek apakah pasien sudah punya kunjungan di RS target
2. Jika SUDAH → gunakan DRD yang ada di RS tersebut
3. Jika BELUM → buat DRD BARU (next sequence)

### 16. Anamnesa Field Naming Convention

**Anamnesa form menggunakan snake_case untuk field names:**

```javascript
// CORRECT field names in anamnesa record_data:
{
    "gravida": "2",
    "para": "0",
    "abortus": "1",
    "anak_hidup": "0",           // snake_case, NOT anakHidup
    "alergi_obat": "-",          // snake_case, NOT alergiObat
    "alergi_makanan": "-",       // snake_case
    "alergi_lingkungan": "-",    // snake_case
    "usia_menarche": "-",        // snake_case
    "lama_siklus": "-",          // snake_case
    "siklus_teratur": "",        // snake_case
    "metode_kb_terakhir": "",    // snake_case
    "riwayat_keluarga": "-",     // snake_case
    "detail_riwayat_penyakit": "-"
}
```

**JANGAN gunakan camelCase untuk field anamnesa baru!**

### 17. Hospital Locations

**Valid visit_location values:**
- `klinik_private` - Klinik Privat (has billing)
- `rsia_melinda` - RSIA Melinda
- `rsud_gambiran` - RSUD Gambiran
- `rs_bhayangkara` - RS Bhayangkara

**Only `klinik_private` has billing system.** RS lain tidak ada tagihan.

### 18. Solution Memory Rule

**When user expresses gratitude** (says "great job", "nice", "bagus", "mantap", "thanks", etc.), **save the successful solution to this CLAUDE.md file**.

This helps remember what worked and prevents repeating mistakes in the future.

### 19. Android Native App Solutions

**Hide Foreground Service Notification:**
Use `IMPORTANCE_NONE` channel with new channel ID to completely hide the notification:

```kotlin
// DokterDibyaApp.kt
val serviceChannel = NotificationChannel(
    SERVICE_CHANNEL_ID,
    "Background Service",
    NotificationManager.IMPORTANCE_NONE  // Completely hidden
).apply {
    setShowBadge(false)
    setSound(null, null)
    enableVibration(false)
    enableLights(false)
    lockscreenVisibility = android.app.Notification.VISIBILITY_SECRET
}
```

**Important:** User must uninstall app first before reinstalling - old notification channels persist.

**Material3 Ripple Deprecation:**
`rememberRipple` is deprecated. Either:
1. Use `ripple()` from `androidx.compose.material3` (requires newer version)
2. Or use `indication = null` with custom press animation (scale)

```kotlin
// Use scale animation instead of ripple
.clickable(
    interactionSource = interactionSource,
    indication = null,  // No ripple, using scale animation
    onClick = item.onClick
)
```

**Haze Library (Blur Effect) - WORKING:**
The Haze library (`dev.chrisbanes.haze`) provides true backdrop blur like web/iOS.

**IMPORTANT: Use haze-jetpack-compose for AndroidX Compose projects!**
- `haze-android` requires Compose Multiplatform dependencies which conflict with AndroidX Compose
- `haze-jetpack-compose` is specifically designed for AndroidX Compose (standard Android projects)

**Dependencies (build.gradle.kts):**
```kotlin
// Use haze-jetpack-compose for AndroidX Compose (NOT haze-android!)
implementation("dev.chrisbanes.haze:haze-jetpack-compose:0.7.0")
```

**Imports:**
```kotlin
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.haze
import dev.chrisbanes.haze.hazeChild
```

**Usage Example (Nav bar with backdrop blur):**
```kotlin
val hazeState = remember { HazeState() }

Box {
    // Nav bar - shows blurred content behind it
    Box(
        modifier = Modifier
            .hazeChild(state = hazeState)
            .background(BgDark.copy(alpha = 0.7f))
    ) {
        // Nav bar content
    }

    // Main content - this is what gets blurred behind nav bar
    Column(
        modifier = Modifier
            .haze(state = hazeState)
            .verticalScroll(scrollState)
    ) {
        // Scrollable content
    }
}
```

**How it works:**
1. `haze(state)` - marks content to be captured and blurred
2. `hazeChild(state)` - shows the blurred content behind it
3. Add `.background()` with alpha for tint color

**JANGAN Build APK di VPS:**
APK harus di-build di komputer lokal developer, BUKAN di VPS. Alasan:
- SHA-1 debug keystore VPS berbeda dengan lokal
- Google Sign-In akan error 10 (DEVELOPER_ERROR) jika SHA-1 tidak cocok
- SHA-1 yang terdaftar di Google Cloud Console: `CE:75:23:17:32:B5:D6:7E:E8:2B:FB:56:A0:4B:19:B9:60:11:83:C7`

Jika diminta build APK, commit & push code lalu minta user build lokal:
```bash
git pull origin main
./gradlew assembleDebug
```

### 20. Session Log - 27 Desember 2025

**Perbaikan yang dilakukan dalam sesi ini:**

1. **Activity Logging untuk Audit Trail**
   - Implementasi logging di `patients.js` (Add/Update Patient)
   - Implementasi logging di `medical-records.js` (Create/Update/Delete MR)
   - Implementasi logging di `sunday-clinic.js` (Confirm Billing, Finalize Visit, Print Invoice)

2. **Fix Bug Notifikasi Billing Reset Form**
   - Bug: Event `billing_confirmed` auto-reload form staff lain yang sedang mengisi rekam medis berbeda
   - Fix: Tambah pengecekan MR ID sebelum reload di `sunday-clinic/main.js`

3. **Notifikasi Lonceng Staff Announcements**
   - Ubah query dari tabel `announcements` ke `staff_announcements`
   - Buat tabel `staff_announcement_reads` untuk tracking baca/belum
   - Endpoint `POST /api/staff-announcements/:id/read` untuk mark as read
   - Update `/api/notifications/count` include staff announcements
   - Highlight & scroll ke pengumuman spesifik saat klik dari dropdown
   - CSS animation `highlight-flash` untuk visual feedback

4. **Activity Logging "Unknown" User**
   - Fix `logActivity()` di main.js menggunakan `window.currentUserId` dan `window.currentUserName`
   - Skip logging jika user belum teridentifikasi
   - Root cause: `window.auth?.currentUser` belum ready saat page load

5. **Dashboard Chart "Kunjungan 30 Hari"**
   - Fix `loadVisitSection()` yang return early karena element `stat-visits-last-month` tidak ada
   - Ubah endpoint `/api/visits?exclude_dummy=true` untuk query `sunday_clinic_records` (bukan tabel `visits` yang berisi intake forms)
   - Set skala maksimal chart ke 30 kunjungan dengan pixel heights

6. **UI Cleanup**
   - Hapus icons dari form Advanced Search pasien (Nama, ID, MR ID, Email, Umur, HP, WhatsApp, Nama Suami)

7. **Git Hooks**
   - Fix `.git/hooks/post-checkout` dan `post-merge` agar executable (chmod +x)

8. **CLAUDE.md Updates**
   - Aturan selektif menjalankan `fix-permissions.sh`

9. **Sidebar Riwayat Pasien - Spacing Fix**
   - Perbesar padding di `.current-patient-info` (12px 15px)
   - Perbesar padding di `.visit-card-header` (12px 14px, min-height 56px)
   - File: `staff/public/styles/sunday-clinic.css`

10. **Bulk Upload USG - All Staff Access**
    - Hapus `requirePermission('medical_records.edit')` dari endpoint
    - Hapus class `dokter-only` dari menu item
    - Tambah role_visibility untuk semua role (admin, bidan, front_office, managerial)
    - File: `staff/backend/routes/usg-bulk-upload.js`

11. **Bulk Upload USG - CORS Fix**
    - Bug: Request dari `www.dokterdibya.com` ke `dokterdibya.com` blocked by CORS
    - Fix: Ubah hardcoded URL ke relative URL `/api`
    - File: `staff/public/scripts/usg-bulk-upload.js`

12. **Bulk Upload USG - Duplicate MR ID Fix (CRITICAL)**
    - Bug: Sequence collision menyebabkan duplicate MR ID (DRD0210 assigned ke 2 pasien berbeda)
    - Root cause: `SELECT MAX(mr_sequence)` tidak atomic, race condition pada concurrent requests
    - Fix:
      - Database: Update Bunga Amalina ke DRD0213, delete duplicate Ulviatul
      - Code: Atomic transaction dengan `SELECT FOR UPDATE` lock
      - Constraint: Add UNIQUE index pada `mr_sequence`
    - File: `staff/backend/routes/usg-bulk-upload.js` (lines 451-490)

### 21. Session Log - 30 Desember 2025

**Perbaikan yang dilakukan dalam sesi ini:**

1. **DateTime Stamp per Section (Major Feature)**
   - Tambah datetime picker ke semua section rekam medis:
     - Anamnesa Obstetri (`components/obstetri/anamnesa-obstetri.js`)
     - Anamnesa Gyn/Repro (`components/gyn_repro/anamnesa-gyn_repro.js`)
     - Pemeriksaan Fisik (`components/shared/physical-exam.js`)
     - Pemeriksaan Obstetri (`components/obstetri/pemeriksaan-obstetri.js`)
     - Penunjang (`components/shared/penunjang.js`)
     - USG Obstetri (`components/obstetri/usg-obstetri.js`)
     - USG Ginekologi (`components/shared/usg-ginekologi.js`)
     - Diagnosis (`components/shared/diagnosis.js`)
     - Planning/Terapi (`components/shared/plan.js`)
   - Datetime WAJIB diisi sebelum save (validasi di `main.js`)
   - Auto-fill dari import Melinda/Gambiran (`utils/medical-import.js`)
   - Data structure:

     ```javascript
     {
       "record_datetime": "2025-12-30T14:30",
       "record_date": "2025-12-30",
       "record_time": "14:30",
       ...otherFields
     }
     ```

2. **Search by Tanggal Periksa**
   - Tambah date picker ke Advanced Search di Kelola Pasien
   - File: `staff/public/index-adminlte.html` (form + `performAdvancedSearch()`)
   - Backend: `staff/backend/routes/patients.js` filter `DATE(scr.created_at)`

3. **Bulk Upload USG - Folder Date Fix**
   - Bug: `created_at` menggunakan `NOW()` bukan tanggal dari folder
   - Fix: Extract date dari folder name (e.g., `21122025-XXXX_NAMA` → `2025-12-21`)
   - File: `staff/backend/routes/usg-bulk-upload.js`
   - Fallback ke `NOW()` jika parsing gagal

4. **MEDIFY Import - HPL, HPHT, Gravida, Para, Abortus, Anak Hidup Fix**
   - Bug: HPL, HPHT, dan obstetric fields tidak terisi saat import dari Melinda/Gambiran
   - Root cause: AI prompt tidak include fields `abortus` dan `anak_hidup`, dan HPL extraction dari Keluhan Utama tidak dijelaskan
   - Fix:
     - Backend AI prompt: Tambah `abortus`, `anak_hidup` ke assessment object
     - Backend AI prompt: Tambah rule MEDIFY G*P**** format (G2P0101 → Para=Aterm+Premature)
     - Backend AI prompt: Tambah rule HPL extraction dari Keluhan Utama ("kontrol hamil, HPL 29/1/26")
     - Backend: Tambah `abortus`, `anak_hidup` ke `mapToTemplate()` obstetri section
     - Frontend: Tambah retry mechanism untuk HPL, HPHT, Gravida, Para, Abortus, Anak Hidup (3 detik delay)
     - Frontend: Tambah date conversion DD/MM/YYYY → YYYY-MM-DD untuk date inputs
   - Files:
     - `staff/backend/routes/medical-import.js` (AI prompt lines 43-44, 64-66, 96-108, mapToTemplate lines 1107-1108)
     - `staff/public/scripts/sunday-clinic/utils/medical-import.js` (retry block lines 1134-1208)

5. **Chrome Extension Updates - MEDIFY G*P**** Parsing**
   - Updated both Melinda and Gambiran Chrome extensions with:
     - Comma-separated MEDIFY format regex patterns (handles "Keluhan Utama : kontrol, HPL 29/1/26, ...")
     - MEDIFY G*P**** parsing: G2P0101 → Gravida=2, Para=0+1=1, Abortus=0, AnakHidup=1
     - Merge logic to combine local extraction with API result for HPL, HPHT, and obstetric fields
   - Files:
     - `chrome-extension/simrs-melinda-exporter/content.js` (extractCPPT function, handleExport merge logic)
     - `chrome-extension/simrs-gambiran-exporter/content.js` (extractCPPT function, handleExport merge logic)
   - Regex pattern for MEDIFY format:

     ```javascript
     const medifyMatch = assText.match(/G(\d+)P(\d)(\d)(\d)(\d)/i);
     if (medifyMatch) {
         cpptData.assessment.gravida = parseInt(medifyMatch[1]);
         cpptData.assessment.para = parseInt(medifyMatch[2]) + parseInt(medifyMatch[3]); // Aterm + Premature
         cpptData.assessment.abortus = parseInt(medifyMatch[4]);
         cpptData.assessment.anak_hidup = parseInt(medifyMatch[5]);
     }
     ```

6. **Fix Empty Form After MEDIFY Import**
   - Bug: Form showed empty/today's date after import, even though data was saved to database
   - Root causes:
     - Null values from AI parsing overwrote base template values
     - Section save conditions required truthy values, skipping sections with nulls
     - Form didn't refresh after API save
   - Fixes:
     - Added `mergeIfPresent` helper to preserve base template values when parsed values are null
     - Changed save conditions to include sections if they have `recordDatetime` (ensures timestamp always saved)
     - Added form refresh (`fetchRecord`) after API save to reload data from database
   - File: `staff/public/scripts/sunday-clinic/utils/medical-import.js`

### 22. Session Log - 3 Januari 2026

**Android Pharm App - Token/Login Fix**

1. **Issue:** Obat/Alkes dropdown tidak bisa load data, menampilkan "HTTP 401: Missing authorization header"

2. **Root Cause:** Backend API menggunakan wrapper `data` untuk response:
   ```json
   { "success": true, "data": { "token": "...", "user": {...} } }
   ```
   Tapi Android model mengharapkan `token` di root level.

3. **Fixes:**
   - **Models.kt:** Tambah `LoginData` wrapper class
     ```kotlin
     data class LoginResponse(
         val success: Boolean,
         val message: String? = null,
         val data: LoginData? = null  // Wrapper untuk token & user
     )

     data class LoginData(
         val token: String? = null,
         val user: User? = null
     )

     data class User(
         val id: String,  // Backend returns string IDs, NOT Int!
         val name: String,
         val email: String,
         val role: String
     )
     ```

   - **SalesRepository.kt:** Akses token via `body.data?.token`
     ```kotlin
     val token = body.data?.token
     val user = body.data?.user
     if (body.success && token != null) {
         tokenRepository.saveToken(token)
     }
     ```

   - **AuthViewModel.kt:** Akses user via `response.data?.user`
     ```kotlin
     if (response.success && response.data?.token != null) {
         userName = response.data.user?.name
     }
     ```

4. **Important Notes:**
   - Backend `sendSuccess()` ALWAYS wraps data in `data` field
   - User ID di backend adalah STRING (e.g., "UDZAQUCQWZ"), bukan Int
   - Tambah delay 300ms sebelum API call untuk memastikan token tersimpan di DataStore

5. **Files Modified:**
   - `android-pharm/app/src/main/java/com/dokterdibya/pharm/data/model/Models.kt`
   - `android-pharm/app/src/main/java/com/dokterdibya/pharm/data/repository/SalesRepository.kt`
   - `android-pharm/app/src/main/java/com/dokterdibya/pharm/viewmodel/AuthViewModel.kt`
   - `android-pharm/app/src/main/java/com/dokterdibya/pharm/viewmodel/SalesViewModel.kt`
   - `android-pharm/app/src/main/java/com/dokterdibya/pharm/ui/screens/sales/SalesListScreen.kt`
   - `android-pharm/app/src/main/java/com/dokterdibya/pharm/ui/screens/sales/NewSaleScreen.kt`

### 23. CRITICAL: Never Assume Before Complete Analysis

**ALWAYS analyze the existing codebase COMPLETELY before claiming something is done or complete.**

**Rules:**
1. When porting/replicating a system (e.g., web to Flutter), FIRST thoroughly analyze ALL features in the source
2. Use exploration tools to list ALL pages, menus, modules, and functionality
3. Create a complete feature comparison before saying "it's done"
4. Never claim implementation is complete without verifying EVERY feature exists

**Example - Flutter Admin Panel:**
Before saying "Flutter admin is complete", must analyze:
- ALL sidebar menu items in `index-adminlte.html`
- ALL page content sections (content-* IDs)
- ALL JavaScript modules and their functionality
- Compare 1:1 with Flutter implementation

**DO NOT:**
- Say "structure is complete" without full analysis
- Assume features exist without verification
- Claim parity without side-by-side comparison

**ALWAYS:**
- Use Task/Explore tool to analyze source system first
- List ALL features found
- Check each feature exists in target implementation
- Report what's missing BEFORE claiming completion
