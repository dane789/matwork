# Matwork — The Long Game

Matwork keeps a wrestler’s development moving between lessons by connecting the athlete, parent, and every assigned coach around one private progress record.

## Core loop

1. A coach records the lesson focus, coaching cues, and assigned practice.
2. The athlete sees clear next steps and checks off work between lessons.
3. The parent supports the plan, adds their perspective, and chooses what to share.
4. Assigned coaches review the athlete’s history and shared follow-through before the next session.

Lesson history stays attached to the athlete and identifies the coach who recorded each session. AI formatting is optional; manual notes and practice plans remain available when AI is unavailable.

## Pages

- `index.html` — concise public Matwork home and the main path into the shared workspace.
- `shared.html` — email sign-in, family setup, and role-specific athlete, parent, and coach workspace.
- `for-coaches.html` — short explanation of the core workflow for coaches and families.
- `journal.html` — retained device-only journal from the early prototype. Its browser-local data does not sync with Matwork’s shared workspace.

## Services

- GitHub Pages hosts the public pages from the `main` branch.
- Supabase Auth and PostgreSQL store private family, lesson, assignment, and check-in records with row-level security.
- The Supabase `coach-session-draft` Edge Function can optionally send the current notes to OpenAI for a reviewable draft. API keys stay in Supabase. The function has monthly limits and does not retry automatically.

## Privacy

Use first names or nicknames in the private workspace. Do not enter surnames, birthdays, schools, schedules, locations, or identifying details about other young athletes. Parent notes and athlete reflections follow explicit role and sharing rules. Never commit private lesson records or backups to this public source repository.

The old `journal.html` prototype saves data only in the current browser and does not have role-based access. Use the authenticated shared workspace for current records.

## Source and deployment

Repository: [dane789/matwork](https://github.com/dane789/matwork)  
Public home: [dane789.github.io/matwork](https://dane789.github.io/matwork/)  
Shared workspace: [dane789.github.io/matwork/shared.html](https://dane789.github.io/matwork/shared.html)

