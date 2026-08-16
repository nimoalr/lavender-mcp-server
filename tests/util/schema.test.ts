import { describe, expect, it } from 'vitest';
import { convertExternalSchema } from '../../src/server/util/schema';

describe('convertExternalSchema', () => {
    it('returns an empty object schema for undefined input', () => {
        const result = convertExternalSchema(undefined);
        expect(result.parse({})).toEqual({});
    });

    it('converts a required string field', () => {
        const s = convertExternalSchema({ name: { type: 'string' } });
        expect(s.parse({ name: 'foo' })).toEqual({ name: 'foo' });
        expect(() => s.parse({})).toThrow();
        expect(() => s.parse({ name: 42 })).toThrow();
    });

    it('marks optional fields as optional', () => {
        const s = convertExternalSchema({ note: { type: 'string', optional: true } });
        expect(s.parse({})).toEqual({});
        expect(s.parse({ note: 'hi' })).toEqual({ note: 'hi' });
    });

    it('applies number bounds and integer constraint', () => {
        const s = convertExternalSchema({
            count: { type: 'number', integer: true, min: 1, max: 100 },
        });
        expect(s.parse({ count: 50 })).toEqual({ count: 50 });
        expect(() => s.parse({ count: 0 })).toThrow();
        expect(() => s.parse({ count: 101 })).toThrow();
        expect(() => s.parse({ count: 1.5 })).toThrow();
    });

    it('converts enum to a Zod enum', () => {
        const s = convertExternalSchema({
            status: { type: 'enum', values: ['open', 'closed'] },
        });
        expect(s.parse({ status: 'open' })).toEqual({ status: 'open' });
        expect(() => s.parse({ status: 'pending' })).toThrow();
    });

    it('throws when enum.values is missing or empty', () => {
        expect(() =>
            convertExternalSchema({ x: { type: 'enum' } as unknown as never }),
        ).toThrow(/values/);
        expect(() =>
            convertExternalSchema({
                x: { type: 'enum', values: [] } as unknown as never,
            }),
        ).toThrow(/values/);
    });

    it('converts array fields with item schema and minItems', () => {
        const s = convertExternalSchema({
            ids: {
                type: 'array',
                items: { type: 'number', integer: true },
                minItems: 1,
            },
        });
        expect(s.parse({ ids: [1, 2, 3] })).toEqual({ ids: [1, 2, 3] });
        expect(() => s.parse({ ids: [] })).toThrow();
        expect(() => s.parse({ ids: [1.5] })).toThrow();
        expect(() => s.parse({ ids: ['a'] })).toThrow();
    });

    it('throws when array.items is missing', () => {
        expect(() =>
            convertExternalSchema({ xs: { type: 'array' } as unknown as never }),
        ).toThrow(/items/);
    });

    it('attaches description (informational; not asserted via parse)', () => {
        const schema = convertExternalSchema({
            name: { type: 'string', description: 'Display name' },
        });
        expect(schema.shape.name).toBeDefined();
    });

    it('rejects unknown field types', () => {
        expect(() =>
            convertExternalSchema({
                broken: { type: 'object' } as unknown as never,
            }),
        ).toThrow(/Unsupported/);
    });

    it('rejects invalid constraints', () => {
        expect(() =>
            convertExternalSchema({
                count: { type: 'number', min: 10, max: 1 },
            }),
        ).toThrow(/min cannot exceed max/);
        expect(() =>
            convertExternalSchema({
                ids: {
                    type: 'array',
                    items: { type: 'number' },
                    minItems: -1,
                },
            }),
        ).toThrow(/minItems/);
    });

    it('converts boolean fields', () => {
        const s = convertExternalSchema({ on: { type: 'boolean', optional: true } });
        expect(s.parse({ on: true })).toEqual({ on: true });
        expect(s.parse({})).toEqual({});
        expect(() => s.parse({ on: 'true' })).toThrow();
    });
});
