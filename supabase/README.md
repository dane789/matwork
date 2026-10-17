# Matwork shared workspace setup

This folder contains the initial schema for the private parent, wrestler, and coach workspace. The public Matwork site remains generic. Keep wrestler records in the signed-in workspace only, and use first names or nicknames.

## Current state

- `migrations/001_private_journal.sql` is installed in the Matwork Supabase project. It defines the private records, role-aware row-level security (RLS), and one-time parent-created access codes for wrestler and coach accounts.
- `migrations/003_coach_profiles.sql` adds private, account-linked coach display names. It is installed in the active Matwork Supabase project. For a new project, apply it after the base schema and before using the matching `shared.html` and `shared.js` changes. It does not expose coach emails.
- `migrations/004_ai_usage_limits.sql` adds private server-enforced quotas for optional AI lesson drafts. Pilot defaults are 100 drafts per Matwork project per month and 20 per coach per month. Apply it before deploying the updated function source. Project owners can adjust the limits in Supabase SQL Editor; coaches cannot read or change them.
- `functions/coach-session-draft/index.ts` is deployed as the authenticated `coach-session-draft` Edge Function. It validates the coach assignment before sending lesson notes to the OpenAI Responses API, and returns an editable draft without saving it. The function handles browser CORS preflight requests for the GitHub Pages origin and local preview.
- The function is deployed, but its live OpenAI request currently returns `429 credit_balance_exhausted`. Add API credits before retrying. No OpenAI secret belongs in this repository or in Drive.
- Cost controls: coach notes can be entered and saved without AI; use phone keyboard dictation for free transcription, send only the current lesson note (never the full journal/history), and review the draft before saving. The request is a single call with `store: false`; the updated source requests concise output capped at 1,600 tokens and checks the project-wide and per-coach monthly quotas before calling OpenAI. These safeguards take effect in production after migration `004_ai_usage_limits.sql` is applied and the Edge Function is redeployed. No automatic retries or background AI calls.
- The current model is `gpt-5.4-mini`. A future cost experiment can compare `gpt-5.4-nano` on an already-approved sample before switching; nano's published token rates are lower, but we should keep the coach review gate and verify faithful cue extraction first.
- `shared.html` and its JavaScript/CSS provide the initial shared workspace: email-link sign-in, family setup, wrestler profiles, lesson notes, practice assignments, and wrestler completion tracking.
- A sign-in link worked from the published shared page on a phone and desktop. The owner has parent and pilot-coach views in one signed-in account; separate parent, wrestler, and coach accounts still need end-to-end verification before real records are relied on.
- Supabase's built-in email sender is limited to two auth emails per hour. Configure custom SMTP before onboarding separate wrestler and coach accounts.
- The original public journal at `index.html` is browser-local; it does not share data or enforce roles.

## Connect a new Supabase project

1. Sign into Supabase and create a new Matwork project. The initial migration assumes an empty project.
2. In the SQL Editor, run `migrations/001_private_journal.sql` once.
3. In `Project Settings → API`, copy the **Project URL** and **publishable key** (legacy `anon` key is also accepted) into `supabase-config.js`.
4. In Supabase Auth URL configuration, set the site URL to `https://dane789.github.io/matwork/` and add `https://dane789.github.io/matwork/shared.html` as a redirect URL. If you use the local preview, add its shared page URL too.
5. In Auth email settings, ensure the sign-in email link directs back to the requested redirect URL. Email-link sign-in is used so families do not need passwords for the first version.
6. Publish the changed files. A parent signs in, creates a family and first-name wrestler profile, then makes a one-time coach access code and wrestler access code. Each code expires after seven days and is single-use.
7. Before relying on it, sign in separately as parent, wrestler, and coach. Confirm wrestler views do not show parent notes and coach access is limited to the assigned wrestler.
8. For an existing project, apply later migrations in sequence. Migration `003_coach_profiles.sql` must be applied before the coach profile UI is used.

The Project URL and publishable key are intended for browser use. **Never put a `service_role` or `secret` key in website files, chat, or GitHub.** Those keys bypass RLS. Do not enter a child's birthday, surname, school, location, schedule, or contact details.

## First lesson workflow

After the parent workspace is ready, record each lesson's date, number, focus, the actual coach cues, and separately labeled observations/priorities. Add each suggested at-home item with its audience and mark it as a parent recommendation unless the coach assigned it. A wrestler can then sign in, see wrestler-facing items, and check them off. The checklist records completion time for the parent and (for coach-assigned work) coach to review.

Coach display names are set by the signed-in coach in their workspace and shown beside coach-authored lesson notes and assignments. Each name is tied to the coach account; email addresses remain private. A future wrestler-facing momentum view should be based on logged actions (practice check-ins, assigned drills, and strength sessions), explain its calculation, and give credit for consistency without claiming to measure motivation.

No wrestler-specific data or credential is seeded in this migration. Do not apply it over existing tables with the same names.

