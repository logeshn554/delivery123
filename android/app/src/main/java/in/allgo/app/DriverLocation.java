package in.allgo.app;

import android.Manifest;
import android.content.Intent;
import android.location.LocationManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.auth.FirebaseAuth;

@CapacitorPlugin(name = "DriverLocation", permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class DriverLocation extends Plugin {
    @PluginMethod public void start(PluginCall call) {
        if (call.getString("customToken") == null || call.getString("userId") == null) { call.reject("Partner session missing."); return; }
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationGranted"); return;
        }
        locationGranted(call);
    }
    @PermissionCallback private void locationGranted(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) { call.reject("Enable precise location in phone settings before going online."); return; }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsGranted"); return;
        }
        notificationsGranted(call);
    }
    @PermissionCallback private void notificationsGranted(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) { call.reject("Enable notifications to see and stop location sharing."); return; }
        LocationManager manager = (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
        if (manager == null || !manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) { call.reject("Turn on phone location services."); return; }
        FirebaseAuth.getInstance().signInWithCustomToken(call.getString("customToken")).addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult().getUser() == null || !call.getString("userId").equals(task.getResult().getUser().getUid())) { call.reject("Partner session could not be verified."); return; }
            getActivity().runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(getContext(), DriverLocationService.class).putExtra("userId", call.getString("userId"));
                    ContextCompat.startForegroundService(getContext(), intent);
                    call.resolve();
                } catch (RuntimeException error) { call.reject("Open AllGo and restart location sharing."); }
            });
        });
    }
    @PluginMethod public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), DriverLocationService.class)); call.resolve();
    }
    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject(); result.put("running", DriverLocationService.running); result.put("message", DriverLocationService.statusMessage); result.put("lastReportedAt", DriverLocationService.lastReportedAt); call.resolve(result);
    }
}
