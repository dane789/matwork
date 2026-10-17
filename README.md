# Matwork — The Long Game

A lightweight, static wrestling journey journal designed for GitHub Pages.

## What it tracks

- Training sessions across wrestling, private lessons, strength, conditioning, recovery, and competition
- Lesson records that distinguish coach cues from priorities and parent interpretation
- An at-home checklist that labels coach assignments separately from parent recommendations
- Milestones that recognize skill, consistency, mindset, and personal bests
- Short reflections and wrestler mindset notes
- Season totals and a simple recent-activity view

## Privacy

The website source is public when published with GitHub Pages. Journal entries are stored in the browser's local storage and are not sent to the site or a server. Keep entries free of family names, school names, locations, schedules, and other identifying details. First names are okay. The app has JSON backup and restore controls; keep backup files private.

This is currently a browser-local journal rather than a multi-device synced account. Each browser/device has its own data unless you move a backup yourself. Lesson and checklist records are stored the same way; the current screen is a local draft and does not enforce role-specific access or share completion with a remote coach.

## Publish

The included `.github/workflows/pages.yml` deploys the repository root to GitHub Pages when changes are pushed to `main`. In the repository's **Settings → Pages**, set the publishing source to **GitHub Actions**. GitHub's current official guidance uses the Pages artifact and deployment actions in this workflow.

## Files

- `index.html` — page structure and privacy explanation
- `styles.css` — responsive visual design
- `app.js` — local journal behavior and backup handling
- `.github/workflows/pages.yml` — GitHub Pages deployment


## Wrestler profiles

Matwork supports multiple separate wrestler profiles in the same browser. A profile may use an optional first name or a generic label. Each profile has its own training sessions, milestones, and reflections. The profile name is stored locally with the journal and is not sent to the public site. Backups include every profile, so keep downloaded backups private.

When opened with the earlier single-journal version, Matwork brings that journal into the first local profile automatically. Existing `matwork-backup-v1` files can still be restored; new downloads use the multi-profile format.

## Shared wrestler, parent, and coach experience

The current public GitHub Pages shell stores profiles in one browser and does not provide account sign-in or remote sharing. A separate shared workspace is being prepared with Supabase Auth and PostgreSQL row-level security (RLS). The initial schema is in [supabase/migrations/001_private_journal.sql](supabase/migrations/001_private_journal.sql); setup notes are in [supabase/README.md](supabase/README.md). The migration has not been applied to a live project, and the shared sign-in/dashboard is not enabled yet.

Keep all records out of the public source. The public shell can be general and encouraging; private family, wrestler, coach, and lesson data belongs only in the authenticated service. See [360-workflow.md](360-workflow.md) for role behavior and privacy requirements.

