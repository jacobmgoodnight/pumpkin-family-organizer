# Developer setup, deployment and release checks

Repository: https://github.com/jacobmgoodnight/pumpkin-family-organizer

This is a lightweight GitHub Pages static app. **Do not replace its embedded catalog, Supabase project, user IDs, family profiles, or licensed artwork.**

## Frontend and deployment

- GitHub Pages serves **main / root**. There is no build step or framework migration.
- `index.html` embeds catalog data and the core browser script. It currently exceeds 1.2 MB. Preserve IDs and source paths when editing. The catalog should eventually move into a separately cacheable static asset after regression testing.
- `family-sync.js` handles authentication, realtime, signed thumbnail URLs, print locator and a local account-scoped sync outbox.
- `family-features.js` handles online discovery, private imports and metadata updates.
- `search-suggestions.js` provides local autocomplete, no external API calls.
- `pdf-preview.js` dynamically loads **PDF.js 4.10.38** from cdnjs only when a PDF import needs a first-page thumbnail; it runs in the browser. The PDF worker uses the *same pinned version*. If the CDN is inaccessible, imports still work with a placeholder.
- `cloud-config.js` contains only the public Supabase URL and publishable key. Do not put privileged keys in browser code or GitHub.
- `supabase/functions/pumpkin-image-search/index.ts` is the version-controlled source for the deployed Edge Function.

## Private Supabase project

Project: [wljddcebgmqzrgxjebkn](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn).

Supabase Auth uses one parent account across devices; profiles are **not independent security principals**. Configure allowed sign-in and redirect URLs for `https://jacobmgoodnight.github.io/pumpkin-family-organizer/`. Password sign-in avoids the default email-sender quota, and the email-link method remains fallback.

Required tables: `pc_accounts`, `pc_people`, `pc_choices`, `pc_imports`, `pc_web_ideas`, `pc_search_logs`. Owner-scoped RLS and user-scoped paths are mandatory; `pc-previews` and `pc-family-imports` must remain **private** storage buckets. Signed links are refreshed periodically; do not cache signed URLs or original artwork publicly.

For image discovery, configure the private Edge Function secret **`SERPAPI_KEY`** under **Edge Functions → Secrets**. The deployed function deliberately uses `verify_jwt: false` at the gateway and **manually checks the Bearer token, user and family account internally**. Do not disable or remove those function-level checks. The function returns up to 48 images, and the client reveals them in groups of 12. Searches are explicitly initiated and rate limited.

The live project has a **Leaked Password Protection Disabled** security advisory. Where supported by the Supabase Auth plan, enable leaked-password protection in Auth settings and recheck the advisor: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

See [schema inventory](supabase/SCHEMA_BASELINE.md) for inspected columns, constraints, private storage requirements and limits. **Do not blindly run new table-creation SQL against production.** No table migrations were applied during the October 29 improvement pass.

## Running checks

With Node.js 22 or newer:

```bash
npm test
```

GitHub Actions runs the same suite on commits/PRs. Tests cover the 661 + 1,392 built-in catalog records, unique IDs, offline search scoring, print-action types, source syntax and privacy invariants without calling Supabase or SerpApi.

## Manual acceptance checklist before declaring release fully verified

- [ ] Parent signs in via password on two actual devices and switches between family profiles.
- [ ] Change a favorite/final pick on one device; verify it appears on the other.
- [ ] Take a device offline; save a favorite; reconnect and verify the pending sync is delivered.
- [ ] Browse a built-in design in gallery, preview, comparison and Family lineup; all invoke local locator.
- [ ] Open a private imported PDF from Family lineup; confirm printable link works and renews when necessary.
- [ ] Import an authorized PDF with no preview; check first-page thumbnail on desktop and phone.
- [ ] Edit an imported pattern's tags, category, difficulty and thumbnail; ensure existing favorites remain.
- [ ] Confirm that a blocked external original falls back to manual download.
- [ ] Print a Family lineup on paper or to PDF; verify text and pictures fit.
- [ ] Verify Google Images search does **not** occur while typing and reuses cached results on reopening.
- [ ] Test the app at 360 px, 768 px and desktop sizes for clipping, keyboard focus and touch targets.

## Cautions and follow-up

- The sync outbox retries failed writes per account, but **simultaneous changes to the exact same favorite/final-pick item on two devices are currently last-writer-wins**, not conflict-resolved. Test explicitly before claiming perfect concurrent sync.
- The DB does not transact deletion of an import, its choice references and storage cleanup as one atomic operation. Use care around partial failures; a future owner-scoped transaction/RPC may help.
- Private licensed built-in originals are not published. Web search previews are references, not permanent printables.
- No full offline experience and no public cache of protected preview assets.


## Authentication and iPhone UI (October 29, 2026)

Email links use `signInWithOtp` with `shouldCreateUser: false`. For failures such as “Signups not allowed for OTP,” verify that the supplied address is the **existing confirmed family account**, OTP/email authentication is permitted in Supabase, and that the GitHub Pages URL is in Auth → URL Configuration. **Do not enable open registrations just to get email links working.** Password setup and resets use `resetPasswordForEmail`, an existing-account recovery redirect, `PASSWORD_RECOVERY` and authenticated `updateUser`. Default Supabase email limits still apply. Recovery responses deliberately do not reveal whether an address exists.

The `mobile-polish.css` file is loaded after the inline styles and provides a grid rather than a wrapping flex row for Sort, Surprise and Clear filters. It also sizes inputs at 16px to avoid iPhone Safari zoom. Test at CSS viewport widths 320, 375, 390, 430 and 768 px. GitHub CI only validates CSS structure; it does not visually emulate Safari.


## Invite-only guest portal and scoped server API

The deployed Supabase function `pumpkin-profile-invites` uses a server-held key and manually verifies either the real parent JWT (`list`, `create`, `revoke`) or a single-person 256-bit bearer token (`guest`, `choice`, `thumbs`, `print`). The function is deployed with `verify_jwt: false` because guests authenticate with their own bearer capability. Keep its internal checks.

Creating a link revokes prior live links for that person, stores only a SHA-256 token hash in `pc_profile_invites`, and returns the plaintext token only once. Links expire after 7, 14 or 30 days. The guest portal stores it in sessionStorage and removes the fragment from its visible URL. Parent can revoke the link immediately.

`pc_profile_invites` is intentionally **RLS enabled with zero policies and zero grants to anon/authenticated**. The Supabase advisor's `rls_enabled_no_policy` INFO finding is expected. Do not grant public SQL access to silence it. The guest API uses the server-only credential and binds choice writes to the invitation's owner/profile pair, never a person ID supplied by the guest.

Guest artwork is delivered by 20-minute signed URLs to private, owner-scoped preview files. The extra `guest-catalog.json` asset contains only catalog metadata, not licensed artwork or credentials. Guest access to imported printable files uses short-lived signed URLs for records belonging to the bound owner.

Acceptance testing still needed: parent creates a link → guest opens in private browsing → guest changes favorites and picks → parent sees the changes → parent revokes → guest requests fail. Test also expiration and print behavior. Static CI alone cannot prove a real parent/guest session works.

## Guest expanded features and server permissions (October 29, 2026)

The `pumpkin-profile-invites` Edge Function also supports the guest-only `search` action. Every request requires a live, nonrevoked invite token; Google search uses the **server-side** `SERPAPI_KEY`, shares the parent's `pc_search_logs` quotas (15/hour and 40/day), requests safe Google Images results, and returns up to 48 image cards. Guest searches must not leak SerpApi keys or parent JWTs into the browser. Guests can only share a source URL with the organizer, not upload third-party assets through this capability.

The `guest` action now additionally returns the family's names and only **favorite/final-pick** states for the same household, excluding account emails and other parent data. The `choice` branch remains hard-coded to the verified invitation's `uid` and `personId`, so selecting another person's view in guest.js has no corresponding write power. The portal includes a preview dialog, comparison dialog, read-only family lineup and signed previews. Manual testing should include changing the selected member then attempting a write (UI disabled and server always binds write to the invite's person), and separately testing that a revoked/expired token rejects searches.

The phone-only organizer header now uses mobile-scoped CSS and asset version markers; desktop layout remains unchanged. It is important to test actual iPhone Safari rather than assuming CSS checks prove the visual layout.
