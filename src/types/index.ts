export interface AIToolUsage {
    name: string;
    shortName: string;
    model: string;
    used: number;
    limit: number;
    costUSD: number;
    lastUsed: Date | null;
    resetDate: Date;
    isConfigured: boolean;
    isStale: boolean;
}

export interface DailyUsage {
    date: string;
    tool: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUSD: number;
    sessionCount: number;
}

export interface SessionRecord {
    id: string;
    timestamp: string;
    tool: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
    durationMs: number;
}

export interface TrackerStatus {
    name: string;
    shortName: string;
    configured: boolean;
    lastPollOk: boolean;
    lastPollAt: Date | null;
    lastError?: string;
}

export interface ModelPricing {
    input: number;
    output: number;
}

export interface PricingTable {
    [model: string]: ModelPricing;
}

export interface AlertState {
    [tool: string]: {
        period: string;
        firedThresholds: number[];
    };
}

export interface ExtensionSettings {
    limits: Record<string, number>;
    pollingIntervalSeconds: number;
    statusBarAlignment: 'Left' | 'Right';
    alertThresholds: number[];
    enableCostEstimates: boolean;
    currency: string;
    resetDay: number;
    dailyDigestTime: string;
    enableDailyDigest: boolean;
    pricingOverrides: PricingTable;
}

export type WebviewInboundMessage =
    | { type: 'resetTool'; toolName: string }
    | { type: 'openSettings' }
    | { type: 'refresh' }
    | { type: 'exportCSV' }
    | { type: 'configureKey'; toolName: string };

export type WebviewOutboundMessage =
    | { type: 'update'; data: AIToolUsage[]; sessions: SessionRecord[]; weekly: DailyUsage[] }
    | { type: 'error'; message: string };
