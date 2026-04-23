import * as assert from 'assert';
import { countTokens, formatTokenCount, estimateCost } from '../../tokenCounter';

suite('tokenCounter', () => {
    test('countTokens returns 0 for empty input', () => {
        assert.strictEqual(countTokens('', 'gpt-4o'), 0);
    });

    test('countTokens returns positive value for typical input', () => {
        const n = countTokens('Hello, world!', 'gpt-4o');
        assert.ok(n >= 1, `expected >= 1, got ${n}`);
    });

    test('countTokens handles unknown model via fallback', () => {
        const n = countTokens('abcd'.repeat(10), 'some-unknown-model');
        assert.ok(n >= 1);
    });

    test('formatTokenCount uses k suffix for large numbers', () => {
        assert.strictEqual(formatTokenCount(45_000), '45k');
    });

    test('formatTokenCount uses comma for small numbers', () => {
        assert.strictEqual(formatTokenCount(123), '123');
        assert.strictEqual(formatTokenCount(1_234), '1,234');
    });

    test('estimateCost returns 0 for zero tokens', () => {
        assert.strictEqual(estimateCost(0, 'gpt-4o', 'input'), 0);
    });

    test('estimateCost scales linearly per 1M', () => {
        const a = estimateCost(1_000_000, 'gpt-4o', 'input');
        const b = estimateCost(500_000, 'gpt-4o', 'input');
        assert.ok(Math.abs(a - 2.5) < 0.01, `expected ~2.5, got ${a}`);
        assert.ok(Math.abs(b - 1.25) < 0.01, `expected ~1.25, got ${b}`);
    });
});
