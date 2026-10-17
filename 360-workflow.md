# Matwork 360° Workflow

This document defines the product behavior for a shared wrestler, parent, and coach experience. It contains no wrestler-specific lesson record.

## Role access

| Role | Can view | Can add or update |
| --- | --- | --- |
| Wrestler | Their own coach-assigned focus, at-home checklist, training log, milestones, and wrestler reflections | Checklist completion, brief practice notes, training entries, and wrestler reflections |
| Parent | All wrestler-visible information plus the full lesson record, parent summary, recommendations, and progress history | Parent observations, parent recommendations, training entries, milestones, and reflections |
| Coach | Lesson records and assignments for wrestlers explicitly assigned to that coach, plus checklist progress and wrestler practice notes | Actual coaching cues, observations, lesson follow-ups, and separate parent/wrestler assignments |

Wrestlers must not receive parent-only notes, parent recommendations, or parent dashboard data in the page payload. Hiding a panel in the browser is not access control. Authorization must be checked by the server for every read and write.

## Lesson record structure

Keep these categories distinct so later lessons can build on recorded facts without turning interpretations into coach statements:

- Lesson metadata: date, lesson number, primary focus, and instructor display name.
- Coach record: exact coaching cues, techniques introduced, and observations actually stated by the coach.
- Parent interpretation: plain-language explanation of cues, clearly labeled as interpretation.
- Development priorities: observed areas to reinforce, with provenance and date.
- Practice recommendations: suggested activities, dose, quality reminders, and whether a coach assigned or a parent suggested them.
- Lesson follow-up: proposed topics for the next lesson, clearly marked as suggestions until confirmed by the coach.

## Assignment and checklist behavior

Every assignment stores a description, steps, intended audience (`wrestler` or `parent`), creator role, source (`coach` or `parent`), status, and timestamps. A coach can create separate tasks for the wrestler and parent. The wrestler can mark only wrestler tasks complete and add a short note. The parent and assigned coach can see completion history. Changing a completed task must retain its prior state in the audit history.

Do not label parent-generated suggestions as coach-prescribed training. Preserve the wording and attribution supplied by the author.

## Data model

- `families`: account ownership and family settings.
- `users`: authenticated identities and display names.
- `memberships`: user, family, role, and status.
- `wrestlers`: a child profile owned by a family.
- `coach_assignments`: explicit coach-to-wrestler access grant and revocation history.
- `lessons`: date, sequence, focus, and source attribution.
- `lesson_items`: typed content (`coach_cue`, `coach_observation`, `parent_interpretation`, `priority`, `recommendation`, or `follow_up`) with author and provenance.
- `practice_assignments`: audience, source, steps, status, and due date when supplied.
- `checklist_events`: append-only completion and note events.
- `journal_entries`: training sessions, milestones, and wrestler reflections.
- `audit_events`: actor, action, record, and timestamp for sensitive record changes.

## Privacy and platform constraints

- The public site source and JavaScript bundle must contain no personal lesson data.
- Hosting direction: keep the general Matwork site public on GitHub Pages and add a separate authenticated shared workspace for family and coach records.
- Full names, birth dates, schools, locations, and schedules do not belong in public source or public URLs.
- Shared records belong in authenticated server storage with per-family and per-coach authorization. Browser-local storage is suitable only for local preferences and temporary drafts.
- The current static GitHub Pages shell has no authenticated identity or shared database. It cannot enforce role separation or provide remote coach visibility. Keep role-based records disabled until a private service and authentication model are in place.
- Backups containing journal data are private exports and must not be committed to the source repository.
- Until the shared workspace is ready, the current lesson page is a local parent-side draft. Every person using that browser can see its records; do not treat it as the wrestler view or enter parent-only material there.

## Acceptance criteria

1. A wrestler session cannot retrieve parent-only records through the UI, browser storage, or network responses.
2. A parent can review all records for their wrestler and can distinguish coach instruction from parent interpretation and recommendation.
3. A coach can access only wrestlers with an active assignment.
4. A coach can create separate wrestler and parent assignments and see wrestler checklist completion.
5. Revoking coach access immediately blocks later reads and writes.
6. The lesson history preserves attribution and sequence without inventing results or feedback.
7. Public source inspection finds no private lesson records or identifying information.

