import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BaseTracker } from './BaseTracker';
import { AIToolUsage } from '../types';
import { logger } from '../utils/logger';

type ServiceQuotasModule = typeof import('@aws-sdk/client-service-quotas');

export class CodeWhispererTracker extends BaseTracker {
    readonly name = 'Amazon CodeWhisperer';
    readonly shortName = 'CodeWhisperer';
    readonly defaultModel = 'codewhisperer';
    readonly defaultLimit = 50_000;

    private interceptedCompletions = 0;
    private lastInterceptAt: Date | null = null;

    recordCompletion(): void {
        this.interceptedCompletions += 1;
        this.lastInterceptAt = new Date();
    }

    isConfigured(): boolean {
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            return true;
        }
        if (process.env.AWS_PROFILE) {
            return true;
        }
        try {
            const credsPath = path.join(os.homedir(), '.aws', 'credentials');
            return fs.existsSync(credsPath);
        } catch {
            return false;
        }
    }

    async poll(): Promise<AIToolUsage> {
        if (!this.isConfigured()) {
            this.lastPollOk = false;
            this.lastPollAt = new Date();
            return this.makeUsage({ isConfigured: false });
        }

        try {
            let quotaLimit = this.getLimit();
            try {
                const mod: ServiceQuotasModule = await import('@aws-sdk/client-service-quotas');
                const client = new mod.ServiceQuotasClient({});
                const command = new mod.ListServiceQuotasCommand({ ServiceCode: 'codewhisperer' });
                const result = await client.send(command);
                const quotas = result.Quotas ?? [];
                for (const q of quotas) {
                    if (typeof q.Value === 'number' && q.Value > 0) {
                        quotaLimit = Math.max(quotaLimit, q.Value);
                    }
                }
            } catch (sdkErr) {
                logger.debug('CodeWhisperer SDK unavailable or call failed', sdkErr);
            }

            this.markOk();
            return this.makeUsage({
                used: this.interceptedCompletions,
                limit: quotaLimit,
                costUSD: 0,
                model: this.defaultModel,
                isConfigured: true,
                lastUsed: this.lastInterceptAt
            });
        } catch (err) {
            logger.warn('CodeWhispererTracker poll failed', err);
            return this.markFail(err);
        }
    }
}
