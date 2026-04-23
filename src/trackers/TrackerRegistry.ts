import * as vscode from 'vscode';
import { BaseTracker } from './BaseTracker';
import { ClaudeTracker, CLAUDE_SECRET_KEY } from './ClaudeTracker';
import { CopilotTracker, COPILOT_SECRET_KEY } from './CopilotTracker';
import { OpenAITracker, OPENAI_SECRET_KEY } from './OpenAITracker';
import { AIToolUsage } from '../types';
import { logger } from '../utils/logger';

export const SECRET_KEY_BY_TOOL: Record<string, string | null> = {
    Claude: CLAUDE_SECRET_KEY,
    Copilot: COPILOT_SECRET_KEY,
    Codex: OPENAI_SECRET_KEY
};

export class TrackerRegistry {
    private trackers: BaseTracker[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.trackers = [
            new ClaudeTracker(context),
            new CopilotTracker(context),
            new OpenAITracker(context)
        ];
    }

    all(): BaseTracker[] {
        return this.trackers;
    }

    byShortName(shortName: string): BaseTracker | undefined {
        return this.trackers.find(t => t.shortName === shortName);
    }

    async pollAll(): Promise<AIToolUsage[]> {
        const results = await Promise.all(
            this.trackers.map(async tracker => {
                try {
                    return await tracker.poll();
                } catch (err) {
                    logger.error(`Tracker ${tracker.shortName} threw`, err);
                    return {
                        name: tracker.name,
                        shortName: tracker.shortName,
                        model: tracker.defaultModel,
                        used: 0,
                        limit: tracker.defaultLimit,
                        costUSD: 0,
                        lastUsed: null,
                        resetDate: new Date(),
                        isConfigured: false,
                        isStale: true
                    } as AIToolUsage;
                }
            })
        );
        return results;
    }
}
