package com.projectgraphite.strata;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StrataCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
