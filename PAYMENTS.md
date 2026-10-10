# AllGo mobile payments

All customer services use Razorpay Standard Checkout in the Capacitor Android and iOS apps. Checkout presents the payment methods enabled for the AllGo Razorpay account (such as UPI, cards, net banking and wallets). The app never creates a booking from the native success callback alone: the Firebase Functions backend verifies the signature, fetches and captures the payment, and creates the booking only after capture.

## Configure the provider

1. Complete Razorpay merchant onboarding and enable the payment methods needed for the account.
2. Set Firebase Functions secrets; do not add these values to the app bundle or source control:

   ```powershell
   firebase functions:secrets:set RAZORPAY_KEY_ID --project golden-polygon-3rrhs
   firebase functions:secrets:set RAZORPAY_KEY_SECRET --project golden-polygon-3rrhs
   firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET --project golden-polygon-3rrhs
   ```

3. In the Razorpay Dashboard, configure a webhook pointing at the deployed `razorpayWebhook` HTTPS function and subscribe to `payment.captured`, `refund.processed` and `refund.failed`. Use the same webhook secret in Firebase.
4. Deploy Functions and the named Firestore database rules/indexes:

   ```powershell
   firebase deploy --only functions,firestore --project golden-polygon-3rrhs
   ```

5. Build and install the native Android/iOS apps. Web checkout uses Razorpay Standard Checkout when enabled for the merchant account and allowed by its provider configuration. Native and web callbacks both require server verification before a booking is created. Test both platform paths in staging.

## Current quote rules

Food and grocery totals, including selected menu variants, are recalculated from the current Firestore catalog on the server. Grocery stock is checked again and decremented when a captured payment is fulfilled. Ride, parcel, personal-driver and vehicle-transport use stored expiring quotes based on provider routes and operator-managed pricing/coverage. See `MAPS_SETUP.md` for setup.

Customers can cancel a still-pending paid order; AllGo requests a full refund to the original payment method. Refund completion is reconciled from webhooks. Captured payments whose inventory changes before fulfillment are also sent through the refund API. If a refund request fails, the booking/payment attempt is marked `refund_required` for support follow-up.

## Test and launch

Use Razorpay Test Mode credentials and test payment instruments first. Configure webhook retries, auto-capture (or retain the backend capture call), refunds and reconciliation in the Razorpay account before switching to live credentials. Live checkout remains unavailable until the secrets are set and the Firebase functions/rules are deployed.
