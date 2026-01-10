package com.dokterdibya.staff;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Force load the web URL
        getBridge().getWebView().loadUrl("https://dokterdibya.com/staff/public/index-adminlte.html?mobile=1");
    }
}
