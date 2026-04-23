import * as vscode from 'vscode';
import { AIToolUsage } from './types';
import { formatK, formatCurrency, formatDate } from './utils/formatters';

const OPEN_DASHBOARD_COMMAND = 'aiUsageTracker.openDashboard';
const CONFIGURE_KEY_COMMAND = 'aiUsageTracker.configureApiKey';

export class AIStatusBarManager {
    private items: Map<string, vscode.StatusBarItem> = new Map();
    private alignment: vscode.StatusBarAlignment = vscode.StatusBarAlignment.Right;
    private basePriority = 100;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.refreshAlignmentFromSettings();
        const sub = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('aiUsageTracker.statusBarAlignment')) {
                this.refreshAlignmentFromSettings();
                const existing = Array.from(this.items.keys());
                for (const key of existing) {
                    const item = this.items.get(key);
                    item?.dispose();
                    this.items.delete(key);
                }
            }
        });
        context.subscriptions.push(sub);
    }

    private refreshAlignmentFromSettings(): void {
        const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
        const value = cfg.get<string>('statusBarAlignment', 'Right');
        this.alignment = value === 'Left'
            ? vscode.StatusBarAlignment.Left
            : vscode.StatusBarAlignment.Right;
    }

    update(tools: AIToolUsage[]): void {
        const seen = new Set<string>();
        tools.forEach((tool, index) => {
            seen.add(tool.shortName);
            const item = this.ensureItem(tool.shortName, index);
            this.renderItem(item, tool);
            item.show();
        });

        for (const [key, item] of this.items.entries()) {
            if (!seen.has(key)) {
                item.hide();
                item.dispose();
                this.items.delete(key);
            }
        }
    }

    private ensureItem(key: string, index: number): vscode.StatusBarItem {
        const existing = this.items.get(key);
        if (existing) {
            return existing;
        }
        const priority = this.basePriority - index;
        const item = vscode.window.createStatusBarItem(this.alignment, priority);
        this.context.subscriptions.push(item);
        this.items.set(key, item);
        return item;
    }

    private renderItem(item: vscode.StatusBarItem, tool: AIToolUsage): void {
        if (!tool.isConfigured) {
            item.text = `$(warning) ${tool.shortName} — not configured`;
            item.color = new vscode.ThemeColor('notificationsWarningIcon.foreground');
            item.tooltip = this.buildUnconfiguredTooltip(tool);
            item.command = {
                command: CONFIGURE_KEY_COMMAND,
                title: 'Configure API Key',
                arguments: [tool.shortName]
            };
            return;
        }

        if (tool.limit <= 0) {
            const staleMark = tool.isStale ? ' ~' : '';
            item.text = `$(pulse) ${tool.shortName} · active${staleMark}`;
            item.color = undefined;
            item.tooltip = this.buildActiveTooltip(tool);
            item.command = OPEN_DASHBOARD_COMMAND;
            return;
        }

        const pct = (tool.used / tool.limit) * 100;
        const usedStr = formatK(tool.used);
        const limitStr = formatK(tool.limit);
        const overLimit = pct >= 80 ? ' !' : '';
        const staleMark = tool.isStale ? ' ~' : '';
        item.text = `$(pulse) ${tool.shortName} ${usedStr}/${limitStr}${overLimit}${staleMark}`;
        item.color = this.getColor(pct);
        item.tooltip = this.buildTooltip(tool);
        item.command = OPEN_DASHBOARD_COMMAND;
    }

    private buildActiveTooltip(tool: AIToolUsage): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportThemeIcons = true;
        md.appendMarkdown(`**${tool.name}** · active\n\n`);
        md.appendMarkdown('---\n\n');
        md.appendMarkdown(`Extension detected: \`${tool.model || 'unknown'}\`\n\n`);
        if (tool.shortName === 'Copilot') {
            md.appendMarkdown('GitHub does not expose per-user token counts to other extensions. For real numbers:\n\n');
            md.appendMarkdown('- [Open GitHub Copilot billing page](https://github.com/settings/copilot) to view usage.\n');
            md.appendMarkdown('- Or set `GITHUB_TOKEN` (PAT with `manage_billing:copilot` scope on an org you admin) to pull seat usage into the dashboard.\n\n');
        } else {
            md.appendMarkdown('Token counts are only available when an API key or local session log is provided. The extension is signed in and running — no action needed for continued use.\n\n');
        }
        md.appendMarkdown('---\n\n');
        md.appendMarkdown(`[Open Dashboard](command:${OPEN_DASHBOARD_COMMAND}) · [Add API key for live stats](command:${CONFIGURE_KEY_COMMAND}?${encodeURIComponent(JSON.stringify([tool.shortName]))})`);
        return md;
    }

    private formatK(n: number): string {
        return formatK(n);
    }

    private buildTooltip(tool: AIToolUsage): vscode.MarkdownString {
        const remaining = Math.max(0, tool.limit - tool.used);
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportThemeIcons = true;
        md.appendMarkdown(`**${tool.name}** · \`${tool.model || 'unknown'}\`\n\n`);
        md.appendMarkdown('---\n\n');
        md.appendMarkdown(`Used &nbsp;&nbsp;&nbsp;&nbsp;\`${tool.used.toLocaleString('en-US')} tokens\`\n\n`);
        md.appendMarkdown(`Remaining &nbsp;&nbsp;\`${remaining.toLocaleString('en-US')} tokens\`\n\n`);
        md.appendMarkdown(`Limit &nbsp;&nbsp;&nbsp;\`${tool.limit.toLocaleString('en-US')} / month\`\n\n`);
        md.appendMarkdown(`Cost &nbsp;&nbsp;&nbsp;&nbsp;~${formatCurrency(tool.costUSD)}\n\n`);
        md.appendMarkdown(`Resets &nbsp;&nbsp;${formatDate(tool.resetDate)}\n\n`);
        if (tool.isStale) {
            md.appendMarkdown('_Last poll failed — showing cached values._\n\n');
        }
        md.appendMarkdown('---\n\n');
        md.appendMarkdown(`[Open Dashboard](command:${OPEN_DASHBOARD_COMMAND})`);
        return md;
    }

    private buildUnconfiguredTooltip(tool: AIToolUsage): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportThemeIcons = true;
        md.appendMarkdown(`**${tool.name}** — not configured\n\n`);
        md.appendMarkdown('No API key or credentials found.\n\n');
        md.appendMarkdown(`[Configure API Key](command:${CONFIGURE_KEY_COMMAND}?${encodeURIComponent(JSON.stringify([tool.shortName]))})`);
        return md;
    }

    private getColor(pct: number): vscode.ThemeColor | undefined {
        if (pct > 80) {
            return new vscode.ThemeColor('statusBarItem.errorForeground');
        }
        if (pct >= 50) {
            return new vscode.ThemeColor('statusBarItem.warningForeground');
        }
        return undefined;
    }

    dispose(): void {
        for (const item of this.items.values()) {
            item.dispose();
        }
        this.items.clear();
    }
}
