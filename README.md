# Goodnight Family Pumpkin Organizer 🎃

[**Open the family organizer**](https://jacobmgoodnight.github.io/pumpkin-family-organizer/) · [**Supabase project**](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn)

**Quick links:** [Family instructions](FAMILY_GUIDE.md) · [Developer setup and security](DEVELOPER_SETUP.md) · [Schema inventory](supabase/SCHEMA_BASELINE.md) · [Automated tests](.github/workflows/validate.yml)

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

## Secure links for each person

An authenticated **parent organizer** can now open **Family account settings → Share private family links**, select 7, 14 or 30 days (default 30), and generate a separate link for any person. Use **Copy link** or the device's native **Share** sheet to deliver it privately. The app itself does **not** send emails/text messages or require children's emails.

Each link opens [the restricted guest page](guest.html). The invited person can browse all 2,053 designs and authorized thumbnails, and update **only their own** favorites and final picks. They cannot open parent settings, manage others' choices, create links or access the parent password. Built-in original PDFs remain local; authorized imported printables may open with expiring signed URLs.

Link security: each 256-bit random bearer token is carried in the URL **fragment**, removed from the guest address bar, held in tab-local session storage, and stored only as a SHA-256 hash on the server. Every request checks which person it belongs to and whether it was revoked or expired. Organizer may **Replace** or **Revoke** immediately. A forwarded link grants the same access to its holder, so share only with the intended person.

**Verified:** the private invite table has RLS enabled, no client policies or grants; the invitation function is deployed. **Still needs a real device test:** create a link, open it in a separate browser, change picks, verify synchronization and revocation. No guest links were generated or messages sent on the user's behalf.


## Getting started

1. Open the [website](https://jacobmgoodnight.github.io/pumpkin-family-organizer/).
2. A parent signs in once on each device using the **same adult email and password**. If an existing email-link session does not yet have a password, set it first under **Family account settings → Set/change parent password** on a signed-in device.
3. Pick **Jacob**, **Shelby**, **Charlotte**, or **Violet**. Each family member uses their own favorites and Final Picks without their own email address.
4. Search **All templates**, or filter to **Zombie Pumpkins**, **Additional templates**, or **Family imports**.
5. Use **Import pattern** for an authorized printable PDF/image. Use **Library tools** for **Manage imports**, **Saved ideas**, and **Help**.

Supabase persists browser sessions, but sessions can expire or be cleared. An email magic-link fallback remains available and is rate-limited; the password method avoids repeated email delivery. Family profiles are convenience profiles under one authenticated household account, **not separately secured child accounts**. Avoid treating a carver selection as an authentication boundary.

### Pattern previews and storage

The account's private Supabase Storage already contains all 2,053 original preview images. **There is no need to upload them again.** If a future device reports missing previews, confirm it is signed into the same account, then refresh the page. A troubleshooting uploader is available in **Family account settings → Upload photos for all family devices**, but it should only be used for an actual missing/failed upload. Original licensed PDFs are not hosted publicly.

Family imports use the separate private `pc-family-imports` bucket. A printable PDF/image is required; an optional JPG, PNG or WebP thumbnail improves the gallery preview. When a PDF is imported without a separate thumbnail, the app tries to generate a private first-page preview in the browser using PDF.js 4.10.38. If this fails, the PDF can still import with a placeholder and its thumbnail can be edited later. Supported uploads are limited to **20 MB per file**. Source attribution is optional. Similar normalized titles trigger a confirmation instead of silently importing duplicates. **Manage imports → Edit details** can update name, category, search tags, difficulty and replace a thumbnail without changing the pattern ID or family selections.

## Offline search suggestions and typo handling

The built-in gallery already supports synonyms (e.g. cat / kitty), partial word matches once at least 4 characters are typed, and limited single-character typo tolerance on longer words. It **does not automatically replace a misspelled search**.

An additional, lightweight **offline suggestion list** appears after typing **2 or more letters**, offering matching pattern names and common subject words from the built-in and imported catalog. When a likely typo is detected, a clickable **Did you mean?** option can appear. Click a suggestion or use the keyboard arrows and Enter to search it; press Escape to dismiss. Suggestions are based on **this family's actual library**, not Google's global predictions, and **use no SerpApi or Supabase search quota**.

## Google Images inside the app

### Collapsible discovery panel

The **Find more printable designs** panel now has **− Minimize / + Expand** and **✕ Close** controls. Minimize keeps the searched image cards ready to reopen without navigating away. Close hides the panel entirely; recent online results can still be reused from the 15-minute in-session cache when reopened.

Selecting **Find more online** now opens the inline discovery panel **and automatically searches Google Images** using the current subject. No second click is necessary. The **Search Google Images** button remains for running a new or refreshed query after editing the online-search input. Typing in the built-in library search remains local and uses no SerpApi credits: a provider search is triggered only by explicitly selecting **Find more online** or **Search Google Images**. If the library has five or fewer matching patterns, a contextual "more designs" shortcut appears. Reopening the same query within 15 minutes reuses session-cached results without another provider request.

Once enabled, the in-app results include an externally hosted thumbnail, title, source website, **Open source**, **Save idea**, and **Import image**. The cards are visually integrated with the Halloween interface but remain **separate from the licensed pattern gallery** until the family uploads an authorized printable file. **Save idea** stores a source reference, not a permanent printable PDF. Remote thumbnails and third-party sites may disappear, block embedding, or be subject to copyrights. The app does not automatically download or republish them.

### Easier image importing from search results

Selecting **Import image…** on a Google Images result now pre-fills the design name, source and tags, displays the image preview and **tries to retrieve the original image directly in the browser**. When a website permits cross-origin image downloads, the printable image is staged automatically; after confirming permission, select **Upload and add pattern** to save it to the private family library. An imported JPG, PNG or WebP automatically doubles as the gallery preview if no extra preview is selected. The app warns when the original image may be too small for a clear print.

This is a **best-effort, browser-only process**. Some image hosts block cross-origin downloads; when that happens, select **Open original image** or **Visit pattern source**, save a permitted high-resolution image or PDF manually and select it in the same dialog. When available, a small web preview may be fetched for the gallery but is **never substituted as the printable original**. Google Images results usually do not provide a PDF download URL and the app does **not** scrape PDFs, bypass site restrictions or copy copyrighted designs automatically. Uploads require a signed-in parent and an explicit rights confirmation.

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

- **Frontend:** Static `index.html`, `family-sync.js`, `family-features.js`, `pdf-preview.js`, `search-suggestions.js` and `cloud-config.js`, hosted on GitHub Pages (public source).
- **Cloud:** Supabase Auth, account-scoped Postgres RLS on `pc_accounts`, `pc_people`, `pc_choices`, `pc_imports`, `pc_web_ideas`, and `pc_search_logs`; realtime publication for the family-facing choice/import tables.
- **Storage:** Both `pc-previews` and `pc-family-imports` are **private** and use account-scoped object paths; signed URLs have time limits.
- **Image discovery:** Deployed `pumpkin-image-search` Edge Function calls SerpApi server-side, with a server-held `SERPAPI_KEY`. It uses gateway `verify_jwt: false` with **manual user token and family-account verification inside the function**; do not remove those internal checks.
- **Credentials:** The frontend holds a publishable Supabase key, **never a service-role key or SerpApi key**. Passwords are handled by Supabase Auth.
- **Limitations:** External thumbnails still load from their source hosts; arbitrary websites may block them. Optional original-image retrieval uses the signed-in browser and CORS rather than server-side unrestricted URL fetching; imported images are only uploaded after explicit rights confirmation. No offline caching of licensed previews or signed URLs is implemented.

## Deploy and verify

- GitHub Pages: [settings](https://github.com/jacobmgoodnight/pumpkin-family-organizer/settings/pages) → deploy `main` branch, repository root.
- Supabase Auth: [URL configuration](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn/auth/url-configuration) → allow `https://jacobmgoodnight.github.io/pumpkin-family-organizer/` for sign-in redirects.
- Supabase secrets: [project dashboard](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn) → Edge Functions → Secrets → optional `SERPAPI_KEY`.
- No credentials or private original PDF/thumbnail files should be committed.

**Engineering checks completed:** Repository bridge and feature wiring reviewed; private buckets and their uploaded preview counts checked; schema RLS and realtime publication reviewed; JavaScript syntax checked. There is still one Supabase Auth advisory about disabled leaked-password protection (which may depend on plan). [Supabase security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

**Still to acceptance-test:** PDF first-page rendering and metadata/thumbnail editing on a real signed-in family device;  A parent sign-in on a new device, full 2-device favorites/Final Picks sync, actual PDF/image upload and printable-original access, signed-URL refresh behavior, search suggestions in real mobile/desktop browsers, expansion of 48-image responses with a live SerpApi search, and the new best-effort browser auto-fetch/import flow against real image hosts. Google Images cards have already been confirmed working by the user. Avoid claiming those tests have passed without real results.

## Automated validation and schema notes

The repository now includes dependency-free Node.js smoke tests in `tests/` and a GitHub Actions workflow that checks catalog counts/unique IDs, core offline search behavior, print-action routing, JavaScript syntax and privacy invariants. Run `npm test` with Node.js 22+. CI does **not** need Supabase or SerpApi secrets and does not perform production writes. See [the technical setup guide](DEVELOPER_SETUP.md) for release validation. The schema inventory in [supabase/SCHEMA_BASELINE.md](supabase/SCHEMA_BASELINE.md) describes the inspected live database; it is **not** a destructive migration to rerun in production.


## October 29: iPhone usability, sign-in and image importing

- **Phone layout:** A dedicated `mobile-polish.css` prevents Sort by from overlapping Surprise me by placing Sort by on its own row and both actions in independent, touch-sized cells. Search stays full width; collection/theme selectors share a row on phones when possible. The login and online discovery panels also get safer widths and controls.
- **Existing-family sign-in:** **Send email sign-in link** does not need a password and only permits an existing parent account (`shouldCreateUser:false`). The app now explains a signup/OTP refusal instead of suggesting a password is required. The new **Set up / reset password** option uses Supabase recovery emails and opens the password editor after a valid recovery callback. This does not enable public registration. A recovery request never proves the email is registered.
- **Web-image import:** A successful CORS-permitted original-image fetch is explicitly marked **staged**, not uploaded. If the remote host blocks it, the dialog explains that nothing was imported and provides a **Choose file from phone or computer** button. Search preview images are not substituted as printable originals.

These improvements have syntax/static checks in GitHub Actions; the exact iPhone layout, password recovery email delivery and different external hosts still require live acceptance testing.


## Search-first layout (October 29, 2026)

The organizer home screen now starts with **one prominent search box**, immediately followed by the **four family profile choices** and simple **Browse all / Favorites / Final picks / Family lineup** navigation. Collection, theme, and difficulty filters live inside a **More filters** disclosure; the existing original selectors, search suggestions, favorites and gallery logic remain unchanged. The sticky quick-search bar appears after the top search scrolls out of view and its Filters action opens the advanced controls. Mobile filter and search controls are designed for touch targets rather than stacked full-screen panels.

The header distinguishes the **Organizer** (authenticated adult's Supabase account/email) from the **selected carver** (whose favorites are active). A **Share links** shortcut expands Family account settings → Share private family links, where an organizer can **Replace link** if an invitation is lost or already shared. Replacing a link revokes the previous one, because plaintext invite secrets are deliberately never stored in the database. The authenticated parent account, not the Jacob/Shelby/Charlotte/Violet selector, determines organizer privileges.

This redesign changes markup and styling, **not the 2,053 catalog records, user profiles, RLS policies, or database**. Automated DOM/source regression tests cover the unique search input, progressive filters, link management and JavaScript syntax. Actual phone Safari layout and signed-in parent use still need human acceptance testing.
