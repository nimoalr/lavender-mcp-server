import { timingSafeEqual } from 'node:crypto';

export const MIN_TOKEN_LENGTH = 32;

// Refuse to start when the token matches a copy-paste value
// from the example config.
export const TOKEN_PLACEHOLDERS: ReadonlySet<string> = new Set([
    '',
    'CHANGE_ME',
    'change-me',
    'change_me',
    'your-token-here',
    'YOUR_TOKEN',
    'your_token',
    'your-secret-here',
    'lavender_mcp_token',
    'placeholder',
    'REPLACE_ME',
    'REPLACE_ME_WITH_A_LONG_RANDOM_STRING',
    'REPLACE_WITH_A_LONG_RANDOM_STRING',
    '$(openssl rand -hex 24)',
]);

export type TokenCheckResult =
    | { ok: true }
    | { ok: false; reason: 'placeholder' | 'too_short'; length?: number };

export function validateToken(token: string): TokenCheckResult {
    if (TOKEN_PLACEHOLDERS.has(token)) return { ok: false, reason: 'placeholder' };
    if (token.length < MIN_TOKEN_LENGTH) {
        return { ok: false, reason: 'too_short', length: token.length };
    }
    return { ok: true };
}

export function safeStringEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}
