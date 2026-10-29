# Goodnight Family Pumpkin Organizer 🎃

[**Open the family organizer**](https://jacobmgoodnight.github.io/pumpkin-family-organizer/) · [**Supabase project**](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn)

A private-to-the-family pumpkin-carving planner hosted on GitHub Pages. Browse **2,053 built-in patterns**, compare favorites, and choose each family member's final carving design. The public GitHub repository contains the app's code and catalog metadata, **not the licensed original PDFs or thumbnails**.

## What works today

| Area | Implementation |
| --- | --- |
| Pattern catalog | 661 curated Zombie Pumpkins + 1,392 Additional Templates; original records left untouched |
| Smart Search | Names, tags, keywords and 1,553 reviewed visual descriptions; curated results favored on close matches, not above clearly stronger matches. Offline suggestions appear after 2 letters; optional typo suggestions never silently change a query |
| Family profiles | Jacob, Shelby, Charlotte and Violet share one trusted adult Supabase login; kids do not need email |
| Favorites & Final Picks | Person-specific selections stored in Supabase; Realtime listeners refresh connected devices |
| Private thumbnails | **All 2,053 uploaded and verified in the private `pc-previews` bucket** (661 + 1,392; about 194 MiB) |
| Family imports | Upload an authorized PDF or image to private storage with title, tags, category and optional preview; shown in the regular gallery, favorites and Final Picks |
| Saved web ideas | Save source links and externally hosted preview references separately from actual printable imports |
| Google Images discovery | User-confirmed native-styled cards from SerpApi Google Images via a Supabase Edge Function. The server returns up to 48 results from one search; 12 appear initially, with Show more revealing the rest |
| Home screen | Web-app manifest and SVG pumpkin icon; no offline service worker or guaranteed offline browsing |
| Original catalog printing | Local file-path locator; licensed built-in originals are not accessible as PDFs on other devices |
| Imported file printing | Authorized imported originals use time-limited private storage links; cross-device printing still needs real-world testing |

**Important:** Google Images result cards have been confirmed working by the user. Real PDF uploads, phone/tablet access, and two-device sync have **not** been acceptance-tested with the family's devices.

## Getting started

1. Open the [website](https://jacobmgoodnight.github.io/pumpkin-family-organizer/).
2. A parent signs in once on each device using the **same adult email and password**. If an existing email-link session does not yet have a password, set it first under **Family account settings → Set/change parent password** on a signed-in device.
3. Pick **Jacob**, **Shelby**, **Charlotte**, or **Violet**. Each family member uses their own favorites and Final Picks without their own email address.
4. Search **All templates**, or filter to **Zombie Pumpkins**, **Additional templates**, or **Family imports**.
5. Use **Import pattern** for an authorized printable PDF/image. Use **Library tools** for **Manage imports**, **Saved ideas**, and **Help**.

Supabase persists browser sessions, but sessions can expire or be cleared. An email magic-link fallback remains available and is rate-limited; the password method avoids repeated email delivery. Family profiles are convenience profiles under one authenticated household account, **not separately secured child accounts**. Avoid treating a carver selection as an authentication boundary.

### Pattern previews and storage

The account's private Supabase Storage already contains all 2,053 original preview images. **There is no need to upload them again.** If a future device reports missing previews, confirm it is signed into the same account, then refresh the page. A troubleshooting uploader is available in **Family account settings → Upload photos for all family devices**, but it should only be used for an actual missing/failed upload. Original licensed PDFs are not hosted publicly.

Family imports use the separate private `pc-family-imports` bucket. A printable PDF/image is required; an optional JPG, PNG or WebP thumbnail improves the gallery preview. Without a separate image thumbnail, imported PDFs use a pumpkin placeholder, not an automatically generated PDF preview. Supported uploads are limited to **20 MB per file**. Source attribution is optional, and duplicate titles produce a confirmation rather than automatic merging.

## Offline search suggestions and typo handling

The built-in gallery already supports synonyms (e.g. cat / kitty), partial word matches once at least 4 characters are typed, and limited single-character typo tolerance on longer words. It **does not automatically replace a misspelled search**.

An additional, lightweight **offline suggestion list** appears after typing **2 or more letters**, offering matching pattern names and common subject words from the built-in and imported catalog. When a likely typo is detected, a clickable **Did you mean?** option can appear. Click a suggestion or use the keyboard arrows and Enter to search it; press Escape to dismiss. Suggestions are based on **this family's actual library**, not Google's global predictions, and **use no SerpApi or Supabase search quota**.

## Google Images inside the app

Selecting **Find more online** now opens the inline discovery panel **and automatically searches Google Images** using the current subject. No second click is necessary. The **Search Google Images** button remains for running a new or refreshed query after editing the online-search input. Typing in the built-in library search remains local and uses no SerpApi credits: a provider search is triggered only by explicitly selecting **Find more online** or **Search Google Images**. If the library has five or fewer matching patterns, a contextual "more designs" shortcut appears. Reopening the same query within 15 minutes reuses session-cached results without another provider request.

Once enabled, the in-app results include an externally hosted thumbnail, title, source website, **Open source**, **Save idea**, and **Import file**. The cards are visually integrated with the Halloween interface but remain **separate from the licensed pattern gallery** until the family uploads an authorized printable file. **Save idea** stores a source reference, not a permanent printable PDF. Remote thumbnails and third-party sites may disappear, block embedding, or be subject to copyrights. The app does not automatically download or republish them.

### Free SerpApi setup (recommended)

1. Sign up for a free account at [SerpApi](https://serpapi.com/users/sign_up).
2. Copy the key from [Manage API Key](https://serpapi.com/manage-api-key).
3. Open [this app's Supabase dashboard](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn) → **Edge Functions → Secrets**.
4. Add a secret whose **name** is exactly `SERPAPI_KEY`; paste the key as its **value**. **Never place it in browser code, the public repo, issues, or chat.**
5. Save the secret, reload the [family organizer](https://jacobmgoodnight.github.io/pumpkin-family-organizer/), search a subject such as "Hello Kitty", and click **Find more online**. Cards load automatically.

The deployed `pumpkin-image-search` Edge Function uses Google Images via SerpApi, checks the authenticated user's family account, and can return **up to 48 cards per query** (when the provider supplies enough eligible results). The browser shows **12 at first** and reveals 12 more on each **Show more images** click without spending another SerpApi search for that batch. It currently limits the household to **15 image searches per rolling hour and 40 per rolling day**. Provider quotas are independent. As of October 29, 2026, SerpApi advertises **250 free searches per month**; verify current plan terms at [SerpApi pricing](https://serpapi.com/). The app checks whether the server secret exists when you open web discovery. The user has confirmed that real image result cards now work with the key. Supabase provides the authenticated API/function layer; **SerpApi** is the external service querying Google Images.

If the key is not configured, **Open Google Images** still launches the normal Google Images results in another tab, with no key. There is **no browser-only method for embedding arbitrary Google Images search results as reliable custom cards without an approved search provider**.

### Other image-search options (not enabled)

- **Brave Image Search API:** Supports custom in-app cards, but these are Brave's index, **not Google Images**. Its current advertised Search plan is $5/1,000 requests with $5/month free credits, and requires its own credentials and server implementation. [Official pricing](https://brave.com/search/api/)
- **Google Programmable Search Element:** Can embed an image-search experience with Google's own interface, rather than this app's custom result cards. Under Google's **January 20, 2026** changes, new engines must search selected sites (up to 50 domains); new unrestricted whole-web engines are unavailable. [Google announcement](https://programmablesearchengine.googleblog.com/2026/01/updates-to-our-web-search-products.html)
- **Google Custom Search JSON API:** Closed to new customers and scheduled for transition by **January 1, 2027**. It is not a new-project alternative. [Google developer docs](https://developers.google.com/custom-search/v1/overview)
- **Screen scraping Google Images from the browser:** Not implemented; fragile, prone to blocking, and unsuitable for a dependable family app.

## How printing works

**Built-in patterns:** The site keeps original relative source paths and provides **Find original**. On a computer that has the purchased/licensed catalog, use the locator's **Set my local library folder** action, then copy the file path into Finder or Windows File Explorer. The root is the folder containing both `Zombie Pumpkins` and `____Pumpkin_Complete_Family_Organizer_HD`. Browsers on other devices cannot read files on that computer directly.

**Family imports:** An authorized imported PDF or image gets a short-lived signed URL to the private original file, letting the browser open it for printing. Imported originals are not published to GitHub. A separate image preview is recommended for PDF imports.

The locally repaired `START_HERE.html` and any repair ZIPs distributed outside this repository are **not included in the GitHub Pages deployment**. This README does not claim they have been installed or audited on every device.

## Security and architecture

- **Frontend:** Static `index.html`, `family-sync.js`, `family-features.js`, `search-suggestions.js` and `cloud-config.js`, hosted on GitHub Pages (public source).
- **Cloud:** Supabase Auth, account-scoped Postgres RLS on `pc_accounts`, `pc_people`, `pc_choices`, `pc_imports`, `pc_web_ideas`, and `pc_search_logs`; realtime publication for the family-facing choice/import tables.
- **Storage:** Both `pc-previews` and `pc-family-imports` are **private** and use account-scoped object paths; signed URLs have time limits.
- **Image discovery:** Deployed `pumpkin-image-search` Edge Function calls SerpApi server-side, with a server-held `SERPAPI_KEY`. It uses gateway `verify_jwt: false` with **manual user token and family-account verification inside the function**; do not remove those internal checks.
- **Credentials:** The frontend holds a publishable Supabase key, **never a service-role key or SerpApi key**. Passwords are handled by Supabase Auth.
- **Limitations:** External thumbnails still load from their source hosts; arbitrary websites may block them. Do not automatically mirror third-party copyrighted images. No offline caching of licensed previews or signed URLs is implemented.

## Deploy and verify

- GitHub Pages: [settings](https://github.com/jacobmgoodnight/pumpkin-family-organizer/settings/pages) → deploy `main` branch, repository root.
- Supabase Auth: [URL configuration](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn/auth/url-configuration) → allow `https://jacobmgoodnight.github.io/pumpkin-family-organizer/` for sign-in redirects.
- Supabase secrets: [project dashboard](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn) → Edge Functions → Secrets → optional `SERPAPI_KEY`.
- No credentials or private original PDF/thumbnail files should be committed.

**Engineering checks completed:** Repository bridge and feature wiring reviewed; private buckets and their uploaded preview counts checked; schema RLS and realtime publication reviewed; JavaScript syntax checked. There is still one Supabase Auth advisory about disabled leaked-password protection (which may depend on plan). [Supabase security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

**Still to acceptance-test:** A parent sign-in on a new device, full 2-device favorites/Final Picks sync, actual PDF/image upload and printable-original access, signed-URL refresh behavior, search suggestions in real mobile/desktop browsers, and expansion of 48-image responses with a live SerpApi search. Google Images cards have already been confirmed working by the user. Avoid claiming those tests have passed without real results.
