package in.allgo.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public class SecureSession extends Plugin {
    private static final String ALIAS = "allgo.account.session";
    private SharedPreferences store() { return getContext().getSharedPreferences("allgo_secure_session", Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) ks.getKey(ALIAS, null);
    }
    @PluginMethod public void set(PluginCall call) {
        String token = call.getString("token");
        if (token == null || !token.matches("[a-f0-9]{64}")) { call.reject("Invalid session token."); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!store().edit().putString("token", value).commit()) throw new Exception();
            call.resolve();
        } catch (Exception error) { call.reject("Could not securely save the session."); }
    }
    @PluginMethod public void get(PluginCall call) {
        String value = store().getString("token", null);
        JSObject result = new JSObject();
        if (value == null) { result.put("token", JSObject.NULL); call.resolve(result); return; }
        try {
            String[] parts = value.split(":", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            result.put("token", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8)); call.resolve(result);
        } catch (Exception error) { store().edit().remove("token").commit(); call.reject("The saved session is unavailable. Sign in again."); }
    }
    @PluginMethod public void remove(PluginCall call) {
        if (store().edit().remove("token").commit()) call.resolve(); else call.reject("Could not remove the session.");
    }
}
