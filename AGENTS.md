# AGENTS.md

## Project Overview

- **Purpose**: Next.js web app that tracks OpenAI/Codex accounts, monitors live quota usage, and manages account health
- **Stack**: Next.js (App Router), TypeScript, Tailwind CSS, Vitest, ESLint, deployed on Vercel
- **GitHub repo**: `AZLabsAI/OpenAI-Account-Tracker`
- **Key files**:
  - `src/app/page.tsx` — main page: filter tabs, logo spin animation, account grid, drag-to-reorder
  - `src/components/AccountCard.tsx` — account card with flip, pin/star icons, delete dialog
  - `src/components/UsageBar.tsx` — quota bar component showing live quota fetched from Codex app-server
  - `src/components/CommandPalette.tsx` — Cmd+K palette for quick account access
  - `src/components/Toast.tsx` — lightweight toast notification system
  - `src/hooks/useAccountRefreshController.ts` — refresh all / per-account refresh logic
  - `src/lib/format-time.ts` — shared relative-time formatting utility
  - `src/lib/account-accent.ts` — shared accent color priority helper
  - `src/data/accounts.ts` — account sorting (`getSortedAccounts`) and data helpers
  - `src/types/` — shared TypeScript types (`Account`, `QuotaData`, etc.)

## Workflow & Conventions

- **Package manager**: always `pnpm` (never `npm`)
- **Lint**: `pnpm lint` (ESLint, exit 0 = pass)
- **Type check**: `pnpm exec tsc --noEmit`
- **Tests**: `pnpm test` (Vitest — 10 test files, 44 tests)
- **Git workflow**: this is a deployed Vercel app — never push directly to `main`; always use feature branch → PR → squash merge + delete branch
- **Branch naming**: `feat/`, `fix/`, `chore/`, `cursor/` prefixes (e.g. `feat/refresh-all-sort-order`)
- **PR creation**: `gh pr create` then `gh pr merge --squash --delete-branch`

## Learned User Preferences

- Refresh All must iterate accounts in the same top-to-bottom order displayed in the UI (not raw DB order)
- After implementing a plan, do NOT edit the plan file itself
- Filter tabs should be positioned logically next to related tabs (e.g. "Not In Use" goes immediately after "In Use")
- Remove redundant UI info — if data is already shown elsewhere, strip the duplicate display
- Always squash merge PRs and delete the branch after merge
- Logo spin: high peak speed and very slow momentum-like decay are preferred over snappy stop
- Icons must use consistent viewBox + same `d` path for filled/outline states (Lucide pattern preferred)
- When polish/feature suggestions are offered, user wants ALL implemented, not a subset
- User values a11y polish: keyboard focus visibility, ARIA roles, `prefers-reduced-motion` support

## Learned Workspace Facts

- Account display sort order (`getSortedAccounts`): health rank (waiting-refresh → weekly-warning → healthy) → pinned by `pinOrder` → starred → alphabetical by name
- `QuotaData.planType` comes from Codex app-server's `rateLimits.planType` (values: `"plus"`, `"pro"`, `"free"`)
- Filter union type `Filter` and `FILTERS` array are both defined in `src/app/page.tsx`; includes `"not-in-use"` filter
- Logo spin state: `spinLevel` (0–10), decay via `setTimeout` at 7000 ms/level; speed = `spinLevel === 0 ? 8 : Math.max(1.5 - spinLevel * 0.18, 0.08)` seconds per rotation
- `getSortedAccounts` is exported from `src/data/accounts.ts` and is the canonical sort for all account lists
- Pin icon uses Lucide-style pushpin SVG; star icon uses unified 24x24 star polygon (`d` path shared for both fill/stroke states)
- Drag-to-reorder for pinned cards persists `pinOrder` via the existing account update API
- Export/import JSON routes at `/api/accounts/export` (GET) and `/api/accounts/import` (POST)
- Quota snapshots stored for sparkline history via `insertQuotaSnapshot` in `src/lib/db.ts`
- `useDocumentTitle` updates tab title with alert indicator when accounts hit critical quota
- `CommandPalette` (Cmd+K) and `KeyboardShortcuts` (`?` overlay, `/` focus search, `R` refresh all) provide keyboard-driven navigation
- Lint and typecheck both pass cleanly on the current codebase
