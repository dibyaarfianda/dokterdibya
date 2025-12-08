# Project Rules - Dokter Dibya

## Code Standards

### 1. Authentication Token
**NEVER hardcode token storage keys.** Use the appropriate helper:

```javascript
// In main.js - use the built-in helper function (line 13-18)
const token = getAuthToken();

// In ES Modules (other .js files)
import { TOKEN_KEY, getIdToken } from './vps-auth-v2.js';
const token = await getIdToken();
```

**DO NOT use in main.js:**
- `localStorage.getItem(TOKEN_KEY)` ❌ (TOKEN_KEY not defined)
- `localStorage.getItem(window.TOKEN_KEY || 'vps_auth_token')` ❌ (unreliable)
- `localStorage.getItem('vps_auth_token')` ❌ (hardcoded)

**ALWAYS use in main.js:**
- `getAuthToken()` ✅ (defined at top of main.js)

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
