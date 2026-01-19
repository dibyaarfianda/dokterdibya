package com.dokterdibya.staff;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.appcompat.app.AppCompatActivity;
import java.util.HashMap;
import java.util.Map;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import java.io.File;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private static final String WEB_URL = "https://dokterdibya.com/staff/public/index-adminlte.html?mobile=1";

    private int statusBarHeight = 0;
    private int navBarHeight = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // CRITICAL: Clear ALL cache directories BEFORE creating WebView
        Log.d("DBStaff", "=== PRE-WEBVIEW CACHE CLEARING ===");
        clearAllCacheDirectories();

        // Enable edge-to-edge display
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Create SwipeRefreshLayout
        swipeRefresh = new SwipeRefreshLayout(this);

        // Create WebView
        webView = new WebView(this);

        // Simple touch handling - only disable swipe on horizontal scroll
        // Using dispatchTouchEvent instead of OnTouchListener for better compatibility
        swipeRefresh.setOnChildScrollUpCallback(new SwipeRefreshLayout.OnChildScrollUpCallback() {
            @Override
            public boolean canChildScrollUp(SwipeRefreshLayout parent, View child) {
                if (webView != null) {
                    return webView.getScrollY() > 0;
                }
                return false;
            }
        });

        // Add WebView to SwipeRefreshLayout
        swipeRefresh.addView(webView);
        setContentView(swipeRefresh);

        // Get system bar insets
        ViewCompat.setOnApplyWindowInsetsListener(swipeRefresh, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            statusBarHeight = insets.top;
            navBarHeight = insets.bottom;

            // Apply padding to SwipeRefreshLayout
            v.setPadding(0, statusBarHeight, 0, navBarHeight);

            return WindowInsetsCompat.CONSUMED;
        });

        // Configure SwipeRefreshLayout
        swipeRefresh.setColorSchemeResources(
            android.R.color.holo_blue_bright,
            android.R.color.holo_green_light,
            android.R.color.holo_orange_light
        );

        swipeRefresh.setOnRefreshListener(new SwipeRefreshLayout.OnRefreshListener() {
            @Override
            public void onRefresh() {
                webView.reload();
            }
        });

        // Configure WebView settings - AGGRESSIVE NO-CACHE
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);  // Keep for localStorage (auth tokens)
        settings.setDatabaseEnabled(false);   // Disable database cache
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE); // Always fetch from network
        settings.setAppCacheEnabled(false);   // Disable app cache completely
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // Force no caching
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        Log.d("DBStaff", "WebView cache mode set to LOAD_NO_CACHE");

        // Handle navigation within WebView - with cache-busting
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Add cache-busting timestamp to all URLs
                String cacheBustedUrl = url;
                if (url.contains("dokterdibya.com")) {
                    String separator = url.contains("?") ? "&" : "?";
                    cacheBustedUrl = url + separator + "_cb=" + System.currentTimeMillis();
                }
                Log.d("DBStaff", "Loading URL: " + cacheBustedUrl);
                view.loadUrl(cacheBustedUrl);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // Stop refresh animation when page loads
                swipeRefresh.setRefreshing(false);
                Log.d("DBStaff", "Page finished: " + url);
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                Log.d("DBStaff", "Page started: " + url);
            }
        });

        // WebChromeClient with console logging
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d("WebViewConsole", consoleMessage.message() + " -- From line "
                        + consoleMessage.lineNumber() + " of " + consoleMessage.sourceId());
                return true;
            }
        });

        // AGGRESSIVE cache clearing - clear ALL WebView data
        Log.d("DBStaff", "Clearing all WebView caches...");

        // 1. Clear WebView cache
        webView.clearCache(true);
        webView.clearHistory();
        webView.clearFormData();

        // 2. NOTE: Don't clear WebStorage as it contains auth tokens in localStorage
        // WebStorage.getInstance().deleteAllData();  // This would log user out!

        // 3. Clear all cookies
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.removeAllCookies(null);
        cookieManager.flush();

        // 4. Delete WebView cache directories manually
        clearWebViewCache();

        Log.d("DBStaff", "Cache clearing complete, loading URL with timestamp...");

        // Load the URL with cache-busting timestamp
        String urlWithCacheBust = WEB_URL + "&_cb=" + System.currentTimeMillis();
        webView.loadUrl(urlWithCacheBust);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /**
     * Clear ALL cache directories BEFORE WebView is created
     * This is the nuclear option - clears everything
     */
    private void clearAllCacheDirectories() {
        try {
            String dataDir = getApplicationInfo().dataDir;

            // List of ALL directories that might contain cached web content
            String[] cacheDirs = {
                "cache",           // General app cache
                "app_webview",     // WebView data (includes HTTP cache)
                "code_cache",      // Compiled code cache
                "app_webview/Cache",
                "app_webview/GPUCache",
                "app_webview/blob_storage",
                "app_webview/Service Worker",
                "app_webview/IndexedDB",
                "databases"        // WebView databases
            };

            for (String dirName : cacheDirs) {
                File dir = new File(dataDir, dirName);
                if (dir.exists()) {
                    boolean deleted = deleteDir(dir);
                    Log.d("DBStaff", "Delete " + dirName + ": " + (deleted ? "OK" : "FAILED"));
                }
            }

            // Also clear using getCacheDir() which might be different
            File cacheDir = getCacheDir();
            if (cacheDir != null && cacheDir.exists()) {
                deleteDir(cacheDir);
                Log.d("DBStaff", "Deleted getCacheDir: " + cacheDir.getAbsolutePath());
            }

            Log.d("DBStaff", "=== PRE-WEBVIEW CACHE CLEARING COMPLETE ===");

        } catch (Exception e) {
            Log.e("DBStaff", "Error in clearAllCacheDirectories: " + e.getMessage());
        }
    }

    /**
     * Manually delete WebView cache directories (called after WebView created)
     */
    private void clearWebViewCache() {
        try {
            // Delete app cache directory
            File cacheDir = getCacheDir();
            if (cacheDir != null && cacheDir.isDirectory()) {
                deleteDir(cacheDir);
                Log.d("DBStaff", "Deleted cache dir: " + cacheDir.getAbsolutePath());
            }

            // Delete WebView-specific cache in app_webview directory
            File appWebviewDir = new File(getApplicationInfo().dataDir, "app_webview");
            if (appWebviewDir.exists() && appWebviewDir.isDirectory()) {
                deleteDir(appWebviewDir);
                Log.d("DBStaff", "Deleted app_webview dir: " + appWebviewDir.getAbsolutePath());
            }

            // Delete code_cache
            File codeCacheDir = new File(getApplicationInfo().dataDir, "code_cache");
            if (codeCacheDir.exists() && codeCacheDir.isDirectory()) {
                deleteDir(codeCacheDir);
                Log.d("DBStaff", "Deleted code_cache dir: " + codeCacheDir.getAbsolutePath());
            }

        } catch (Exception e) {
            Log.e("DBStaff", "Error clearing WebView cache: " + e.getMessage());
        }
    }

    /**
     * Recursively delete a directory and all its contents
     */
    private boolean deleteDir(File dir) {
        if (dir != null && dir.isDirectory()) {
            String[] children = dir.list();
            if (children != null) {
                for (String child : children) {
                    boolean success = deleteDir(new File(dir, child));
                    if (!success) {
                        return false;
                    }
                }
            }
        }
        return dir != null && dir.delete();
    }
}
