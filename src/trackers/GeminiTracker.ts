import { BaseTracker } from './BaseTracker';
import { AIToolUsage } from '../types';
import { estimateTotalCost } from '../utils/costCalculator';
import { logger } from '../utils/logger';

export const GEMINI_SECRET_KEY = 'aiUsageTracker.apiKey.Gemini';

export class GeminiTracker extends BaseTracker {
    readonly name = 'Google Gemini';
    readonly shortName = 'Gemini';
    readonly defaultModel = 'gemini-1.5-pro';
    readonly defaultLimit = 1_000_000;

    private interceptedInput = 0;
    private interceptedOutput = 0;
    private lastInterceptAt: Date | null = null;

    async isConfigured(): Promise<boolean> {
        const key = await this.resolveKey(GEMINI_SECRET_KEY, ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY']);
        return typeof key === 'string' && key.length > 0;
    }

    recordCall(inputTokens: number, outputTokens: number): void {
        this.interceptedInput += inputTokens;
        this.interceptedOutput += outputTokens;
        this.lastInterceptAt = new Date();
    }

    resetIntercepted(): void {
        this.interceptedInput = 0;
        this.interceptedOutput = 0;
        this.lastInterceptAt = null;
    }

    async poll(): Promise<AIToolUsage> {
        const apiKey = await this.resolveKey(GEMINI_SECRET_KEY, ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY']);
        if (!apiKey) {
            this.lastPollOk = false;
            this.lastPollAt = new Date();
            return this.makeUsage({ isConfigured: false });
        }

        try {
            const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
            );
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            await resp.json();

            const used = this.interceptedInput + this.interceptedOutput;
            const costUSD = estimateTotalCost(
                this.interceptedInput,
                this.interceptedOutput,
                this.defaultModel
            );

            this.markOk();
            return this.makeUsage({
                used,
                costUSD,
                model: this.defaultModel,
                isConfigured: true,
                lastUsed: this.lastInterceptAt
            });
        } catch (err) {
            logger.warn('GeminiTracker poll failed', err);
            return this.markFail(err);
        }
    }
}
