import * as vscode from 'vscode';
import { AIToolUsage, AlertState } from './types';
import { StorageManager } from './storageManager';
import { billingPeriodKey, parseHHMM, todayKey } from './utils/dateHelpers';
import { formatK, formatCurrency } from './utils/formatters';
import { logger } from './utils/logger';

const DAILY_DIGEST_STATE_KEY = 'aiUsageTracker.lastDigestDate';

export class AlertManager {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly storage: StorageManager
    ) {}

    private getThresholds(): number[] {
        const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
        const raw = cfg.get<number[]>('alertThresholds', [70, 90, 100]);
        if (!Array.isArray(raw)) {
            return [70, 90, 100];
        }
        return [...raw].filter(n => typeof n === 'number' && n > 0).sort((a, b) => a - b);
    }

    private getResetDay(): number {
        const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
        return cfg.get<number>('resetDay', 1);
    }

    async checkAndAlert(tools: AIToolUsage[]): Promise<void> {
        const thresholds = this.getThresholds();
        const period = billingPeriodKey(this.getResetDay());
        const state: AlertState = await this.storage.getAlertState();
        let mutated = false;

        for (const tool of tools) {
            if (!tool.isConfigured || tool.limit <= 0) {
                continue;
            }
            const pct = (tool.used / tool.limit) * 100;
            const entry = state[tool.shortName] ?? { period, firedThresholds: [] };

            if (entry.period !== period) {
                entry.period = period;
                entry.firedThresholds = [];
                mutated = true;
            }

            for (const threshold of thresholds) {
                if (pct >= threshold && !entry.firedThresholds.includes(threshold)) {
                    await this.fireAlert(tool, threshold);
                    entry.firedThresholds.push(threshold);
                    mutated = true;
                }
            }

            state[tool.shortName] = entry;
        }

        if (mutated) {
            await this.storage.setAlertState(state);
        }
    }

    private async fireAlert(tool: AIToolUsage, threshold: number): Promise<void> {
        const usedStr = tool.used.toLocaleString('en-US');
        const limitStr = tool.limit.toLocaleString('en-US');

        if (threshold >= 100) {
            const choice = await vscode.window.showErrorMessage(
                `${tool.shortName}: Token limit reached! Further calls may fail.`,
                'Open Dashboard',
                'Reset Counter',
                'Dismiss'
            );
            await this.handleChoice(choice, tool);
            return;
        }

        const choice = await vscode.window.showWarningMessage(
            `${tool.shortName}: ${threshold}% of token limit used (${usedStr} / ${limitStr})`,
            'Open Dashboard',
            'Dismiss'
        );
        await this.handleChoice(choice, tool);
    }

    private async handleChoice(choice: string | undefined, tool: AIToolUsage): Promise<void> {
        if (choice === 'Open Dashboard') {
            await vscode.commands.executeCommand('aiUsageTracker.openDashboard');
        } else if (choice === 'Reset Counter') {
            await vscode.commands.executeCommand('aiUsageTracker.resetSession', tool.shortName);
        }
    }

    async resetAlertsForTool(toolShortName: string): Promise<void> {
        const state = await this.storage.getAlertState();
        delete state[toolShortName];
        await this.storage.setAlertState(state);
    }

    async maybeFireDailyDigest(tools: AIToolUsage[]): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
        const enabled = cfg.get<boolean>('enableDailyDigest', false);
        if (!enabled) {
            return;
        }
        const timeStr = cfg.get<string>('dailyDigestTime', '08:00');
        const parsed = parseHHMM(timeStr);
        if (!parsed) {
            return;
        }
        const now = new Date();
        if (now.getHours() !== parsed.hour || now.getMinutes() !== parsed.minute) {
            return;
        }
        const today = todayKey(now);
        const lastDigest = this.context.globalState.get<string>(DAILY_DIGEST_STATE_KEY);
        if (lastDigest === today) {
            return;
        }

        const parts: string[] = [];
        let totalCost = 0;
        for (const tool of tools) {
            if (!tool.isConfigured) {
                continue;
            }
            parts.push(`${tool.shortName} ${formatK(tool.used)}`);
            totalCost += tool.costUSD;
        }
        if (parts.length === 0) {
            return;
        }
        await this.context.globalState.update(DAILY_DIGEST_STATE_KEY, today);
        const message = `AI Usage today: ${parts.join(', ')}, total ~${formatCurrency(totalCost)}`;
        const action = await vscode.window.showInformationMessage(message, 'Open Dashboard', 'Dismiss');
        if (action === 'Open Dashboard') {
            await vscode.commands.executeCommand('aiUsageTracker.openDashboard');
        }
        logger.info('Daily digest fired');
    }
}
