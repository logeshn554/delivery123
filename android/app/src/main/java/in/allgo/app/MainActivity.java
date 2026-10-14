package in.allgo.app;

import com.getcapacitor.BridgeActivity;
import com.ionicframework.capacitor.Checkout;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(Checkout.class);
        registerPlugin(SecureSession.class);

        super.onCreate(savedInstanceState);
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            getBridge().getWebView().getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    leaveScreen();
                    return;
                }
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new Event('allgo:back', {cancelable:true}))",
                    result -> { if (!"false".equals(result)) leaveScreen(); }
                );
            }

            private void leaveScreen() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}

