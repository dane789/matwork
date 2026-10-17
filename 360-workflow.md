# Matwork 360° Workflow

This document defines the product behavior for Matwork’s athlete, parent, and coach experience. It contains no athlete-specific lesson record.

## Product boundary

Matwork’s core service is one coach-attributed development history attached to the athlete: lesson instruction becomes a short practice plan; the athlete reports completed work; the parent supports the plan and may share their perspective; assigned coaches use that feedback to prepare the next lesson. Every primary screen and feature should make that loop clearer or easier. Generic quotes, activity metrics, and standalone journals stay out of the main workflow unless they directly improve follow-through or communication.

Coach attribution is part of the history, not a separate feature: when multiple coaches are assigned to one athlete, each lesson should identify its author and remain available to the other assigned coaches under the existing access rules.

## Current implementation status (October 17, 2026)

- The general Matwork site is live on GitHub Pages; the shared workspace is a separate authenticated page backed by Supabase Auth and PostgreSQL.
- The initial private schema, row-level policies, family setup, wrestler profiles, lesson notes, and practice checklist are in place. The owner created a family and wrestler profile on mobile and generated parent and coach access codes.
- Parent, wrestler, and coach access still needs end-to-end verification with separate accounts before real records are relied on.
- The built-in Supabase email sender is limited to two auth emails per hour. Custom SMTP is needed for reliable onboarding beyond early testing.
- The public coach capture and editable review interface is in GitHub Pages. Migration `002_coach_note_capture.sql` is applied; it stores source notes in a table available only to parents and assigned coaches and saves a reviewed lesson bundle atomically. Lesson items and approved checklist tasks preserve AI provenance.
- Parent and athlete check-ins are available in the shared workspace. Parents choose family-only, coach-only, or athlete-and-coach visibility; athletes choose private-to-self/family or share with coach. Coaches see only explicitly shared entries, labeled by the author's perspective. Migration `005_reflection_sharing.sql` is applied.
- The authenticated `coach-session-draft` Edge Function is deployed with CORS preflight support for GitHub Pages and the local preview. The owner approved sending coach notes to OpenAI for formatting, and the `OPENAI_API_KEY` Function secret is configured in Supabase. During the signed-in Jared pilot, the function reached OpenAI but received `429 credit_balance_exhausted`; the captured note was not saved. Add API credits before retrying.
- AI is optional: coach or parent can write notes or use free device keyboard dictation without an API call. The function sends only the current note, has no automatic retry, caps output at 1,600 tokens, and enforces a monthly project allowance (100 drafts) plus a per-user allowance (20 drafts). Manual lesson capture and a usable practice plan remain available if AI credits are unavailable.
- Parent-led planning is live: Coach notes and Parent observations stay separated; the parent reviews the AI draft and chooses any parent recommendations. The parent chooses per plan whether to share the recap and checklist progress with the assigned coach. Migration `006_parent_ai_drafts.sql` and the matching parent-capable Edge Function are deployed. AI generation itself remains untested since the prior API credit error; no new request was sent.

## Remaining pilot work

The owner currently has parent and pilot-coach views in one signed-in account. AI drafting previously reached OpenAI but was blocked by exhausted API credits; no automatic retry is made. Migrations `004_ai_usage_limits.sql`, `005_reflection_sharing.sql`, and `006_parent_ai_drafts.sql` are applied, and the current Edge Function is deployed. Manual lesson entry remains available while API credits are addressed; no new AI request has been made.

1. Restore OpenAI API credits only if the family chooses to do so; no API retry should happen automatically. If credits are added later, keep parent-entered pilot notes labeled as parent notes until the actual coach confirms them.
2. Preserve exact coach cues separately from parent interpretation and suggested practice. Keep surnames, birthdays, and other identifying details out of public source and shared lesson notes.
3. Verify parent, wrestler, and coach views with separate accounts where possible.
4. Build and verify training logs and milestones after the role boundaries are confirmed.
5. Configure custom SMTP before inviting more families or relying on frequent email sign-ins.
6. Verify parent and wrestler check-ins appear to coaches only when intentionally shared, and confirm parent-generated checklist progress stays hidden from the coach when sharing is off.

## Role access

| Role | Can view | Can add or update |
| --- | --- | --- |
| Wrestler | Their own coach-assigned focus, at-home checklist, training log, milestones, and wrestler reflections | Checklist completion, brief practice notes, training entries, and wrestler reflections |
| Parent | All wrestler-visible information plus the full lesson record, parent summary, recommendations, and progress history | Parent observations, parent recommendations, training entries, milestones, and reflections |
| Coach | Lesson records and assignments for wrestlers explicitly assigned to that coach, plus checklist progress and wrestler practice notes | Actual coaching cues, observations, lesson follow-ups, and separate parent/wrestler assignments |

Wrestlers must not receive parent-only notes, parent recommendations, or parent dashboard data in the page payload. Hiding a panel in the browser is not access control. Authorization must be checked by the server for every read and write.

## Wrestler-first experience and coach feedback loop

The wrestler view is the athlete's home base: make the next action obvious, keep language direct and encouraging, celebrate completed work, and let the wrestler see how today's effort connects to the next lesson. A wrestler should only see their own assignments, coach-facing cues, personal training entries, and milestones. Parent-only recommendations and dashboard notes stay out of the view and its network responses.

Coaches need a focused follow-through view for their assigned wrestlers. It should show whether coach-assigned checklist items were completed, when activity was logged, and any short wrestler note shared with the coach. Parents should be able to add observations, expectations, or concerns from their own perspective and deliberately share selected items with the coach. Keep private family notes separate from parent-to-coach feedback. Attribute each entry to its author and viewpoint; a parent's interpretation must never appear as a coach's technical assessment. The coach can use the wrestler and parent perspectives, plus activity since the last session, to prepare the next lesson and reply with clear follow-up. Do not create attendance surveillance or expose a wrestler's activity to unrelated coaches.

Explore a positive, transparent **Momentum** signal (working name) based on actions the wrestler chooses to log: coach-assigned work completed, wrestling practices/private lessons attended, drilling, and strength sessions. Show the underlying activity counts and period so the number is understandable. Do not infer effort from missing data, count rest or recovery days against the athlete, rank wrestlers, or describe the signal as a measure of motivation, talent, or character. The wrestler should be able to see and understand the same signal the parent and assigned coach see.

Current implementation includes a role-specific wrestler view and coach visibility into assignment completion events. A dedicated training log, milestone feed, attendance check-ins, and Momentum summary still need to be designed and implemented; the source migration `003_coach_profiles.sql` separately enables account-linked coach names for attribution.

### Feedback loop

1. Coach records a lesson and coach-authored next steps.
2. Wrestler sees a focused action plan, records practice/checklist completion, and can share a short reflection with the coach.
3. Parent can record their own perspective and expectations privately, then explicitly select what to share with the coach.
4. Coach sees only feedback shared with them, attributed to the wrestler or parent, alongside completed work. They use it to shape the next lesson and return an updated plan.
5. Parent has the full family history; wrestler sees their own training story; coaches only see assigned wrestlers and intentionally shared inputs.

## Lesson record structure

Keep these categories distinct so later lessons can build on recorded facts without turning interpretations into coach statements:

- Lesson metadata: date, lesson number, primary focus, and instructor display name.
- Coach record: exact coaching cues, techniques introduced, and observations actually stated by the coach.
- Parent interpretation: plain-language explanation of cues, clearly labeled as interpretation.
- Development priorities: observed areas to reinforce, with provenance and date.
- Practice recommendations: suggested activities, dose, quality reminders, and whether a coach assigned or a parent suggested them.
- Lesson follow-up: proposed topics for the next lesson, clearly marked as suggestions until confirmed by the coach.

## Coach quick note and AI-assisted lesson draft

The coach should be able to capture a useful session record in about two minutes, without filling out a long form. The first version should work well on a phone and allow the coach to paste notes or dictate through the device keyboard. Do not record or upload audio in the first version.

### Quick capture

Use the selected wrestler and signed-in coach as the record context, then offer one required free-text box with a lightweight prompt:

> What did you work on? Include cues you repeated, what you want the wrestler to focus on, and anything you want the parent to reinforce. Rough notes are fine.

Optional fields can capture a date, one coach-assigned task, or next-lesson follow-up. Do not require the coach to repeat information already in the notes. Remind coaches to use first names or the wrestler profile, and avoid surnames, birthdays, schools, locations, and details identifying other minors.

### AI draft for review

The parent can initiate an AI draft using Coach notes they captured and/or their own observations. Keep those inputs separately labeled. The parent reviews the recap and possible athlete steps before saving or sharing. Parent-generated steps remain **Parent recommendations**; they never become coach assignments automatically. The coach can contribute their own record or follow up with coach-authored assignments. Only the authenticated Edge Function may send notes; the browser must never hold the AI key.

After submission, AI formats the note into a structured draft with these sections:

- **Parent lesson recap:** a technical section title/focus, one objective, concise key coaching points, and one lesson takeaway. Show this in a readable hierarchy, with the takeaway easy to spot. Coach-authored material is labeled **Coach notes**; a coach-submitted AI draft is labeled **AI organized · Coach approved** only after coach approval. Parent-provided notes stay labeled **Parent notes** (and **AI organized** if applicable); never imply the coach authored or approved a parent's recap. Keep exact cue wording in a separate expandable area so an AI explanation is not presented as a direct quote.
- **Coach’s lesson record:** techniques covered and coaching cues present in the source note. Preserve quoted wording when possible.
- **Wrestler focus:** one to three short, age-appropriate takeaways in direct language.
- **At-home checklist:** only tasks supported by the source note or explicitly entered by the coach. Include repetitions, time, or intensity only when the coach supplied them.
- **Parent support:** practical ways to encourage the wrestler and help reinforce the stated focus, without asking the parent to act as a coach.
- **Next lesson ideas:** optional suggestions, clearly labeled as unconfirmed.
- **Needs coach confirmation:** missing or unclear details, rather than guessed facts.

### Keep AI costs low

- Make AI optional. A coach can fill the same short fields, use the phone keyboard's built-in dictation, and save without calling an AI service.
- Send only the current lesson note. Do not send the wrestler's full journal or earlier lessons for each draft.
- Make one request per submitted note, with no automatic retry, background summary, or second “polish” pass. Preserve the note if the request fails so the coach can continue manually.
- Keep the generated draft concise and cap the output. The current source caps it at 1,600 tokens; the deployed function needs redeployment for this limit to apply.
- Keep the coach review short: focus, recap, and assignments should be easy to scan and approve; avoid making the coach repeat facts already present in the dictated note. The parent gets the fuller context, while the athlete gets simple, motivating next steps.
- Consider the lower-priced `gpt-5.4-nano` for extraction only after a coach reviews its accuracy against an approved sample. Keep human approval regardless of model.
- Set a small manual API credit budget and turn off automatic recharge. Show the coach when AI is unavailable and leave manual note entry available.

Keep the original coach note with the approved lesson record so the formatted version remains traceable. AI output is a draft: the coach can edit each section, remove suggestions, and approve the final record before it is shared. Do not save or notify families from an unreviewed draft.

### Provenance and safety rules

- Separate exact coach cues and reported observations from AI explanations and suggestions.
- Keep parent-reported summaries distinct from coach-submitted instruction. If source notes include separate partner or other-athlete observations, exclude them from this wrestler's individual plan.
- Never invent a technique, coaching phrase, strength, weakness, result, assignment, or progress claim. If the note does not say, mark it as not provided.
- Label each checklist item as coach-assigned or as an AI suggestion approved by the coach. Store the AI origin and coach approval separately so AI-generated wording is not misrepresented as a direct coach statement.
- Parent-initiated AI steps, once selected by the parent, are stored as parent recommendations. The parent chooses whether the assigned coach can see those items and their Athlete check-ins. Coach assignments remain coach-authored.
- Parents can see the approved lesson and parent-support section. Wrestlers see their focus and wrestler-facing practice items, never parent-only dashboard content. Coaches see assigned wrestlers and their own lesson records.
- Send notes to an AI provider only through an authenticated Supabase Edge Function. Keep the AI API key in Supabase secrets, never in the GitHub Pages code. Preserve the caller's role and family authorization when reading or writing records.
- Before enabling AI, tell coaches and parents that lesson text is sent to the selected AI provider for formatting. Use first names or the internal wrestler profile, minimize personal details, and review the provider's current retention terms.

OpenAI's API does not use API inputs and outputs for model training by default, but abuse-monitoring logs may retain content for up to 30 days unless an eligible retention control applies. This must be included in the product's data notice if OpenAI is selected.

### Value for coaches

Matwork turns a short note into a clear handoff for the whole support team: the wrestler knows what to practice, the parent knows how to help, and the coach can review checklist follow-through before the next lesson. The coach remains in control of what is attributed to them and what is shared.

The coach-facing value is a polished, organized service with less after-session administration. Coaches can spend more time teaching, while families know how to reinforce the lesson and assigned coaches can see the relevant follow-through.

## Monetization hypotheses — private planning only

Keep athlete and parent access to the shared core included. The likely buyer is the coach or coaching organization that gains a more professional lesson experience, an attributed athlete history across coaches, less follow-up administration, and better preparation for the next private. Do not sell young athletes’ data, add ads to the youth experience, or make AI use a prerequisite for a useful plan.

Potential models to validate:

- **Independent coach plan:** a simple monthly or annual subscription based on active athlete workspaces or a small roster band. Core notes, checklists, coach attribution, and sharing should be included; do not meter by words or individual lesson entries because that would discourage useful record keeping.
- **Multi-coach club plan:** a higher organization plan if assigned coaches need shared athlete histories, coach attribution, and light roster administration across a club or academy. This only becomes valuable after multi-coach access and attribution are proven reliable.
- **Optional AI allowance:** include a bounded number of reviewed drafts in a coach plan. Keep manual capture fully usable and enforce a hard server-side limit. Consider a paid increase only after actual usage and unit costs are measured; never surprise a coach with per-note charges.
- **Coach-delivered development package:** coaches may include Matwork follow-up in their own private-lesson package. Matwork should not take a booking commission unless it later owns booking and payment services.

Public competitor pricing is a reference point, not a Matwork price recommendation. CoachNow separates athlete/parent access from paid coach and academy tiers; its current page lists Analyze at $9.99 monthly or $59 yearly, PRO at $49.99 monthly or $499 yearly, and Academy at $89.99 monthly or $899 yearly, with multi-coach pricing available. Its help center says invited athletes and parents generally do not need a paid membership ([CoachNow pricing](https://coachnow.com/pricing), [CoachNow help](https://help.coachnow.io/en/articles/2477947-how-can-i-update-manage-my-subscription-and-billing-for-coachnow)). TeamSnap offers a free single-team entry tier and custom club/league pricing ([TeamSnap pricing](https://www.teamsnap.com/pricing)). Plans and promotions change; these pages were reviewed on October 17, 2026.

For the youth context, prioritize data minimization, clear parent involvement, and review/deletion practices; the FTC’s COPPA guidance specifically calls out information collected, parental notice and consent, parent review/deletion, and security/retention ([FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)). Confirm legal applicability with counsel before offering the service broadly.

Before setting price, interview private coaches and families. Track how many lesson records are completed, whether athletes use assigned steps, whether coaches review shared feedback before the next session, and how much admin time the workflow removes. Treat repeat private sessions as a possible outcome to validate, not a guaranteed result.

## Assignment and checklist behavior

Every assignment stores a description, steps, intended audience (`wrestler` or `parent`), creator role, source (`coach` or `parent`), status, and timestamps. A coach can create separate tasks for the wrestler and parent. The wrestler can mark only wrestler tasks complete and add a short note. The parent and assigned coach can see completion history. Changing a completed task must retain its prior state in the audit history.

Do not label parent-generated suggestions as coach-prescribed training. Preserve the wording and attribution supplied by the author.

## Data model

The migration implements the family, role, lesson, checklist, training, milestone, and reflection tables below. AI draft provenance and coach approval fields are future schema work.

- `families`: account ownership and family settings.
- `family_memberships`: authenticated user, family, role, and wrestler when applicable.
- `wrestlers`: a child profile owned by a family.
- `coach_assignments`: explicit coach-to-wrestler access grant and revocation history.
- `lessons`: date, sequence, focus, and source attribution.
- `lesson_items`: typed content (`coach_cue`, `coach_observation`, `parent_interpretation`, `priority`, `recommendation`, or `follow_up`) with author and provenance.
- `practice_assignments`: audience, source, steps, status, and due date when supplied.
- `checklist_events`: append-only completion and note events.
- `journal_entries`: training sessions, milestones, and wrestler reflections.
- AI provenance: coach-submitted and parent-submitted plans are separately attributed. Parent source notes are not retained by the atomic save RPC; parent recaps, reported cue wording, observations, and selected recommendations retain parent authorship. Coach source notes and coach approval metadata remain in the coach workflow.

## Privacy and platform constraints

- The public site source and JavaScript bundle must contain no personal lesson data.
- Hosting direction: keep the general Matwork site public on GitHub Pages and add a separate authenticated shared workspace for family and coach records.
- Full names, birth dates, schools, locations, and schedules do not belong in public source or public URLs.
- Shared records belong in authenticated server storage with per-family and per-coach authorization. Browser-local storage is suitable only for local preferences and temporary drafts.
- The public pages remain static, while the shared workspace uses Supabase Auth and row-level security. The policies are installed but the role boundaries still need to be validated with separate parent, wrestler, and coach accounts.
- Backups containing journal data are private exports and must not be committed to the source repository.
- The original `index.html` journal is a browser-local parent-side draft; it is not a shared role-based view. Do not enter parent-only notes or treat it as the wrestler's synced checklist.

## Acceptance criteria

1. A wrestler session cannot retrieve parent-only records through the UI, browser storage, or network responses.
2. A parent can review all records for their wrestler and can distinguish coach instruction from parent interpretation and recommendation.
3. A coach can access only wrestlers with an active assignment.
4. A coach can create separate wrestler and parent assignments and see wrestler checklist completion.
5. Revoking coach access immediately blocks later reads and writes.
6. The lesson history preserves attribution and sequence without inventing results or feedback.
7. Public source inspection finds no private lesson records or identifying information.

