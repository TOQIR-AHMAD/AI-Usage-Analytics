import * as vscode from 'vscode';
import { BaseTracker } from './BaseTracker';
import { AIToolUsage } from '../types';
import { logger } from '../utils/logger';

export const COPILOT_SECRET_KEY = 'aiUsageTracker.apiKey.Copilot';
const COPILOT_ORG_SETTING = 'aiUsageTracker.copilotOrg';
const GITHUB_SCOPES = ['read:user'];
const COPILOT_EXTENSION_IDS = [
    'GitHub.copilot',
    'github.copilot',
    'GitHub.copilot-chat',
    'github.copilot-chat'
];

async function getGithubSessionToken(silent: boolean): Promise<string | undefined> {
    try {
        const session = await vscode.authentication.getSession('github', GITHUB_SCOPES, {
            silent,
            createIfNone: false
        });
        return session?.accessToken;
    } catch {
        return undefined;
    }
}

interface CopilotSeats {
    total_seats?: number;
    seats?: Array<{
        assignee?: { login?: string };
        last_activity_at?: string | null;
    }>;
}

interface CopilotOrgUsage {
    total_active_users?: number;
    usage?: Array<{
        day?: string;
        total_suggestions_count?: number;
        total_acceptances_count?: number;
        total_lines_suggested?: number;
        total_lines_accepted?: number;
    }>;
}

export class CopilotTracker extends BaseTracker {
    readonly name = 'GitHub Copilot';
    readonly shortName = 'Copilot';
    readonly defaultModel = 'gpt-4o';
    readonly defaultLimit = 100_000;

    async isConfigured(): Promise<boolean> {
        if (this.detectExtension(COPILOT_EXTENSION_IDS)) {
            return true;
        }
        const stored = await this.resolveKey(COPILOT_SECRET_KEY, ['GITHUB_TOKEN', 'GH_TOKEN']);
        if (stored) {
            return true;
        }
        const session = await getGithubSessionToken(true);
        return !!session;
    }

    private async resolveToken(): Promise<string | undefined> {
        const stored = await this.resolveKey(COPILOT_SECRET_KEY, ['GITHUB_TOKEN', 'GH_TOKEN']);
        if (stored) {
            return stored;
        }
        return getGithubSessionToken(true);
    }

    async poll(): Promise<AIToolUsage> {
        const token = await this.resolveToken();
        if (!token) {
            const ext = this.detectExtension(COPILOT_EXTENSION_IDS);
            if (ext) {
                this.markOk();
                return this.makeUsage({
                    isConfigured: true,
                    limit: 0,
                    used: 0,
                    model: ext.packageJSON?.displayName ?? 'GitHub Copilot',
                    lastUsed: ext.isActive ? new Date() : null
                });
            }
            this.lastPollOk = false;
            this.lastPollAt = new Date();
            return this.makeUsage({ isConfigured: false });
        }

        try {
            const seatsResp = await fetch('https://api.github.com/user/copilot_billing/seats', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            let lastActivityAt: Date | null = null;
            if (seatsResp.ok) {
                const seats = (await seatsResp.json()) as CopilotSeats;
                for (const seat of seats.seats ?? []) {
                    if (seat.last_activity_at) {
                        const d = new Date(seat.last_activity_at);
                        if (!lastActivityAt || d > lastActivityAt) {
                            lastActivityAt = d;
                        }
                    }
                }
            }

            let used = 0;
            const cfg = vscode.workspace.getConfiguration();
            const org = cfg.get<string>(COPILOT_ORG_SETTING, '').trim();

            if (org) {
                const orgUrl = `https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/usage`;
                const usageResp = await fetch(orgUrl, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    }
                });
                if (usageResp.ok) {
                    const data = (await usageResp.json()) as CopilotOrgUsage | CopilotOrgUsage[];
                    const list = Array.isArray(data) ? data : (data.usage ?? []);
                    for (const row of list) {
                        const anyRow = row as Record<string, unknown>;
                        used += (anyRow.total_lines_accepted as number | undefined) ?? 0;
                        used += (anyRow.total_lines_suggested as number | undefined) ?? 0;
                    }
                }
            }

            this.markOk();
            return this.makeUsage({
                used,
                costUSD: 0,
                model: this.defaultModel,
                isConfigured: true,
                lastUsed: lastActivityAt
            });
        } catch (err) {
            logger.warn('CopilotTracker poll failed', err);
            return this.markFail(err);
        }
    }
}
