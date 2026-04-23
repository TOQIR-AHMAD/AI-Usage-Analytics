# AI Usage Tracker

Live token usage and cost tracking for Claude, GitHub Copilot, and OpenAI Codex — shown directly in the VS Code status bar and a sidebar dashboard.

## Features

- **Live status bar items** — one entry per AI tool, always visible next to the git branch and Live Share items. Shows current usage vs. limit in compact form (e.g. `Claude 45k/1m`).

- **Color-coded thresholds** — each status bar item turns yellow above 50%, red above 80%, and appends a `!` marker. No color below 50%.

- **Rich hover tooltips** — hover any item to see used tokens, remaining, monthly limit, cost estimate, reset date, and a one-click link to the dashboard.

- **Sidebar dashboard** — a dedicated webview in the activity bar with:
  - An overview grid (used today, remaining, cost, days to reset)
  - Per-tool progress bars, model badges, last-used timestamps
  - 7-day bar charts per tool
  - Input vs. output token breakdown
  - Top 5 most expensive sessions today
  - A scrollable table of the last 50 session records

- **Auto-detection — no API keys required** — detects your installed AI extensions (Claude Code, GitHub Copilot, Codex) and marks them as active automatically. You can start using the tracker the moment it's installed.

- **Real token counts without API keys** — parses local session logs for Claude (`~/.claude/projects/**/*.jsonl`) and Codex (`~/.codex/sessions/**/rollout-*.jsonl`) to give you accurate token and cost numbers even when you're only signed in via OAuth.

- **Notification alerts** — warning notifications at 70% and 90% of your limit, and an error notification at 100%. Each alert fires at most once per billing period.

- **Optional daily digest** — a once-a-day summary notification showing tokens used and estimated cost across all tools.

- **CSV export** — dump this month and last month's daily usage as a CSV file for your own analysis or billing records.

- **Cost estimation** — built-in per-model pricing table (Claude Opus/Sonnet/Haiku, GPT-4o/4 Turbo/3.5, Gemini Pro/Flash, etc.) with full override support via settings.

- **Secure credential storage** — all API keys stored in VS Code's encrypted `SecretStorage`. Never written to `settings.json` or any workspace file. Log output scrubs `sk-…`, `ghp_…`, and similar patterns.

- **Strict webview security** — per-render cryptographic nonce and a strict Content-Security-Policy header on the dashboard webview. No inline scripts, no remote content.

- **Theme-native UI** — dashboard styled entirely with `--vscode-*` CSS variables, so it looks native in any color theme (light, dark, high contrast) and is responsive down to 200 px sidebar width.

- **No telemetry** — the extension only makes outbound requests to the AI provider APIs *you* configure. No analytics, no tracking, no data sent to third parties.

- **Configurable billing period** — set your own `resetDay` (1–28) to match your actual billing cycle, not just the calendar month.

- **Customizable polling** — default 60 s refresh interval, configurable via `aiUsageTracker.pollingIntervalSeconds`.
