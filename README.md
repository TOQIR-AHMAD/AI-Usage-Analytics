# AI Usage Tracker

Live token usage and cost tracking for multiple AI coding tools, shown directly in the VS Code status bar and a sidebar dashboard.

## Features

- **Status bar items** — one entry per configured AI tool, always visible next to the git branch and Live Share items. Colour-coded by usage percentage (default / warning / error), with a rich hover tooltip (used, remaining, limit, cost, reset date) and a click action that opens the dashboard.
- **Sidebar dashboard** — a webview in the activity bar showing an overview grid, per-tool progress bars, a 7-day bar chart per tool, an input/output token breakdown, the top 5 most expensive sessions today, and the last 50 session records.
- **Notifications** — warning notifications at 70% / 90% and an error notification at 100% of each tool's limit. Daily digest notification is available (disabled by default).
- **Security** — all API keys are stored in `vscode.SecretStorage`. Never written to settings files. Webview uses a per-render nonce and a strict CSP. No telemetry.

## Supported tools

| Tool | Source |
| --- | --- |
| Anthropic Claude | `GET https://api.anthropic.com/v1/usage` |
| GitHub Copilot | `GET https://api.github.com/user/copilot_billing/seats` (+ optional org usage) |
| OpenAI / Codex | `GET https://api.openai.com/v1/usage?date=…` |
| Cursor AI | `~/.cursor/logs/usage.json` or local completion interception |
| Google Gemini | model list call + local token counting |
| Amazon CodeWhisperer | `service-quotas:ListServiceQuotas` + local completion interception |
| Tabnine | `GET https://api.tabnine.com/usage` (if available) or local completion count |

## Configuration

All settings live under `aiUsageTracker.*`:

- `limits` — per-tool numeric limits used by the progress bars and thresholds.
- `pollingIntervalSeconds` — how often to refresh (default `60`).
- `statusBarAlignment` — `"Left"` or `"Right"` (default `"Right"`).
- `alertThresholds` — percentage thresholds (default `[70, 90, 100]`).
- `enableCostEstimates`, `currency`, `resetDay`, `dailyDigestTime`, `enableDailyDigest`, `pricingOverrides`.

API keys are entered via the command **AI Tracker: Configure API Key** and stored encrypted.

## Commands

- `aiUsageTracker.refresh` — poll all tools now
- `aiUsageTracker.openDashboard` — focus the sidebar
- `aiUsageTracker.configureApiKey` — prompt for / store a provider key
- `aiUsageTracker.resetSession` — clear local session counter for a tool
- `aiUsageTracker.exportCSV` — export this and last month's daily usage
- `aiUsageTracker.openSettings` — open the Settings UI filtered to this extension

## Getting started

```bash
npm install
npm run compile
```

Then press **F5** in VS Code to launch the Extension Development Host.

1. Open the command palette → **AI Tracker: Configure API Key** → choose a provider and paste the key.
2. Look for the `$(pulse)` items on the right of the status bar.
3. Click any status bar item, or open the **AI Usage** view in the activity bar, to see the full dashboard.

## File structure

```
src/
  extension.ts              // activation, polling loop, command wiring
  statusBar.ts              // AIStatusBarManager
  alertManager.ts           // threshold + digest notifications
  tokenCounter.ts           // tiktoken + Anthropic count API + cost helpers
  storageManager.ts         // JSON files under globalStorageUri
  settingsManager.ts        // read settings, manage secret keys
  trackers/                 // BaseTracker + 7 concrete trackers + Registry
  sidebar/                  // WebviewViewProvider + HTML
  utils/                    // formatters, dateHelpers, costCalculator, logger
  types/index.ts            // shared interfaces
  test/suite/*              // unit tests
```

## Privacy

The extension only makes outbound requests to the provider APIs you have configured keys for. There is no first-party telemetry or analytics.
