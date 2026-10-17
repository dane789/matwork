# Matwork — Setup tracker

Updated: 17 October 2026

## What is set up

- **Public site:** GitHub Pages at https://dane789.github.io/matwork/; the home page leads with the core lesson, practice, and next lesson loop.
- **Core product rule:** every primary screen must advance coach instruction → athlete practice → parent support and feedback → coach follow-up, with one athlete history attributed to each coach.
- **UX cleanup:** removed stale wrestling quotes and the old journal from the home path; the shared workspace prioritizes each role main action, with manual alternatives tucked away.
- **Source:** public repository https://github.com/dane789/matwork; deploys from `main` with GitHub Actions.
- **Shared workspace:** parent, athlete, and coach views at https://dane789.github.io/matwork/shared.html. The owner has parent and pilot-coach views for rehearsal. Role-specific sign-in and account-level boundary checks remain pending.
- **Private backend:** Supabase project “Matwork Project” (`https://zrlxhvjiuwhnlsyzhofa.supabase.co`, Free plan). The owner has now created a family workspace and wrestler profile on mobile and generated separate parent and coach access codes.
- **Data safeguards:** schema installed with row-level security; parent-created wrestler/coach access codes are single-use and expire after seven days. Policies filter parent-only notes from wrestler and coach views; role behavior still needs account-level verification.
- **Login approach:** Supabase email sign-in links. Site URL and exact shared-workspace redirect are configured. The app uses the browser-safe publishable key; no service-role/secret key is in the site.
- **Email delivery:** Supabase default sender is active. Its current built-in limit is two auth emails per hour. Configure custom SMTP before broad use.
- **Coach quick capture:** Mobile-friendly coach note capture and editable approval screen are in GitHub Pages. Migrations `002_coach_note_capture.sql`, `003_coach_profiles.sql`, `004_ai_usage_limits.sql`, and `005_reflection_sharing.sql` are applied in Supabase. The authenticated Edge Function `coach-session-draft` calls OpenAI (`gpt-5.4-mini`), checks monthly quotas, and is deployed with a 1,600-token output cap. The first live draft request reached OpenAI and returned `429 credit_balance_exhausted`; no credits were added and no further AI calls were made. The `OPENAI_API_KEY` secret remains only in Supabase, not code or Drive.
- **AI cost policy:** AI is an optional formatting shortcut. Coaches can use manual lesson entry and phone keyboard dictation without an API call. The function sends only the current note, makes one request with `store: false`, has no automatic retries or background AI work, and enforces monthly limits of 100 drafts per project and 20 per coach. Coaches do not see or manage costs. A lower-priced model can be considered later after coach review.
- **Feedback loop feature:** Shared-workspace source includes parent and wrestler check-ins with author labels and explicit sharing choices. Migration `005_reflection_sharing.sql` is applied; parents can review family reflections, wrestlers see wrestler-addressed reflections, and coaches see only entries deliberately shared with them.
- **Parent-led lesson planning:** The parent can submit Coach notes and Parent observations as separate inputs, request one AI organized draft, review it, and select optional Athlete steps. Parent recaps and parent recommendations retain parent attribution. Coach assignments remain coach authored. The parent can choose to share the recap and parent checklist progress with the assigned coach; the choice resets after each save. Migration `006_parent_ai_drafts.sql` has been applied and verified. The updated `coach-session-draft` Edge Function was deployed successfully; no AI request was made during deployment.
- **Coach attribution:** Migration `003_coach_profiles.sql` is installed in Supabase. It creates the private account-linked coach profile table, the related-user access function, and three row-level policies. A read-only verification confirmed the table, function, and policies exist. Coach display-name UI is available; test coach sign-in and note attribution before relying on it with real records. Coach emails are not exposed.
- **Athlete core experience:** athletes see their own lesson cues and at-home checklist; check-ins are visible to assigned coaches. Training logs, milestones, and mindset extras are outside the core workflow until they demonstrably support lesson follow-through.
- **How it works page:** `for-coaches.html` explains athlete, parent, and coach roles, the private lesson loop, and coach-attributed history; mock athlete data and speculative public monetization copy were removed.
- **Source backup:** the Matwork Google Drive folder contains current tracked source files, `.nojekyll`, setup tracker, and workflow notes; update it after each published source change.

## Dependencies

- GitHub account/repository and GitHub Pages Actions for the public website.
- Supabase Auth + PostgreSQL for sign-in and private shared records.
- Supabase JavaScript client loaded from jsDelivr in the browser.
- OpenAI API access for coach-note organization; the API key is stored only as a Supabase Edge Function secret.
- Google Drive folder for source and setup-document backup.

## Still to finish before real records

1. Confirm the API key previously pasted into chat has been revoked; keep only the replacement key in Supabase Secrets.
2. Add API credits in OpenAI Platform, then retry the pilot Lesson #1 coach-note draft; confirm it stays in review until a human approves it. Keep the pilot provenance label so the parent-entered note is not mistaken for a coach-submitted record.
3. Invite the actual coach and wrestler with separate one-time codes; verify each role with separate sign-ins.
4. Configure custom SMTP for reliable sign-in email delivery before broader use.
5. Keep only first names in private Matwork lesson records; do not enter partner birthdays or surnames.

## Change log

- **17 October 2026:** Created the public GitHub Pages journal and role-aware shared workspace; configured Supabase Auth, database schema, row-level security, one-time family access codes, coach-note drafting function, and the OpenAI Function secret. Added access-code redemption to existing signed-in workspaces so parents can add coach access; coach-note generation and role separation still need signed-in verification.
- **17 October 2026:** Prepared account-linked coach display-name attribution and migration `003_coach_profiles.sql`; applied the migration to Matwork Supabase and verified the profile table, access function, and three RLS policies. Coach sign-in and authored-note display still need role-level verification. Added a wrestler-first engagement direction with a positive, explainable activity signal as a future design item.
- **17 October 2026:** Published the public Matwork coach/family marketing page with a sample wrestler view and future coach-plan value proposition; did not publish family or wrestler data or set prices.
- **17 October 2026:** Refined the coach marketing copy to describe the potential value of lower admin, professional session follow-up, and stronger continuity between private lessons. Future features and possible paid plans remain clearly framed as items to build and validate.
- **17 October 2026:** Rehearsed the private pilot using first names only. Added a one-time coach role to the signed-in parent account and labeled the coach profile “Pilot coach” to avoid implying the actual instructor submitted the test note. Found and fixed missing Edge Function CORS preflight handling; redeployed the function. The request now reaches OpenAI, which returns `429 credit_balance_exhausted`. The lesson remains unsaved in the coach capture form pending API credits and coach review.
- **17 October 2026:** Added a low-cost AI policy: keep note capture and phone dictation usable without AI, send only the current lesson note, avoid retries/background calls, and cap draft output at 1,600 tokens. No OpenAI request or credit purchase was made while applying this change.
- **17 October 2026:** Added source migration `004_ai_usage_limits.sql` and Edge Function quota checks: initial owner-adjustable limits are 100 drafts per project and 20 per coach per month. The migration and function update are prepared in source; apply the migration and redeploy the function before production AI use. Manual lesson entry remains the fallback.
- **17 October 2026:** Built the first parent/wrestler feedback loop in the shared workspace with deliberate family/coach sharing and role labels. Added migration `005_reflection_sharing.sql`; apply it before enabling the check-in form in production. No API calls or credit purchases were made.
- **17 October 2026:** Applied migrations `004_ai_usage_limits.sql` and `005_reflection_sharing.sql` in Supabase and redeployed `coach-session-draft` with project and per-coach monthly AI caps. The sharing migration was made rerunnable because its columns already existed. No AI generation call or credit purchase was made. Updated GitHub and Drive migration source.
- **17 October 2026:** Fixed the shared workspace role selector so its displayed choice matches the active role. Published commit `6a2ac92` to GitHub Pages and confirmed a fresh live session renders the parent dashboard with Parent selected. No AI request was sent; the existing coach note remains an unsaved draft. Coach selection and separate wrestler sign-in still need hands-on checks.
- **17 October 2026:** Refined role-specific workspace layout after pilot feedback: parent-only wrestler setup is hidden outside onboarding, coach access-code entry appears below the main coach tools for connecting another assigned wrestler, and coach/parent action panels have distinct headings and guidance. Added a versioned script URL and clear the startup status after loading so browsers fetch and display the current role behavior cleanly. No journal data was saved and no AI request was made.
- **17 October 2026:** Verified the refreshed live role switch using the existing parent/pilot-coach account. Coach selection shows the coach profile, quick lesson capture, and coach-shared perspectives; parent invite controls and check-in composer are hidden. Lesson and practice lists remain empty. No lesson was saved and no AI request was made.

## Privacy reminders

Use first names or nicknames. Do not store birthdays, surnames, schools, locations, schedules, or contact details. Never place a Supabase secret/service-role key in GitHub or browser code. The GitHub Pages site and source repository are public; only records in the authenticated Supabase project are intended to be private.

- **Terminology:** Shared workspace role labels now show Athlete to keep the product open to other sports while keeping wrestling training as Matwork’s starting focus. Internal database roles and table names remain unchanged for compatibility.
- **17 October 2026:** Updated the shared workspace copy to use Athlete for the participant-facing role, setup, check-ins, practice audience, and access code. Bumped the script version so the browser loads the current copy. No family data changed.

- **17 October 2026 UX review:** Found icon-only public-journal navigation on phones, an invalid media-query marker that kept the explainer’s athlete example in two columns on small screens, and inconsistent Athlete/Wrestler participant labels across public and shared pages. Updated mobile navigation to show named destinations, improved supporting text sizes, fixed the explainer breakpoint, and aligned participant-facing labels to Athlete. Recheck live desktop and phone layouts after deployment. No athlete data was entered.

- **17 October 2026:** Applied and verified Supabase migration `006_parent_ai_drafts.sql`. Published the parent-led planning interface and source, then deployed `coach-session-draft` with parent authorization, separate source attribution, and the existing monthly caps. No lesson text was sent to OpenAI; the AI drafting flow still needs a user initiated check after the API credit balance is addressed.

## UX review — 2026-10-17
- Audited the public journal, coach and family marketing explainer, and signed-in Parent and Coach workspace at 390px phone and 1440px desktop widths.
- Found the phone journal was still loading stale CSS: mobile navigation was a narrow side rail that squeezed and overlapped the page. Added cache-busting asset references in index.html, plus the matching mobile fix is in styles.css.
- Athlete wording is now consistent across user-facing pages. The marketing sample clearly says it is illustrative; the connected Athlete workspace is still in development.
- Parent and Coach workspace views both render at phone and desktop sizes. Role switching is visible and responsive; no Athlete login is available in this pilot account, so the Athlete role remains unverified.
- Changes published to dane789/matwork main; GitHub Pages rebuild pending.
- **Legacy journal:** the early browser-local prototype is retained at `journal.html` so local records are not lost, but it is removed from the primary Matwork path. Current records belong in the authenticated shared workspace.

- Follow-up phone check found the fixed brand mark overlapped the public journal’s top controls. Reserved header space and bumped the stylesheet version so phones receive the corrected layout.

- Aligned the unnamed local-profile avatar with its Athlete 1 label (A) and refreshed the app script reference.


## Athlete practice checklist refinement — 2026-10-17
- Added an Athlete-specific At-home practice checklist heading, clear practice check-in instructions, completion count, and progress bar. Each task retains its own check control; updates are sent to the coach and reflected in the Coach workspace.
- Parent view stays read-only for practice check-ins and continues to show source labels for coach assignments versus parent recommendations. Athlete view only shows athlete-facing items.
- Existing coach note organizer keeps coach-stated tasks separate from optional AI suggestions. Coach approval remains required before either appears in the shared plan.
- No Jared lesson or checklist records were added in this UI pass. The Athlete account view is implemented but still needs a separate Athlete sign-in for end-to-end verification.

- Kept practice feedback guidance visible by default, with role-specific wording on load. This avoids blank guidance if browser scripts load slowly.

## Parent lesson recap format — 2026-10-17
- Parent lesson records should show each lesson focus as a concise recap: **Objective**, **Key coaching points** as a scannable list, and a highlighted **Lesson takeaway**.
- Label provenance plainly: **Coach notes** for coach-entered content, and **AI organized · Coach approved** only after the coach reviews and approves the draft. Keep exact coach cue wording separately identifiable from AI explanations.
- Coach capture should remain low effort: paste/dictate once, review a short organized draft, approve. Parent view provides fuller context; Athlete view keeps next steps concise and actionable. Matwork should make progress and communication easier for all three roles.
- The Parent recap renderer and coach review fields are prepared in source. The Edge Function schema/prompt also needs redeployment for the new objective, coaching-points, and takeaway fields to appear in AI drafts. No lesson data was added and no AI request was sent.
- Coaches can keep dictating one rough note; the AI review screen organizes its supported information into recap fields. Notes that are already structured with these headings display directly in the same recap format without needing re-entry.
- Parent-captured notes are explicitly labeled as parent notes; only a coach-submitted, coach-approved draft can carry the “AI organized · Coach approved” provenance. Partner-specific observations must stay out of the athlete's individual progress record.
- Parent can initiate the action-plan workflow from two separate inputs: notes reported from the coach and the parent's observations. AI prepares a reviewable, multi-section recap and optional suggested steps; coach assignments stay coach-authored. Selected parent steps are marked as parent recommendations, and parent chooses whether the assigned coach may see the recap and checklist progress.
- Parent AI workflow, account-level quota authorization, optional coach sharing for parent checklist items, and atomic save RPC are prepared in migration `006_parent_ai_drafts.sql`. Apply this migration and redeploy `coach-session-draft` before using the new Parent action-plan form. Until then, do not submit parent notes to the current deployed function.


