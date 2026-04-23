import * as vscode from 'vscode';
import { ExtensionSettings, PricingTable } from './types';
import { SECRET_KEY_BY_TOOL } from './trackers/TrackerRegistry';

export class SettingsManager {
    constructor(private readonly context: vscode.ExtensionContext) {}

    read(): ExtensionSettings {
        const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
        return {
            limits: cfg.get<Record<string, number>>('limits', {}),
            pollingIntervalSeconds: cfg.get<number>('pollingIntervalSeconds', 60),
            statusBarAlignment: (cfg.get<string>('statusBarAlignment', 'Right') as 'Left' | 'Right'),
            alertThresholds: cfg.get<number[]>('alertThresholds', [70, 90, 100]),
            enableCostEstimates: cfg.get<boolean>('enableCostEstimates', true),
            currency: cfg.get<string>('currency', 'USD'),
            resetDay: cfg.get<number>('resetDay', 1),
            dailyDigestTime: cfg.get<string>('dailyDigestTime', '08:00'),
            enableDailyDigest: cfg.get<boolean>('enableDailyDigest', false),
            pricingOverrides: cfg.get<PricingTable>('pricingOverrides', {})
        };
    }

    onDidChange(handler: (settings: ExtensionSettings) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('aiUsageTracker')) {
                handler(this.read());
            }
        });
    }

    async configureApiKey(toolShortName?: string): Promise<void> {
        const candidates = Object.entries(SECRET_KEY_BY_TOOL)
            .filter(([, secretKey]) => secretKey !== null)
            .map(([name]) => name);

        let target = toolShortName;
        if (!target) {
            target = await vscode.window.showQuickPick(candidates, {
                title: 'Select AI tool',
                placeHolder: 'Which tool do you want to configure?'
            });
            if (!target) {
                return;
            }
        }

        const secretKey = SECRET_KEY_BY_TOOL[target];
        if (!secretKey) {
            vscode.window.showWarningMessage(`${target} does not require an API key.`);
            return;
        }

        const existing = await this.context.secrets.get(secretKey);
        const value = await vscode.window.showInputBox({
            password: true,
            title: `API key for ${target}`,
            placeHolder: existing ? 'Leave blank to clear the existing key' : 'Paste your API key',
            ignoreFocusOut: true
        });

        if (value === undefined) {
            return;
        }

        if (value.trim() === '') {
            await this.context.secrets.delete(secretKey);
            vscode.window.showInformationMessage(`${target} API key cleared.`);
        } else {
            await this.context.secrets.store(secretKey, value.trim());
            vscode.window.showInformationMessage(`${target} API key saved to VS Code secret storage.`);
        }
    }

    async openSettingsUI(): Promise<void> {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'aiUsageTracker');
    }
}
