# Order notifications

Customer, merchant and delivery app registrations include their audience alongside platform and token. The audience selects notification routing; it does not grant account permissions. Partner registration requires the current assigned merchant role or verified driver profile. Tokens are server-only records keyed by token hash and expire after 90 days.

Booking changes notify the customer app, the currently assigned verified driver's delivery app, and merchant apps whose current account is assigned to the matching restaurant/grocery business. Disabled/suspended accounts, revoked partner roles, preference opt-outs, expired tokens and malformed expirations are excluded. The trigger reads the current booking before selecting recipients so delayed events do not deliberately route to historical assignees. Authorization is rechecked on all subsequent order reads/actions; a push payload grants no access.

The visible message is generic and includes no contact, address, amount or order status. Its data contains a booking identifier and event identifier. Permanent invalid-token responses delete the registration. Transient failures leave it for trigger retry; retries can send duplicates and exactly-once delivery is not claimed.

Legacy registrations without an audience retain customer routing. Legacy partner devices must enable notifications again in their matching app, which updates the registration. Merchant and driver workspaces expose an opt-in button; Android/iOS Firebase registration and permission are prerequisites. Customer preferences continue to control order updates for the whole account.

Provider/device acceptance remains required: register each native app with Firebase, verify permission denial/recovery, foreground/background/killed-app delivery, token refresh, account switch/logout, correct workspace after tapping, and recipient changes. Unassigned dispatch-offer notifications, guaranteed offline logout revocation, automatic native cleanup on account expiry, and duplicate suppression remain separate unfinished work. No real push or provider call is made by the isolated integration tests.
