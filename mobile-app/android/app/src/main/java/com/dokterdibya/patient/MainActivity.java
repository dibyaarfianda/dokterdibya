package com.dokterdibya.patient;

import android.os.Bundle;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private long backPressedTime = 0;
    private Toast backToast;

    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();

        // Check if WebView can go back
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            // On login page (can't go back) - implement double press to exit
            if (backPressedTime + 2000 > System.currentTimeMillis()) {
                // Second press within 2 seconds - exit app
                if (backToast != null) {
                    backToast.cancel();
                }
                super.onBackPressed();
                finish();
            } else {
                // First press - show toast
                backToast = Toast.makeText(this, "Tekan back sekali lagi untuk keluar aplikasi", Toast.LENGTH_SHORT);
                backToast.show();
                backPressedTime = System.currentTimeMillis();
            }
        }
    }
}
