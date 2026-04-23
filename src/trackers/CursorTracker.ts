import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BaseTracker } from './BaseTracker';
import { AIToolUsage } from '../types';
import { logger } from '../utils/logger';

interface CursorUsageLog {
    date?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    completions?: number;
}

export class CursorTracker extends BaseTracker {
    readonly name = 'Cursor AI';
    readonly shortName = 'Cursor';
    readonly defaultModel = 'cursor-default';
    readonly defaultLimit = 500;

    private logPath = path.join(os.homedir(), '.cursor', 'logs', 'usage.json');
    private fallbackCompletions = 0;

    isConfigured(): boolean {
        try {
            return fs.existsSync(this.logPath);
        } catch {
            return false;
        }
    }

    recordCompletion(): void {
        this.fallbackCompletions += 1;
    }

    async poll(): Promise<AIToolUsage> {
        try {
            if (!fs.existsSync(this.logPath)) {
                if (this.fallbackCompletions > 0) {
                    this.markOk();
                    return this.makeUsage({
                        used: this.fallbackCompletions,
                        isConfigured: true,
                        lastUsed: new Date(),
                        model: this.defaultModel
                    });
                }
                this.lastPollOk = false;
                this.lastPollAt = new Date();
                return this.makeUsage({ isConfigured: false });
            }

            const raw = await fs.promises.readFile(this.logPath, 'utf8');
            const data = JSON.parse(raw) as CursorUsageLog | CursorUsageLog[];
            const list: CursorUsageLog[] = Array.isArray(data) ? data : [data];

            let total = 0;
            let completions = 0;
            let model = this.defaultModel;
            let lastUsed: Date | null = null;

            for (const row of list) {
                total += row.totalTokens ?? ((row.inputTokens ?? 0) + (row.outputTokens ?? 0));
                completions += row.completions ?? 0;
                if (row.model) {
                    model = row.model;
                }
                if (row.date) {
                    const d = new Date(row.date);
                    if (!isNaN(d.getTime()) && (!lastUsed || d > lastUsed)) {
                        lastUsed = d;
                    }
                }
            }

            const used = total > 0 ? total : completions;
            this.markOk();
            return this.makeUsage({
                used,
                model,
                isConfigured: true,
                lastUsed
            });
        } catch (err) {
            logger.warn('CursorTracker poll failed', err);
            return this.markFail(err);
        }
    }
}
