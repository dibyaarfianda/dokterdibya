package com.dokterdibya.patient;

import android.content.Intent;
import android.app.AlertDialog;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebStorage;
import android.webkit.CookieManager;
import android.net.Uri;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private AlertDialog exitAppDialog;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Set custom WebViewClient that extends Capacitor's BridgeWebViewClient
        Bridge bridge = getBridge();
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();

                // Intercept our custom schemes
                if (url.startsWith("dokterdibya://") || url.startsWith("intent://")) {
                    handleAppCommandUrl(url);
                    return true;
                }

                // Let Capacitor handle everything else
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Intercept our custom schemes
                if (url != null && (url.startsWith("dokterdibya://") || url.startsWith("intent://"))) {
                    handleAppCommandUrl(url);
                    return true;
                }

                // Let Capacitor handle everything else
                return super.shouldOverrideUrlLoading(view, url);
            }
        });

        // Check if launched with logout deep link
        handleIntent(getIntent());
    }

    private void handleAppCommandUrl(String url) {
        // Handle both dokterdibya://logout and intent://logout#Intent;...
        if (url.contains("logout")) {
            performLogout();
        } else if (url.contains("background")) {
            moveAppToBackground();
        }
    }

    private void moveAppToBackground() {
        if (exitAppDialog != null && exitAppDialog.isShowing()) {
            exitAppDialog.dismiss();
        }
        moveTaskToBack(true);
    }

    private boolean isPatientHomeUrl(String url) {
        if (url == null) return false;
        try {
            Uri uri = Uri.parse(url);
            String path = uri.getPath();
            return "/patient-menu-simple-trial.html".equals(path) || "/patient-menu.html".equals(path);
        } catch (Exception e) {
            return url.contains("/patient-menu-simple-trial.html") || url.contains("/patient-menu.html");
        }
    }

    private void showExitAppDialog() {
        if (isFinishing()) return;
        if (exitAppDialog != null && exitAppDialog.isShowing()) return;

        exitAppDialog = new AlertDialog.Builder(this)
            .setTitle("Keluar dari aplikasi?")
            .setMessage("Aplikasi akan ditutup ke background. Notifikasi tetap masuk.")
            .setNegativeButton("Tidak", null)
            .setPositiveButton("Ya", (dialog, which) -> moveAppToBackground())
            .create();
        exitAppDialog.show();
    }

    private void performLogout() {
        // Clear all web storage
        WebStorage.getInstance().deleteAllData();
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();

        // Clear WebView
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.clearCache(true);
            webView.clearHistory();
            webView.evaluateJavascript("localStorage.clear(); sessionStorage.clear();", null);
        }

        // Reload the local app
        getBridge().reload();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && intent.getData() != null) {
            Uri uri = intent.getData();
            if ("dokterdibya".equals(uri.getScheme()) && "logout".equals(uri.getHost())) {
                performLogout();
            }
        }
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();
        String currentUrl = webView != null ? webView.getUrl() : null;

        if (isPatientHomeUrl(currentUrl)) {
            showExitAppDialog();
        } else if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            showExitAppDialog();
        }
    }
}
