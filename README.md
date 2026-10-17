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

The public source repository is [dane789/matwork](https://github.com/dane789/matwork), and the live shell is [dane789.github.io/matwork](https://dane789.github.io/matwork/). GitHub Pages is configured to deploy the repository root with the included `.github/workflows/pages.yml` whenever changes are pushed to `main`.

## Files

- `index.html` — page structure and privacy explanation
- `styles.css` — responsive visual design
- `app.js` — local journal behavior and backup handling
- `.github/workflows/pages.yml` — GitHub Pages deployment


## Wrestler profiles

Matwork supports multiple separate wrestler profiles in the same browser. A profile may use an optional first name or a generic label. Each profile has its own training sessions, milestones, and reflections. The profile name is stored locally with the journal and is not sent to the public site. Backups include every profile, so keep downloaded backups private.

When opened with the earlier single-journal version, Matwork brings that journal into the first local profile automatically. Existing `matwork-backup-v1` files can still be restored; new downloads use the multi-profile format.

## Shared wrestler, parent, and coach experience

Open [the shared workspace](https://dane789.github.io/matwork/shared.html) for the initial email-link sign-in and role-aware dashboard. Parents create the family workspace and share one-time, seven-day access codes with the wrestler and coach. Wrestlers see their own lesson cues and at-home tasks, and can check off their practice. Parents see the whole record; coaches see the wrestler(s) whose access was granted and coach-assigned follow-through.

The shared page is not active until a Supabase project is created, the migration is applied, and `supabase-config.js` receives that project's URL and publishable key. Follow [supabase/README.md](supabase/README.md) before putting real records in it. Role views are enforced by database row-level security, not just by hiding parts of the page. Keep personal records out of the public GitHub source. Use first names or nicknames only; never put a service-role/secret key in this repository. See [360-workflow.md](360-workflow.md) for the stakeholder workflow and privacy requirements.

