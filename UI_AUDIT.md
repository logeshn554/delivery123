# AllGo UI audit

## Baseline, 13 October 2026

- Customer home (`CustomerApp.tsx`): a fixed promotional banner and a prominent unavailable journey occupied the first screen. Service discovery was a flat grid, with working and planned services at equal weight. The restaurant preview had no error recovery.
- Shared styles (`tokens.css`, `index.css`): the brand palette existed, but spacing, semantic colors and card elevation were scattered across literal values. Home typography and service accents were inconsistent with the customer shell.
- Navigation: Home, Services, Activity and Account already map to customer tabs. Cart opens contextually from the header. Preserve those routes and Android back handling during later changes.
- Data: restaurants, groceries, addresses and bookings use live subscriptions. UI must preserve loading, empty and error states and avoid claims based on absent data.
- Shopping: broken restaurant images in the home preview and broken cart item images did not have a fallback. Store switching was disabled when a grocery cart was active, but the store list did not explain why. Checkout did not surface the quoted payable amount in its final action.
- Logistics and activity: transport accepted incomplete or stale quote responses and had no visible step progress or countdown. Parcel repeated shipment history at every booking step. Activity cards displayed a generic timeline even when a booking was cancelled and exposed handover codes in the list.
- Partner screens: merchant order metrics and cards trusted the scoped parent stream without checking the assigned merchant ID. Driver profile load failures fell through to the dashboard without a recovery action. Merchant order controls had small tap targets.
- Account and support: account actions were one long undifferentiated list; support subject and description relied on placeholders instead of labels, request history errors had no retry, and hardware back from Support returned to Home instead of Account.
- Ride and personal-driver booking: a quote could expire between the last timer tick and the pay tap. Editing a form while a quote request was in flight did not release the loading state until the stale request finished.
- Global catalog search: the home overlay could show a no-results message before the remote query ran and even for a single letter. Remote search failures did not provide a direct retry action.
- Shared booking surfaces: the delivery address sheet lacked dialog semantics, a clearly labeled street field and a close action near its heading. Driver dispute fields relied on placeholder text and allowed an empty submit tap.
- Saved addresses: opening the sheet copied the current full saved address into the new-address field, which could encourage duplicate entries when users expected to edit an existing address.

## Priority

1. Customer home and shared tokens.
2. Food, grocery and checkout visual and workflow review.
3. Logistics booking screens, followed by activity and account.
4. Driver and merchant operational screens.
