# Matwork shared workspace setup

This folder contains the initial schema for the private parent, wrestler, and coach workspace. The public Matwork site remains generic. Keep wrestler records in the signed-in workspace only, and use first names or nicknames.

## Current state

- `migrations/001_private_journal.sql` defines the private records, role-aware row-level security (RLS), and one-time parent-created access codes for wrestler and coach accounts.
- `shared.html` and its JavaScript/CSS provide the initial shared workspace: email-link sign-in, family setup, wrestler profiles, lesson notes, practice assignments, and wrestler completion tracking.
- The migration has not been applied to a live project or verified with separate parent, wrestler, and coach accounts. Do not enter real records until that validation is complete.
- The original public journal at `index.html` is browser-local; it does not share data or enforce roles.

## Connect a new Supabase project

1. Sign into Supabase and create a new Matwork project. The initial migration assumes an empty project.
2. In the SQL Editor, run `migrations/001_private_journal.sql` once.
3. In `Project Settings → API`, copy the **Project URL** and **publishable key** (legacy `anon` key is also accepted) into `supabase-config.js`.
4. In Supabase Auth URL configuration, set the site URL to `https://dane789.github.io/matwork/` and add `https://dane789.github.io/matwork/shared.html` as a redirect URL. If you use the local preview, add its shared page URL too.
5. In Auth email settings, ensure the sign-in email link directs back to the requested redirect URL. Email-link sign-in is used so families do not need passwords for the first version.
6. Publish the changed files. A parent signs in, creates a family and first-name wrestler profile, then makes a one-time coach access code and wrestler access code. Each code expires after seven days and is single-use.
7. Before relying on it, sign in separately as parent, wrestler, and coach. Confirm wrestler views do not show parent notes and coach access is limited to the assigned wrestler.

The Project URL and publishable key are intended for browser use. **Never put a `service_role` or `secret` key in website files, chat, or GitHub.** Those keys bypass RLS. Do not enter a child's birthday, surname, school, location, schedule, or contact details.

## First lesson workflow

After the parent workspace is ready, record each lesson's date, number, focus, the actual coach cues, and separately labeled observations/priorities. Add each suggested at-home item with its audience and mark it as a parent recommendation unless the coach assigned it. A wrestler can then sign in, see wrestler-facing items, and check them off. The checklist records completion time for the parent and (for coach-assigned work) coach to review.

No wrestler-specific data or credential is seeded in this migration. Do not apply it over existing tables with the same names.

