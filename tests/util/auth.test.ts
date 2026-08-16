import { describe, expect, it } from 'vitest';
import {
    MIN_TOKEN_LENGTH,
    TOKEN_PLACEHOLDERS,
    safeStringEqual,
    validateToken,
} from '../../src/server/util/auth';

describe('validateToken', () => {
    it('rejects empty string as placeholder', () => {
        expect(validateToken('')).toEqual({ ok: false, reason: 'placeholder' });
    });

    it('rejects each known placeholder verbatim', () => {
        for (const placeholder of TOKEN_PLACEHOLDERS) {
            if (placeholder === '') continue;
            expect(validateToken(placeholder)).toEqual({ ok: false, reason: 'placeholder' });
        }
    });

    it('rejects below minimum length with the actual length', () => {
        const tok = 'a'.repeat(MIN_TOKEN_LENGTH - 1);
        expect(validateToken(tok)).toEqual({
            ok: false,
            reason: 'too_short',
            length: MIN_TOKEN_LENGTH - 1,
        });
    });

    it('accepts a token at exactly the minimum length', () => {
        const tok = 'a'.repeat(MIN_TOKEN_LENGTH);
        expect(validateToken(tok)).toEqual({ ok: true });
    });

    it('accepts a long random-ish token', () => {
        const tok = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0';
        expect(validateToken(tok)).toEqual({ ok: true });
    });
});

describe('safeStringEqual', () => {
    it('returns true for equal strings', () => {
        expect(safeStringEqual('foo', 'foo')).toBe(true);
        expect(safeStringEqual('', '')).toBe(true);
    });

    it('returns false for differing same-length strings', () => {
        expect(safeStringEqual('foo', 'bar')).toBe(false);
    });

    it('returns false for different-length strings without throwing', () => {
        expect(safeStringEqual('a', 'aa')).toBe(false);
        expect(safeStringEqual('abc', '')).toBe(false);
    });

    it('handles unicode safely', () => {
        expect(safeStringEqual('héllo', 'héllo')).toBe(true);
        expect(safeStringEqual('héllo', 'hello')).toBe(false);
    });
});
