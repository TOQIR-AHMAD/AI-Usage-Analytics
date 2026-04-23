import * as assert from 'assert';
import { estimateCost, estimateTotalCost, resolvePricing, DEFAULT_PRICING } from '../../utils/costCalculator';

suite('costCalculator', () => {
    test('resolvePricing finds exact match', () => {
        const p = resolvePricing('gpt-4o');
        assert.strictEqual(p.input, DEFAULT_PRICING['gpt-4o'].input);
    });

    test('resolvePricing falls back via prefix match', () => {
        const p = resolvePricing('gpt-4o-2024-11-05');
        assert.strictEqual(p.input, DEFAULT_PRICING['gpt-4o'].input);
    });

    test('resolvePricing returns zero pricing for unknown model', () => {
        const p = resolvePricing('totally-made-up-model');
        assert.strictEqual(p.input, 0);
        assert.strictEqual(p.output, 0);
    });

    test('overrides win over defaults', () => {
        const p = resolvePricing('gpt-4o', { 'gpt-4o': { input: 1, output: 2 } });
        assert.strictEqual(p.input, 1);
        assert.strictEqual(p.output, 2);
    });

    test('estimateCost for input + output matches manual math', () => {
        const input = 100_000;
        const output = 50_000;
        const total = estimateTotalCost(input, output, 'claude-sonnet-4');
        const expected = (100_000 / 1_000_000) * 3 + (50_000 / 1_000_000) * 15;
        assert.ok(Math.abs(total - expected) < 1e-9);
    });

    test('estimateCost ignores negative or zero tokens', () => {
        assert.strictEqual(estimateCost(0, 'gpt-4o', 'input'), 0);
        assert.strictEqual(estimateCost(-500, 'gpt-4o', 'input'), 0);
    });
});
