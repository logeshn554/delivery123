import UIKit
import Capacitor
import FirebaseCore
import FirebaseAuth

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AllGoBridgeViewController()
        window?.makeKeyAndVisible()
        if FirebaseApp.app() != nil {
            for context in connectionOptions.urlContexts { _ = Auth.auth().canHandle(context.url) }
        }
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        let remaining = Set(URLContexts.filter { context in FirebaseApp.app() == nil || !Auth.auth().canHandle(context.url) })
        if !remaining.isEmpty { SceneDelegateProxy.shared.scene(scene, openURLContexts: remaining) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
