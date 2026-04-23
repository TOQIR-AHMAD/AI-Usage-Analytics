import { BaseTracker } from './BaseTracker';
import { AIToolUsage } from '../types';
import { logger } from '../utils/logger';

export const TABNINE_SECRET_KEY = 'aiUsageTracker.apiKey.Tabnine';

export class TabnineTracker extends BaseTracker {
    readonly name = 'Tabnine';
    readonly shortName = 'Tabnine';
    readonly defaultModel = 'tabnine-pro';
    readonly defaultLimit = 10_000;

    private localCompletions = 0;
    private lastInterceptAt: Date | null = null;

    recordCompletion(): void {
        this.localCompletions += 1;
        this.lastInterceptAt = new Date();
    }

    async isConfigured(): Promise<boolean> {
        const key = await this.getSecret(TABNINE_SECRET_KEY);
        if (typeof key === 'string' && key.length > 0) {
            return true;
        }
        return this.localCompletions > 0;
    }

    async poll(): Promise<AIToolUsage> {
        const token = await this.getSecret(TABNINE_SECRET_KEY);

        if (token) {
            try {
                const resp = await fetch('https://api.tabnine.com/usage', {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                if (resp.ok) {
                    const payload = (await resp.json()) as {
                        completions?: number;
                        tokens?: number;
                        limit?: number;
                    };
                    const used = payload.tokens ?? payload.completions ?? this.localCompletions;
                    this.markOk();
                    return this.makeUsage({
                        used,
                        limit: payload.limit ?? this.getLimit(),
                        isConfigured: true,
                        model: this.defaultModel,
                        lastUsed: this.lastInterceptAt ?? new Date()
                    });
                }
                logger.debug('Tabnine API non-OK response', resp.status);
            } catch (err) {
                logger.debug('Tabnine API call failed, falling back to local count', err);
            }
        }

        if (this.localCompletions > 0) {
            this.markOk();
            return this.makeUsage({
                used: this.localCompletions,
                isConfigured: true,
                model: this.defaultModel,
                lastUsed: this.lastInterceptAt
            });
        }

        this.lastPollOk = false;
        this.lastPollAt = new Date();
        return this.makeUsage({ isConfigured: false });
    }
}
