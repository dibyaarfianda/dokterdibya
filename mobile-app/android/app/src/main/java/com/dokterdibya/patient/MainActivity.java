package com.dokterdibya.patient;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebStorage;
import android.webkit.CookieManager;
import android.widget.Toast;
import android.net.Uri;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private long backPressedTime = 0;
    private Toast backToast;

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
                    handleLogoutUrl(url);
                    return true;
                }

                // Let Capacitor handle everything else
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Intercept our custom schemes
                if (url != null && (url.startsWith("dokterdibya://") || url.startsWith("intent://"))) {
                    handleLogoutUrl(url);
                    return true;
                }

                // Let Capacitor handle everything else
                return super.shouldOverrideUrlLoading(view, url);
            }
        });

        // Check if launched with logout deep link
        handleIntent(getIntent());
    }

    private void handleLogoutUrl(String url) {
        // Handle both dokterdibya://logout and intent://logout#Intent;...
        if (url.contains("logout")) {
            performLogout();
        }
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

        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            if (backPressedTime + 2000 > System.currentTimeMillis()) {
                if (backToast != null) {
                    backToast.cancel();
                }
                super.onBackPressed();
                finish();
            } else {
                backToast = Toast.makeText(this, "Tekan back sekali lagi untuk keluar aplikasi", Toast.LENGTH_SHORT);
                backToast.show();
                backPressedTime = System.currentTimeMillis();
            }
        }
    }
}
