import { describe, expect, it } from 'vitest';
import { validateExternalToolDefinition } from '../src/server/exports';

describe('validateExternalToolDefinition', () => {
    it('accepts a complete definition', () => {
        const definition = {
            name: 'get_status',
            description: 'Return status.',
            inputSchema: { verbose: { type: 'boolean' as const, optional: true } },
            timeoutMs: 5000,
        };
        expect(validateExternalToolDefinition(definition)).toBe(definition);
    });

    it.each(['', 'has spaces', 'has.dot', '../escape', 'a'.repeat(65)])(
        'rejects invalid local tool name %s',
        (name) => {
            expect(() => validateExternalToolDefinition({ name })).toThrow(/definition\.name/);
        },
    );

    it.each([99, 300001, 100.5, Number.NaN])('rejects invalid timeout %s', (timeoutMs) => {
        expect(() => validateExternalToolDefinition({ name: 'valid', timeoutMs })).toThrow(
            /timeoutMs/,
        );
    });

    it('rejects malformed optional fields', () => {
        expect(() =>
            validateExternalToolDefinition({ name: 'valid', description: 42 }),
        ).toThrow(/description/);
        expect(() =>
            validateExternalToolDefinition({ name: 'valid', inputSchema: [] }),
        ).toThrow(/inputSchema/);
    });
});
