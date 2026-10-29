# Goodnight Family Pumpkin Organizer 🎃

[Open the family website](https://jacobmgoodnight.github.io/pumpkin-family-organizer/)

A shared family pumpkin-carving catalog with **2,053 designs** and **1,553 visual descriptions**.

## Parent sign-in without repeated emails

Supabase's built-in sender allows only **two auth emails per hour per project**. For regular household use, sign in with an **adult email + password** instead of requesting a fresh email link on every phone.

1. On a phone or computer **already signed in** using the parent email link, open **Family sync → Set/change parent password**.
2. Set a strong password of at least 12 characters. This updates the existing household account without clearing its four profiles or favorites.
3. On a new device, enter that same adult email and password and select **Sign in with password**. No new email is sent.
4. Let the child tap their name (Charlotte/Violet/etc.) to use their own profile. No child email or password needed.
5. If no device is currently signed in and no password has been set, wait for the project-wide email quota to reset before requesting **one** email link, or configure custom SMTP; there is no instant bypass of Supabase's server-side limit.

The email-link fallback does not create a new user account and pauses repeat requests after the server reports a rate limit. Passwords are submitted directly to Supabase Auth; the organizer does not save them in its local favorites or repository.

## Simple family access

Children **do not need email accounts**. The parent uses one trusted household adult email to connect each phone or tablet once. Supabase remembers the signed-in device unless the family signs out or clears browser data. Kids simply choose their profile (Jacob, Shelby, Charlotte, or Violet) using the quick profile buttons at the top of the page.

A completely unauthenticated family-code login is **not enabled** because the artwork previews and selections are in private cloud storage. Public read access would make private artwork available outside your family.

## Why thumbnails are missing and how to fix them

The GitHub Pages repository intentionally does not contain the licensed thumbnails. On a Mac or PC that holds the organizer's actual image folders:

1. Open the [website](https://jacobmgoodnight.github.io/pumpkin-family-organizer/) and sign in using the trusted adult account.
2. In the green **Family sync** panel, click **Upload thumbnails for everyone**. The panel shows how many of the 2,053 thumbnails are currently stored in your household's private bucket.
3. Open **📷 Upload photos for all family devices**, confirm that you have permission to store those selected previews privately, and choose the folder named **Thumbnails**.
4. Let that folder finish uploading. Repeat the process with **Additional_Thumbnails**. The total is approximately 194 MB; only small images are uploaded, not PDFs.
5. Refresh the gallery on any signed-in family device. Images are delivered from authenticated, private Supabase Storage using short-lived URLs. No local image folders are needed on those devices.

If some items remain blank, look at the uploader's error summary. Re-selecting a folder can replace existing files to complete a partial transfer. A valid user session and permission confirmation are required for uploads.

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
