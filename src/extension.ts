import * as vscode from 'vscode';
import { AIStatusBarManager } from './statusBar';
import { TrackerRegistry } from './trackers/TrackerRegistry';
import { StorageManager } from './storageManager';
import { AlertManager } from './alertManager';
import { SettingsManager } from './settingsManager';
import { SidebarProvider } from './sidebar/SidebarProvider';
import { AIToolUsage, DailyUsage, SessionRecord } from './types';
import { todayKey } from './utils/dateHelpers';
import { initLogger, logger } from './utils/logger';

let registry: TrackerRegistry;
let storage: StorageManager;
let alerts: AlertManager;
let settings: SettingsManager;
let statusBar: AIStatusBarManager;
let sidebar: SidebarProvider;

let pollTimer: NodeJS.Timeout | undefined;
let digestTimer: NodeJS.Timeout | undefined;
let latestTools: AIToolUsage[] = [];
let lastUsedByTool: Map<string, number> = new Map();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    initLogger(context);
    logger.info('AI Usage Tracker activating');

    storage = new StorageManager(context);
    await storage.init();

    settings = new SettingsManager(context);
    registry = new TrackerRegistry(context);
    alerts = new AlertManager(context, storage);
    statusBar = new AIStatusBarManager(context);

    sidebar = new SidebarProvider(context, {
        refresh: () => refreshOnce(),
        resetTool: name => resetTool(name),
        configureKey: name => settings.configureApiKey(name),
        exportCSV: () => exportCSV(),
        openSettings: () => settings.openSettingsUI(),
        getSnapshot: () => getSnapshot()
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiUsageTracker.refresh', async () => {
            await refreshOnce();
            vscode.window.setStatusBarMessage('AI Usage Tracker: refreshed', 2000);
        }),
        vscode.commands.registerCommand('aiUsageTracker.openDashboard', async () => {
            await sidebar.reveal();
        }),
        vscode.commands.registerCommand('aiUsageTracker.configureApiKey', async (toolName?: string) => {
            await settings.configureApiKey(toolName);
            await refreshOnce();
        }),
        vscode.commands.registerCommand('aiUsageTracker.resetSession', async (toolName?: string) => {
            let target = toolName;
            if (!target) {
                const names = latestTools.map(t => t.shortName);
                target = await vscode.window.showQuickPick(names, {
                    title: 'Reset session counter'
                });
                if (!target) {
                    return;
                }
            }
            await resetTool(target);
        }),
        vscode.commands.registerCommand('aiUsageTracker.exportCSV', async () => {
            await exportCSV();
        }),
        vscode.commands.registerCommand('aiUsageTracker.openSettings', async () => {
            await settings.openSettingsUI();
        })
    );

    context.subscriptions.push(
        settings.onDidChange(() => {
            restartPolling();
        })
    );

    context.subscriptions.push({
        dispose: () => {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = undefined;
            }
            if (digestTimer) {
                clearInterval(digestTimer);
                digestTimer = undefined;
            }
            statusBar.dispose();
        }
    });

    await announceAutoDetected(context);
    await refreshOnce();
    startPolling();
    startDigestTimer();
    logger.info('AI Usage Tracker activated');
}

async function announceAutoDetected(context: vscode.ExtensionContext): Promise<void> {
    const detected: string[] = [];
    for (const tracker of registry.all()) {
        try {
            const configured = await tracker.isConfigured();
            if (configured) {
                detected.push(tracker.shortName);
            }
        } catch (err) {
            logger.debug(`auto-detect failed for ${tracker.shortName}`, err);
        }
    }
    const announcedKey = 'aiUsageTracker.announcedAutoDetect';
    const previouslyAnnounced = context.globalState.get<string[]>(announcedKey, []);
    const newlyDetected = detected.filter(d => !previouslyAnnounced.includes(d));
    if (newlyDetected.length > 0) {
        await context.globalState.update(announcedKey, detected);
        vscode.window.setStatusBarMessage(
            `AI Usage Tracker: auto-configured ${newlyDetected.join(', ')}`,
            5000
        );
        logger.info('Auto-detected', newlyDetected.join(', '));
    } else {
        await context.globalState.update(announcedKey, detected);
    }
}

export function deactivate(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
    }
    if (digestTimer) {
        clearInterval(digestTimer);
        digestTimer = undefined;
    }
    statusBar?.dispose();
}

function startPolling(): void {
    const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
    const seconds = Math.max(10, cfg.get<number>('pollingIntervalSeconds', 60));
    pollTimer = setInterval(() => {
        refreshOnce().catch(err => logger.error('poll failed', err));
    }, seconds * 1000);
}

function restartPolling(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
    }
    startPolling();
}

function startDigestTimer(): void {
    digestTimer = setInterval(() => {
        alerts.maybeFireDailyDigest(latestTools).catch(err => logger.error('digest failed', err));
    }, 60 * 1000);
}

async function refreshOnce(): Promise<void> {
    const tools = await registry.pollAll();
    const previous = latestTools;
    latestTools = tools;

    statusBar.update(tools);

    try {
        await recordDeltas(previous, tools);
    } catch (err) {
        logger.error('recordDeltas failed', err);
    }

    try {
        await alerts.checkAndAlert(tools);
    } catch (err) {
        logger.error('alerts failed', err);
    }

    try {
        await sidebar.pushSnapshot();
    } catch (err) {
        logger.debug('sidebar push (likely not visible yet)', err);
    }
}

async function recordDeltas(previous: AIToolUsage[], current: AIToolUsage[]): Promise<void> {
    const date = todayKey();
    for (const tool of current) {
        if (!tool.isConfigured) {
            continue;
        }
        const prev = previous.find(p => p.shortName === tool.shortName);
        const prevUsed = lastUsedByTool.get(tool.shortName) ?? prev?.used ?? tool.used;
        const delta = tool.used - prevUsed;
        if (delta <= 0) {
            lastUsedByTool.set(tool.shortName, tool.used);
            continue;
        }
        const costDelta = Math.max(0, tool.costUSD - (prev?.costUSD ?? 0));
        const daily: DailyUsage = {
            date,
            tool: tool.shortName,
            inputTokens: Math.round(delta * 0.6),
            outputTokens: Math.round(delta * 0.4),
            totalTokens: delta,
            costUSD: costDelta,
            sessionCount: 1
        };
        await storage.addDailyUsage(daily);

        const session: SessionRecord = {
            id: `${tool.shortName}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            tool: tool.shortName,
            model: tool.model,
            inputTokens: daily.inputTokens,
            outputTokens: daily.outputTokens,
            costUSD: costDelta,
            durationMs: 0
        };
        await storage.addSession(session);
        lastUsedByTool.set(tool.shortName, tool.used);
    }
}

async function resetTool(shortName: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        `Reset local session counter for ${shortName}? This clears cached sessions and alert state; remote API counters are unaffected.`,
        { modal: true },
        'Reset'
    );
    if (confirm !== 'Reset') {
        return;
    }

    await storage.clearSessionsForTool(shortName);
    await alerts.resetAlertsForTool(shortName);
    lastUsedByTool.delete(shortName);

    const idx = latestTools.findIndex(t => t.shortName === shortName);
    if (idx >= 0) {
        latestTools[idx] = { ...latestTools[idx], used: 0, costUSD: 0, isStale: true };
        statusBar.update(latestTools);
    }

    await refreshOnce();
    vscode.window.showInformationMessage(`${shortName}: local counter reset.`);
}

async function exportCSV(): Promise<void> {
    try {
        const uri = await storage.exportCSV();
        const action = await vscode.window.showInformationMessage(
            `Exported usage to ${uri.fsPath}`,
            'Open File',
            'Reveal in Explorer'
        );
        if (action === 'Open File') {
            await vscode.window.showTextDocument(uri);
        } else if (action === 'Reveal in Explorer') {
            await vscode.commands.executeCommand('revealFileInOS', uri);
        }
    } catch (err) {
        logger.error('Export CSV failed', err);
        vscode.window.showErrorMessage('Failed to export CSV — see AI Usage Tracker output for details.');
    }
}

async function getSnapshot() {
    const [sessions, weekly] = await Promise.all([
        storage.getSessions(),
        storage.getWeeklyUsage()
    ]);
    return { tools: latestTools, sessions, weekly };
}
