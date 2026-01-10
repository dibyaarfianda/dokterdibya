package com.dokterdibya.staff;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private static final String WEB_URL = "https://dokterdibya.com/staff/public/index-adminlte.html?mobile=1";

    private int statusBarHeight = 0;
    private int navBarHeight = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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

        // Configure WebView settings
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE); // No cache for dev
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // Handle navigation within WebView
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // Stop refresh animation when page loads
                swipeRefresh.setRefreshing(false);
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

        // Clear cache to ensure latest web content
        webView.clearCache(true);
        webView.clearHistory();

        // Load the URL
        webView.loadUrl(WEB_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
