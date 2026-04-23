import { PricingTable, ModelPricing } from '../types';

export const DEFAULT_PRICING: PricingTable = {
    'claude-sonnet-4':    { input: 3.00,  output: 15.00 },
    'claude-haiku-4':     { input: 0.25,  output: 1.25  },
    'claude-opus-4':      { input: 15.00, output: 75.00 },
    'claude-3-5-sonnet':  { input: 3.00,  output: 15.00 },
    'claude-3-5-haiku':   { input: 0.80,  output: 4.00  },
    'claude-3-opus':      { input: 15.00, output: 75.00 },
    'gpt-4o':             { input: 2.50,  output: 10.00 },
    'gpt-4o-mini':        { input: 0.15,  output: 0.60  },
    'gpt-4-turbo':        { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo':      { input: 0.50,  output: 1.50  },
    'code-davinci':       { input: 2.00,  output: 2.00  },
    'gemini-1.5-pro':     { input: 1.25,  output: 5.00  },
    'gemini-1.5-flash':   { input: 0.075, output: 0.30  },
    'gemini-2.0-flash':   { input: 0.10,  output: 0.40  },
    'copilot-chat':       { input: 0.00,  output: 0.00  },
    'tabnine-pro':        { input: 0.00,  output: 0.00  },
    'cursor-default':     { input: 0.00,  output: 0.00  },
    'codewhisperer':      { input: 0.00,  output: 0.00  }
};

function normalize(model: string): string {
    return model.toLowerCase().replace(/[^a-z0-9\-.]/g, '');
}

export function resolvePricing(model: string, overrides?: PricingTable): ModelPricing {
    const merged: PricingTable = { ...DEFAULT_PRICING, ...(overrides ?? {}) };
    const norm = normalize(model);
    if (merged[model]) {
        return merged[model];
    }
    if (merged[norm]) {
        return merged[norm];
    }
    const keys = Object.keys(merged).sort((a, b) => b.length - a.length);
    for (const key of keys) {
        if (norm.startsWith(normalize(key))) {
            return merged[key];
        }
    }
    for (const key of keys) {
        if (norm.includes(normalize(key))) {
            return merged[key];
        }
    }
    return { input: 0, output: 0 };
}

export function estimateCost(
    tokens: number,
    model: string,
    direction: 'input' | 'output',
    overrides?: PricingTable
): number {
    if (tokens <= 0) {
        return 0;
    }
    const pricing = resolvePricing(model, overrides);
    const perMillion = direction === 'input' ? pricing.input : pricing.output;
    return (tokens / 1_000_000) * perMillion;
}

export function estimateTotalCost(
    inputTokens: number,
    outputTokens: number,
    model: string,
    overrides?: PricingTable
): number {
    return (
        estimateCost(inputTokens, model, 'input', overrides) +
        estimateCost(outputTokens, model, 'output', overrides)
    );
}
