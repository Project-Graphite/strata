package com.projectgraphite.strata;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String closeOverlay =
        "(function () {" +
        "  var open = document.querySelector('.MuiModal-root:not([aria-hidden=\"true\"]), .comments-panel[data-open=\"true\"]');" +
        "  if (!open) return false;" +
        "  var target = document.activeElement && document.activeElement !== document.body ? document.activeElement : open;" +
        "  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));" +
        "  return true;" +
        "})()";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StrataCapturePlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                webView.evaluateJavascript(closeOverlay, (closed) -> {
                    if ("true".equals(closed)) return;
                    if (webView.canGoBack()) webView.goBack();
                    else moveTaskToBack(true);
                });
            }
        });
        openShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openShare(intent);
    }

    private void openShare(Intent intent) {
        if (!SharedContent.receive(this, intent)) return;
        String server = getBridge().getServerUrl();
        if (server == null) return;
        getBridge().getWebView().loadUrl(server.replaceAll("/+$", "") + "/save");
    }
}
