# Implementation log

## 2026-10-23 — Milestone 1 input validation capability

Branch: `fix/rea-account-input-validation`, based on the existing checkout. Preserved pre-existing untracked `scripts/run-usb-api.mjs`; do not stage it as part of this work.

Source audit found `express.json` errors flowed into `accountErrorResponse`, which returned client-error `message` verbatim. Parser diagnostics can contain sensitive request fragments. Arrays also passed parsing and could reach account mutations; invalid shapes could produce unrelated errors.

Changes:

- `server/accountInputPolicy.mjs`: shared object-body/content-type boundary for POST/PATCH/PUT after JSON parsing and before account handlers.
- `server/accounts.mjs`: install the boundary on `/api` without changing authentication, ownership, data schema or UI flows.
- `server/accountErrorPolicy.mjs`: map known body-parser failures to fixed 400/413/415 messages without quoting payloads.
- `server/accountInputPolicy.test.mjs`: real HTTP integration with the production middleware/error mapper, checking shape rejection, payload privacy, oversize/charset behavior, valid mutations and bodyless JSON compatibility.
- `tests/accounts.integration.test.mjs`: add actual account-server malformed-payload regressions for the isolated database suite. Final fresh run passed all 9 tests against actual PostgreSQL/Auth/Firestore-backed API execution. Earlier resource failure and 8/9 retry with one lifecycle timeout remain recorded; deadlines were unchanged.
- `docs/rea/*`: current static evidence, bounded capability matrix, plan, log, tests and blockers.

No Swiggy feature claim informed this change: it follows the independently authorized security/data-correctness priority. No database/rules migration or frontend change is needed for an HTTP boundary; existing UI error handling consumes the stable `invalid-argument` response.

Initial focused HTTP test was blocked by sandbox loopback EACCES; approved execution allowed it. A subsequent test exposed an empty non-JSON payload bypass; content-type validation fixed it. The final compatibility check preserves current bodyless JSON logout/service-identity calls. See TEST_RESULTS.md for executed checks and remaining acceptance.

Milestone 1 is not globally complete. Next checkpoint: restore static code provider and run isolated account/native acceptance, then choose the next verified transaction or authorization defect.

Android debug build succeeded (308 Gradle tasks). Installation succeeded; AllGo process and foreground activity were observed, but launch-wait timed out. A screenshot attempt produced no usable image. Shut down the exact headless emulator created for this investigation after its ADB shutdown stalled; no Swiggy package operation was used. Optional ABI-split inventory failed with host out-of-memory, and its partial output was not used as evidence. Provisioned only fresh loopback PostgreSQL instances using generated test-only credentials; cleanup stopped each task-owned database and its Firebase emulators. No application database was used.

Reviewed the final middleware placement, parser error projection, existing bodyless JSON callers, account integration coverage and staged-file scope. No unrelated source was staged. The change is a completed security capability checkpoint; overall APK method analysis and milestones 1–8 remain open as described above.

## 2026-10-23 — Independent production continuation

User direction now explicitly permits proceeding without the APK. COD checkout/completion/cancellation/recovery repairs are committed as `8d54eaf` and pass 349 application tests plus 158 Firebase integration/rules tests. Shared runtime alignment, standalone web checks and all three verified Android debug artifacts are recorded in `../production/2026-10-23-production-work.md`. APK/provider unknowns are no longer a reason to defer independent application repairs. Missing live configuration, business policy and device/operational acceptance are still reported honestly.
