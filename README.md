# Goodnight Family Pumpkin Organizer 🎃

[Open the family website](https://jacobmgoodnight.github.io/pumpkin-family-organizer/)

A shared family pumpkin-carving catalog with **2,053 designs** and **1,553 visual descriptions**.

## Features

- Profiles for Jacob, Shelby, Charlotte, Violet and optional Family
- Live family favorites and final picks, with account-scoped Supabase synchronization
- Smart search, galleries, compare, and Google Images fallback
- Private, opt-in thumbnail uploads under **Family sync → Add private thumbnail folders**
- Original-file locator for patterns stored on your own Mac/PC
- Original licensed PDFs are **not** published by this repository

## Family setup

1. Use the same **trusted household adult email** on each device to sign in with an email link. There are no separate child login accounts.
2. After sign-in shows **Synced ✓**, select a family profile and favorite a design. Check the same profile on another device.
3. To populate images, on a Mac/PC open **Add private thumbnail folders** (Family sync panel), affirm that you have permission to store the selected previews, and upload **Thumbnails**, then **Additional_Thumbnails**, separately.
4. The private Supabase Storage bucket `pc-previews` is account scoped and not public. The image files never enter this public repository.
5. On the website, **Find original** shows the real source collection and a copyable file path. The first time, click **Set my local library folder** and point it to the directory containing both `Zombie Pumpkins` and `____Pumpkin_Complete_Family_Organizer_HD`.

**Important:** Web browsers cannot directly open `file://` paths to another computer's drive. The online site currently locates originals only; it does not host PDFs or enable remote PDF printing.

## Local PDF link repair

In the local `START_HERE.html`, original Zombie Pumpkins PDFs are under `../Zombie Pumpkins/<original publisher collection>/<filename>.pdf` relative to the organizer folder. The category paths formerly used for PDF links were virtual organizer groupings, not the actual source folders.

The standalone `Pumpkin_PDF_Original_Links_Upgrade.zip` installer is provided separately in ChatGPT. It fixes the local HTML without copying PDFs. It also includes `Audit_Original_Files.py` to check all 2,053 file paths on your actual drive and report mismatches. The catalog retains Dolly Parton locally.

## Technical/security notes

- Static site: GitHub Pages (source public)
- Sync: Supabase Auth, Postgres with RLS, and Realtime
- Private preview bucket: Supabase Storage; users can upload/read in their own account folder only
- Browser configuration uses a **publishable key**, never a service-role/secret key
- Favorites in a local browser stay separate until you sign in; see **Merge favorites from this device** when needed
- The complete library of images and PDF files remains on your computer until you explicitly choose to store authorized previews privately. Verify your pattern licenses before uploading previews.
- The web experience is not guaranteed to work offline.

## Deployment settings

- [GitHub Pages settings](https://github.com/jacobmgoodnight/pumpkin-family-organizer/settings/pages): deploy **main / root**
- [Supabase Auth URL settings](https://supabase.com/dashboard/project/wljddcebgmqzrgxjebkn/auth/url-configuration): Site URL and Redirect URL `https://jacobmgoodnight.github.io/pumpkin-family-organizer/`

## Deployment status

- [x] GitHub repository and Supabase database configured
- [x] Account-upsert RLS policy added to resolve first sign-in error
- [x] Private authenticated image-upload policies
- [x] Web print locator and explicit user-initiated thumbnail uploader
- [ ] Re-test first family sign-in on a real device
- [ ] Test two-device real-time favorites
- [ ] Upload permission-appropriate private previews from the user's Mac/PC
- [ ] Confirm original-file audit and printing from the locally fixed organizer
