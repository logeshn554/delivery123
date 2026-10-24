package in.allgo.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "EscPosPrinter", permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) })
public class EscPosPrinter extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int MAX_RECEIPT_BYTES = 64 * 1024;

    @PluginMethod public void listPairedPrinters(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED) { requestPermissionForAlias("bluetooth", call, "bluetoothGrantedForList"); return; }
        listGranted(call);
    }
    @PermissionCallback private void bluetoothGrantedForList(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED) { call.reject("Allow nearby devices to use a paired printer."); return; }
        listGranted(call);
    }
    private void listGranted(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) { call.reject("This device does not support Bluetooth."); return; }
            if (!adapter.isEnabled()) { call.reject("Turn on Bluetooth in Android Settings."); return; }
            JSArray printers = new JSArray();
            for (BluetoothDevice device : adapter.getBondedDevices()) {
                JSObject printer = new JSObject(); printer.put("name", device.getName() == null ? "Bluetooth printer" : device.getName()); printer.put("address", device.getAddress()); printers.put(printer);
                if (printers.length() >= 30) break;
            }
            JSObject result = new JSObject(); result.put("printers", printers); call.resolve(result);
        } catch (SecurityException error) { call.reject("Nearby-device permission is required to list paired printers."); }
    }
    @PluginMethod public void printReceipt(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED) { requestPermissionForAlias("bluetooth", call, "bluetoothGrantedForPrint"); return; }
        printGranted(call);
    }
    @PermissionCallback private void bluetoothGrantedForPrint(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED) { call.reject("Allow nearby devices to print this receipt."); return; }
        printGranted(call);
    }
    private void printGranted(PluginCall call) {
        String address = call.getString("address"), encoded = call.getString("data");
        if (address == null || !address.matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}") || encoded == null) { call.reject("Select a paired Bluetooth printer."); return; }
        final byte[] bytes;
        try { bytes = Base64.decode(encoded, Base64.DEFAULT); if (bytes.length == 0 || bytes.length > MAX_RECEIPT_BYTES) { call.reject("Receipt is too large to print."); return; } }
        catch (IllegalArgumentException error) { call.reject("Receipt data is invalid."); return; }
        BluetoothSocket socket = null;
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) { call.reject("Turn on Bluetooth in Android Settings."); return; }
            BluetoothDevice device = adapter.getRemoteDevice(address);
            boolean paired = false;
            for (BluetoothDevice bonded : adapter.getBondedDevices()) if (address.equalsIgnoreCase(bonded.getAddress())) { paired = true; break; }
            if (!paired) { call.reject("Pair this printer in Android Settings before printing."); return; }
            adapter.cancelDiscovery(); socket = device.createRfcommSocketToServiceRecord(SPP); socket.connect();
            OutputStream output = socket.getOutputStream(); output.write(bytes); output.flush(); call.resolve();
        } catch (SecurityException error) { call.reject("Nearby-device permission is required to print."); }
        catch (Exception error) { call.reject("Could not connect to the paired printer. Check that it supports Bluetooth Classic ESC/POS and is powered on."); }
        finally { if (socket != null) try { socket.close(); } catch (Exception ignored) { } }
    }
}
