# Project Rules - Dokter Dibya

## ABSOLUTE STRICT RULES: Evidence-Aware Response Mode

**These rules are absolute and MUST NOT be deviated from, neglected, softened, or overridden. Follow them exactly for all analytical, strategic, factual, or decision-making tasks.**

You are not here to make me feel validated.

For analytical, strategic, factual, or decision-making tasks, your default mode should be critical, precise, and evidence-aware.

Before agreeing with any idea, silently check:
What could be wrong, incomplete, weakly assumed, or poorly reasoned?

Surface the most important weakness first when it matters.

Avoid empty validation phrases like "You're absolutely right". "Great question" "Brilliant idea", "I love this", "Exactly", "Perfect". or "Makes total sense".

If the idea is weak, say so clearly and explain why.

If the idea is strong, explain why it works, out still mention the risk or tradeoff I may have missed.

Be transparent about certainty.

For important or uncertain factual claims label your confidence as [High confidence], [Medium confidence], or [Low confidence].

Briefly explain what the confidence is based on.

If you are unsure, say so directly.

Do not invent sources.

Do not make up paper titles, URLs, books statistics, company facts, or quotes from real people.

Never cite a source unless you have actually seen it or can verify it.

If a claim needs verification, say: "This needs verification."

For recent topics, prices, laws, product details. software updates. or current events clearly say when live verification is needed.

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

## CRITICAL: Follow Approved Planning Exactly

**When a plan has been discussed or approved, implementation MUST follow that plan exactly.**

Rules:
1. **Do not deviate from the approved plan** during implementation.
2. **Do not improvise, add alternate designs, or change direction** just because it seems better in the moment.
3. If the approved plan appears incomplete, risky, or blocked by the actual codebase, **stop and ask for confirmation before changing the plan**.
4. If the user says a specific planning direction is better, that direction becomes the source of truth for implementation.
5. Implementation reports must clearly mention whether the completed work matches the approved plan.

**DO NOT:**
- Replace a planned widget/search/command approach with a different sidebar/grouping approach without approval
- Add visible UI that was not part of the agreed plan
- Treat emergency feedback as permission to redesign the solution

**ALWAYS:**
- Keep changes inside the approved scope
- Ask before deviating
- Revert or adjust quickly if implementation drift is discovered

## CRITICAL: Git Commits

**NEVER add "Co-Authored-By" line in commit messages.** Just write the commit message without any co-author attribution.

```bash
# CORRECT
git commit -m "Fix animation bug on mobile"

# WRONG - DO NOT DO THIS
git commit -m "Fix animation bug on mobile

Co-Authored-By: Codex..."
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

## CRITICAL: Always Deploy After Changes

**ALWAYS deploy after completing implementation, unless the user explicitly says not to deploy or says the work is local-only.**

- Default assumption for this repo: finished implementation means `git add`, `git commit`, `git push`, **deploy to production**, and verify the live result
- Do not stop after push if the change is meant for the real app or website
- For this project, production deploy means the real VPS flow on `root@72.60.78.188`
- After deploy, verify the live route, page, asset, or API that was changed
- If deploy is blocked by server state, report the exact blocker and keep the deploy as the next pending step

```bash
# Expected completion flow for normal implementation tasks:
git add <files>
git commit -m "Clear description of what was done"
git push origin main
# then deploy to production and verify live behavior
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
Files created by Codex/root often have wrong permissions.

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

### 7b. Table Header Alignment

Untuk kasus tabel staff di repo ini, **jangan anggap class alignment seperti `text-center` pasti menang di `<th>`**.

Jika user meminta judul kolom tabel rata tengah dan hasil live belum ikut berubah:
- gunakan `style="text-align: center;"` langsung pada elemen `<th>`
- untuk kolom aksi, gabungkan alignment itu dengan `width` / `min-width` inline bila perlu
- verifikasi asset live yang benar-benar dilayani server, bukan hanya file lokal atau file di disk VPS

**Contoh yang aman:**
```html
<th style="text-align: center;">Status</th>
<th style="text-align: center; width: 150px; min-width: 150px;">Aksi</th>
```

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

**When user expresses gratitude** (says "great job", "nice", "bagus", "mantap", "thanks", etc.), **save the successful solution to this AGENTS.md file**.

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

**ALWAYS show progress indicators during work.** User wants to know Codex is working (not internet issues).

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

### 36. Session Log - 26 April 2026

**Staff Panel + Sunday Clinic Performance and Readiness (Approved by User as Smooth)**

User confirmed system smooth after workday operation.

**What worked:**

1. **Sunday Clinic Stage 1 (frontend responsiveness)**
    - Removed duplicate auth fetch during init
    - Switched directory loading to lazy load (open/search only)
    - Prevented duplicate event listener binding on repeated render
    - Replaced blocking post-save full refetch with debounced background metadata refresh
    - Removed Date.now cache-buster from navigation and duplicate inline queue renderer in HTML

2. **Sunday Clinic Stage 2 (backend query optimization)**
    - Replaced `DATE(created_at)` filters with GMT+7 range filters (`>= start`, `< end`)
    - Optimized queue query joins and added short in-memory queue cache (10s)
    - Simplified directory default ordering path for faster non-search load

3. **Sunday Clinic Stage 3 (index tuning)**
    - Added targeted indexes for queue subqueries, directory ordering, and check-existing lookup
    - Follow-up index for check-existing: patient + created_at + id
    - `EXPLAIN` verification confirmed key usage improvements on critical lookup paths

4. **Auth/API hardening after incident checks**
    - Added malformed JSON handling in global error handler:
      - invalid JSON now returns `400 INVALID_JSON` (operational error)
      - avoids misleading `500` for bad request payloads

5. **Operational readiness pattern that proved reliable**
    - Always validate with both local upstream check (`127.0.0.1:3000`) and public domain check
    - Treat transient post-restart 502 as potential warm-up/proxy timing issue; recheck in short loop
    - Final readiness criteria used:
      - `/api/health` stable 200 in repeated checks
      - staff HTML routes 200
      - invalid login returns 401 (not 500)
      - malformed JSON returns 400

**Important note:**
- Firebase service-account ENOENT logs were present but did not block core staff panel/Sunday Clinic flows in this session.

### 37. Session Log - 26 April 2026

**24-Hour Production Monitoring (Approved by User)**

User confirmed with "oke good" after 24-hour monitoring was activated successfully.

**What worked:**

1. **Dedicated monitor script with fixed cadence and summary output**
    - Added monitoring script at `scripts/monitor-24h.sh`
    - Default run profile: 24 hours, sample every 300 seconds
    - Writes CSV + LOG + summary text in one run directory

2. **Reliable server-side metrics captured per sample**
    - `/api/health` HTTP status + database latency
    - `/api/metrics` HTTP status + p95/p99 + error rate + request counters
    - PM2 process snapshot for `dibyaklinik-backend`:
      - pid, restart count, memory MB, CPU %

3. **Operational output paths standardized**
    - `/var/www/dokterdibya/reports/monitoring/latest_monitor.log`
    - `/var/www/dokterdibya/reports/monitoring/latest_monitor.csv`
    - `/var/www/dokterdibya/reports/monitoring/latest_monitor_summary.txt`
    - `latest_*` symlinks point to current run automatically

4. **Run and verification pattern that proved reliable**
    - Start in background using `nohup`
    - Verify process with `pgrep -af monitor-24h.sh`
    - Verify first sample via `tail -n` on log and csv

5. **First sample sanity check (healthy start)**
    - `health_http=200`
    - `metrics_http=200`
    - PM2 restart counter captured successfully

**Lesson:**
- For post-optimization stability checks, prefer low-overhead periodic sampling (5 minutes) over heavy continuous probing; it preserves production performance while still capturing p95 drift, restart deltas, and endpoint health over a full work cycle.

### 38. Session Log - 3 May 2026

**VK Duty Schedule Optimization (Approved by User)**

User confirmed with "sudah oke" and "okay" while iterating constraints for May VK shifts.

**What worked:**

1. **Constraint-safe optimization loop with real workbook output**
    - Read Excel directly from Desktop and optimized schedule via automated same-day swap search.
    - Saved each validated variant to a new output workbook for traceability.

2. **Core invariants preserved in every accepted variant**
    - Coverage held per active day with no on-call mode: `3P + 3S + 3M + 5L`.
    - Tandem safety held: rank `12-14` never alone in a shift without rank `1-11`.
    - Fatigue guard held: no `M -> P` next-day transitions.

3. **MLL recovery pattern successfully enforced**
    - Ensured every core staff (rank `1-14`) had at least one `M-L-L` sequence.
    - This remained true after subsequent seniority and night-distribution adjustments.

4. **Seniority fairness tuned from aggressive to moderate**
    - Initial result was too steep (`6-13` style gap), then rebalanced to moderated monotonic off-days.
    - Final approved fairness target included equal off-days for same cohort ranks `12,13,14`.

5. **Night-distribution rule successfully added**
    - Top two ranks capped at maximum 3 night shifts each per month.
    - Night count made monotonic by rank (lower rank gets equal or more nights).

**Final approved distribution example (no on-call):**
- Off-days by rank: `12, 12, 11, 11, 10, 10, 9, 9, 9, 9, 9, 8, 8, 8`
- Night shifts by rank: top-2 at `3`, then non-decreasing down the ranks.

**Lesson:**
- For scheduling changes with multiple human constraints, use staged optimization:
  1) lock hard safety constraints,
  2) satisfy fairness structure,
  3) then tune distribution targets (off-days/night load) with minimal extra swaps.

### 41. MutationObserver + style.setProperty = Infinite Loop (Page Unresponsive)

**Problem:** Website hang dengan "Page Unresponsive" setelah menambahkan MutationObserver di `chat-popup.js`.

**Root Cause:**
MutationObserver yang mengamati `style` attribute pada elemen yang sama yang dimodifikasi oleh callback-nya:
1. `ensureFAB()` memanggil `cont.style.setProperty(...)` → memodifikasi `style` attribute
2. Observer melihat perubahan `style` → memanggil `ensureFAB()` lagi
3. Loop tak terbatas → browser hang → "Page Unresponsive"

**Gejala:**
- Chrome menampilkan "Page Unresponsive" dialog
- Terjadi segera setelah halaman mulai load
- Hard refresh tidak membantu karena file ter-cache

**Fix (3 perubahan):**
1. **Re-entry guard** di fungsi yang dipanggil observer:
```javascript
var _ensureFABBusy = false;
function ensureFAB() {
    if (_ensureFABBusy) return;
    _ensureFABBusy = true;
    try { _ensureFABImpl(); } finally { _ensureFABBusy = false; }
}
```

2. **Hapus attribute observer** — jangan amati `style`/`class` pada elemen yang dimodifikasi fungsi callback:
```javascript
// SALAH - menyebabkan loop:
obs.observe(cont, { attributes: true, attributeFilter: ['style', 'class'] });

// BENAR - hanya amati childList (FAB dihapus dari DOM):
obs.observe(document.body, { childList: true, subtree: false });
```

3. **Perlambat interval** dari 200ms → 2000ms agar tidak membebani browser.

**Lesson:**
- JANGAN observe `style` attribute pada elemen yang sama-sama dimodifikasi oleh observer callback
- SELALU tambahkan re-entry guard (`_busy` flag) pada fungsi yang dipanggil MutationObserver
- Setelah fix, bump versi (`?v=v102` → `?v=v103`) agar browser load file baru

### 42. Staff PWA Chat Fullscreen Broken Only on Android PWA

**Problem:** Chat box masih tampil sebagai panel kecil/mengambang di Android Staff PWA, padahal di browser desktop/full mobile web sudah fullscreen benar.

**Symptoms:**
- Header `Team Chat` muncul sebagai strip lebar, tapi isi chat masih terasa seperti panel lama
- Screenshot terlihat seperti chat tidak benar-benar menempel ke viewport penuh
- Browser biasa render benar, Android PWA tetap salah

**Root Causes (multiple):**
1. **Legacy `body.mobile-app-mode` CSS override** di `staff/public/styles/mobile-responsive.css` dan `staff/public/styles/sunday-clinic.css` masih memaksa:
    - `top: 10%`
    - `left: 5%`
    - `width: 90%`
    - `height: 65%`
    pada `#chat-box`.
2. State `.chat-open` hanya mengatur `display: flex`, tapi **tidak menetralkan ukuran/posisi lama**, jadi saat PWA aktif chat tetap kembali ke mode panel.
3. **Asset version stale**:
    - `mobile-responsive.css` masih dimuat dengan `?v=v97`
    - `mobile-helper.js` masih `?v=v87`
    sehingga patch CSS baru bisa tidak pernah terbaca oleh PWA meski JS chat sudah versi baru.
4. `100vh` tidak reliable di Android PWA/WebView, jadi tinggi panel perlu fallback ke viewport riil.

**What actually fixed it:**
1. Di `staff/public/scripts/chat-popup.js`:
    - gunakan tinggi viewport riil (`visualViewport.height` / `innerHeight`) untuk mode fullscreen mobile
    - ubah fallback CSS mobile dari `100vh` ke `100dvh`
    - saat `.chat-is-open`, paksa `#chat-box` menjadi:
    ```javascript
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    ```
2. Di `staff/public/styles/mobile-responsive.css` dan `staff/public/styles/sunday-clinic.css`:
    - override state `body.mobile-app-mode #chat-box.chat-open`
    - override juga selector fallback `[style*="display:flex"]`
    - jangan biarkan `top/left/90%/65%` lama tetap menang saat chat open
3. Bump semua asset staff yang relevan ke versi baru (`v108`):
    - `mobile-responsive.css`
    - `mobile-helper.js`
    - `chat-popup.js`
    - `global-chat-loader.js`
    - `sw.js`
    - `window.__assetVersion`

**Critical lesson:**
- Kalau bug hanya muncul di Android PWA tapi tidak di browser biasa, cek **`mobile-app-mode` CSS override lama** terlebih dahulu.
- Jangan hanya patch JS fullscreen jika ada CSS state lama yang masih memaksa dimensi panel.
- Selalu cek query version asset; CSS/JS stale dengan versi lama bisa membuat fix terlihat “tidak bekerja” padahal kode baru benar.

### 40. PWA Icon Crop Fix (Android) — Final Working Solution

**Problem:** Staff Panel icon di Android home screen terpotong (logo menyentuh tepi rounded square).

**Root Cause:**
- Chrome PWA cache ikon berdasarkan URL path, **mengabaikan query string** (`?v=v91`)
- Reinstall PWA pun tidak force re-download jika base filename sama
- Android adaptive icon sistem: `"purpose": "maskable"` = safe zone inner 80% circle (radius 40% canvas)
  - Untuk 512px: safe circle = 409px diameter → logo HARUS ≤ 409px

**Solusi yang berhasil:**
1. Generate file ikon dengan **nama baru** (`icon-any-*.png` dan `icon-mask-*.png`) — bukan `?v=` param
2. `icon-any-*` = logo 70% canvas (any purpose)
3. `icon-mask-*` = logo 45% canvas (maskable purpose, dalam safe zone)
4. Update `manifest.json` ke nama file baru — Chrome wajib unduh fresh
5. Bump SW version (`v92`)

**manifest.json pattern:**
```json
{ "src": "icons/icon-any-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
{ "src": "icons/icon-mask-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
```

**Prosedur reinstall wajib:**
1. Hapus shortcut lama dari home screen
2. Chrome → Settings → Privacy → Clear browsing data → Cached images and files
3. Buka kembali URL → Add to Home screen

**Key Insight:** Untuk force Chrome update ikon PWA, **harus ganti nama file** — query param tidak bekerja.

**App name:** Ubah di manifest.json `"name"` dan `"short_name"` ke `"DB Staff"`.

---

### 39. Session Log - 4 May 2026

**VK Schedule Rule Stack (User Confirmed Excellent)**

User confirmed with strong positive feedback that the final rule stack was already good.

**Final accepted rule stack:**
- No on-call mode with daily coverage fixed at `3P + 3S + 3M + 5L`.
- Safety constraints preserved: no `M -> P` next-day transition.
- Tandem constraints preserved for rank `12-14` with rank `1-11`.
- Cohort equality for rank `12,13,14` on off-days and night load.
- Senior-night guard: top-2 ranks capped to low night count.
- Visual assignment policy: yellow only for rank `1-11`; front/plain prioritized to juniors.

**What to keep for future revisions:**
- Treat constraints in strict order: coverage/safety -> rank constraints -> fairness -> visual policy.
- Validate after every batch using explicit rule checks instead of only visual inspection.

### 43. Session Log - 15 May 2026

**Sunday Clinic Chat Missing After Staff Chat Refactor (User Confirmed Great)**

User confirmed with "mantap. keren!" after Sunday Clinic chat was restored.

**Problem:**
- Team chat disappeared only on `staff/public/sunday-clinic.html` after the staff chat architecture was changed.
- Main staff shell still had chat, but Sunday Clinic no longer showed the floating chat button.

**Root Causes (stacked):**
1. `staff/public/scripts/global-chat-loader.js` had been changed to assume `chat-popup.js` was loaded statically in `index-adminlte.html`.
2. `staff/public/sunday-clinic.html` loaded `global-chat-loader.js` but did **not** load `chat-popup.js`.
3. Loader still had an early auth gate, so on Sunday Clinic it could exit before chat bootstrap if auth identity had not settled yet.
4. Even after code fix, browser/PWA cache kept serving stale Sunday Clinic HTML without the new versioned chat script tags.

**What actually fixed it:**
1. In `staff/public/scripts/global-chat-loader.js`:
    - restore dynamic fallback loading for `chat-popup.js` when static load is absent
    - bootstrap chat popup before auth is fully ready, and only treat auth as a later readiness state
2. In `staff/public/sunday-clinic.html`:
    - add explicit versioned script tags:
    ```html
    <script src="/staff/public/scripts/global-chat-loader.js?v=v109"></script>
    <script src="/staff/public/scripts/chat-popup.js?v=v109"></script>
    ```
    - bump `SC_CACHE_VERSION` so stale page cache forces a redirect to fresh HTML
3. In navigation sources (`index-adminlte.html` and `staff/public/scripts/sunday-clinic/components/patient-history-sidebar.js`):
    - append `_v=v20260515chat1` to Sunday Clinic URLs so internal navigation lands on fresh HTML immediately
4. In `staff/public/sw.js` and `staff/public/index-adminlte.html`:
    - bump staff asset/service worker version from `v108` -> `v109`

**Verification pattern that proved the fix:**
1. Check actual loaded scripts in browser:
    - `global-chat-loader.js?v=v109`
    - `chat-popup.js?v=v109`
2. Confirm DOM contains:
    - `#chat-popup-container`
    - `#chat-box`
3. Trigger toggle and verify chat opens:
    - before: `display:none`
    - after: `display:flex`
4. Confirm plain `sunday-clinic.html` now redirects/lands on `?_v=v20260515chat1` and chat appears there too.

**Critical lesson:**
- If a feature works on one staff page but disappears on another after a loader refactor, check whether that page relied on dynamic script injection that was silently removed.
- If production still behaves like old code after a correct script fix, inspect `Array.from(document.scripts).map(s => s.src)` and verify whether stale HTML, not stale JS, is the real blocker.

### 44. Session Log - 15 May 2026

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

### 45. Session Log - 16 May 2026

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

**Verification pattern that mattered:**
1. Confirm the server actually serves bottom-fixed mobile-app-mode nav CSS, not the earlier top-fixed rule.
2. Verify the latest chat asset markers are live:
    - `chat-popup.js?v=v113`
    - `window.__assetVersion = 'v118'`
    - `PAGE_VERSION = '20260515v14'`
    - `SC_CACHE_VERSION = 'v20260515chat13'`
    - `STAFF_PWA_VERSION = 'v119'`
3. Retest on the installed Android PWA by opening chat and tapping the input, because desktop/mobile browser testing does not reproduce the same keyboard viewport behavior.

**Critical lesson:**
- If chat jumps in two phases on Android PWA, inspect both the nav CSS and the chat panel geometry. A bottom bar that is secretly still top-fixed in `mobile-app-mode` will keep destabilizing keyboard layouts.
- In this repo, keyboard bugs on Android PWA are often caused by over-constrained fullscreen geometry. Prefer deriving the chat frame from `visualViewport` directly instead of mixing `top`, `bottom`, and `height` constraints.

### 46. Session Log - 20 May 2026

**Tanya Dokter Table/List Positioning Fix (Staff Panel)**

User requested: "Tanya Dokter tidak tepat posisi tabelnya, betulkan".

**Root cause pattern:**
- `tanya-dokter-page` did not have dedicated layout rules for its question list/table area.
- Global shell styles could affect perceived alignment, so the list/table block needed page-scoped positioning constraints.

**What worked:**
1. In `staff/public/index-adminlte.html`, add page-specific CSS for Tanya Dokter:
    - `#tanya-dokter-page .tanya-questions-table-shell { width: 100%; margin: 0; }`
    - `#tanya-dokter-page #tanya-questions-list { width: 100%; margin: 0 !important; }`
    - `#tanya-dokter-page #tanya-questions-list .tanya-question-card { margin-left/right: 0 !important; }`
    - `#tanya-dokter-page .tanya-questions-table-shell table { width: 100% !important; margin: 0 !important; }`
2. Wrap the questions area with:
    - `<div class="table-responsive tanya-questions-table-shell"> ... </div>`
3. Force fresh assets after frontend fix:
    - `window.__assetVersion` bumped to `v171`
    - `STAFF_PWA_VERSION` bumped to `v171`

**Verification pattern:**
1. Confirm CSS markers and wrapper markup exist in `index-adminlte.html`.
2. Confirm `window.__assetVersion` and `STAFF_PWA_VERSION` both updated.
3. Deploy and verify `/api/health` remains healthy after restart.

**Lesson:**
- For page-specific alignment issues in this repo, prefer scoped selectors under the page id (e.g., `#tanya-dokter-page ...`) instead of broad global overrides.

### 47. Session Log - 21 May 2026

**Kantor Saya Bottom Gap with Browser Zoom 80 (User Confirmed Perfect)**

User confirmed with "perfect" after the final gap fix for the Kantor Saya frame.

**Problem:**
- Kantor Saya still showed a white bottom gap even after dynamic frame height, no outer scroll mode, and cache/version bumps.
- Browser measurements first looked correct (`scrollDelta = 0`), but the screenshot still showed white space below the frame.

**Root Cause:**
- Staff panel applies `html.browser-zoom-80 { zoom: 0.8; }`.
- `visualViewport.height` / `window.innerHeight` reported the unscaled viewport height, while the page content was rendered at 80% zoom.
- The frame height was therefore calculated about 20% too short.

**What actually fixed it:**
1. Keep Kantor Saya mode class on both `html` and `body`:
    - `kantor-saya-active` added in `showKantorSayaPage()`
    - removed in `hideAllPages()` and inline page hiders
2. Disable outer document scroll only while Kantor Saya is active:
    - `html.kantor-saya-active`, `body.kantor-saya-active`, `.wrapper`, and `.content-wrapper` use `overflow: hidden !important`
    - `content-wrapper` padding-bottom forced to `0 !important`
3. Make frame height zoom-aware in `staff/public/scripts/kantor-saya.js`:
    ```javascript
    function getShellZoomScale() {
        var rawZoom = window.getComputedStyle(document.documentElement).zoom || '1';
        var zoom = Number.parseFloat(rawZoom);
        return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    }

    var viewportHeight = getViewportHeight() / getShellZoomScale();
    ```
4. Force fresh assets after the fix:
    - `window.__assetVersion` -> `v208`
    - `STAFF_PWA_VERSION` -> `v208`

**Verification pattern that proved the fix:**
1. Use browser tooling, not only curl/source checks.
2. Inspect `getComputedStyle(document.documentElement).zoom`.
3. Use `document.elementFromPoint()` near the visual bottom to confirm whether the white area belongs to `content-wrapper` or `#kantor-saya-page`.
4. Final browser metrics that mattered:
    - `assetVersion: v208`
    - `htmlZoom: 0.8`
    - `rootHeight` increased to account for zoom
    - `scrollDelta: 0`
    - `maxWindowScrollY: 0`

**Lesson:**
- When layout math looks correct but the visual result is still short, check CSS `zoom` on `html` or `body`. In this staff panel, viewport-based calculations must account for `browser-zoom-80`.

### 48. Session Log - 24 May 2026

**Nanda Simple Patient Portal Trial (User Reacted Positively)**

User reacted with "wow" after the first simple trial dashboard implementation.

**Problem:**
- The earlier patient portal trial felt like reopening a landing page every time.
- User wanted a simpler daily portal that still felt animatic, plus optional tap sound and a personal patient space similar in spirit to Staff Panel's Kantor Saya.

**What worked:**
1. Keep production safe by routing only the beta tester account to the new page:
    - Nanda tester detection stayed in `public/patient-menu.html`.
    - `TRIAL_HOME` was switched to `/patient-menu-simple-trial.html`.
    - Non-Nanda patients stayed on the old production home.
    - `?theme=old` continued to suppress the trial redirect.
2. Build the new portal as an isolated page instead of replacing production:
    - New page: `public/patient-menu-simple-trial.html`.
    - First viewport behaves like a compact dashboard: greeting, today's context, booking status, quick actions, tracker summary, and personal corner.
3. Add patient-owned personalization locally for the trial:
    - `patient_my_corner_name`
    - `patient_my_corner_note`
    - This keeps My Corner separate from official medical records while testing the concept.
4. Add subtle optional button tap sound:
    - Web Audio oscillator, very short and low volume.
    - Preference stored in `patient_tap_sound_enabled`.
    - Avoid double playback by letting `.soundable` click capture handle sound instead of also playing inside navigation helpers.
5. Bump patient PWA cache after adding the trial:
    - `CACHE_VERSION` in `public/sw.js` -> `20260524c`.
    - Include `/patient-menu-simple-trial.html` in precache.

**Verification pattern:**
1. Check inline JavaScript syntax with `new Function()` against script blocks.
2. Check duplicate HTML IDs before committing.
3. Run `git diff --check`.
4. Verify `/api/health` returns 200.
5. Simulate the Nanda gate in Node:
    - Nanda redirects to `/patient-menu-simple-trial.html`.
    - Other patients do not redirect.
    - `?theme=old` does not redirect.

**Lesson:**
- For daily patient portal redesign, use animation as microinteraction and atmosphere, not as repeated landing-page structure. Keep the first screen immediately useful, and isolate beta pages behind account-specific routing until the pattern is proven.

### 49. Session Log - 26 May 2026

**Trial Landing Mobile Footer + Stale Service Worker Escape (User Confirmed Success)**

User confirmed with "berhasil! you did it" after the footer background and cache trap were fixed.

**Problem:**
- On mobile-first trial landing, footer grain/background looked separated and later the footer image looked under-zoomed/cropped at top and bottom.
- Version bumps appeared to do nothing because an old active patient service worker kept serving/redirecting the page to an older `_v`.

**Root Causes:**
1. `.footer-photo` used parallax transform but `.footer-grain` did not follow the same transform, so the layers visually separated while scrolling.
2. The reduced-motion kill-switch used high-specificity `:not()` chains, so footer animation/layer classes had to be added to the whitelist directly.
3. Mobile footer background used desktop-style sizing (`156% auto`), which was too wide and not tall enough for the mobile viewport.
4. A service-worker-level navigation redirect tied to cache version caused stale SW versions to trap newer URLs back to old `_v` values.

**What actually fixed it:**
1. Move `.footer-grain` with the same `--journey-parallax-y` transform as `.footer-photo`.
2. Add footer classes to the reduced-motion whitelist:
    - `.site-footer`
    - `.footer-card-frame`
    - `.footer-photo`
    - `.footer-grain`
    - `.footer-vignette`
    - `.footer-inner`
3. Use mobile-first background fit:
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
4. Remove SW-level `Response.redirect(...)` for trial landing navigation.
5. Add early page-version escape in `public/trial-landing/index.html`:
    - unregister stale service workers
    - delete old caches
    - navigate through a `blob:` trampoline before returning to the fresh `_v`, so the old SW no longer controls the next navigation
6. Bump versions:
    - `PAGE_VERSION = '20260526m'`
    - `CACHE_VERSION = '20260526m'`

**Verification that mattered:**
- Use browser/Playwright, not just source inspection.
- Old URL `_v=20260526j` must land on `_v=20260526m`.
- Mobile viewport `421x705` should report:
  - `cssVarSize: "auto 118%"`
  - `cssVarPosition: "center 56%"`
  - `navigator.serviceWorker.controller === false` after the escape
- Desktop viewport `1280x800` should remain:
  - `cssVarSize: "156% auto"`
  - `cssVarPosition: "center center"`

**Lesson:**
- Do not use service-worker navigation redirects for version enforcement on this patient PWA; old active workers can trap newer versions. Prefer an early HTML version script that unregisters stale workers, clears caches, and navigates through a `blob:` trampoline.

### 50. Session Log - 28 May 2026

**SISIwanita Gerakan Bayi Home Shell + Bottom Nav (User Confirmed "GPT JOB")**

User confirmed with "luar biasa, ini baru GPT JOB" after the Gerakan Bayi trial page finally matched the home portal.

**Problem:**
- `public/kick-counter-trial.html` looked and felt different from `public/patient-menu-simple-trial.html` even after earlier header/nav fixes.
- The page was a hybrid: home-like hero/header, but old kick-counter CSS and a different bottom nav style still leaked through.

**Root Causes:**
1. Matching the home portal requires using the same shell IDs/classes, not just similar CSS:
    - `#home-topbar`, `#home-topbar-inner`, `#home-brand-link`, `#home-brand-title`, `#home-brand-sub`
    - `#home-bottom-nav`, `#home-bottom-inner`
2. `patient-menu-simple-trial.html` has a final override block after `patient-trial-theme.css` that changes the bottom nav from the larger white base style to the compact translucent style.
3. Gerakan Bayi initially copied the larger base nav (`520px`, white glass, active black pill) instead of the final home override (`460px`, translucent black tint, active transparent).
4. The counter idle state was too tall, so the start button could fall behind the fixed bottom nav on mobile.

**What actually fixed it:**
1. Rebased Gerakan Bayi shell on the actual home portal DOM IDs and disabled generic injected trial nav with `data-trial-nav="off"` and `window.__patientTrialHeaderInstalled = true`.
2. Added a final post-theme CSS layer in `kick-counter-trial.html` for home-style brand/header/hero/content and page-scoped `body.kick-counter-page #home-bottom-nav` overrides.
3. Matched the home bottom nav final computed style exactly:
    - width `min(460px, calc(100% - 28px))`
    - bottom `safe-area + 8px`
    - border `0`, radius `19px`, padding `6px`
    - background `rgba(0, 0, 0, 0.1)`, blur `5px`, no shadow
    - nav item font `8px`, icon `12px`, radius `14px`, padding `6px 3px`
    - active item stays transparent; only `:active` turns dark
4. Moved the counter directly under the hero and compressed idle state so `Mulai Menghitung` is visible above the nav on mobile.
5. Normalized mock API response shape to match real backend (`stats.week`, `summary`) and kept summary/chart in sync after taps.
6. Bumped `public/sw.js` cache versions after each patient-facing frontend fix:
    - `20260528k` for shell adoption
    - `20260528l` for final bottom nav parity

**Verification pattern that mattered:**
1. Compare computed styles with Playwright, not screenshots alone:
    - home nav and kick nav should both report height `48px`, background `rgba(0, 0, 0, 0.1)`, icon `12px`, text `8px`, active transparent.
2. Check old shell count is zero:
    - `.trial-unified-header`, `.topbar-trial`, `#kick-topbar`, `#kick-bottom-nav`
3. Browser smoke test with `?mockApi=1`:
    - load page
    - start session
    - tap once
    - count, summary, and chart update to `1`
    - save session
    - recent session and history modal render
4. Verify live deploy:
    - `/api/health` returns `200`
    - `public/sw.js` serves the new `CACHE_VERSION`
    - live HTML contains the final bottom nav CSS markers

**Lesson:**
- When adopting a home portal component, inspect the final override block, not only the first/base definition. In this patient portal, the actual home bottom nav appearance comes from `body #home-bottom-nav` overrides near the end of `patient-menu-simple-trial.html`.

### 51. Session Log - 28 May 2026

**SISIwanita Fertility Calendar Tool Shell Adoption (User Confirmed "luar biasa")**

User confirmed with "luar biasa" after `public/fertility-calendar-trial.html` was standardized to the approved SISIwanita tool shell and deployed.

**What worked:**

1. Replace the old page shell with the shared Patient Tool Shell pattern:
    - `<html data-trial-nav="off">`
    - `window.__patientTrialHeaderInstalled = true`
    - `body.home-sections-locked.patient-tool-shell.fertility-calendar-page`
    - `#home-topbar`, `#home-bottom-nav`, `#bottom-sheet`, `#sheet-overlay`, `#toast-container`
    - load `/styles/patient-tool-shell.css` and `/scripts/patient-tool-shell.js`
2. Remove legacy shell drift:
    - no `trial-bottom-nav.js`
    - no `.topbar-trial`
    - no `.site-footer`
3. Preserve real app behavior while changing the UI:
    - real API stays on relative `/api/fertility-calendar` endpoints
    - calendar month navigation works
    - period date selection fills the form
    - save cycle, delete cycle, and intercourse toggle remain functional
4. Add mock review mode for browser testing without patient auth:
    - `?mockApi=1` seeds cycles and intercourse dates
    - mock save/delete updates stats, calendar, and history immediately
5. Bump patient PWA cache after frontend deploy:
    - `CACHE_VERSION` in `public/sw.js` -> `20260528o`
    - add `/fertility-calendar-trial.html` to `PRECACHE_FILES`

**Verification pattern that mattered:**

1. Static checks:
    - `get_errors` clean for fertility page and `sw.js`
    - inline scripts extracted and checked with `node --check`
    - `node --check public/sw.js`
    - `git diff --check`
2. Shell markers:
    - required home shell IDs/classes present
    - old shell markers count is zero
    - inline `onclick` handlers are exported to `window`, except shared shell globals (`go`, `openSheet`, `closeSheet`, `openMyCorner`)
3. Browser smoke with `?mockApi=1`:
    - calendar renders
    - selecting start/end dates fills `#period-start` and `#period-end`
    - saving adds a cycle and updates stats/history
    - intercourse mode adds heart markers
    - delete modal removes cycle
    - Aplikasi bottom sheet opens and contains tool links
4. Production checks:
    - `/api/health` returns `200`
    - live HTML contains `patient-tool-shell.css/js`
    - live HTML has no `trial-bottom-nav.js` or `.topbar-trial`
    - live `sw.js` contains `CACHE_VERSION = '20260528o'` and `/fertility-calendar-trial.html`
    - VPS checkout matches pushed commit `f95adf36`

**Lesson:**
- For SISIwanita tool pages, keep the visual shell and the domain logic separate: adopt the shared Patient Tool Shell first, then rewire only the page-specific panels and existing API behavior. Always include `?mockApi=1` browser smoke so visual parity and app behavior can be verified together before deploy.

### 52. Session Log - 31 May 2026

**Sunday Clinic Team Chat Scroll + Duplicate Echo Fix (User Confirmed "sudah beres")**

User confirmed the Sunday Clinic chat issue was resolved after the chat popup was updated and deployed.

**Problems fixed:**
1. Opening chat showed the oldest/top messages instead of jumping to the latest message.
2. A sent message appeared twice for the sender: once as the optimistic outgoing bubble and again when the realtime socket broadcast returned.

**What worked:**
1. In `staff/public/scripts/chat-popup.js`, add a module-level singleton guard:
    - `window.__chatPopupModuleLoaded`
    - This prevents duplicate initialization when `chat-popup.js` is loaded through both the static script tag and `global-chat-loader.js`.
2. Normalize chat user IDs before comparing:
    - Convert both current user id and `data.user_id` to trimmed strings.
    - Use `isOwnChatMessage(data)` instead of strict `data.user_id !== user.id` checks.
3. Dedupe rendered messages by database message ID:
    - Track `renderedMessageIds`.
    - Skip realtime messages whose ID has already rendered.
    - Add the returned `result.data.id` after successful send.
4. Make scroll-to-latest resilient to WebView/mobile layout timing:
    - Use `scheduleChatScrollToLatest()`.
    - Re-run scroll after layout/keyboard changes up to `4200ms`.
    - Call scroll again from `syncOpenChatLayout()` after mobile viewport recalculation.
5. Bump Sunday Clinic cache/version strings:
    - `PAGE_VERSION` -> `20260531chat4`
    - `SC_CACHE_VERSION` -> `v20260531chat4`
    - `global-chat-loader.js?v=v114`
    - `chat-popup.js?v=v224`
    - `window.__sundayClinicChatVersion = 'v224'`
6. Update `staff/public/scripts/global-chat-loader.js` so dynamic fallback loading uses:
    - `window.__assetVersion || window.__sundayClinicChatVersion || 'v224'`

**Verification pattern that mattered:**
1. Run `node --check` on:
    - `staff/public/scripts/chat-popup.js`
    - `staff/public/scripts/global-chat-loader.js`
2. Verify live VPS file markers:
    - `20260531chat4`
    - `chat-popup.js?v=v224`
    - `window.__sundayClinicChatVersion = 'v224'`
3. Deploy static files directly to VPS:
    - `/var/www/dokterdibya/staff/public/scripts/chat-popup.js`
    - `/var/www/dokterdibya/staff/public/scripts/global-chat-loader.js`
    - `/var/www/dokterdibya/staff/public/sunday-clinic.html`

**Lesson:**
- For Sunday Clinic chat, fix both load-path duplication and message identity. Scroll bugs in Android/WebView can be layout-timing bugs, so scroll after the panel is visible, after viewport recalculation, and after keyboard/layout transitions, not only immediately after message history loads.

### 53. Session Log - 31 May 2026

**Staff Panel <-> Sunday Clinic Team Chat Sync Fix (User Confirmed "good job")**

User reported that chat messages between Staff Panel and Sunday Clinic were still inconsistent:
1. Messages from the same logged-in doctor account appeared as if they were from another person.
2. Messages sent from Staff Panel sometimes did not appear in Sunday Clinic.

**Root causes:**
1. Production was still serving old assets:
    - Live `sunday-clinic.html` still had `PAGE_VERSION = '20260531chat4'`.
    - Live script tag still used `chat-popup.js?v=v224`.
    - Local fixes were committed/pushed, but VPS `git pull` was blocked by local dirty changes.
2. Same-account multi-tab messages were skipped:
    - Staff Panel and Sunday Clinic can both be logged in as `dr. Dibya`.
    - The realtime handler treated socket broadcasts from the same account as local echo and skipped them.
    - This is correct only for the sending tab's immediate echo, but wrong for another tab/page using the same account.
3. Realtime events can still be missed, so the popup needs a history polling fallback.

**What worked:**
1. Update `staff/public/scripts/chat-popup.js` ownership detection:
    - Collect possible current user IDs from `window.auth.currentUser`, `window.currentStaffIdentity`, `window.currentStaffUser`, `window.__realtimeSyncState.currentUser`, and JWT payload.
    - Also collect current user names and normalize them, so `dr. Dibya` and `dr Dibya` match.
    - If `user_id` mismatch happens but `user_name` matches the current staff name, render as `sent`.
2. Add local echo suppression that only suppresses the sender tab's optimistic echo:
    - Track `pendingSentMessages`.
    - Suppress matching socket echo for about 30 seconds.
    - Do not skip other same-account socket broadcasts once they are not a local pending echo.
3. Change `handleRealtimeChatMessage(data)`:
    - After `consumePendingSentEcho(data)`, always render the socket message.
    - Use `isOwnChatMessage(data) ? 'sent' : 'received'` to choose side.
    - This allows Staff Panel -> Sunday Clinic messages from the same account to appear on the right side.
4. Add polling fallback:
    - `startChatHistoryPolling()`
    - `pollChatHistoryForNewMessages()`
    - Poll `/api/chat/messages?limit=100&_t=${Date.now()}` every 3 seconds.
    - Append only messages whose database ID is not already in `renderedMessageIds`.
5. Bump cache/version strings:
    - Sunday Clinic `PAGE_VERSION` -> `20260531chat8`
    - `window.__sundayClinicChatVersion` -> `v229`
    - `window.__chatPopupVersion` -> `v229`
    - Static script tags -> `chat-popup.js?v=v229`
    - `global-chat-loader.js` fallback -> `v229`
6. Deploy static files directly to VPS when `git pull` is blocked:
    - Backup production files first under `/root/chat-popup-backup-<timestamp>/`.
    - Copy local `chat-popup.js` and `global-chat-loader.js` to `/var/www/dokterdibya/staff/public/scripts/`.
    - Patch only chat cache markers in production HTML.
    - Run `/var/www/dokterdibya/fix-permissions.sh`.

**Verification pattern that mattered:**
1. Run syntax checks:
    - `node --check staff/public/scripts/chat-popup.js`
    - `node --check staff/public/scripts/global-chat-loader.js`
2. Confirm production file markers on VPS:
    - `PAGE_VERSION = '20260531chat8'`
    - `window.__sundayClinicChatVersion = 'v229'`
    - `chat-popup.js?v=v229`
    - `Adding realtime message`
    - `pollChatHistoryForNewMessages`
3. Confirm live HTTP serves the updated files:
    - `https://dokterdibya.com/staff/public/sunday-clinic.html`
    - `https://dokterdibya.com/staff/public/scripts/chat-popup.js?v=v229`
4. Query production DB to confirm messages are in one thread:
    - `SELECT id,user_id,user_name,message,timestamp FROM chat_messages ORDER BY id DESC LIMIT 20;`
    - Example successful same-account rows used `UDZAQUCQWZ / dr. Dibya` for messages from both Staff Panel and Sunday Clinic.
5. User visually confirmed two-way sync:
    - Staff Panel message appears in Sunday Clinic.
    - Sunday Clinic message appears in Staff Panel.
    - Same-account messages render on the right side.

**Lesson:**
- For Team Chat, same-account multi-tab/page behavior is different from local socket echo. Suppress only the sender tab's pending echo, then render same-account broadcasts in other tabs as `sent`. Always verify production assets over HTTP, because pushed code is not enough if the VPS worktree is dirty and `git pull` aborts.

### 54. Session Log - 3 June 2026

**Patient Portal Ruang Saya Fullscreen Room Intro (User Confirmed Good Job)**

User confirmed with "sudah full. good job" after the final Ruang Saya fullscreen and intro timing fix.

**Problem:**
- Ruang Saya initially still felt like a dashboard or technical panel, not a personal room.
- The requested experience was: short intro, fade to black, show room name and owner, then fade into a fullscreen room with no bottom nav or header.
- On mobile review, intro felt too fast and the room still showed white side gaps.

**What worked:**
1. Keep Ruang Saya local/private and render it as an immersive overlay from `public/scripts/patient-my-corner.js`, not as a dashboard section.
2. Hide patient portal chrome while the room is open so there is no header or bottom nav competing with the room.
3. Add an entry overlay with stage elements:
    - `.pmc-entry-stage`
    - `.pmc-entry-door-left`
    - `.pmc-entry-door-right`
    - `.pmc-entry-threshold`
    - `.pmc-entry-light`
    - `.pmc-entry-copy`
4. Slow the intro enough for mobile:
    - CSS entry/shell animations around `3.6s`
    - JS `startIntro()` timeout set to `3600ms`
5. Remove the fixed-width shell cap that caused side gaps:
    ```css
    .pmc-shell {
        position: absolute;
        inset: 0;
        width: 100vw;
        max-width: none;
        height: 100dvh;
        min-height: 100dvh;
    }
    ```
6. Remove mobile content padding specifically for the fullscreen room:
    ```css
    @media (max-width: 430px) {
        .pmc-content-room-quiet {
            padding-left: 0;
            padding-right: 0;
        }
    }
    ```
7. Keep settings scroll stable across rerenders with `renderPanel({ preserveScroll: true })`.

**Verification pattern that mattered:**
1. Use phone-accessible local preview bound to `0.0.0.0`, then test from HP via LAN IP.
2. Use Playwright metrics across mobile widths (`393`, `430`, `480`) to verify:
    - `.pmc-shell` left/right gaps are `0`
    - `.pmc-content-room-quiet` left/right gaps are `0`
    - `.pmc-room-scene` left/right gaps are `0`
3. Run syntax/diff checks:
    - `node --check public/scripts/patient-my-corner.js`
    - `node --check public/scripts/patient-my-corner-visit.js`
    - `node --check public/sw.js`
    - `git diff --check`

**Lesson:**
- For fullscreen patient room experiences, full overlay width is not enough; also audit inner mobile padding rules. A global `.pmc-content` mobile padding can leave visible side gaps even when `#pmc-root` and `.pmc-shell` are full viewport.
- When the user asks for a room, avoid dashboard language and dense controls. Treat the first view as atmosphere, identity, and presence; keep editing controls secondary.

### 55. Session Log - 3 June 2026

**Patient Portal Ruang Saya Grid Edit + Drag Ghost Fix (User Confirmed Good Work)**

User confirmed with "kerja bagus!" after the Ruang Saya grid edit/drag interaction was tuned on mobile preview.

**Problems fixed:**
1. Widget drag ghost felt detached from the user's finger.
2. USG widget and room title ghost looked separated because cloned drag ghosts were moved outside `.pmc-room-grid`.
3. Long-press could still trigger browser selection/context behavior instead of directly entering edit mode.
4. USG ribbon needed to be one line and lower on the thumbnail.

**What worked:**
1. In `public/scripts/patient-my-corner.js`, clean cloned drag ghosts before appending to `body`:
    - remove `is-dragging` and `is-hold-ready` from the clone
    - otherwise `.pmc-room-block.is-dragging { transform: scale(0.96) }` can override the ghost transform
2. Use per-type drag anchors:
    - large widgets (`usg`, `clock`, `ai`) use `--pmc-drag-offset-y: 62%`
    - icons and title use `--pmc-drag-offset-y: 50%`
    - this avoids both hanging below the finger and jumping too far above tap
3. Add ghost-specific CSS mirroring grid-only rules:
    - `.pmc-room-drag-ghost .pmc-room-title`
    - `.pmc-room-drag-ghost .pmc-usg-thumb-widget`
    - `.pmc-room-drag-ghost .pmc-pastel-date-widget`
    - `.pmc-room-drag-ghost .pmc-pastel-ai-card`
    - this keeps USG/title content inside the ghost after the clone leaves `.pmc-room-grid`
4. Disable browser selection/drag/callout in the room grid:
    - `user-select: none`
    - `-webkit-touch-callout: none`
    - `-webkit-user-drag: none`
    - inline `oncontextmenu`, `onselectstart`, and `ondragstart` prevention on room blocks
5. USG ribbon final local tuning:
    - one-line text with `white-space: nowrap` and ellipsis
    - position lowered to `top: 74%`
6. Version used for local preview/cache:
    - `20260603roomlocal43`

**Verification pattern:**
1. Restart phone-accessible preview server bound to `0.0.0.0:4177` after version bumps.
2. Use Playwright smoke checks to verify:
    - USG ghost offset is `62%`
    - icon/title ghost offset is `50%`
    - USG and title ghost children report `childInsideGhost: true`
    - asset URL contains the latest roomlocal version
3. Run:
    - `node --check public/scripts/patient-my-corner.js`
    - `node --check public/sw.js`
    - `get_errors` for edited files
    - `git diff --check`

**Lesson:**
- When cloning draggable grid items into `body`, any CSS scoped under the original grid container no longer applies. Add ghost-specific selectors for every child component that depends on grid-scoped rules.
- For mobile drag feel, do not use one universal pointer offset for every item. Large widgets and small icons need different anchors.

### 56. Session Log - 5 June 2026

**SISIwanita Patient Portal Migration + Google Registration Success**

User confirmed full Google registration/login worked without problems after the SISIwanita migration.

**What worked:**
1. Keep patient portal files in `public/` while serving them through `sisiwanita.id`; do not move active patient files to `/temp` because `sisiwanita.id` depends on the same static root and service worker precache.
2. Redirect old patient-facing `dokterdibya.com` HTML routes to `sisiwanita.id` through nginx, preserving query strings with `$is_args$args` for token/code flows.
3. Keep Staff Panel, API, Socket.IO, shared document, uploads, and staff routes on `dokterdibya.com` so staff workflows are not disrupted.
4. Allow both domains in backend CORS and Socket.IO using a shared origin delegate:
    - `https://sisiwanita.id`
    - `https://www.sisiwanita.id`
    - `https://dokterdibya.com`
    - `https://www.dokterdibya.com`
5. Add delayed `Masuk sekarang` CTA animation on `public/sisiwanita/index.html` using opacity/filter/clip-path instead of transform so existing hover/active transforms remain stable.
6. Bump `public/sisiwanita-sw.js` cache version after SISIwanita frontend changes.

**Verified successful production flow:**
1. Google auth code received from SISIwanita.
2. Google token exchange succeeded.
3. Registration code `897ZDM` validated.
4. New patient created: `P2026273`.
5. Intake loaded, submitted, integrated into EMR, and linked to authenticated patient.
6. `intake_completed=1` marked for `P2026273`.
7. Portal continued to document badge check for that patient.

**Important guardrails:**
- A Google attempt without registration code must remain blocked for new patients.
- Invalid registration code must remain blocked.
- Query-string redirects are critical for `complete-profile.html`, `reset-password.html`, and `mobile-google-callback.html`.
- When verifying after deployment, check live HTTP assets and PM2 logs, not only pushed commits.

**Lesson:**
- For patient-domain migration, treat `dokterdibya.com` and `sisiwanita.id` as two front doors to a shared backend during transition. The safe path is redirect patient pages, expand CORS/socket origins, keep staff routes untouched, and verify a real Google registration all the way through intake before declaring success.

### 57. Session Log - 5 June 2026

**Staff Patient Activity Timeline Collation Fix (User Confirmed Good)**

User confirmed with "sudah bagus" after the Staff Panel Aktivitas Pasien page loaded correctly again.

**Problem:**
- Staff Panel Aktivitas Pasien showed "Gagal memuat data" after expanding the timeline to include portal interactions.
- Each new source query worked alone, but the combined endpoint failed when all sources were loaded together.

**Root Cause:**
- MariaDB failed the combined `UNION ALL` query with `ER_CANT_AGGREGATE_NCOLLATIONS` because activity rows came from tables with different text collations.

**What worked:**
1. Keep the source queries unchanged, then wrap each query before unioning.
2. Normalize text output columns in the wrapper:
    - `type`
    - `patient_name`
    - `patient_email`
    - `patient_phone`
    - `details`
3. Use:
    ```sql
    CONVERT(activity_source.column USING utf8mb4) COLLATE utf8mb4_unicode_ci
    ```
4. Commit and deploy the backend route hotfix:
    - `394cfa02 Fix patient activity collation error`

**Verification pattern:**
1. Test each source query separately if the combined endpoint fails.
2. Test the exact `UNION ALL` shape; individual query success does not rule out collation errors.
3. Verify authenticated production endpoints:
    - `/api/patient-activity?limit=3` returns `HTTP 200`
    - `/api/patient-activity/stats?days=30` returns `HTTP 200`
4. Check logs after the smoke test; old errors before deploy can remain in the tail, but no new `Failed to load patient activity` should appear.

**Lesson:**
- For cross-table timeline aggregators in MariaDB, normalize text collations at the union boundary. This preserves individual query logic while preventing hidden collation conflicts between patient, chat, feedback, and support tables.

### 58. Session Log - 6 June 2026

**Invoice Table Client-Side Sort Buttons (User Confirmed "good job")**

User confirmed with "good job" after sortable column headers were added to the invoice/keuangan table.

**What worked:**

1. **Refactor `loadInvoiceHistory()` in `staff/public/scripts/main.js`:**
    - Store fetched data in `window.__invoiceRawData` after successful fetch
    - Track sort state in `window.__invoiceSortCol` and `window.__invoiceSortDir`
    - Extract inline rendering to a standalone `renderInvoiceRows(invoices)` function
    - Add `sortInvoiceTable(col)` function that sorts a copy of raw data and re-renders
    - Export `window.sortInvoiceTable = sortInvoiceTable`

2. **Sort logic in `sortInvoiceTable(col)`:**
    - Toggle direction: first click = `asc`, second click on same column = `desc`
    - Date: compare `new Date(visit_date || created_at).getTime()`
    - Patient: compare `patient_name.toLowerCase()`
    - Total: compare `Number(total_amount || total || 0)`
    - Status: compare `invoice_status || status` string
    - After sort: update icons (`▲`/`▼`/`⇅`) and toggle `.sort-active` class on `<th>`

3. **Update `<th>` headers in `staff/public/index-adminlte.html`:**
    - Add `id`, `class="invoice-sort-th"`, `onclick="sortInvoiceTable('...')"` to Tanggal, Pasien, Total, Status columns
    - Add `<span id="invoice-sort-{col}" class="invoice-sort-icon">⇅</span>` inside each `<th>`

4. **Add CSS in `<style>` block:**
    ```css
    .invoice-sort-th { cursor: pointer; user-select: none; white-space: nowrap; }
    .invoice-sort-th:hover { background-color: #dde5ee !important; }
    .invoice-sort-th.sort-active .invoice-sort-icon { opacity: 1; color: #007bff; }
    ```

5. **Bump asset versions:** `v247` → `v248` in `index-adminlte.html` and `sw.js`

6. **Deploy:** `git push` from local, then `ssh root@72.60.78.188 "cd /var/www/dokterdibya && git pull origin main"` — no PM2 restart needed (frontend-only change).

**Lesson:**
- For client-side sort on staff tables, store raw API data in a `window.__rawData` variable at fetch time, then sort a copy with `[...array].sort(...)` and re-render. This avoids extra API calls and keeps sort state across renders.
- Frontend-only changes only need `git pull` on VPS, not `pm2 restart`.
