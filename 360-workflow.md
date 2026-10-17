# Matwork 360° Workflow

This document defines the product behavior for a shared wrestler, parent, and coach experience. It contains no wrestler-specific lesson record.

## Current implementation status (October 17, 2026)

- The general Matwork site is live on GitHub Pages; the shared workspace is a separate authenticated page backed by Supabase Auth and PostgreSQL.
- The initial private schema, row-level policies, family setup, wrestler profiles, lesson notes, and practice checklist are in place. The owner created a family and wrestler profile on mobile and generated parent and coach access codes.
- Parent, wrestler, and coach access still needs end-to-end verification with separate accounts before real records are relied on.
- The built-in Supabase email sender is limited to two auth emails per hour. Custom SMTP is needed for reliable onboarding beyond early testing.
- The public coach capture and editable review interface is in GitHub Pages. Migration `002_coach_note_capture.sql` is applied; it stores source notes in a table available only to parents and assigned coaches and saves a reviewed lesson bundle atomically. Lesson items and approved checklist tasks preserve AI provenance.
- The authenticated `coach-session-draft` Edge Function is deployed. The owner approved sending coach notes to OpenAI for formatting, and the `OPENAI_API_KEY` Function secret has been added in Supabase. Its value is not stored in source or Drive. End-to-end generation is not yet verified because the desktop session is signed out and the feature requires an assigned coach session.

## Work that can continue before sign-in testing

The sign-in email limit blocks role-based verification and writing to the private family workspace; it does not block product planning or safe source work. Continue with changes that contain no wrestler-specific records:

1. Review and refine the coach-to-wrestler-to-parent handoff and privacy copy.
2. Prepare the first lesson as a private, reviewable draft, preserving exact coach cues separately from interpretation and suggested practice. Keep surnames, birthdays, and other identifying details out of public source and shared lesson notes.
3. After sign-in is available, enter the lesson into the authenticated workspace and verify the parent, wrestler, and coach views using separate accounts where possible.
4. Build and verify the next progress tools (training log and milestones) only after the existing role boundaries are confirmed, so new record types inherit the same access protections.
5. Configure custom SMTP before inviting more families or relying on frequent email sign-ins.

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

This step remains gated until the administrator configures the `OPENAI_API_KEY` server-side secret. Only the authenticated Edge Function may send the coach note; the browser must never hold the AI key.

After submission, AI formats the note into a structured draft with these sections:

- **Coach’s lesson record:** focus, techniques covered, and coaching cues present in the source note. Preserve quoted wording when possible.
- **Wrestler focus:** one to three short, age-appropriate takeaways in direct language.
- **At-home checklist:** only tasks supported by the source note or explicitly entered by the coach. Include repetitions, time, or intensity only when the coach supplied them.
- **Parent support:** practical ways to encourage the wrestler and help reinforce the stated focus, without asking the parent to act as a coach.
- **Next lesson ideas:** optional suggestions, clearly labeled as unconfirmed.
- **Needs coach confirmation:** missing or unclear details, rather than guessed facts.

Keep the original coach note with the approved lesson record so the formatted version remains traceable. AI output is a draft: the coach can edit each section, remove suggestions, and approve the final record before it is shared. Do not save or notify families from an unreviewed draft.

### Provenance and safety rules

- Separate exact coach cues and reported observations from AI explanations and suggestions.
- Never invent a technique, coaching phrase, strength, weakness, result, assignment, or progress claim. If the note does not say, mark it as not provided.
- Label each checklist item as coach-assigned or as an AI suggestion approved by the coach. Store the AI origin and coach approval separately so AI-generated wording is not misrepresented as a direct coach statement.
- Parents can see the approved lesson and parent-support section. Wrestlers see their focus and wrestler-facing practice items, never parent-only dashboard content. Coaches see assigned wrestlers and their own lesson records.
- Send notes to an AI provider only through an authenticated Supabase Edge Function. Keep the AI API key in Supabase secrets, never in the GitHub Pages code. Preserve the caller's role and family authorization when reading or writing records.
- Before enabling AI, tell coaches and parents that lesson text is sent to the selected AI provider for formatting. Use first names or the internal wrestler profile, minimize personal details, and review the provider's current retention terms.

OpenAI's API does not use API inputs and outputs for model training by default, but abuse-monitoring logs may retain content for up to 30 days unless an eligible retention control applies. This must be included in the product's data notice if OpenAI is selected.

### Value for coaches

Matwork turns a short note into a clear handoff for the whole support team: the wrestler knows what to practice, the parent knows how to help, and the coach can review checklist follow-through before the next lesson. The coach remains in control of what is attributed to them and what is shared.

The coach-facing business value is a polished, organized service with less after-session administration. A coach can spend more time teaching and training, while families see the lesson's value and know how to continue the work. A useful feedback loop may make planning the next private session easier and more timely. Future paid coach plans could center on individual athlete workspaces, lesson records, and follow-through tools; pricing and packaging should follow pilot feedback rather than be assumed in advance.

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
- Planned AI provenance: source note, generated draft, provider/model metadata, coach edits, approver, and approval time. Keep this separate from direct coach cues.

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

