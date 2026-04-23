import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { DailyUsage, SessionRecord, AlertState, PricingTable } from './types';
import { monthKey, todayKey, lastNDays } from './utils/dateHelpers';
import { logger } from './utils/logger';

const SESSIONS_FILE = 'sessions.json';
const ALERTS_FILE = 'alerts.json';
const SETTINGS_CACHE_FILE = 'settings-cache.json';
const MAX_SESSIONS = 200;

interface SettingsCache {
    limits?: Record<string, number>;
    pricingOverrides?: PricingTable;
}

export class StorageManager {
    private readonly root: vscode.Uri;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.root = context.globalStorageUri;
    }

    async init(): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(this.root);
        } catch (err) {
            logger.debug('Storage root already exists or could not be created', err);
        }
    }

    private fileUri(name: string): vscode.Uri {
        return vscode.Uri.joinPath(this.root, name);
    }

    private async readJson<T>(name: string, fallback: T): Promise<T> {
        try {
            const bytes = await vscode.workspace.fs.readFile(this.fileUri(name));
            const text = new TextDecoder('utf-8').decode(bytes);
            return JSON.parse(text) as T;
        } catch {
            return fallback;
        }
    }

    private async writeJson(name: string, value: unknown): Promise<void> {
        const text = JSON.stringify(value, null, 2);
        const bytes = new TextEncoder().encode(text);
        await vscode.workspace.fs.writeFile(this.fileUri(name), bytes);
    }

    private monthlyFile(date = new Date()): string {
        return `usage-${monthKey(date)}.json`;
    }

    async addDailyUsage(entry: DailyUsage): Promise<void> {
        const file = this.monthlyFile(new Date(entry.date));
        const existing = await this.readJson<DailyUsage[]>(file, []);
        const idx = existing.findIndex(
            e => e.date === entry.date && e.tool === entry.tool
        );
        if (idx >= 0) {
            const prev = existing[idx];
            existing[idx] = {
                ...prev,
                inputTokens: prev.inputTokens + entry.inputTokens,
                outputTokens: prev.outputTokens + entry.outputTokens,
                totalTokens: prev.totalTokens + entry.totalTokens,
                costUSD: prev.costUSD + entry.costUSD,
                sessionCount: prev.sessionCount + entry.sessionCount
            };
        } else {
            existing.push(entry);
        }
        await this.writeJson(file, existing);
    }

    async getMonthlyUsage(date = new Date()): Promise<DailyUsage[]> {
        return this.readJson<DailyUsage[]>(this.monthlyFile(date), []);
    }

    async getWeeklyUsage(): Promise<DailyUsage[]> {
        const days = lastNDays(7);
        const needed = new Set(days);
        const monthsSeen = new Set<string>();
        const result: DailyUsage[] = [];
        for (const day of days) {
            const d = new Date(day);
            const month = monthKey(d);
            if (monthsSeen.has(month)) {
                continue;
            }
            monthsSeen.add(month);
            const rows = await this.getMonthlyUsage(d);
            for (const row of rows) {
                if (needed.has(row.date)) {
                    result.push(row);
                }
            }
        }
        return result;
    }

    async addSession(record: SessionRecord): Promise<void> {
        const sessions = await this.readJson<SessionRecord[]>(SESSIONS_FILE, []);
        sessions.unshift(record);
        if (sessions.length > MAX_SESSIONS) {
            sessions.length = MAX_SESSIONS;
        }
        await this.writeJson(SESSIONS_FILE, sessions);
    }

    async getSessions(): Promise<SessionRecord[]> {
        return this.readJson<SessionRecord[]>(SESSIONS_FILE, []);
    }

    async clearSessionsForTool(tool: string): Promise<void> {
        const sessions = await this.getSessions();
        const filtered = sessions.filter(s => s.tool !== tool);
        await this.writeJson(SESSIONS_FILE, filtered);
    }

    async getAlertState(): Promise<AlertState> {
        return this.readJson<AlertState>(ALERTS_FILE, {});
    }

    async setAlertState(state: AlertState): Promise<void> {
        await this.writeJson(ALERTS_FILE, state);
    }

    async getSettingsCache(): Promise<SettingsCache> {
        return this.readJson<SettingsCache>(SETTINGS_CACHE_FILE, {});
    }

    async setSettingsCache(cache: SettingsCache): Promise<void> {
        await this.writeJson(SETTINGS_CACHE_FILE, cache);
    }

    async exportCSV(): Promise<vscode.Uri> {
        const today = new Date();
        const thisMonth = await this.getMonthlyUsage(today);
        const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const prevMonth = await this.getMonthlyUsage(prev);
        const all = [...prevMonth, ...thisMonth].sort((a, b) => a.date.localeCompare(b.date));

        const header = 'date,tool,inputTokens,outputTokens,totalTokens,costUSD,sessionCount';
        const rows = all.map(r =>
            [
                r.date,
                JSON.stringify(r.tool),
                r.inputTokens,
                r.outputTokens,
                r.totalTokens,
                r.costUSD.toFixed(4),
                r.sessionCount
            ].join(',')
        );
        const csv = [header, ...rows].join('\n');

        const fileName = `ai-usage-${todayKey()}.csv`;
        const out = vscode.Uri.file(path.join(os.tmpdir(), fileName));
        await vscode.workspace.fs.writeFile(out, new TextEncoder().encode(csv));
        return out;
    }
}
