package in.allgo.app;

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.*;
import android.os.*;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.functions.FirebaseFunctions;
import com.google.firebase.functions.FirebaseFunctionsException;
import java.util.HashMap;
import java.util.Map;

/** User-started foreground service. No stored coordinates, boot receiver or silent restart. */
public class DriverLocationService extends Service implements LocationListener {
    public static volatile boolean running = false;
    public static volatile String statusMessage = "Location sharing stopped";
    public static volatile long lastReportedAt = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager manager;
    private Location latest;
    private String userId;
    private boolean sending;
    private int failures;
    private final Runnable tick = new Runnable() {
        @Override public void run() { report(); handler.postDelayed(this, 15000); }
    };
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "stop".equals(intent.getAction())) {
            if ("stop".equals(intent == null ? null : intent.getAction())) {
                Map<String, Object> data = new HashMap<>(); data.put("enabled", false);
                FirebaseFunctions.getInstance("asia-south1").getHttpsCallable("setDriverLocationConsent").call(data);
            }
            stopSelf(); return START_NOT_STICKY;
        }
        userId = intent.getStringExtra("userId");
        if (FirebaseAuth.getInstance().getCurrentUser() == null || !FirebaseAuth.getInstance().getCurrentUser().getUid().equals(userId)) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager notifications = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(new NotificationChannel("allgo_driver_location", "Partner location sharing", NotificationManager.IMPORTANCE_LOW));
        Notification notification = notification("Sharing your location while online");
        if (Build.VERSION.SDK_INT >= 29) startForeground(3005, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION); else startForeground(3005, notification);
        if (running) return START_NOT_STICKY;
        manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        try { manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000, 0, this, Looper.getMainLooper()); }
        catch (SecurityException | IllegalArgumentException error) { statusMessage = "Location permission or GPS unavailable"; stopSelf(); return START_NOT_STICKY; }
        running = true; failures = 0; statusMessage = "Waiting for an accurate location"; handler.post(tick);
        return START_NOT_STICKY;
    }
    private Notification notification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, DriverLocationService.class).setAction("stop");
        PendingIntent stopAction = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, "allgo_driver_location") : new Notification.Builder(this);
        return builder.setSmallIcon(R.drawable.ic_stat_location).setContentTitle("AllGo location sharing").setContentText(text).setContentIntent(content).setOngoing(true).addAction(new Notification.Action.Builder(null, "Stop sharing", stopAction).build()).build();
    }
    private void report() {
        if (sending || !running) return;
        if (FirebaseAuth.getInstance().getCurrentUser() == null || !FirebaseAuth.getInstance().getCurrentUser().getUid().equals(userId)) { stopSelf(); return; }
        // Never upload cached fixes after network recovery; only recent precise positions.
        if (latest == null || SystemClock.elapsedRealtimeNanos() - latest.getElapsedRealtimeNanos() > 30000000000L || !latest.hasAccuracy() || latest.getAccuracy() > 100) {
            statusMessage = "Waiting for a fresh, accurate location"; getSystemService(NotificationManager.class).notify(3005, notification(statusMessage)); return;
        }
        Map<String, Object> location = new HashMap<>(); location.put("lat", latest.getLatitude()); location.put("lng", latest.getLongitude());
        Map<String, Object> data = new HashMap<>(); data.put("location", location); data.put("accuracy", latest.getAccuracy());
        sending = true;
        FirebaseFunctions.getInstance("asia-south1").getHttpsCallable("updateDriverLocation").call(data).addOnCompleteListener(task -> {
            sending = false; if (!running) return;
            if (task.isSuccessful()) { failures = 0; lastReportedAt = System.currentTimeMillis(); statusMessage = "Sharing your location while online"; }
            else {
                failures++; statusMessage = "Location upload failed; check connection";
                Exception error = task.getException();
                if (error instanceof FirebaseFunctionsException) {
                    FirebaseFunctionsException.Code code = ((FirebaseFunctionsException) error).getCode();
                    if (code == FirebaseFunctionsException.Code.PERMISSION_DENIED || code == FirebaseFunctionsException.Code.UNAUTHENTICATED) { statusMessage = "Partner session ended; reopen AllGo"; stopSelf(); return; }
                }
                if (failures >= 20) { statusMessage = "Sharing stopped after repeated connection failures; reopen AllGo"; stopSelf(); return; }
            }
            getSystemService(NotificationManager.class).notify(3005, notification(statusMessage));
        });
    }
    @Override public void onLocationChanged(Location value) { latest = value; }
    @Override public void onProviderDisabled(String provider) { statusMessage = "Phone location services are off"; latest = null; }
    @Override public void onProviderEnabled(String provider) { }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onDestroy() {
        running = false; handler.removeCallbacks(tick); if (manager != null) { try { manager.removeUpdates(this); } catch (SecurityException ignored) { } }
        latest = null; stopForeground(true); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
