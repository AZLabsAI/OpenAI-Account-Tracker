# Changelog

All notable changes to this project will be documented in this file.

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
