import * as vscode from 'vscode';
import { AIToolUsage, TrackerStatus } from '../types';
import { nextResetDate } from '../utils/dateHelpers';

export abstract class BaseTracker {
    abstract readonly name: string;
    abstract readonly shortName: string;
    abstract readonly defaultModel: string;
    abstract readonly defaultLimit: number;

    protected lastPollOk = false;
    protected lastPollAt: Date | null = null;
    protected lastError: string | undefined;
    protected cached: AIToolUsage | null = null;

    constructor(protected readonly context: vscode.ExtensionContext) {}

    abstract poll(): Promise<AIToolUsage>;
    abstract isConfigured(): Promise<boolean> | boolean;

    getStatus(): TrackerStatus {
        return {
            name: this.name,
            shortName: this.shortName,
            configured: this.cached?.isConfigured ?? false,
            lastPollOk: this.lastPollOk,
            lastPollAt: this.lastPollAt,
            lastError: this.lastError
        };
    }

    protected async getSecret(key: string): Promise<string | undefined> {
        return this.context.secrets.get(key);
    }

    protected detectExtension(candidateIds: string[]): vscode.Extension<unknown> | undefined {
        const normalized = new Set(candidateIds.map(id => id.toLowerCase()));
        return vscode.extensions.all.find(ext => normalized.has(ext.id.toLowerCase()));
    }

    protected async resolveKey(secretKey: string, envVars: string[]): Promise<string | undefined> {
        const stored = await this.context.secrets.get(secretKey);
        if (stored && stored.length > 0) {
            return stored;
        }
        for (const name of envVars) {
            const fromEnv = process.env[name];
            if (fromEnv && fromEnv.trim().length > 0) {
                return fromEnv.trim();
            }
        }
        return undefined;
    }

    protected getLimit(): number {
        const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
        const limits = cfg.get<Record<string, number>>('limits', {});
        const value = limits[this.shortName];
        if (typeof value === 'number' && value > 0) {
            return value;
        }
        return this.defaultLimit;
    }

    protected getResetDate(): Date {
        const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
        const resetDay = cfg.get<number>('resetDay', 1);
        return nextResetDate(resetDay);
    }

    protected makeUsage(partial: Partial<AIToolUsage>): AIToolUsage {
        const usage: AIToolUsage = {
            name: this.name,
            shortName: this.shortName,
            model: this.defaultModel,
            used: 0,
            limit: this.getLimit(),
            costUSD: 0,
            lastUsed: null,
            resetDate: this.getResetDate(),
            isConfigured: false,
            isStale: false,
            ...partial
        };
        this.cached = usage;
        return usage;
    }

    protected markOk(): void {
        this.lastPollOk = true;
        this.lastPollAt = new Date();
        this.lastError = undefined;
    }

    protected markFail(err: unknown): AIToolUsage {
        this.lastPollOk = false;
        this.lastPollAt = new Date();
        this.lastError = err instanceof Error ? err.message : String(err);
        if (this.cached) {
            return { ...this.cached, isStale: true };
        }
        return this.makeUsage({ isStale: true });
    }
}
