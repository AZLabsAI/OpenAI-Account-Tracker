# OpenAI Account Tracker

A local-first dashboard for managing multiple OpenAI accounts — track subscriptions, usage quotas, expiration dates, and agent assignments across machines.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![SQLite](https://img.shields.io/badge/SQLite-local-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Multi-account management** — add, edit, pin, star, and delete OpenAI accounts
- **Live quota tracking** — OAuth sign-in via Codex CLI fetches real-time 5-hour and weekly usage
- **Per-account auto-refresh** — set custom refresh intervals (5 min to 2 hours) per account
- **Flippable cards** — click the grip zone at the bottom of any card to access settings
- **Stale-aware indicators** — refresh buttons shift from blue → amber → orange as quota data ages
- **Search & filter** — filter by name, email, subscription, account type, or status
- **Structured logging** — full Settings page with color-coded, filterable, auto-refreshing logs
- **SQLite persistence** — all data stored locally in `data.db` (never leaves your machine)
- **Dark theme** — zinc palette, designed for extended use

## Requirements

- **Node.js** 18+ (LTS recommended)
- **npm** or **pnpm**
- **Codex CLI** (optional — required only for live quota tracking)
  - [Install Codex CLI](https://github.com/openai/codex) and ensure it's on your PATH or in the standard install directory

## Getting Started

```bash
# Clone the repo
git clone https://github.com/AZLabsAI/OpenAI-Account-Tracker.git
cd OpenAI-Account-Tracker

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

On first run, three example accounts are seeded into `data.db`. Replace them with your own via the **+ Add Account** card or delete them from the UI.

## Cross-Platform Support

| Platform | Dashboard | Live Quota (Codex CLI) |
|----------|-----------|----------------------|
| **macOS** (ARM/Intel) | ✅ | ✅ |
| **Windows** (x64) | ✅ | ✅ |
| **Linux** (x64) | ✅ | ✅ |

The Codex CLI binary is auto-detected from standard install locations on all platforms. Browser-based OAuth opens via the platform-native command (`open` / `start` / `xdg-open`).

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── settings/page.tsx     # Logs & diagnostics
│   └── api/
│       ├── accounts/         # CRUD + login + quota endpoints
│       └── logs/             # Log viewer API
├── components/
│   ├── AccountCard.tsx       # Flippable card (front + back)
│   ├── AddAccountCard.tsx    # New account modal
│   ├── UsageBar.tsx          # Quota visualisation
│   ├── DashboardStats.tsx    # Summary stats
│   └── StatusBadge.tsx       # Health indicator
├── lib/
│   ├── db.ts                 # SQLite via better-sqlite3
│   ├── logger.ts             # Structured logging to SQLite
│   └── codex-appserver.ts    # Codex CLI JSON-RPC wrapper
├── data/
│   └── accounts.ts           # Seed data + sort/status helpers
└── types/
    └── account.ts            # TypeScript interfaces
```

## Local-Only Design

This app is intentionally **not deployable to Vercel or any serverless platform**:

- **SQLite** requires a persistent local filesystem
- **Codex CLI** must be installed as a native binary
- **CODEX_HOME** directories are local filesystem paths

For multi-device access on your local network, use `http://<your-ip>:3000`.

## Data Privacy

- `data.db` is gitignored — your account data never leaves your machine
- Seed data uses `@example.com` placeholders only
- No telemetry, no external API calls (except to OpenAI during OAuth)
- No API keys or secrets are stored in the repo

## License

MIT
