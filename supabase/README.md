# Matwork shared workspace setup

This folder contains the first database schema for the private parent, wrestler, and coach workspace. It does not contain athlete data, API keys, or credentials.

## Current state

- `migrations/001_private_journal.sql` defines the private tables, access helper functions, role-aware policies, and parent setup/grant functions.
- The migration is a starting point and has not been applied to a live Supabase project or validated against real accounts.
- The browser app is not connected to Supabase yet. Until that happens, the current local journal is only for the browser owner and must not be treated as role-protected or coach-shared.

## What I need to connect it

Create a new Supabase project for Matwork and share only:

1. The project URL, in the form `https://<project-ref>.supabase.co`.
2. The project's **publishable** key (or legacy `anon` key if the dashboard only offers that).

These values are intended for a browser client, but should still be supplied privately during setup. Never provide a `service_role` or `secret` key; those bypass row-level security and must never be included in a website.

Use email one-time-code sign-in by default. Parents should own the family workspace. A coach will see a wrestler only after a parent grants that coach access. A wrestler account will be attached to only that wrestler's record. No email addresses need to appear in public files.

## Before enabling live records

1. Review and apply the SQL in a new, empty project.
2. Configure Supabase Auth for the intended sign-in flow and allowed site URLs.
3. Verify parent, wrestler, and coach behavior using separate test accounts and confirm parent-only lesson details never reach wrestler queries.
4. Connect the app with the project URL and publishable key, then replace local-only records with the authenticated workflow only after the access checks pass.

Do not apply this draft to a project that already contains tables with these names. No wrestler-specific records should be seeded by this migration.

