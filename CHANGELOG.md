# Changelog

All notable changes to this project will be documented in this file.

## [0.0.4-beta] - 2026-04-24

### Added
- Per-account quota-history sparkline rendered under each live balance (24 hourly buckets for the 5-hour window, 14 daily buckets for the weekly window).
- Three sparkline styles — Bars (default), Wave, Dots — switchable in Settings.
- Interactive hover tooltip with timestamp + remaining %, and a per-window trend indicator (Recovering / Depleting / Stable) derived from a linear regression over the last 5 filled buckets.
- `/api/accounts/[id]/history` endpoint backed by a `quota_history` table.

### Fixed
- Sparklines no longer show false gaps during idle periods. Buckets between two measured samples are now forward-filled from the last observation and rendered at reduced opacity with an `est.` tooltip flag. Resets (detected as a ≥10pp upward jump) are preserved as real discontinuities, and leading gaps before the first measurement remain null.

### Internal
- Added `.firecrawl/` to `.gitignore`.
- Bumped app version to `0.0.4-beta` in package metadata, docs, and footer display.

## [0.0.3-beta] - 2026-04-06

### Fixed
- Stopped per-account Codex homes under `~/.codex-accounts/<account>` from accumulating unnecessary `plugins-clone-*` temp directories.
- Prevented live quota refresh and login flows from using the persistent account directory as the runtime `CODEX_HOME`.
- Disabled Codex plugins for app-server sessions used by this app, removing an unnecessary source of startup sync and disk growth.

### Changed
- Treat `codexHomePath` as a persistent auth home instead of a general-purpose runtime workspace.
- Run `codex app-server` inside a temporary scratch `CODEX_HOME` for each login/quota session.
- Persist only the updated `auth.json` back to the account home after successful sessions.
- Prune stale leaked `plugins-clone-*` directories in managed account homes.
- Prune stale temporary OAT scratch homes left behind in the OS temp directory.

### Internal
- Added runtime-home coverage tests for auth sync, stale scratch cleanup, and leaked plugin clone cleanup.
- Bumped app version to `0.0.3-beta` in package metadata, docs, and footer display.
