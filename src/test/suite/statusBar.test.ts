import * as assert from 'assert';
import { formatK } from '../../utils/formatters';

suite('statusBar helpers', () => {
    test('formatK — sub-1k returns raw number', () => {
        assert.strictEqual(formatK(5), '5');
        assert.strictEqual(formatK(999), '999');
    });

    test('formatK — 1k-10k uses one decimal', () => {
        assert.strictEqual(formatK(1_200), '1.2k');
        assert.strictEqual(formatK(9_999), '10k');
    });

    test('formatK — >=10k rounds to whole k', () => {
        assert.strictEqual(formatK(45_000), '45k');
        assert.strictEqual(formatK(74_500), '75k');
    });

    test('formatK — millions use m suffix', () => {
        assert.strictEqual(formatK(1_200_000), '1.2m');
    });
});
