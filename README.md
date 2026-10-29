# Goodnight Family Pumpkin Organizer 🎃

Family pumpkin-stencil discovery with profiles for Jacob, Shelby, Charlotte and Violet.

**Website (after GitHub Pages is enabled):** https://jacobmgoodnight.github.io/pumpkin-family-organizer/

## What's included

- Searchable catalog of **2,053 carving designs** and **1,553 visual descriptions**
- Personal favorites, comparisons and final carving picks
- Separate Supabase cloud database for household selections, with realtime changes
- Private storage bucket for approved thumbnail assets (none are included in this public repository)
- Optional Google Images link when the local collection has few matches

## Turn on the website

1. Open [Repository Settings → Pages](https://github.com/jacobmgoodnight/pumpkin-family-organizer/settings/pages).
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Set branch **main** and folder **/(root)** and click **Save**.
4. In [Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn/auth/url-configuration), set **Site URL** to `https://jacobmgoodnight.github.io/pumpkin-family-organizer/` and add that exact URL under **Redirect URLs**.
5. Open the Pages URL; request an email sign-in link using your household email, then select a family profile. Use the same trusted household account from other devices.

## Artwork and printing

**No copyrighted pattern PDFs or thumbnails are published in this repository.** Only the catalog and user-interface code are public. The website may show missing thumbnails until properly permitted private preview images are uploaded to Supabase Storage. Printable originals remain in your local `K:` organizer until their paths and hosting permissions are reviewed.

Favorites are protected by account-scoped row-level security in Supabase; the website's catalog entries and public frontend code are visible to anyone. The current login method is a shared trusted adult email account, not independent child authentication.

## State

- [x] Source website published to GitHub repository
- [x] Separate Supabase project and secure tables created
- [x] Public publishable project key configured (no secret keys)
- [ ] GitHub Pages enabled in repository settings
- [ ] Auth Site URL and allowed Redirect URL configured in Supabase
- [ ] First household sign-in and two-device synchronization tested
- [ ] Permission-appropriate previews uploaded and PDF mapping repaired

The existing offline organizer remains unchanged. Export a JSON backup before importing selections from a previous browser.
