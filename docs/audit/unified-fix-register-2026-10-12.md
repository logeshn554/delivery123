# Unified app fix register

The supplied AG-01–AG-21 report is a source review, not acceptance evidence. Current local edits extend its reviewed commit. Items are not marked complete based on UI removal or emulator results alone.

| Issue | Current status | Remaining acceptance/work |
| --- | --- | --- |
| AG-01 | Fabricated builder removed; new combined booking disabled | Real catalog selection and server quote integration |
| AG-02 | Fake place IDs removed with disabled builder | Verified map selection, draft persistence and quote invalidation |
| AG-03 | Open | Driver bundle offer, assignment, detour and completion queue |
| AG-04 | Open | Merchant bundle preparation and handover queue |
| AG-05 | Diagram labeled truthfully; misleading GPS claim removed | Real authorized geographic map and coordinate freshness |
| AG-06 | Owner-scoped paginated history and reopenable status added | Merged activity adapter, migration deduplication and stable routes/deep links |
| AG-07 | Placeholder checkout contacts removed with builder | Real consented verified prefill and payment recovery acceptance |
| AG-08 | Open | Canonical job adapter, migration idempotency and cross-role integration |
| AG-09 | Activity and chat extracted incrementally | Remaining customer pages and feature hooks |
| AG-10 | Open | Guarded route tree, browser/native back and reload verification |
| AG-11 | Navigation overlap, nested full-height/scroll wrappers and competing sticky bundle header removed; tracking now follows the light customer layout | Viewport, keyboard and safe-area visual acceptance |
| AG-12 | Shared tokens, navigation, service tiles and workspace sizing added | Remaining primitives and cross-role visual acceptance |
| AG-13 | Home/Services/Activity/Account primary navigation and contextual cart added; account Support retained | Interaction and back/forward acceptance; route migration remains AG-10 |
| AG-14 | Open | Shared quote/review/stepper patterns with unchanged service policies |
| AG-15 | Customer touch minimum, chat label and keyboard accordion added | Complete contrast, text zoom, focus and assistive-technology acceptance |
| AG-16 | Server-authorized chat command, bounded text, server timestamp, replay-safe message IDs, transactional rate control and bounded reception added; direct writes denied | Moderation/report workflow, UI interaction and real participant acceptance |
| AG-17 | Open | Operations/partner bundle and fleet tools |
| AG-18 | Existing role/bridge checks retained; scoped history/chat rules added | Real cross-provider session and route acceptance |
| AG-19 | Goods/Movers shown disabled | Full operations before activation |
| AG-20 | iOS directory exists locally; Android debug compile verified before latest chat changes | Signed native builds, native registrations, macOS iOS compilation and device acceptance |
| AG-21 | Release gates documented | Real staging/provider/partner evidence, monitoring and rollback acceptance |

Additional critical defect remediation: bundle cancellation now stores durable refund intents, calls providers outside Firestore transactions, uses bundle/leg-scoped provider-compatible keys and posts settled journals only from matching processed receipts. Live provider acceptance, operator UI, legacy migration/finance review and deployment of reconciliation indexes remain pending.

## Chat deployment order

Deploy `sendBundleLegMessage` and updated rules together with the client. Older clients that send direct Firestore writes will fail safely after the rules change; notify operators of this compatibility boundary. The new command uses the existing authorization wrapper (including App Check enforcement when configured), rechecks participant profile/assignment in its transaction, and admits only active stops. Customer history and verified operations retain read access after completion; partner chat access closes when the stop is no longer active.

Messaging is limited to ten new messages per minute per identity across all stops, with at least 1.5 seconds between new sends. Identical authorized retries of the same message ID return the existing receipt without inserting another message. Message timestamps and sender identity/name are set by the server. No client sender or timestamp fields are accepted.

Real staging deployment has not been performed.

## Local command evidence for this increment

- `npm run lint` passed (`tsc --noEmit`, exit 0).
- `npm test` passed: 64 Functions tests, 10 UI tests and 21 server tests; the secret scan covered 35 staged files and 375 snapshots with no recognized secrets (exit 0).
- `npm run test:rules` passed all 96 isolated emulator tests (exit 0). Emulator logs warned that Maps and Razorpay secrets were not configured; provider calls in these tests are mocked and this is not live acceptance.
- `npm run build` passed in development mode (exit 0). Vite still warns that the `accounts` chunk is 602.06 kB, above its 500 kB warning threshold.
- `npm run android:sync` and `node scripts/check-android.mjs` passed; Gradle assembled the debug APK. Sync reported that native Firebase configuration is absent and omitted those native providers.
- The debug APK installed and opened on the connected V2225 Android phone; ADB confirmed `in.allgo.app/.MainActivity` was foregrounded. The captured screen showed the account-server reconnect state. The local API was not started because its configured hosted Neon database is not verified as a disposable development/staging target; API startup creates tables and indexes. No authenticated service UI acceptance is claimed.
- `git diff --check` passed. iOS compilation, signed builds, staging/provider acceptance and production deployment were not performed.

## Bundle refund increment

- New cancellations serialize stock restoration, cancellation events and refund intent creation in one transaction. Duplicate SKU rows are combined and restoration problems are flagged for review. Driver custody is cleared only if both active bundle and leg match.
- Provider calls run outside the transaction using an immutable request and stable alphanumeric hash key, following Razorpay's documented idempotent refund contract. After an uncertain POST, retrying the same intent retains the request/key. Once a refund ID is known, reconciliation fetches that ID instead of issuing another POST.
- Matching payment ID, amount, currency, entity, refund ID and bundle/leg notes are required. Pending evidence does not post settled money. Processed evidence creates one scoped journal and updates aggregate refunded amounts and per-leg refund state. Failed receipts require manual review.
- The scheduled worker checks up to 20 least-recently-checked unresolved intents. Its composite index must be deployed; live scheduling has not been accepted.
- Verified operations can request reconciliation with an audit record. The admin UI is still required under AG-17.
- Migrated legacy bookings must be cancelled through their original booking flow to avoid disconnected double stock/money handling until AG-08 is implemented.
- Account deletion request/processing now refuses active bundles, active driver bundle custody and unresolved bundle refund intents.
- New tests cover distinct bundles sharing `LEG_1`, stock movements across those bundles, lost provider responses, pending evidence, deterministic keys and operator claims. The final isolated rules/integration rerun passed all 94 tests. This is mocked provider acceptance only.
- Legacy journals without matching durable provider evidence are shown as requiring manual review; they do not automatically issue a replacement refund.

### Next blocking source findings under AG-03 / AG-08

The existing `advanceBundleLegDriver` accepts a destination status without validating the previous state, can repeat completed-job/earnings updates, allows completion without a stored OTP, and falls back to the ride fare when settlement calculation fails. Its earnings journal key uses only the repeating leg ID. These must be corrected before integrating/enabling partner work queues. The refund increment does not repair these separate completion defects.
