# Static APK investigation — 2026-10-23

## Scope and provenance

Swiggy was never launched, stopped, uninstalled, logged into, or operated. No UI inspection, screenshots, private backend access or proprietary-code copying was performed. Prior `docs/reference-analysis` UI observations belong to earlier work and are not evidence for this static investigation.

REA MCP initially returned “not available to the model”; after its tools reappeared, device access still failed in that context. The installed REA 6.5.0 CLI provided the successful evidence below. This is a CLI fallback, not a claim that the requested MCP workflow succeeded.

ADB 37.0.1 is installed at `D:\Android\Sdk\platform-tools\adb.exe`. The sandbox could not start/access its server; approved execution outside the sandbox succeeded. No devices were initially attached. Cold-booting the existing Pixel_8 AVD without snapshot restoration eventually exposed `emulator-5554`. The first windowed process disconnected; a headless cold boot remained available for extraction.

## Identity and extraction

Package-name search discovered `in.swiggy.android`; the identifier was not assumed. Installed version: **4.119.1**, code **1856**, installer `com.android.vending`, 47 requested permissions in the metadata projection. Counts do not establish granted permissions or feature behavior.

| Operation | REA evidence ID |
|---|---|
| Inspect ADB client | `ev_c41dff4959b3f38d4baa5a946b417e35d64f80953c4812dd4fea38f01e122e5c` |
| List connected emulator | `ev_ec612634f84e95aac8c8c1e54f5d83fd8c5e6c3f448a4a1fae95df86d9709daf` |
| Discover installed package | `ev_5538c5ebda3b2ef84d81f1601c8fb908316eb27bb5f74e6604873a85d77d321a` |
| Inspect installed metadata | `ev_fe63ae4027a5b6ff80200089ef5484a706042baf612816188ec429541a061008` |
| Extract complete installed APK set | `ev_56f2ce0d429d27920212403eeaa690abec6211f8089b9de6a2c86dd26aefb561` |

Analysis directory: `.cache/rea-static-2026-10-23/`. Full metadata and extraction Evidence are retained in `package.json` and `extraction.json`, with durable copies in `docs/rea/evidence/installed-package.json` and `apk-set.json`. The declaration-only inventory is also retained as `evidence/static-summary.json`. APK copies are under `apks/in.swiggy.android/`; all three pulls succeeded, with no reported failures. Host-side SHA-256 recomputation matched every extracted artifact. Device artifacts remain unchanged.

Device artifact prefix: `/data/app/~~9KlBxwwhJVJo_pQtV9l7tw==/in.swiggy.android-wlEq59Y7m3LGNspGpXOqag==/`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| base.apk | 87552739 | `4599d496d20310b5df72ed9603abb03055ad82b9809fbb9fa5e4cd17fe1c70d7` |
| split_config.x86_64.apk | 8962964 | `37b8398fd4f10bd8f412e696c20ddc85c5c64bd34fc54d2b8dc4e28f7d910f36` |
| split_config.xxhdpi.apk | 92775 | `825f4ceacc0da11475aabab1cbead69c63751b49e4692dba32bb08591de8cb17` |

## Archive and manifest observations

REA `inspect-artifact` succeeded without JADX: `ev_bdfa3739d401f7d65a4728ae4221e2241399e14aeba8f023c9c4ecb84eb68db7`, inventory `ev_1200658d4e0bb2586d2fe1a483984dab7b3ec993c181c7d3b71efbcee00a6c47`. Base inventory: 5,833 unique content nodes, 6,060 occurrences (including root), eight DEX entries. Coverage is ZIP central-directory entries; signing-block/non-entry bytes are excluded. No native `.so` entries were found in the base archive; this says nothing about the ABI split.

Android SDK `aapt2` 35.0.0 independently decoded the saved base manifest to `manifest.txt` and `badging.txt`. This is SDK evidence, **not** REA class/method evidence. Minimum SDK 32, target SDK 36. The manifest declares one application, 114 activities, three activity aliases, 25 services, 28 receivers and 11 providers. `static-summary.json` retains component names and decoded-manifest line numbers without configuration values.

| Capability / structure | Evidence and class reference | Confidence | Unknown / static limit | Independent AllGo equivalent |
|---|---|---|---|---|
| Application entry and navigation | Manifest lines 294, 312, 711: `SwiggyApplication`, `activities.DeepLinkActivity`, `activities.HomeActivity` under `in.swiggy.android` | High for declaration | Entry methods and routing validation uninspected | Existing role navigation and validated links should be audited |
| Menu and discovery structures | Manifest 796/801/862: `suggesterpage.activity.SuggesterActivity`, `menupage.MenuV2Activity`, `feature.filters.ui.FiltersActivityV3` | High for declaration; functionality unverified | No ranking, customization, pricing or pagination behavior established | Existing catalog/search/menu components; no replacement justified |
| Address correction structure | Manifest 808: `feature.address.smartNudges.latLngCorrection.LatLngCorrectionActivity` | High for declaration | No geocoding/provider logic or correction algorithm established | Validate current AllGo manual/location fallback |
| Accounts and grocery ratings | Manifest 827/839: `accounts.activity.AccountContainerActivity`, `feature.rating.ui.InstamartRatingActivity` | High for declaration | OTP, verification, rating eligibility and submission unknown | Existing account and completed-order review flows |
| Messaging and tracking notification receivers | Manifest 890/926/929/932: `SwiggyFCMListenerService`, notification-click/track/chat reply receivers | High for declaration | Message contents, token lifecycle, delivery and background behavior unknown | Existing native notifications need device acceptance |
| Background scheduling/persistence | Manifest declares `androidx.work.impl.background.systemjob.SystemJobService`, `androidx.work.multiprocess.RemoteWorkManagerService`, `androidx.room.MultiInstanceInvalidationService` | High for packaged declaration | Does not establish actual jobs, cached entities, schemas or offline guarantees | Audit AllGo lifecycle and persistence before adding work |
| Payment SDK structures | Manifest declares PhonePe transaction activities and PayU `FallbackActivity` | High for packaged declaration | No merchant credentials, private endpoints, successful payment or idempotency inferred | Preserve AllGo Razorpay integration and test its provider contracts |

No method reference is claimed for these rows: JADX inspection is still blocked. No proprietary source, assets, credentials or configuration values were reused.

Optional REA inventory of the ABI split failed with a host out-of-memory error; its incomplete JSON is not evidence and no native-library conclusion is claimed from it.

## Code-analysis limits

`inspect-android-package` returned `capability_unavailable` / `unsupported_provider`: `REA_JADX_MCP_JAR` is unconfigured. The required caller-supplied provider is `jadx-headless-mcp 0.7.1`. The local REA source checkout also lacks its compiled runtime; the installed CLI works. No provider was downloaded and no client configuration was changed.

Class/method inspection and reference tracing remain blocked. Authentication, addresses, search/ranking, menus, customization, cart, promotions, checkout, payments, order transitions, cancellation/refunds, notifications, tracking, ratings/support, caching, image loading, retries, offline handling, background synchronization, analytics and fraud signals are **unresolved**, not absent. Their class/method references and confidence cannot be supplied truthfully yet. Native-library membership and manifest declarations alone cannot establish working behavior or private server architecture.

AllGo input validation is an independently identified source-code defect, not a finding attributed to Swiggy. Food/grocery may benefit from comparable client reliability patterns once evidence is available; merchant, driver, ride and vehicle workflows are independent AllGo requirements.
