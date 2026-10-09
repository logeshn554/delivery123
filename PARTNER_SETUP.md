# AllGo partner operations setup

Merchant profiles in `users/{uid}` must be provisioned by operations with `role: merchant`, `merchantType: restaurant` or `grocery`, and `merchantId` equal to the real restaurant/store document ID. Customers cannot edit these assignments. Merchant booking queries require a composite index on `merchantId` and `serviceType`; deploy the checked-in indexes.

Driver accounts require an operations-assigned `driver` role, a reviewed driver profile with actual vehicle/licence information, and `supportedServices` explicitly selected during verification. Ride vehicle types must match the requested vehicle. Food and grocery jobs become dispatchable after the merchant marks them ready. Drivers may reject offers or release accepted jobs before transit; the server records reassignment and clears the active assignment.

Completion codes are stored in customer-only `booking_codes` records, not in readable driver bookings. Before deploying these changes over any existing database, run the `functions/migrateBookingCodes.js` dry run with trusted Application Default Credentials and an explicit `--project=golden-polygon-3rrhs`. Review its counts and conflicts before using `--apply`. Do not leave legacy public `otp` fields in deployed bookings. Migration has not been executed by the source update.

Set the actual contracted `operations/settlement.driverShareBps` before completion. New driver earnings are credited once to `driver_ledger/{uid}/entries/{bookingId}` and `availableEarningsCents`. Withdrawal requests reserve the available ledger balance in a server transaction. Operations must complete the actual transfer externally, then record its real transfer reference; failed transfers restore the reserved balance. The app does not simulate a bank transfer.

Historical earnings and pre-existing payout requests require reconciliation against actual completed orders and transfer receipts before importing opening balances. Existing `todayEarnings` is not treated as an available bank balance.

Administrative refund and transfer callables require a trusted Firebase Auth custom claim `admin: true`. Assign this only through the Admin SDK using trusted operator credentials. A profile label alone does not authorize those server actions. Provider refunds, partner verification, legacy code migration, settlement policy and actual disbursements remain live acceptance requirements.
