import { estimateCost as baseEstimateCost } from './utils/costCalculator';
import { formatK } from './utils/formatters';
import { logger } from './utils/logger';
import { CLAUDE_SECRET_KEY } from './trackers/ClaudeTracker';
import * as vscode from 'vscode';

type TiktokenEncoder = { encode: (text: string) => ArrayLike<number>; free?: () => void };
type TiktokenModule = {
    encoding_for_model?: (model: string) => TiktokenEncoder;
    get_encoding?: (name: string) => TiktokenEncoder;
};

let tiktoken: TiktokenModule | null | undefined;

function loadTiktoken(): TiktokenModule | null {
    if (tiktoken !== undefined) {
        return tiktoken;
    }
    try {
        tiktoken = require('tiktoken') as TiktokenModule;
    } catch (err) {
        logger.debug('tiktoken not available, using fallback estimator', err);
        tiktoken = null;
    }
    return tiktoken;
}

function isOpenAIStyle(model: string): boolean {
    const m = model.toLowerCase();
    return m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('text-') || m.includes('davinci');
}

function fallbackCount(text: string): number {
    if (!text) {
        return 0;
    }
    return Math.max(1, Math.ceil(text.length / 4));
}

export function countTokens(text: string, model: string): number {
    if (!text) {
        return 0;
    }
    const mod = loadTiktoken();
    if (!mod) {
        return fallbackCount(text);
    }
    try {
        if (isOpenAIStyle(model) && typeof mod.encoding_for_model === 'function') {
            const enc = mod.encoding_for_model(model);
            const tokens = enc.encode(text).length;
            enc.free?.();
            return tokens;
        }
        if (typeof mod.get_encoding === 'function') {
            const enc = mod.get_encoding('cl100k_base');
            const tokens = enc.encode(text).length;
            enc.free?.();
            return tokens;
        }
    } catch (err) {
        logger.debug('tiktoken encode failed, using fallback', err);
    }
    return fallbackCount(text);
}

export async function countAnthropicTokens(
    context: vscode.ExtensionContext,
    text: string,
    model: string
): Promise<number> {
    const apiKey = await context.secrets.get(CLAUDE_SECRET_KEY);
    if (!apiKey) {
        return countTokens(text, model);
    }
    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: text }]
            })
        });
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        const payload = (await resp.json()) as { input_tokens?: number };
        if (typeof payload.input_tokens === 'number') {
            return payload.input_tokens;
        }
    } catch (err) {
        logger.debug('Anthropic token count failed, using local estimate', err);
    }
    return countTokens(text, model);
}

export function estimateCost(
    tokens: number,
    model: string,
    direction: 'input' | 'output'
): number {
    return baseEstimateCost(tokens, model, direction);
}

export function formatTokenCount(n: number): string {
    if (n >= 10_000) {
        return formatK(n);
    }
    return n.toLocaleString('en-US');
}
