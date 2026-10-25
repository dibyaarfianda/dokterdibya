# Patient chat loading, notifications and doctor identity

Scope: mobile edge chat keeps its green vertical tab and full-screen slide-in. Warm the iframe once after 800 ms without opening it or acknowledging messages. A tab-scoped, account-bound lobby preview (last 80 messages, 15-minute expiry) renders before network verification; composer and read acknowledgements remain disabled until fresh data loads. Logout/credential replacement clears the preview. Direct rooms are never persisted in this preview.

The patient service worker serves only the chat static shell and an explicit dependency list from the current release cache. API calls remain network-only. Socket.IO comes from the application's own origin.

Chat Settings contains an account-level notification switch, off by default. Enabling requests browser permission on the user's gesture, registers the device, then saves the preference. Disabling preserves subscriptions for other notification types. Ordinary messages, mentions and quotes use one chat push per enabled eligible recipient, excluding the sender. Payload contains a short preview and a link to the message. SW supplies the existing SISIwanita color logo and a transparent monochrome SW status icon, with silent=false. Actual sound and browser attribution depend on the device's notification settings; physical phone delivery/audio was not tested.

Only the canonical staff identity UDZAQUCQWZ receives sender_is_dr_dibya=true. Display name matching cannot grant the red nickname badge. The frontend uses the trusted flag plus sender_type=staff, with red background and white text.

Validation before release:
- 130 tests across 21 focused suites passed, including preview account isolation/expiry, hidden prewarm, permission denial, preference persistence, recipient filtering, duplicate suppression, SW payload/cache behavior and canonical doctor identity.
- Disposable MariaDB integration passed; migrations ran twice, no production patient/chat data was written and push delivery was mocked.
- Codex in-app browser, 390x844, local synthetic data with 1200 ms delay per chat API: prewarmed panel contained all three example messages before opening; opening interaction completed in approximately 245 ms. After portal reload, cached messages appeared approximately 880 ms after observation began (including the 800 ms warm delay), while API refresh was pending and composer disabled. These are local QA observations, not a device performance guarantee.
- Computed doctor nickname color: rgb(255,255,255), background: rgb(198,40,40).

Deployment requires applying staff/backend/migrations/20261025_patient_chat_notifications.sql before reloading dibyaklinik-backend, then verifying current asset hashes on both patient origins and the new service-worker activation. Release identifier: 20261025chatfast1.
