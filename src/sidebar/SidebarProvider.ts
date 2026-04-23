import * as vscode from 'vscode';
import { AIToolUsage, DailyUsage, SessionRecord, WebviewInboundMessage } from '../types';
import { getWebviewContent, getNonce } from './getWebviewContent';
import { logger } from '../utils/logger';

export interface SidebarHost {
    refresh: () => Promise<void>;
    resetTool: (shortName: string) => Promise<void>;
    configureKey: (shortName: string) => Promise<void>;
    exportCSV: () => Promise<void>;
    openSettings: () => Promise<void>;
    getSnapshot: () => Promise<{
        tools: AIToolUsage[];
        sessions: SessionRecord[];
        weekly: DailyUsage[];
    }>;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'aiUsageTrackerSidebar';

    private view: vscode.WebviewView | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly host: SidebarHost
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        const nonce = getNonce();
        webviewView.webview.html = getWebviewContent(webviewView.webview, nonce);

        webviewView.webview.onDidReceiveMessage(async (msg: WebviewInboundMessage) => {
            try {
                switch (msg.type) {
                    case 'refresh':
                        await this.host.refresh();
                        await this.pushSnapshot();
                        break;
                    case 'resetTool':
                        await this.host.resetTool(msg.toolName);
                        await this.pushSnapshot();
                        break;
                    case 'configureKey':
                        await this.host.configureKey(msg.toolName);
                        await this.host.refresh();
                        await this.pushSnapshot();
                        break;
                    case 'exportCSV':
                        await this.host.exportCSV();
                        break;
                    case 'openSettings':
                        await this.host.openSettings();
                        break;
                }
            } catch (err) {
                logger.error('Sidebar message handler failed', err);
            }
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.pushSnapshot().catch(err => logger.error('pushSnapshot failed', err));
            }
        });

        this.pushSnapshot().catch(err => logger.error('initial pushSnapshot failed', err));
    }

    async reveal(): Promise<void> {
        if (this.view) {
            this.view.show(true);
            await this.pushSnapshot();
            return;
        }
        await vscode.commands.executeCommand('workbench.view.extension.aiUsageTracker');
    }

    async pushSnapshot(): Promise<void> {
        if (!this.view) {
            return;
        }
        const snapshot = await this.host.getSnapshot();
        await this.view.webview.postMessage({
            type: 'update',
            data: snapshot.tools,
            sessions: snapshot.sessions,
            weekly: snapshot.weekly
        });
    }
}
