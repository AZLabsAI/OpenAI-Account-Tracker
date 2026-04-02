# AGENTS.md

## Project Overview

- **Purpose**: Next.js web app that tracks OpenAI/Codex accounts, monitors live quota usage, and manages account health
- **Stack**: Next.js (App Router), TypeScript, Tailwind CSS, Vitest, ESLint, deployed on Vercel
- **GitHub repo**: `AZLabsAI/OpenAI-Account-Tracker`
- **Key files**:
  - `src/app/page.tsx` — main page: filter tabs, logo spin animation, account grid
  - `src/components/UsageBar.tsx` — quota bar component showing live quota fetched from Codex app-server
  - `src/hooks/useAccountRefreshController.ts` — refresh all / per-account refresh logic
  - `src/data/accounts.ts` — account sorting (`getSortedAccounts`) and data helpers
  - `src/types/` — shared TypeScript types (`Account`, `QuotaData`, etc.)

## Workflow & Conventions

- **Package manager**: always `pnpm` (never `npm`)
- **Lint**: `pnpm lint` (ESLint, exit 0 = pass)
- **Type check**: `pnpm exec tsc --noEmit`
- **Tests**: `pnpm test` (Vitest — 8 test files, 34 tests)
- **Git workflow**: this is a deployed Vercel app — never push directly to `main`; always use feature branch → PR → squash merge + delete branch
- **Branch naming**: `feat/`, `fix/`, `chore/` prefixes (e.g. `feat/refresh-all-sort-order`)
- **PR creation**: `gh pr create` then `gh pr merge --squash --delete-branch`

## Learned User Preferences

- Refresh All must iterate accounts in the same top-to-bottom order displayed in the UI (not raw DB order)
- After implementing a plan, do NOT edit the plan file itself
- Filter tabs should be positioned logically next to related tabs (e.g. "Not In Use" goes immediately after "In Use")
- Remove redundant UI info — if data is already shown elsewhere, strip the duplicate display
- Always squash merge PRs and delete the branch after merge
- Logo spin: high peak speed and very slow momentum-like decay are preferred over snappy stop

## Learned Workspace Facts

- Account display sort order (`getSortedAccounts`): health rank (waiting-refresh → weekly-warning → healthy) → pinned by `pinOrder` → starred → alphabetical by name
- `QuotaData.planType` comes from Codex app-server's `rateLimits.planType` (values: `"plus"`, `"pro"`, `"free"`)
- Filter union type `Filter` and `FILTERS` array are both defined in `src/app/page.tsx`
- Logo spin state: `spinLevel` (0–10), decay via `setTimeout` at 7000 ms/level; speed = `spinLevel === 0 ? 8 : Math.max(1.5 - spinLevel * 0.18, 0.08)` seconds per rotation
- `getSortedAccounts` is exported from `src/data/accounts.ts` and is the canonical sort for all account lists
- Lint and typecheck both pass cleanly on the current codebase
