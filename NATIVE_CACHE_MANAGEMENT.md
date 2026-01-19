# Native App Cache Management Guide

## 1. Affected Modules and Packages

### Complete Module Inventory

| Module | Package | Type | Cache Scope | Entry Point |
|--------|---------|------|-------------|-------------|
| **Staff Mobile** | `com.dokterdibya.staff` | Pure WebView | WebView disk/memory cache | `staff-mobile-app/android/app/src/main/java/com/dokterdibya/staff/MainActivity.java` |
| **Patient Portal** | `com.dokterdibya.patient` | Capacitor 6.x | Capacitor + WebView cache | `mobile-app/android/app/src/main/java/com/dokterdibya/patient/MainActivity.java` |
| **Pharmacy App** | `com.dokterdibya.pharm` | Kotlin Native | OkHttp cache | `android-pharm/app/src/main/java/com/dokterdibya/pharm/MainActivity.kt` |
| **Android Native** | `com.dokterdibya.patient` | Kotlin Native | N/A (API-only) | `android-native/app/src/main/java/com/dokterdibya/patient/MainActivity.kt` |
| **Flutter Admin** | `com.dokterdibya.flutter_admin` | Flutter | Flutter cache | `flutter_admin/android/app/src/main/kotlin/com/dokterdibya/flutter_admin/MainActivity.kt` |

### Linked Web Assets (Staff App)

| File | Purpose | Cache Strategy |
|------|---------|----------------|
| `staff/public/index-adminlte.html` | Main staff HTML, SW registration (line ~12308) | Network-first (SW bypassed for HTML) |
| `staff/public/sw.js` | Service Worker v32 | no-cache headers via nginx |
| `staff/public/scripts/sunday-clinic/utils/planning-helpers.js` | Planning modals v4 | Timestamp cache-bust + nginx no-cache |
| `staff/public/sunday-clinic.html` | Sunday clinic page | Loads planning-helpers.js dynamically |

---

## 2. Symptom and Evidence

### Problem Description

**Symptom:** Modal opens with header visible but content area is white/empty. User clicks "Input Tindakan" button but nothing appears inside the modal body.

**Evidence:**
- Missing lime-green `[Planning v4] LOADED` console log
- No `[Planning v4] openTindakanModal called` log when button clicked
- `window.PLANNING_HELPERS_VERSION` returns `undefined` in console
- Network tab shows `planning-helpers.js` loaded from cache (304) with old version

### Root Cause

Stale cached JavaScript in WebView. The native app's WebView cache holds an old version of `planning-helpers.js` that doesn't contain the current modal implementation.

### File Location Confirmation

```
staff/public/scripts/sunday-clinic/utils/planning-helpers.js
├── Version: window.PLANNING_HELPERS_VERSION = '2026-01-18-v4'
├── Key functions: openTindakanModal(), openTerapiModal()
├── Loaded by: sunday-clinic.html (line 1195) with Date.now() timestamp
└── Nginx: no-cache headers applied via location block
```

---

## 3. Device and ADB Reset Steps

### Full Reset Sequence (Recommended)

```bash
# Step 1: Force stop the app
adb shell am force-stop com.dokterdibya.staff

# Step 2: Clear all app data (includes WebView cache, localStorage, cookies)
adb shell pm clear com.dokterdibya.staff

# Step 3: Relaunch the app
adb shell am start -n com.dokterdibya.staff/com.dokterdibya.staff.MainActivity
```

### Patient App Reset

```bash
adb shell am force-stop com.dokterdibya.patient
adb shell pm clear com.dokterdibya.patient
adb shell am start -n com.dokterdibya.patient/com.dokterdibya.patient.MainActivity
```

### Optional: Manual Cache Directory Removal

If `pm clear` doesn't resolve the issue (rare):

```bash
# Requires root or debuggable app
adb shell run-as com.dokterdibya.staff rm -rf ./app_webview
adb shell run-as com.dokterdibya.staff rm -rf ./cache
adb shell run-as com.dokterdibya.staff rm -rf ./code_cache

# Alternative with root
adb shell rm -rf /data/data/com.dokterdibya.staff/app_webview
adb shell rm -rf /data/data/com.dokterdibya.staff/cache
adb shell rm -rf /data/data/com.dokterdibya.staff/code_cache
```

### Via Android Settings (No ADB)

1. **Settings** → **Apps** → **DB Staff**
2. **Storage & cache** → **Clear cache** (safe, keeps login)
3. If still broken: **Clear storage** (full reset, requires re-login)
4. Relaunch app

---

## 4. Native WebView Safeguards (Debug-Only)

### Staff App - MainActivity.java

**Location:** `staff-mobile-app/android/app/src/main/java/com/dokterdibya/staff/MainActivity.java`

**Current Implementation (already in place):**

```java
package com.dokterdibya.staff;

import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import java.io.File;

public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ... layout setup ...

        // Configure WebView settings
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);  // Always fetch from network

        // AGGRESSIVE cache clearing on launch
        Log.d("DBStaff", "Clearing all WebView caches...");

        // 1. Clear WebView cache (disk and memory)
        webView.clearCache(true);
        webView.clearHistory();
        webView.clearFormData();

        // 2. NOTE: Don't clear WebStorage - contains auth tokens in localStorage!
        // WebStorage.getInstance().deleteAllData();  // This would log user out!

        // 3. Clear all cookies
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.removeAllCookies(null);
        cookieManager.flush();

        // 4. Delete WebView cache directories manually
        clearWebViewCache();

        Log.d("DBStaff", "Cache clearing complete, loading URL...");

        // Load URL with cache-busting timestamp
        String urlWithCacheBust = WEB_URL + "&_cb=" + System.currentTimeMillis();
        webView.loadUrl(urlWithCacheBust);
    }

    private void clearWebViewCache() {
        try {
            // Delete app cache directory
            File cacheDir = getCacheDir();
            if (cacheDir != null && cacheDir.isDirectory()) {
                deleteDir(cacheDir);
            }

            // Delete WebView-specific cache
            File appWebviewDir = new File(getApplicationInfo().dataDir, "app_webview");
            if (appWebviewDir.exists()) {
                deleteDir(appWebviewDir);
            }

            // Delete code_cache
            File codeCacheDir = new File(getApplicationInfo().dataDir, "code_cache");
            if (codeCacheDir.exists()) {
                deleteDir(codeCacheDir);
            }
        } catch (Exception e) {
            Log.e("DBStaff", "Error clearing WebView cache: " + e.getMessage());
        }
    }
}
```

### Patient App - MainActivity.java (Capacitor)

**Location:** `mobile-app/android/app/src/main/java/com/dokterdibya/patient/MainActivity.java`

**Recommended Addition for Debug Builds:**

```java
package com.dokterdibya.patient;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Debug-only: Clear all WebView caches on launch
        if (BuildConfig.DEBUG) {
            Log.d("DBPatient", "Debug mode: Clearing WebView caches...");

            // Clear cookies
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();

            // Clear WebView cache
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.clearCache(true);
                webView.clearHistory();

                // Set cache mode to no-cache for debug
                webView.getSettings().setCacheMode(
                    android.webkit.WebSettings.LOAD_NO_CACHE
                );
            }

            // Note: Don't call WebStorage.deleteAllData() -
            // it clears localStorage which logs user out

            Log.d("DBPatient", "WebView caches cleared");
        }
    }
}
```

### WebView Cache Methods Reference

| Method | Class | Effect | Side Effects |
|--------|-------|--------|--------------|
| `clearCache(true)` | WebView | Clears disk and memory cache | None (safe) |
| `clearHistory()` | WebView | Clears navigation history | Breaks back button |
| `clearFormData()` | WebView | Clears form autocomplete | Minor UX impact |
| `deleteAllData()` | WebStorage | Clears localStorage + sessionStorage | **Logs user out!** |
| `removeAllCookies(null)` | CookieManager | Clears all cookies | May affect sessions |
| `LOAD_NO_CACHE` | WebSettings | Always fetches from network | Higher data usage |

---

## 5. Gate Service Worker on Native

### Current Implementation in index-adminlte.html

**Location:** `staff/public/index-adminlte.html` (lines 12291-12374)

```javascript
// Detect if running in native Capacitor/WebView app
window.isNativePlatform = function() {
    // Check for Capacitor
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        return true;
    }
    // Check for mobile=1 URL param (staff native app uses this)
    if (new URLSearchParams(window.location.search).get('mobile') === '1') {
        return true;
    }
    // Check for Android WebView user agent
    if (/Android.*wv/.test(navigator.userAgent)) {
        return true;
    }
    return false;
};

// Service Worker registration - WEB ONLY (skip on native)
if ('serviceWorker' in navigator && !window.isNativePlatform()) {
    // ... register SW for web browsers only ...
} else if (window.isNativePlatform()) {
    console.log('[Native] Skipping Service Worker registration (native platform detected)');

    // Unregister any existing service workers
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => {
                registration.unregister();
                console.log('[Native] Unregistered SW:', registration.scope);
            });
        });
    }

    // Clear Cache API storage on native
    if ('caches' in window) {
        caches.keys().then(cacheNames => {
            cacheNames.forEach(cacheName => {
                caches.delete(cacheName);
                console.log('[Native] Deleted cache:', cacheName);
            });
        });
    }
}
```

### sw.js Strategy Review

**Location:** `staff/public/sw.js`

| Route Pattern | Strategy | Reason |
|---------------|----------|--------|
| `/scripts/*.js` | **Bypass** (return early) | Prevents JS caching issues |
| `/api/*` | **Network-only** (bypass) | Real-time data must be fresh |
| `/socket.io/*` | **Bypass** | WebSocket connections |
| HTML files | **Network-first** | Ensure latest UI |
| Static assets (CSS, fonts) | **Cache-first** | Performance optimization |

**Key bypass in sw.js (line 106-110):**

```javascript
// IMPORTANT: Bypass SW for JavaScript files to prevent caching issues
if (url.pathname.endsWith('.js') && url.pathname.includes('/scripts/')) {
    return;  // Don't intercept - let browser handle directly
}
```

---

## 6. Asset Cache-Busting and Server Headers

### Current Cache-Busting Implementation

**planning-helpers.js is loaded with timestamp in sunday-clinic.html (line 1195):**

```javascript
var script = document.createElement('script');
var timestamp = Date.now();
script.src = '/staff/public/scripts/sunday-clinic/utils/planning-helpers.js?v=' + timestamp;
```

### Nginx Cache Headers

**Location:** `/etc/nginx/sites-enabled/dokterdibya.com`

```nginx
# Service Worker - always fresh
location = /staff/public/sw.js {
    alias /var/www/dokterdibya/staff/public/sw.js;
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
    add_header Service-Worker-Allowed "/" always;
}

# Sunday Clinic JS files - no cache
location ~ ^/staff/public/scripts/sunday-clinic/.+\.js$ {
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
}
```

### Cache Control Policy Matrix

| File Type | Location | Cache-Control | Reason |
|-----------|----------|---------------|--------|
| HTML | `/staff/public/*.html` | no-cache | Always serve latest |
| Sunday Clinic JS | `/staff/public/scripts/sunday-clinic/**/*.js` | no-cache | Frequent updates |
| Other JS | `/staff/public/scripts/*.js` | no-cache (via SW bypass) | Consistency |
| CSS | `/staff/public/styles/*.css` | max-age=86400 | Stable, but still short |
| Images | `/staff/public/images/*` | max-age=604800 | Rarely change |

### Future Consideration: Hashed Filenames

For production, consider a build pipeline that generates hashed filenames:

```
planning-helpers.js → planning-helpers.a1b2c3d4.js
```

Then use immutable caching:
```nginx
location ~ ^/staff/public/scripts/.*\.[a-f0-9]{8}\.js$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

---

## 7. Verification Checklist

### After Reset, Verify These Items:

#### A. Console Logs (chrome://inspect or Android Studio Logcat)

```
Expected sequence for native app:
─────────────────────────────────────────────────────
[Native] Skipping Service Worker registration (native platform detected)
[Native] Unregistered SW: https://dokterdibya.com/staff/public/
[Native] Deleted cache: dokterdibya-staff-v32
[CACHE BUST] planning-helpers.js loaded fresh at 1737XXXXXXXXX
[Planning Helpers] Loaded version: 2026-01-18-v4
%c[Planning v4] LOADED  (with lime-green background)
─────────────────────────────────────────────────────
```

#### B. Visual Debug Marker

On native/debug mode, a lime-green badge should appear:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                    (app content)                │
│                                                 │
│                                                 │
│                               ┌────────────────┐│
│                               │ Planning v4    ││
│                               └────────────────┘│
└─────────────────────────────────────────────────┘
                                    ↑ lime-green badge (fades after 5s)
```

#### C. chrome://inspect Application Tab

| Check | Expected (Native) | Expected (Web) |
|-------|-------------------|----------------|
| **Service Workers** | "No service workers controlling this page" | Active SW: `dokterdibya-staff-v32` |
| **Cache Storage** | Empty (0 caches) | May have `static-v30`, `dynamic-v30` |
| **LocalStorage** | Auth tokens only | Auth + app state |
| **SessionStorage** | Empty or minimal | Session data |

#### D. Network Tab

1. Filter by `planning-helpers`
2. Verify:
   - **Status:** `200` (not `304 Not Modified`)
   - **URL:** Contains `?v=` timestamp parameter
   - **Response Headers:** `Cache-Control: no-store, no-cache...`
   - **Response body:** Contains `PLANNING_HELPERS_VERSION = '2026-01-18-v4'`

#### E. Modal Functionality Test

1. Open Sunday Clinic page
2. Click "Input Tindakan" button
3. **Expected:** Modal opens with tindakan list loaded
4. Console shows: `[Planning v4] openTindakanModal called`

---

## 8. Policy Summary

### Service Worker Policy

| Platform | SW Registered | SW Controls | Rationale |
|----------|---------------|-------------|-----------|
| Web Browser | Yes | Yes | PWA features, offline support |
| Native (Staff) | No | No | WebView cache is sufficient, avoids SW+WebView conflicts |
| Native (Patient) | No | No | Capacitor handles caching |

### Cache Clearing Policy

| Event | Action | Preserves Login? |
|-------|--------|------------------|
| App launch (debug) | Clear WebView cache, keep localStorage | Yes |
| User "Clear cache" | Clear cache dir only | Yes |
| User "Clear storage" | Clear everything | No |
| `pm clear` via ADB | Clear everything | No |

### Key Principle

> **Service Worker is for PWA (web) only.**
>
> Native apps should disable SW registration and rely on WebView's built-in caching with aggressive clearing in debug builds. This prevents the double-caching problem where both SW and WebView cache the same assets with potentially different versions.

---

## Quick Commands Reference

```bash
# Staff app: Full reset and launch
adb shell pm clear com.dokterdibya.staff && \
adb shell am start -n com.dokterdibya.staff/.MainActivity

# Patient app: Full reset and launch
adb shell pm clear com.dokterdibya.patient && \
adb shell am start -n com.dokterdibya.patient/.MainActivity

# Check current version from JS console
window.PLANNING_HELPERS_VERSION
// Expected: "2026-01-18-v4"

# Check if SW is active
navigator.serviceWorker?.controller ? 'SW Active' : 'No SW'
// Expected on native: "No SW"

# Force clear caches from JS console
caches.keys().then(k => k.forEach(n => caches.delete(n)));
navigator.serviceWorker?.getRegistrations().then(r => r.forEach(s => s.unregister()));
```
