package com.dokterdibya.staff;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Disable cache to always load fresh content from server
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings webSettings = this.bridge.getWebView().getSettings();
            webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
            webSettings.setDomStorageEnabled(true);
        }
    }
}
