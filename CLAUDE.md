# Project Rules - Dokter Dibya

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
Files created by Claude/root often have wrong permissions. **ALWAYS fix permissions after creating/modifying files.**

**Quick fix:**
```bash
/var/www/dokterdibya/fix-permissions.sh
```

**Auto-fix is enabled via git hooks:**
- `.git/hooks/post-checkout` - runs after git checkout
- `.git/hooks/post-merge` - runs after git pull

**Correct permissions:**
| Type | Permission | Numeric |
|------|------------|---------|
| Directories | rwxr-xr-x | 755 |
| Files | rw-r--r-- | 644 |
| Owner | www-data:www-data | - |

**If permission issues occur:**
1. Run `/var/www/dokterdibya/fix-permissions.sh`
2. Or manually: `chmod 644 <file>` for files, `chmod 755 <dir>` for directories

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

**Haze Library (Blur Effect) - ISSUES:**
The Haze library (`dev.chrisbanes.haze`) has dependency resolution issues. Artifacts tried:
- `dev.chrisbanes.haze:haze:1.0.0` - unresolved imports
- `dev.chrisbanes.haze:haze-android:1.0.0` - unresolved imports
- `dev.chrisbanes.haze:haze-materials:1.0.0` - unresolved imports

**Workaround:** Use semi-transparent background instead:
```kotlin
.background(BgDark.copy(alpha = 0.85f))
```

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
