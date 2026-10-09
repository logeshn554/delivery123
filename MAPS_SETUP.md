# AllGo location and service fare setup

The booking functions use Google Geocoding API v3 and Routes API to resolve selected addresses, verify operator coverage and calculate travel distance/duration. The API key stays in Firebase Functions secrets.

1. Enable billing, Geocoding API and Routes API in the provider project. Restrict the server key to these APIs and set provider quotas appropriate for the business.
2. Set `MAPS_API_KEY` with `firebase functions:secrets:set MAPS_API_KEY --project golden-polygon-3rrhs`. Never put this key in a `VITE_*` variable.
3. Populate real `service_zones/{zoneId}` documents: `enabled` boolean, `serviceTypes` array of supported service IDs, and `polygon` array of `{lat, lng}` vertices defining the actual coverage boundary. Coordinates must be finite and valid. Local journeys require both addresses in the same enabled zone. Vehicle transport and enabled intercity parcels may connect separate configured zones.
4. Each enabled `service_pricing/{serviceId}` requires a `zoneIds` array referencing its coverage documents. Configure `options` using the IDs listed in `MOBILE_SCREEN_SETUP.md`. Each option requires positive `price` as its base INR fare. Optional nonnegative `perKm`, `perMinute`, `perKg` and `minimumPrice` rates affect the quote. Optional positive `maxKm` limits journey length. Parcel options may specify positive `maxWeightKg`; the app limit remains 50 kg. Set `intercityEnabled: true` to enable intercity parcels.
5. Options may set `travelMode` to `DRIVE` or `TWO_WHEELER` when supported by the provider for the actual service region. The default is `DRIVE`. Route duration is a travel estimate and does not promise a partner arrival time.
6. Deploy the functions, rules and indexes together. Verify actual address searches, coverage boundaries, unsupported routes and fares with the real service records before acceptance.

`getServiceQuote` stores private `service_quotes` records for five minutes. `createPaymentOrder` uses the stored canonical fare and booking details; expired or already claimed quotes cannot start another checkout. Edits to the form require a new quote. A failed or interrupted checkout must be checked in payment activity before another quote is purchased.

Provider references: [Geocoding requests](https://developers.google.com/maps/documentation/geocoding/requests-geocoding), [place ID resolution](https://developers.google.com/maps/documentation/geocoding/requests-places-geocoding), and [Routes requests](https://developers.google.com/maps/documentation/routes/compute_route_directions).

The source integration does not enable APIs, set a secret, populate coverage or deploy functions. Google Maps branding/attribution, data retention terms and provider quotas must be reviewed for the release region before store submission.
