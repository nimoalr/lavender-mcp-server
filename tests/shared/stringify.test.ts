import { describe, expect, it } from 'vitest';
import { safeStringify } from '../../src/shared/stringify';

describe('safeStringify', () => {
    it('handles undefined', () => {
        expect(safeStringify(undefined)).toBe('undefined');
    });

    it('handles primitives', () => {
        expect(safeStringify(null)).toBe('null');
        expect(safeStringify(42)).toBe('42');
        expect(safeStringify(true)).toBe('true');
        expect(safeStringify('hello')).toBe('"hello"');
    });

    it('JSON-stringifies plain objects with two-space indent', () => {
        const result = safeStringify({ a: 1, b: 'two' });
        expect(result).toContain('"a": 1');
        expect(result).toContain('"b": "two"');
        expect(result).toContain('\n  ');
    });

    it('JSON-stringifies arrays', () => {
        expect(safeStringify([1, 2, 3])).toContain('1');
    });

    it('serialises BigInt as decimal string instead of throwing', () => {
        const result = safeStringify({ big: BigInt('9007199254740993') });
        expect(result).toContain('"9007199254740993"');
    });

    it('serialises Error with name + message + stack', () => {
        const result = safeStringify(new Error('boom'));
        const parsed = JSON.parse(result);
        expect(parsed.name).toBe('Error');
        expect(parsed.message).toBe('boom');
        expect(typeof parsed.stack).toBe('string');
    });

    it('falls back to String() on circular references', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        const result = safeStringify(cyclic);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('describes functions', () => {
        function named() {}
        expect(safeStringify(named)).toBe('[Function named]');
        expect(safeStringify(() => 1)).toContain('[Function');
    });
});
