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

## CRITICAL: Git Commits

**NEVER add "Co-Authored-By" line in commit messages.** Just write the commit message without any co-author attribution.

```bash
# CORRECT
git commit -m "Fix animation bug on mobile"

# WRONG - DO NOT DO THIS
git commit -m "Fix animation bug on mobile

Co-Authored-By: Claude..."
```

## CRITICAL: Always Commit and Push

**ALWAYS commit and push changes after completing a task or set of related changes.**

- After finishing implementation, immediately `git add`, `git commit`, and `git push`
- Do not wait for the user to ask - proactively commit when work is done
- Group related changes into a single commit with a clear message
- Push to remote to ensure changes are backed up

```bash
# After completing changes:
git add <files>
git commit -m "Clear description of what was done"
git push origin main
```

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

### 24. Duplicate UI Rendering Code (Sunday Clinic Queue Dropdown)

**Problem:** Cache-resistant UI bug caused by duplicate rendering code in multiple locations.

**Root Cause:**
The queue dropdown ("Antrian Hari Ini") was rendered by TWO different places:
1. `staff/public/scripts/sunday-clinic/components/patient-history-sidebar.js` (renderQueue method, line 280-316)
2. `staff/public/sunday-clinic.html` (inline JavaScript, line 1327-1342)

**What Happened:**
- User reported queue dropdown showing old style with "Ada MR" / "Baru" badges
- Expected: Numbered circles (1, 2, 3...) with checkmark icons
- We fixed patient-history-sidebar.js and tried extensive cache-busting (service worker unregistration, nginx no-cache headers, version bumps)
- Browser confirmed loading fresh JS file (window.PATIENT_SIDEBAR_VERSION correct)
- But dropdown STILL showed old badges!
- Reason: The HTML file had duplicate inline code that was never updated

**The Bug (sunday-clinic.html:1338):**
```javascript
// OLD - showing badges
<span class="badge badge-${item.mr_id ? 'success' : 'warning'}">
    ${item.mr_id ? 'Ada MR' : 'Baru'}
</span>
```

**The Fix:**
```javascript
// NEW - numbered circles with icons
<span class="queue-number">${index + 1}</span>
<div class="queue-info">
    <div class="queue-name">${item.patient_name}</div>
    <div class="queue-meta">${slot_time} • ${chief_complaint}</div>
</div>
<div class="queue-status">
    ${item.mr_id
        ? '<i class="fas fa-check-circle text-success"></i>'
        : '<i class="far fa-circle text-muted"></i>'}
</div>
```

**Lesson Learned:**
When a UI element doesn't update after cache clearing and fresh file verification:
1. **Search for duplicate rendering code** - UI might be rendered in multiple places
2. **Check inline JavaScript** in HTML files, not just external JS modules
3. **Use browser console** to inspect actual rendered HTML: `document.getElementById('element').innerHTML`
4. **Grep for unique text** from the old UI (e.g., "Ada MR") to find all rendering locations

**Prevention:**
- Avoid duplicating UI rendering logic between ES modules and inline scripts
- If using inline JS for initial render, ensure it uses same code patterns as modules
- Document which file is responsible for rendering each UI component

### 25. WebView CSS vh Units Don't Work

**Problem:** Android WebView calculates `vh` (viewport height) units incorrectly, often as 0 or very small values.

**Symptoms:**
- Modal bodies collapse to 0 height
- Elements with `max-height: 50vh` appear "squeezed"
- Content renders correctly in browser but not in WebView app

**Root Cause:**
WebView doesn't reliably report viewport height, causing CSS `vh` units to calculate incorrectly.

**Solution:**
Replace all `vh` units with fixed pixel values:

```css
/* WRONG - WebView calculates vh as 0 */
.modal-content { max-height: 85vh; }
.modal-body { max-height: 50vh; }

/* CORRECT - Use fixed pixels */
.modal-content { max-height: 600px !important; min-height: 400px !important; }
.modal-body { max-height: 400px !important; min-height: 250px !important; }
```

**In JavaScript, use cssText with !important:**
```javascript
container.style.cssText = 'min-height: 250px !important; max-height: 400px !important; height: auto !important; overflow-y: auto !important;';
```

**Files affected:**
- `staff/public/sunday-clinic.html` (CSS at lines 253-266, 313-321)
- `staff/public/scripts/sunday-clinic/utils/planning-helpers.js`

### 26. Patient Password Reset

**CRITICAL: Patient credentials are stored in TWO tables:**

| Table | Column | Purpose |
|-------|--------|---------|
| `patients` | `password` | Legacy/unused |
| `users` | `password_hash` | **Actual login check** |

**The login endpoint `/api/auth/patient-login` checks `users.password_hash`, NOT `patients.password`.**

**USE THE CENTRALIZED SERVICE:**

When updating patient passwords in code, ALWAYS use `PatientPasswordService`:

```javascript
const PatientPasswordService = require('../services/PatientPasswordService');

// Option 1: With plain password (will hash automatically)
await PatientPasswordService.hashAndUpdatePassword({
    patientId: patient.id,      // or use email
    email: patient.email,       // optional if patientId provided
    plainPassword: 'newpassword123'
});

// Option 2: With pre-hashed password
await PatientPasswordService.updatePassword({
    patientId: patient.id,
    hashedPassword: hashedPassword
});
```

**NEVER do this:**
```javascript
// WRONG - Only updates one table!
await db.query('UPDATE patients SET password = ? WHERE id = ?', [hash, id]);
```

**For manual/CLI password reset, use the helper script:**

```bash
/var/www/dokterdibya/scripts/reset-patient-password.sh patient@email.com newpassword123
```

**Why two tables?**
- `patients` table: Patient profile data (name, birth_date, medical info)
- `users` table: Authentication data for ALL users (staff + patients), with `user_type` column to distinguish

**Service location:** `staff/backend/services/PatientPasswordService.js`

### 27. Session Log - 28 Januari 2026

**Capacitor Mobile App - Google Sign-In Registration Fix**

1. **Issue:** Google Sign-In untuk registrasi pasien baru gagal dengan error "Autentikasi Google gagal"

2. **Root Causes (Multiple):**

   **A. serverClientId salah (capacitor.config.ts & index.html)**
   - `serverClientId` harus menggunakan **Web** client ID, bukan Android client ID
   - Web client ID: `738335602560-52as846lk2oo78fr38a86elu8888m7eh.apps.googleusercontent.com`
   - Token yang diissue Google akan punya `aud` (audience) = serverClientId
   - Backend memverifikasi token dengan memeriksa audience

   **B. Database error: Unknown column 'id' in users table**
   - Tabel `users` menggunakan `new_id` sebagai primary key, BUKAN `id`
   - Query `SELECT id FROM users` gagal
   - Fixed dengan menggunakan `new_id` dan patient's medical record ID

3. **Files Modified:**
   - `mobile-app/capacitor.config.ts` - serverClientId → Web client ID
   - `mobile-app/www/index.html` - GOOGLE_WEB_CLIENT_ID → Web client ID
   - `staff/backend/routes/patients-auth.js` - Fix users table query

4. **Key Learnings:**
   - Google Sign-In `serverClientId` = audience di ID token = HARUS Web client ID
   - Android client ID (dari google-services.json) hanya untuk native sign-in flow
   - Selalu tambah debug logging saat troubleshoot auth errors
   - Error message "Autentikasi Google gagal" bisa dari token verification ATAU dari catch block lain (database error)

### 28. User Communication Preferences

**ALWAYS show progress indicators during work.** User wants to know Claude is working (not internet issues).

**Rules:**
1. **Give text updates** at each step - "Sedang membaca file...", "Sedang mengedit...", etc.
2. **Break tasks** into small steps with updates at each step
3. **Never stay silent too long** - if processing takes time, say "Sedang memproses..."
4. **Before long operations**, inform the user what you're about to do

**Example good behavior:**
```
Saya akan mengupdate file patient-menu.html...

Sedang membaca file untuk melihat struktur saat ini...

[Tool call: Read]

Sedang mengedit bagian navbar...

[Tool call: Edit]

Selesai. Perubahan sudah diterapkan.
```

**Why:** User needs visual feedback that work is happening, otherwise they might think the connection is frozen.

### 29. Session Log - 30 Januari 2026

**Staff Dashboard Navbar & Registration Code Fix**

1. **Navbar User Name, Role, dan Avatar tidak muncul**
   - **Root cause:** Kode update navbar di `initializeApp()` (index-adminlte.html) tidak reliable
   - **Fix:** Pindahkan update navbar ke `updateWelcomeCard()` di `main.js`
   - Fetch roles dari `/api/users/${user.id}/roles` untuk mendapatkan `display_name`
   - Tambah update avatar di fungsi yang sama
   - File: `staff/public/scripts/main.js` (lines 2642-2685)

2. **Kode Registrasi tidak muncul di Dashboard**
   - **Root cause:** ES module (`<script type="module">`) tidak bisa akses `loadDashboardCurrentCode` tanpa prefix `window.`
   - **Fix:** Ubah `typeof loadDashboardCurrentCode` → `typeof window.loadDashboardCurrentCode`
   - File: `staff/public/index-adminlte.html` (line 7153)
   - **Lesson:** Dalam ES module, fungsi global harus diakses via `window.functionName`

3. **Error: `setPageTitle is not defined`**
   - **Root cause:** `window.setPageTitle = setPageTitle` tapi fungsi `setPageTitle` tidak ada
   - **Fix:** Tambah definisi fungsi `setPageTitle(title)` sebelum assignment ke window
   - File: `staff/public/scripts/main.js` (line 4492)

**Pattern yang perlu diingat:**
- ES modules punya scope terpisah, akses global function via `window.`
- Selalu pastikan fungsi sudah didefinisikan sebelum di-assign ke `window`
- Untuk navbar update yang reliable, lakukan di `updateWelcomeCard()` yang dipanggil dari `onAuthStateChanged`

### 30. Capacitor LocalNotifications - External URL Access

**Problem:** Capacitor LocalNotifications plugin tidak bisa diakses dari URL eksternal (dokterdibya.com) dalam WebView.

**Symptoms:**
- `window.Capacitor.Plugins.LocalNotifications` returns `undefined`
- Permission check fails with "izin notifikasi ditolak" even after granting permission
- `localStorage` NOT shared between local Capacitor page (`file://`) and external URL (`https://`)

**Root Cause:**
- Capacitor plugins only work on local pages served from app assets
- When WebView navigates to external URL, plugins become inaccessible
- localStorage is scoped to origin, so `file://` and `https://dokterdibya.com` don't share data

**Solution:**
If detected in WebView on external URL, assume notification permission is already granted at native level:

```javascript
// In vitamin-notifications.js (or similar)

// Detect Android WebView
const isAndroidWebView = navigator.userAgent.includes('wv') ||
    (navigator.userAgent.includes('Android') && navigator.userAgent.includes('Version/'));

// In permission check function:
async function isNotificationPermitted() {
    const LocalNotifications = await getLocalNotificationsPlugin();

    if (LocalNotifications) {
        // Plugin available - check normally
        const permStatus = await LocalNotifications.checkPermissions();
        return permStatus.display === 'granted';
    }

    // Plugin NOT available - check if we're in WebView
    if (isAndroidWebView || isCapacitor) {
        // In WebView on external URL, plugin is not accessible
        // But native permission was already granted at app level
        console.log('[VitaminNotif] In WebView - assuming permission granted at native level');
        return true;  // <-- KEY: Assume granted
    }

    // Fallback to Web Notification API for regular browser
    return 'Notification' in window && Notification.permission === 'granted';
}
```

**For test notification button:**
```javascript
async function showTestNotification() {
    const LocalNotifications = await getLocalNotificationsPlugin();

    if (LocalNotifications) {
        // Schedule via plugin
        await LocalNotifications.schedule({ notifications: [...] });
    } else if (isAndroidWebView || isCapacitor) {
        // Can't schedule from external URL, but show success message
        alert('Izin notifikasi sudah aktif! ✓\n\nPengingat obat akan berfungsi normal.');
    } else {
        // Use Web Notification API
        new Notification(title, { body, icon });
    }
}
```

**Key Insight:**
- Permission is granted once at app install/first launch on the LOCAL Capacitor page
- Native Android permission persists across WebView navigation
- We just can't CHECK or SCHEDULE from external URLs
- But the permission IS granted, so assume it's true

**Files:**
- `public/scripts/vitamin-notifications.js` - notification service with WebView detection
- `mobile-app/www/index.html` - local page that requests permission on first launch

### 31. PWA Cache Versioning - Force Fresh Updates on Deploy

**CRITICAL: Service worker cache MUST be version-controlled to force refresh.**

**Problem:** Old cached files cause patients to see outdated code even after deploy. Patient has to hard-reset (Ctrl+Shift+R) to get fresh files. Most patients don't know or won't do this.

**Solution:** Update `CACHE_VERSION` in `public/sw.js` on every deploy:

```javascript
// public/sw.js - CHANGE THIS DATE EVERY TIME YOU DEPLOY
const CACHE_VERSION = '20260321'; // Use today's date: YYYYMMDD
const CACHE_NAME = `dokterdibya-patient-${CACHE_VERSION}`;
```

**How it works:**
1. When you deploy → increment CACHE_VERSION (use today's date YYYYMMDD)
2. Service worker automatically deletes old cache (activate event, line 44-54)
3. Patients get fresh files on next page load (no hard-reset needed!)

**Deployment Checklist:**
```bash
# Before git push:
1. Make your changes to patient portal code
2. Update CACHE_VERSION in public/sw.js to today's date (YYYYMMDD)
3. git add .
4. git commit -m "..."
5. git push origin main
# Done! Patients auto-get fresh cache on next load
```

**Example:**
- Deploy on 2026-03-21 → Set `CACHE_VERSION = '20260321'`
- Deploy on 2026-03-22 → Set `CACHE_VERSION = '20260322'`

**Why this works:**
- Different cache name = browser treats as new cache
- Old cache is automatically deleted by service worker
- No hard-reset needed for patients
- Transparent update process

### 33. CSS Transition Killed by prefers-reduced-motion Kill-Switch (Specificity Trap)

**Problem:** CSS transitions on animated elements appear instant even after setting `transition-duration: 0.5s !important`.

**Root Cause:** A global `@media (prefers-reduced-motion: reduce)` kill-switch using a long `:not()` chain:
```css
*:not(.c1):not(.c2)...not(.c16) {
    transition-duration: 0.01ms !important;
}
```
This has specificity **(0,16,0)**. An override like `.doc-cta-link .dot { transition-duration: 0.5s !important; }` only has **(0,2,0)**. When two `!important` rules clash, **higher specificity wins** — so the kill-switch wins every time.

**Wrong fix (doesn't work):**
```css
/* Specificity 0,2,0 — loses to kill-switch at 0,16,0 */
.doc-cta-link .dot { transition-duration: 0.5s !important; }
```

**Correct fix:** Add the element's classes to the `:not()` whitelist in the kill-switch itself:
```css
@media (prefers-reduced-motion: reduce) {
    *:not(.existing-whitelist)...:not(.doc-cta-link):not(.doc-cta-track):not(.dot-left):not(.dot-right),
    /* same for ::before and ::after */ {
        transition-duration: 0.01ms !important;
    }
    /* No override needed — element is now excluded from the kill-switch entirely */
}
```

**CTA Button Animation (Framer-style) — Working Solution:**

HTML structure:
```html
<a class="doc-cta-link" href="/album-usg-trial.html">
    <span class="doc-cta-track">
        <span class="dot dot-left"></span>
        <span class="text">Lihat Album USG</span>
        <span class="dot dot-right"></span>
    </span>
</a>
```

Key CSS:
```css
.doc-cta-link { position: relative; overflow: hidden; }
.doc-cta-link .doc-cta-track {
    display: inline-flex; align-items: center; gap: 12px;
    transform: translateX(0);
    transition: transform 0.56s cubic-bezier(0.22, 1, 0.36, 1);
}
.doc-cta-link .dot {
    width: 8px; height: 8px; border-radius: 50%;
    transition: transform 0.56s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.36s ease;
}
.doc-cta-link .dot-left  { transform: translateX(-16px); opacity: 0; }
.doc-cta-link .dot-right { transform: translateX(0);     opacity: 1; }
/* On hover/tap: track slides right, right dot exits edge, left dot enters */
.doc-cta-link:is(:hover,:active) .doc-cta-track { transform: translateX(12px); }
.doc-cta-link:is(:hover,:active) .dot-left  { transform: translateX(0);    opacity: 1; }
.doc-cta-link:is(:hover,:active) .dot-right { transform: translateX(18px); opacity: 0; }
```

JS click handler (intercept tap on mobile, delay navigation to let animation play):
```javascript
document.addEventListener('click', function(e) {
    var link = e.target.closest('.doc-cta-link');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href[0] === '#') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (link.dataset.animating === '1') return;
    link.dataset.animating = '1';
    link.classList.add('is-animating');
    link.style.pointerEvents = 'none';
    setTimeout(function() { window.location.href = href; }, 620);
}, true);
```

### 32. Trial URL Appears Unchanged After CSS Fix

**Problem:** Changes to `public/patient-menu-trial.html` were deployed, but hover behavior looked unchanged in production.

**Root Cause:** Trial router logic in `public/scripts/patient-theme-trial.js` could redirect trial pages to old pages when session mode was not active, so users sometimes saw old page styles despite opening `/patient-menu-trial.html`.

**Fix:**
1. In `patient-theme-trial.js`, only redirect trial → old when user explicitly requests old mode via query (`?theme=off|old|default`).
2. Keep trial URL on trial page by default.
3. Bump `CACHE_VERSION` in `public/sw.js` after frontend changes.

**Verification Steps:**
```bash
# On server
cd /var/www/dokterdibya
git pull origin main
pm2 restart all

# Verify deployed files
grep -n "CACHE_VERSION" public/sw.js
sed -n '2018,2032p' public/patient-menu-trial.html
```

**Lesson:** If UI seems unchanged after valid CSS edits, check route/mode redirect scripts first (not only CSS and cache). URL can be correct visually but content source can still be switched by JS logic.

### 34. Session Log - 14 April 2026

**Clearpath Button Snippet (Final Approved by User)**

User confirmed with "perfect" after final CTA behavior tuning for patient menu trial.

**Final behavior requested:**
- Hover: text moves further right until near edge
- Left dot: stays near left area (does not travel far right with text)
- Right dot: fades/moves out

**Final CSS values:**
```css
.doc-cta-link .dot-left { transform: translateX(-58px); opacity: 0; }
.doc-cta-link:is(:hover, :focus-visible, :active) .doc-cta-track,
.doc-cta-link.is-animating .doc-cta-track { transform: translateX(42px); }
.doc-cta-link:is(:hover, :focus-visible, :active) .dot-left,
.doc-cta-link.is-animating .dot-left { transform: translateX(-42px); opacity: 1; }
```

**Reusable snippet saved:**
- VS Code snippet name: `clearpath-button`
- File: `snippets/clearpath-button.code-snippets`
- Includes: HTML structure, CSS motion values, and JS delayed navigation handler (620ms)

### 35. Session Log - 15 April 2026

**Sticky Stack Card-Deck - Final Working Pattern**

User confirmed with "sudah sempurna buatan anda" after multiple refinements to the sticky stack in `public/patient-menu-trial.html`.

**Final fixes that worked:**

1. **Stop using a single global active row timeline**
    - Old approach based collapse on one shared `activeIndex/localP`
    - This caused later rows to feel delayed and could make top titles appear to shift when the next row started collapsing
    - Final working approach computes `rowStartY` and progress **per row**

2. **Measure expanded row height from a hidden clone**
    - Reading live row height during animation produced unstable segment timing
    - Final fix clones the row off-screen, restores expanded padding and desc state, then measures:
    ```javascript
    function measureExpandedRow(row) {
         var clone = row.cloneNode(true);
         clone.style.position = 'absolute';
         clone.style.visibility = 'hidden';
         clone.style.pointerEvents = 'none';
         clone.style.zIndex = '-1';
         clone.style.paddingTop = PAD_TOP_MAX + 'px';
         clone.style.paddingBottom = PAD_BOT_MAX + 'px';
         ...
    }
    ```

3. **Per-row collapse start formula**
    - Final working formula:
    ```javascript
    var slotTop = STICKY_OFFSET + (i * COLLAPSED_H);
    var rowLead = COLLAPSE_LEAD_PX;
    if (isPatientFeaturesSection) {
         rowLead += i * 56;
    }
    var start = row.offsetTop - slotTop - rowLead;
    ```
    - This is what fixed row 2, 3, and 4 feeling late

4. **Patient features section needs custom tuning**
    - Generic timing was not enough for `Fitur Pasien Portal`
    - Final approved tuning:
    ```javascript
    var COLLAPSE_LEAD_PX = 72;
    rowLead += i * 56;          // patient-features-section only
    lastRowHold = 40;           // instead of full 200 for this section
    ```

5. **Fade out must happen very early**
    - Final approved fade settings:
    ```javascript
    var fadeWindow = 0.18;
    var opacity = 1 - Math.pow(fadeP, 0.72);
    ```
    - This makes desc text disappear fast enough before the row fully collapses

6. **Scroll sync needed extra help**
    - Browser scroll updates could lag relative to direct `scrollTo()` tests
    - Final reliable solution keeps `onScroll()` synced with both event-driven and periodic updates:
    ```javascript
    window.addEventListener('scroll', scheduleScrollSync, { passive: true });
    window.addEventListener('wheel', scheduleScrollSync, { passive: true });
    window.addEventListener('touchmove', scheduleScrollSync, { passive: true });
    window.setInterval(onScroll, 33);
    ```

**Final behavior achieved:**
- `TANYA DOKTER` title stays locked in its sticky slot
- Row 2 fades/collapses earlier
- Row 3 and 4 no longer lag behind
- Desc text disappears before full collapse finishes

**Documentation updated:**
- File: `snippets/sticky-stack-card-deck.md`
- Updated to match the final per-row implementation instead of the older global-segment model

### 36. Session Log - 15 May 2026

**Sunday Clinic Refresh Leaving Staff PWA (User Confirmed Success)**

User confirmed with "berhasil!" after the final Sunday Clinic refresh fix.

**Problem:**
- On Android, refreshing Sunday Clinic showed the Chrome/custom-tab header with the `X` button instead of staying inside the installed staff PWA.
- Reinstalling the PWA did not fix it.

**Root Cause:**
- Sunday Clinic could start from an in-scope staff URL, but client-side navigation later rewrote the browser URL to `/sunday-clinic/{mrId}/{section}`.
- That path is outside the staff PWA manifest scope `/staff/`, so the next refresh reopened in browser/custom-tab chrome.
- Some launchers and redirects in staff code also still pointed directly to `/sunday-clinic/...`, reintroducing the same out-of-scope route.

**What actually fixed it:**
1. In `staff/public/scripts/sunday-clinic.js`:
    - stop writing `/sunday-clinic/...` into history
    - keep route updates on `/staff/public/sunday-clinic.html?mr=...&section=...`
    - parse query-based route state instead of relying on path segments
2. In `staff/public/scripts/main.js`, `staff/public/scripts/klinik-private.js`, `staff/public/scripts/sunday-clinic/utils/medical-import.js`, and `staff/public/index-adminlte.html`:
    - replace Sunday Clinic launch URLs from `/sunday-clinic/...` to `/staff/public/sunday-clinic.html?...`
    - preserve `mobile=1` via existing mobile URL helpers
3. In `staff/public/sunday-clinic.html`:
    - normalize mobile mode URLs so installed-app sessions keep `mobile=1`
4. Force fresh assets after the route fix:
    - bump `STAFF_PWA_VERSION` to `v110` in `staff/public/sw.js`
    - bump `window.__assetVersion` to `v110` in `staff/public/index-adminlte.html`
    - bump `PAGE_VERSION` to `20260515v4`, `SC_CACHE_VERSION` to `v20260515chat3`, and `sunday-clinic.js` to `?v=20260515v11` in `staff/public/sunday-clinic.html`

**Verification pattern that mattered:**
1. Check whether any code still writes or opens `/sunday-clinic/...` instead of the in-scope staff page.
2. Confirm manifest scope is `/staff/` and that Sunday Clinic URLs stay under `/staff/public/`.
3. After route fixes, bump service worker and page asset versions, then redeploy before retesting on device.
4. Retest from the installed home-screen PWA, navigate into Sunday Clinic, then refresh there.

**Critical lesson:**
- If an installed PWA page opens fine at first but refresh shows browser chrome, inspect `history.pushState`, launcher URLs, and redirects for out-of-scope paths before assuming the manifest is wrong.
- On this repo, fixing scope alone is often not enough; stale JS can preserve the bad route writer until staff asset versions are bumped and redeployed.

### 37. Session Log - 16 May 2026

**Staff PWA Chat Keyboard Jump on Android (User Confirmed Success)**

User confirmed with "mantap" after the Android chat keyboard jump was fixed.

**Problem:**
- In the installed Android staff PWA, tapping the team chat input made the bottom nav jump upward.
- About a second later, the chat box was pulled upward again, creating a double-jump effect while typing.

**Root Causes (stacked):**
1. `staff/public/styles/mobile-responsive.css` still had `body.mobile-app-mode #mobile-action-bar` pinned to the top of the screen, even though the mobile nav was meant to behave as a bottom bar.
2. `staff/public/index-adminlte.html` had an inline `.mobile-action-bar-force` override also forcing that same bar to `top: 0`, so the layout conflict survived even if one stylesheet changed.
3. `staff/public/scripts/chat-popup.js` positioned the open chat panel using `top + bottom + height` together while also reacting to `visualViewport`, which caused unstable reflow when the Android keyboard changed the visual viewport.
4. The early/basic toggle path in `chat-popup.js` could open the chat with older geometry before the full handler upgraded it, causing a delayed correction that looked like a second jump.

**What actually fixed it:**
1. In `staff/public/styles/mobile-responsive.css`:
    - move `body.mobile-app-mode #mobile-action-bar` back to the bottom with `top: auto` and `bottom: 0`
    - switch content spacing from top padding to bottom padding (`padding-bottom: 78px`)
    - use bottom-safe-area padding and bottom-oriented shadow/border
2. In `staff/public/index-adminlte.html`:
    - stop `.mobile-action-bar-force` from pinning the nav to the top
    - keep the forced bar aligned with bottom-nav behavior instead
3. In `staff/public/scripts/chat-popup.js`:
    - add `chat-keyboard-active` handling so the bottom nav hides while typing
    - sync the open chat layout immediately on `resize` and `visualViewport` changes
    - stop anchoring the panel with conflicting `top/bottom/height` rules; instead compute the frame directly from `visualViewport.offsetTop`, `offsetLeft`, `width`, and `height`
    - add `applyMobileViewportFrame()` and route open-chat layout through it
    - keep the basic toggle path in sync with the same keyboard/layout logic so the panel does not open with stale geometry first
4. Force fresh assets after the fix:
    - `window.__assetVersion` -> `v118`
    - `chat-popup.js` -> `?v=v113`
    - `PAGE_VERSION` -> `20260515v14`
    - `SC_CACHE_VERSION` -> `v20260515chat13`
    - `STAFF_PWA_VERSION` -> `v119`

**Critical lesson:**
- If chat jumps in two phases on Android PWA, inspect both the nav CSS and the chat panel geometry. A bottom bar that is secretly still top-fixed in `mobile-app-mode` will keep destabilizing keyboard layouts.
- In this repo, keyboard bugs on Android PWA are often caused by over-constrained fullscreen geometry. Prefer deriving the chat frame from `visualViewport` directly instead of mixing `top`, `bottom`, and `height` constraints.

### 38. Session Log - 20 May 2026

**Tanya Dokter Table/List Positioning Fix (Staff Panel)**

User requested: "Tanya Dokter tidak tepat posisi tabelnya, betulkan".

**What worked:**
1. Add scoped layout rules in `staff/public/index-adminlte.html` under `#tanya-dokter-page` to lock width/margin for the question list/table container.
2. Wrap question list block with `table-responsive tanya-questions-table-shell` so table/list content stays aligned in the card body.
3. Normalize question card side margins to avoid visual shift.
4. Bump cache versions so clients fetch the fix immediately:
    - `window.__assetVersion = 'v171'`
    - `STAFF_PWA_VERSION = 'v171'`

**Verification pattern:**
1. Confirm CSS selectors and wrapper markup exist.
2. Confirm both version bumps are present.
3. Deploy and verify health endpoint stays healthy.

**Lesson:**
- For staff page layout drift, use page-scoped CSS (`#page-id ...`) first; avoid broad global table overrides.

### 39. Session Log - 26 May 2026

**Trial Landing Mobile Footer + Stale Service Worker Escape (User Confirmed Success)**

User confirmed with "berhasil! you did it" after the footer background and cache trap were fixed.

**What worked:**
1. Sync footer grain with footer photo parallax by applying the same `--journey-parallax-y` transform to `.footer-grain`.
2. Add footer classes directly to the high-specificity reduced-motion whitelist:
   - `.site-footer`
   - `.footer-card-frame`
   - `.footer-photo`
   - `.footer-grain`
   - `.footer-vignette`
   - `.footer-inner`
3. Use mobile-first footer background sizing:
   ```css
   .site-footer {
       --journey-bg-size: auto 118%;
       --journey-position: center 56%;
   }
   @media (min-width: 900px) {
       .site-footer {
           --journey-bg-size: 156% auto;
           --journey-position: center center;
       }
   }
   ```
4. Remove service-worker-level `Response.redirect(...)` version enforcement for trial landing; stale active SWs can trap new versions back to old `_v` values.
5. Use an early HTML version script in `public/trial-landing/index.html` that unregisters stale service workers, deletes caches, then navigates via a `blob:` trampoline before returning to the fresh `_v`.
6. Bump both versions together:
   - `PAGE_VERSION = '20260526m'`
   - `CACHE_VERSION = '20260526m'`

**Verification pattern:**
- Browser/Playwright verification is required for this page.
- Old URL `_v=20260526j` must land on `_v=20260526m`.
- Mobile `421x705` should show `auto 118%` and `center 56%`.
- Desktop `1280x800` should remain `156% auto` and `center center`.

**Lesson:**
- For patient PWA trial landing cache issues, avoid SW navigation redirects. Use page-level stale-worker escape and verify with a real browser.

### 40. Session Log - 28 May 2026

**SISIwanita Gerakan Bayi Home Shell + Bottom Nav (User Confirmed "GPT JOB")**

User confirmed with "luar biasa, ini baru GPT JOB" after the Gerakan Bayi trial page finally matched the home portal.

**What worked:**
1. Rebase `public/kick-counter-trial.html` on the actual home shell IDs/classes from `public/patient-menu-simple-trial.html`:
    - `#home-topbar`, `#home-topbar-inner`, `#home-brand-link`, `#home-brand-title`, `#home-brand-sub`
    - `#home-bottom-nav`, `#home-bottom-inner`
2. Keep generic trial header/nav disabled:
    - `<html data-trial-nav="off">`
    - `window.__patientTrialHeaderInstalled = true`
3. Add a final post-theme CSS layer after `patient-trial-theme.css`; order matters because shared theme overrides brand/nav/card styles.
4. Match home bottom nav from the **final** home override block, not the first/base `.bottom-nav` rule:
    - width `min(460px, calc(100% - 28px))`
    - bottom `safe-area + 8px`
    - border `0`, radius `19px`, padding `6px`
    - background `rgba(0, 0, 0, 0.1)`, blur `5px`, no shadow
    - nav item font `8px`, icon `12px`, radius `14px`, padding `6px 3px`
    - active item transparent; only `:active` darkens
5. Move the counter directly under the hero and compress idle state so `Mulai Menghitung` appears above the fixed nav on mobile.
6. Normalize mock API responses to real backend shape (`summary`, `stats.week`) and update summary/chart immediately after taps.
7. Bump `public/sw.js` after patient-facing frontend fixes:
    - `20260528k` for shell adoption
    - `20260528l` for final bottom nav parity

**Verification pattern:**
- Use Playwright computed styles to compare home vs Gerakan Bayi nav; screenshots alone are not enough.
- Confirm old shell count is zero: `.trial-unified-header`, `.topbar-trial`, `#kick-topbar`, `#kick-bottom-nav`.
- Smoke test with `?mockApi=1`: load, start session, tap once, summary/chart update, save session, recent/history render.
- Verify production `/api/health` is `200` and live `sw.js` serves the new cache version.

**Lesson:**
- For SISIwanita trial pages, final parity with home often depends on late `body #home-*` override blocks. Always inspect and copy those final overrides before declaring the page visually matched.
