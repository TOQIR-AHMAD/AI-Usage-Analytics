import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BaseTracker } from './BaseTracker';
import { AIToolUsage } from '../types';
import { estimateTotalCost } from '../utils/costCalculator';
import { billingPeriodKey } from '../utils/dateHelpers';
import { logger } from '../utils/logger';
import * as vscode from 'vscode';

export const CLAUDE_SECRET_KEY = 'aiUsageTracker.apiKey.Claude';

interface AnthropicUsageResponse {
    data?: Array<{
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        model?: string;
    }>;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
    };
}

const CLAUDE_EXTENSION_IDS = [
    'anthropic.claude-code',
    'Anthropic.claude-code',
    'anthropic.claude',
    'anthropic.claude-vscode'
];

interface LocalUsage {
    input: number;
    output: number;
    cacheCreate: number;
    cacheRead: number;
    lastUsed: Date | null;
    model: string;
}

async function readClaudeLocalUsage(sinceIsoDate: string): Promise<LocalUsage | null> {
    const root = path.join(os.homedir(), '.claude', 'projects');
    let stat: fs.Stats;
    try {
        stat = await fs.promises.stat(root);
    } catch {
        return null;
    }
    if (!stat.isDirectory()) {
        return null;
    }

    const sinceMs = new Date(sinceIsoDate).getTime();
    const acc: LocalUsage = {
        input: 0,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        lastUsed: null,
        model: 'claude-sonnet-4'
    };

    let projectDirs: fs.Dirent[];
    try {
        projectDirs = await fs.promises.readdir(root, { withFileTypes: true });
    } catch (err) {
        logger.debug('failed reading ~/.claude/projects', err);
        return null;
    }

    for (const dir of projectDirs) {
        if (!dir.isDirectory()) {
            continue;
        }
        const projectPath = path.join(root, dir.name);
        let files: string[];
        try {
            files = await fs.promises.readdir(projectPath);
        } catch {
            continue;
        }
        for (const file of files) {
            if (!file.endsWith('.jsonl')) {
                continue;
            }
            const full = path.join(projectPath, file);
            try {
                const fileStat = await fs.promises.stat(full);
                if (fileStat.mtimeMs < sinceMs) {
                    continue;
                }
                const content = await fs.promises.readFile(full, 'utf8');
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
                            if (tsMs < sinceMs) {
                                continue;
                            }
                            if (!acc.lastUsed || tsMs > acc.lastUsed.getTime()) {
                                acc.lastUsed = new Date(tsMs);
                            }
                        }
                    }
                    const message = entry.message as Record<string, unknown> | undefined;
                    if (!message) {
                        continue;
                    }
                    const usage = message.usage as Record<string, number> | undefined;
                    if (usage) {
                        acc.input += usage.input_tokens ?? 0;
                        acc.output += usage.output_tokens ?? 0;
                        acc.cacheCreate += usage.cache_creation_input_tokens ?? 0;
                        acc.cacheRead += usage.cache_read_input_tokens ?? 0;
                    }
                    const model = message.model as string | undefined;
                    if (model) {
                        acc.model = model;
                    }
                }
            } catch (err) {
                logger.debug(`failed to read ${full}`, err);
            }
        }
    }

    return acc;
}

export class ClaudeTracker extends BaseTracker {
    readonly name = 'Claude';
    readonly shortName = 'Claude';
    readonly defaultModel = 'claude-sonnet-4';
    readonly defaultLimit = 1_000_000;

    async isConfigured(): Promise<boolean> {
        if (this.detectExtension(CLAUDE_EXTENSION_IDS)) {
            return true;
        }
        const key = await this.resolveKey(CLAUDE_SECRET_KEY, ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']);
        if (typeof key === 'string' && key.length > 0) {
            return true;
        }
        try {
            const stat = await fs.promises.stat(path.join(os.homedir(), '.claude', 'projects'));
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    async poll(): Promise<AIToolUsage> {
        const apiKey = await this.resolveKey(CLAUDE_SECRET_KEY, ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']);
        if (!apiKey) {
            const ext = this.detectExtension(CLAUDE_EXTENSION_IDS);
            const cfg = vscode.workspace.getConfiguration('aiUsageTracker');
            const resetDay = cfg.get<number>('resetDay', 1);
            const sinceIso = `${billingPeriodKey(resetDay)}T00:00:00`;

            const local = await readClaudeLocalUsage(sinceIso);
            if (local) {
                const used = local.input + local.output + local.cacheCreate + local.cacheRead;
                const costUSD = estimateTotalCost(
                    local.input + local.cacheCreate + local.cacheRead,
                    local.output,
                    local.model
                );
                this.markOk();
                return this.makeUsage({
                    isConfigured: true,
                    used,
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
                    model: ext.packageJSON?.displayName ?? 'Claude extension',
                    lastUsed: ext.isActive ? new Date() : null
                });
            }
            this.lastPollOk = false;
            this.lastPollAt = new Date();
            return this.makeUsage({ isConfigured: false });
        }

        try {
            const resp = await fetch('https://api.anthropic.com/v1/usage', {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                }
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const payload = (await resp.json()) as AnthropicUsageResponse;
            let input = 0;
            let output = 0;
            let model = this.defaultModel;

            if (Array.isArray(payload.data)) {
                for (const entry of payload.data) {
                    input += entry.input_tokens ?? 0;
                    output += entry.output_tokens ?? 0;
                    if (entry.model) {
                        model = entry.model;
                    }
                }
            } else if (payload.usage) {
                input = payload.usage.input_tokens ?? 0;
                output = payload.usage.output_tokens ?? 0;
            }

            const used = input + output;
            const costUSD = estimateTotalCost(input, output, model);
            this.markOk();

            return this.makeUsage({
                used,
                costUSD,
                model,
                isConfigured: true,
                lastUsed: new Date()
            });
        } catch (err) {
            logger.warn('ClaudeTracker poll failed', err);
            return this.markFail(err);
        }
    }
}
