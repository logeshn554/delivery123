import UIKit
import Capacitor
import FirebaseCore
import FirebaseAuth
import FirebaseFunctions
import FirebaseMessaging
import CoreLocation
import Security

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if FirebaseApp.app() == nil && Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil { FirebaseApp.configure() }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        if FirebaseApp.app() != nil && Auth.auth().canHandle(url) { return true }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        if FirebaseApp.app() != nil {
            Auth.auth().setAPNSToken(deviceToken, type: .unknown)
            Messaging.messaging().apnsToken = deviceToken
        }
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        if FirebaseApp.app() != nil && Auth.auth().canHandleNotification(userInfo) { completionHandler(.noData); return }
        completionHandler(.newData)
    }

}

@objc(SecureSessionPlugin)
public class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureSessionPlugin"
    public let jsName = "SecureSession"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)]
    private var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "in.allgo.app.session", kSecAttrAccount as String: "account"] }
    @objc func get(_ call: CAPPluginCall) {
        var request = query; request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        if status == errSecItemNotFound { call.resolve(["token": NSNull()]); return }
        guard status == errSecSuccess, let data = item as? Data, let token = String(data: data, encoding: .utf8) else { call.reject("Saved session unavailable. Sign in again."); return }
        call.resolve(["token": token])
    }
    @objc func set(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { call.reject("Invalid session token."); return }
        let data = Data(token.utf8)
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecSuccess { call.resolve(); return }
        if status != errSecItemNotFound { call.reject("Could not securely save session."); return }
        var item = query; item[kSecValueData as String] = data; item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { call.reject("Could not securely save session."); return }
        call.resolve()
    }
    @objc func remove(_ call: CAPPluginCall) {
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { call.resolve() } else { call.reject("Could not remove session.") }
    }
}
@objc(AllGoBridgeViewController)
class AllGoBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureSessionPlugin())
        bridge?.registerPluginInstance(DriverLocationPlugin())
    }
}

@objc(DriverLocationPlugin)
public class DriverLocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "DriverLocationPlugin"
    public let jsName = "DriverLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CLLocationManager()
    private var startCall: CAPPluginCall?
    private var userId: String?
    private var running = false
    private var sending = false
    private var failures = 0
    private var lastAttemptAt: Date = .distantPast
    private var lastReportedAt: Double = 0
    private var message = "Location sharing stopped"

    override public func load() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let token = call.getString("customToken"), let requestedUserId = call.getString("userId"), !requestedUserId.isEmpty else {
            call.reject("Partner session missing.")
            return
        }
        guard CLLocationManager.locationServicesEnabled() else {
            call.reject("Turn on phone location services.")
            return
        }
        startCall?.reject("Location sharing was restarted.")
        startCall = call
        userId = requestedUserId
        message = "Checking partner session"
        Auth.auth().signIn(withCustomToken: token) { [weak self] result, error in
            guard let self else { return }
            guard error == nil, result?.user.uid == requestedUserId else {
                self.rejectStart("Partner session could not be verified.")
                return
            }
            self.requestLocationPermission()
        }
    }

    private func requestLocationPermission() {
        switch manager.authorizationStatus {
        case .authorizedAlways:
            beginUpdates()
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            rejectStart("Allow Always location access in Settings to share while online.")
        @unknown default:
            rejectStart("Location permission is unavailable. Check phone settings.")
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if running && manager.authorizationStatus != .authorizedAlways {
            stopUpdates(message: "Always location access was disabled; reopen AllGo")
            return
        }
        guard startCall != nil else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways:
            beginUpdates()
        case .authorizedWhenInUse:
            message = "Allow Always access to share location in the background"
            manager.requestAlwaysAuthorization()
        case .denied, .restricted:
            rejectStart("Allow Always location access in Settings to share while online.")
        case .notDetermined:
            break
        @unknown default:
            rejectStart("Location permission is unavailable. Check phone settings.")
        }
    }

    private func beginUpdates() {
        guard startCall != nil, let userId, Auth.auth().currentUser?.uid == userId else { return }
        guard manager.authorizationStatus == .authorizedAlways else {
            rejectStart("Allow Always location access in Settings to share while online.")
            return
        }
        manager.startMonitoringSignificantLocationChanges()
        manager.startUpdatingLocation()
        running = true
        message = "Waiting for a fresh, accurate location"
        startCall?.resolve()
        startCall = nil
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard running, let location = locations.last else { return }
        let age = Date().timeIntervalSince(location.timestamp)
        guard age >= -5, age <= 30, location.horizontalAccuracy >= 0, location.horizontalAccuracy <= 100 else {
            message = "Waiting for a fresh, accurate location"
            return
        }
        guard !sending, Date().timeIntervalSince(lastAttemptAt) >= 15 else { return }
        guard let userId, Auth.auth().currentUser?.uid == userId else {
            stopUpdates(message: "Partner session ended; reopen AllGo")
            return
        }
        sending = true
        lastAttemptAt = Date()
        message = "Sharing your location while online"
        Functions.functions(region: "asia-south1").httpsCallable("updateDriverLocation").call([
            "location": ["lat": location.coordinate.latitude, "lng": location.coordinate.longitude],
            "accuracy": location.horizontalAccuracy
        ]) { [weak self] _, error in
            guard let self else { return }
            self.sending = false
            guard self.running else { return }
            if error == nil {
                self.failures = 0
                self.lastReportedAt = Date().timeIntervalSince1970 * 1000
                self.message = "Sharing your location while online"
            } else {
                self.failures += 1
                if self.failures >= 20 {
                    self.stopUpdates(message: "Sharing stopped after repeated connection failures; reopen AllGo")
                } else {
                    self.message = "Location upload failed; check connection"
                }
            }
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        message = "Location unavailable; check phone settings"
    }

    @objc func stop(_ call: CAPPluginCall) {
        startCall?.reject("Location sharing stopped.")
        startCall = nil
        stopUpdates(message: "Location sharing stopped")
        call.resolve()
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["running": running, "message": message, "lastReportedAt": lastReportedAt])
    }

    private func rejectStart(_ reason: String) {
        message = reason
        startCall?.reject(reason)
        startCall = nil
        stopUpdates(message: reason)
    }

    private func stopUpdates(message: String) {
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        running = false
        sending = false
        failures = 0
        userId = nil
        self.message = message
    }
}
