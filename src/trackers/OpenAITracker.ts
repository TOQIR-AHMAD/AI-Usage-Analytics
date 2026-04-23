import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseTracker } from './BaseTracker';
import { AIToolUsage } from '../types';
import { estimateTotalCost } from '../utils/costCalculator';
import { billingPeriodKey, todayKey } from '../utils/dateHelpers';
import { logger } from '../utils/logger';

export const OPENAI_SECRET_KEY = 'aiUsageTracker.apiKey.Codex';

interface OpenAIUsageDatum {
    snapshot_id?: string;
    n_context_tokens_total?: number;
    n_generated_tokens_total?: number;
    aggregation_timestamp?: number;
}

interface OpenAIUsageResponse {
    data?: OpenAIUsageDatum[];
    whisper_api_data?: unknown[];
    dalle_api_data?: unknown[];
}

const CODEX_EXTENSION_IDS = [
    'openai.chatgpt',
    'OpenAI.chatgpt',
    'openai.codex',
    'OpenAI.codex',
    'openai.openai-chatgpt',
    'openai.openai-chatgpt-adhoc'
];

interface CodexLocalUsage {
    input: number;
    output: number;
    cachedInput: number;
    reasoningOutput: number;
    total: number;
    lastUsed: Date | null;
    model: string;
}

async function readCodexLocalUsage(sinceMs: number): Promise<CodexLocalUsage | null> {
    const sessionsRoot = path.join(os.homedir(), '.codex', 'sessions');
    try {
        const stat = await fs.promises.stat(sessionsRoot);
        if (!stat.isDirectory()) {
            return null;
        }
    } catch {
        return null;
    }

    const acc: CodexLocalUsage = {
        input: 0,
        output: 0,
        cachedInput: 0,
        reasoningOutput: 0,
        total: 0,
        lastUsed: null,
        model: 'gpt-5-codex'
    };

    const files = await collectRecentRollouts(sessionsRoot, sinceMs);
    for (const file of files) {
        try {
            const content = await fs.promises.readFile(file, 'utf8');
            let lastTokenCount: { input: number; output: number; cached: number; reasoning: number; total: number } | null = null;
            let sessionTimestamp: number | null = null;
            let sessionModel: string | null = null;

            for (const rawLine of content.split('\n')) {
                const line = rawLine.trim();
                if (!line) {
                    continue;
                }
                let entry: Record<string, unknown>;
                try {
                    entry = JSON.parse(line) as Record<string, unknown>;
                } catch {
                    continue;
                }

                const ts = entry.timestamp as string | undefined;
                if (ts) {
                    const tsMs = new Date(ts).getTime();
                    if (!isNaN(tsMs)) {
                        sessionTimestamp = tsMs;
                    }
                }

                if (entry.type === 'session_meta') {
                    const payload = entry.payload as Record<string, unknown> | undefined;
                    const model = payload?.model as string | undefined;
                    if (model) {
                        sessionModel = model;
                    }
                    continue;
                }

                if (entry.type !== 'event_msg') {
                    continue;
                }
                const payload = entry.payload as Record<string, unknown> | undefined;
                if (!payload || payload.type !== 'token_count') {
                    continue;
                }
                const info = payload.info as Record<string, unknown> | undefined;
                const total = info?.total_token_usage as Record<string, number> | undefined;
                if (!total) {
                    continue;
                }
                lastTokenCount = {
                    input: total.input_tokens ?? 0,
                    output: total.output_tokens ?? 0,
                    cached: total.cached_input_tokens ?? 0,
                    reasoning: total.reasoning_output_tokens ?? 0,
                    total: total.total_tokens ?? 0
                };
            }

            if (lastTokenCount && sessionTimestamp !== null && sessionTimestamp >= sinceMs) {
                acc.input += lastTokenCount.input;
                acc.output += lastTokenCount.output;
                acc.cachedInput += lastTokenCount.cached;
                acc.reasoningOutput += lastTokenCount.reasoning;
                acc.total += lastTokenCount.total;
                if (sessionTimestamp && (!acc.lastUsed || sessionTimestamp > acc.lastUsed.getTime())) {
                    acc.lastUsed = new Date(sessionTimestamp);
                }
                if (sessionModel) {
                    acc.model = sessionModel;
                }
            }
        } catch (err) {
            logger.debug(`failed to read Codex rollout ${file}`, err);
        }
    }

    return acc;
}

async function collectRecentRollouts(sessionsRoot: string, sinceMs: number): Promise<string[]> {
    const out: string[] = [];
    const sinceDate = new Date(sinceMs);
    const minYear = sinceDate.getFullYear();

    let years: fs.Dirent[];
    try {
        years = await fs.promises.readdir(sessionsRoot, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const yearEntry of years) {
        if (!yearEntry.isDirectory()) {
            continue;
        }
        const year = parseInt(yearEntry.name, 10);
        if (isNaN(year) || year < minYear) {
            continue;
        }
        const yearPath = path.join(sessionsRoot, yearEntry.name);
        const months = await safeReaddir(yearPath);
        for (const m of months) {
            if (!m.isDirectory()) continue;
            const month = parseInt(m.name, 10);
            if (isNaN(month)) continue;
            if (year === sinceDate.getFullYear() && month < sinceDate.getMonth() + 1) continue;
            const monthPath = path.join(yearPath, m.name);
            const days = await safeReaddir(monthPath);
            for (const d of days) {
                if (!d.isDirectory()) continue;
                const day = parseInt(d.name, 10);
                if (isNaN(day)) continue;
                const dayPath = path.join(monthPath, d.name);
                const files = await safeReaddir(dayPath);
                for (const f of files) {
                    if (f.isFile() && f.name.endsWith('.jsonl')) {
                        const full = path.join(dayPath, f.name);
                        try {
                            const st = await fs.promises.stat(full);
                            if (st.mtimeMs >= sinceMs) {
                                out.push(full);
                            }
                        } catch {
                            // ignore
                        }
                    }
                }
            }
        }
    }
    return out;
}

async function safeReaddir(p: string): Promise<fs.Dirent[]> {
    try {
        return await fs.promises.readdir(p, { withFileTypes: true });
    } catch {
        return [];
    }
}

export class OpenAITracker extends BaseTracker {
    readonly name = 'OpenAI / Codex';
    readonly shortName = 'Codex';
    readonly defaultModel = 'gpt-4o';
    readonly defaultLimit = 500_000;

    async isConfigured(): Promise<boolean> {
        if (this.detectExtension(CODEX_EXTENSION_IDS)) {
            return true;
        }
        const key = await this.resolveKey(OPENAI_SECRET_KEY, ['OPENAI_API_KEY', 'CODEX_API_KEY']);
        if (typeof key === 'string' && key.length > 0) {
            return true;
        }
        try {
            const stat = await fs.promises.stat(path.join(os.homedir(), '.codex', 'sessions'));
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    async poll(): Promise<AIToolUsage> {
        const apiKey = await this.resolveKey(OPENAI_SECRET_KEY, ['OPENAI_API_KEY', 'CODEX_API_KEY']);
        if (!apiKey) {
            const ext = this.detectExtension(CODEX_EXTENSION_IDS);
            const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
            const resetDay = cfg.get<number>('resetDay', 1);
            const sinceMs = new Date(`${billingPeriodKey(resetDay)}T00:00:00`).getTime();

            const local = await readCodexLocalUsage(sinceMs);
            if (local && local.total > 0) {
                const billableInput = local.input + local.cachedInput;
                const billableOutput = local.output + local.reasoningOutput;
                const costUSD = estimateTotalCost(billableInput, billableOutput, local.model);
                this.markOk();
                return this.makeUsage({
                    isConfigured: true,
                    used: local.total,
                    costUSD,
                    model: local.model,
                    lastUsed: local.lastUsed
                });
            }
            if (ext) {
                this.markOk();
                return this.makeUsage({
                    isConfigured: true,
                    limit: 0,
                    used: 0,
                    model: ext.packageJSON?.displayName ?? 'OpenAI extension',
                    lastUsed: ext.isActive ? new Date() : null
                });
            }
            this.lastPollOk = false;
            this.lastPollAt = new Date();
            return this.makeUsage({ isConfigured: false });
        }

        try {
            const date = todayKey();
            const resp = await fetch(`https://api.openai.com/v1/usage?date=${encodeURIComponent(date)}`, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'content-type': 'application/json'
                }
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const payload = (await resp.json()) as OpenAIUsageResponse;
            let input = 0;
            let output = 0;
            let model = this.defaultModel;
            let lastUsed: Date | null = null;

            for (const row of payload.data ?? []) {
                input += row.n_context_tokens_total ?? 0;
                output += row.n_generated_tokens_total ?? 0;
                if (row.snapshot_id) {
                    model = row.snapshot_id;
                }
                if (row.aggregation_timestamp) {
                    const d = new Date(row.aggregation_timestamp * 1000);
                    if (!lastUsed || d > lastUsed) {
                        lastUsed = d;
                    }
                }
            }

            const used = input + output;
            const costUSD = estimateTotalCost(input, output, model);
            this.markOk();

            return this.makeUsage({
                used,
                costUSD,
                model,
                isConfigured: true,
                lastUsed
            });
        } catch (err) {
            logger.warn('OpenAITracker poll failed', err);
            return this.markFail(err);
        }
    }
}
