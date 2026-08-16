// Mini-DSL → Zod converter for tool input schemas declared by other
// resources over the `exports` boundary. Plain JSON-serializable shape so
// callers don't need to import Zod (which wouldn't cross the isolate hop).

import { z } from 'zod';

export type ExternalSchemaField =
    | {
          type: 'string';
          description?: string;
          optional?: boolean;
      }
    | {
          type: 'number';
          description?: string;
          optional?: boolean;
          min?: number;
          max?: number;
          integer?: boolean;
      }
    | {
          type: 'boolean';
          description?: string;
          optional?: boolean;
      }
    | {
          type: 'enum';
          values: string[];
          description?: string;
          optional?: boolean;
      }
    | {
          type: 'array';
          items: ExternalSchemaField;
          description?: string;
          optional?: boolean;
          minItems?: number;
      };

export type ExternalInputSchema = Record<string, ExternalSchemaField>;

function fieldToZod(field: ExternalSchemaField): z.ZodTypeAny {
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
        throw new Error('schema field must be an object');
    }
    if (field.description !== undefined && typeof field.description !== 'string') {
        throw new Error('schema field description must be a string');
    }
    if (field.optional !== undefined && typeof field.optional !== 'boolean') {
        throw new Error('schema field optional must be a boolean');
    }

    let zod: z.ZodTypeAny;
    switch (field.type) {
        case 'string':
            zod = z.string();
            break;
        case 'number': {
            if (field.min !== undefined && (typeof field.min !== 'number' || !Number.isFinite(field.min))) {
                throw new Error('number field min must be finite');
            }
            if (field.max !== undefined && (typeof field.max !== 'number' || !Number.isFinite(field.max))) {
                throw new Error('number field max must be finite');
            }
            if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
                throw new Error('number field min cannot exceed max');
            }
            if (field.integer !== undefined && typeof field.integer !== 'boolean') {
                throw new Error('number field integer must be a boolean');
            }
            let n = z.number();
            if (field.integer) n = n.int();
            if (typeof field.min === 'number') n = n.min(field.min);
            if (typeof field.max === 'number') n = n.max(field.max);
            zod = n;
            break;
        }
        case 'boolean':
            zod = z.boolean();
            break;
        case 'enum': {
            if (
                !Array.isArray(field.values) ||
                field.values.length === 0 ||
                field.values.some((value) => typeof value !== 'string' || value.length === 0)
            ) {
                throw new Error('enum field requires a non-empty array of non-empty string values');
            }
            zod = z.enum(field.values as [string, ...string[]]);
            break;
        }
        case 'array': {
            if (!field.items) {
                throw new Error('array field requires `items`');
            }
            if (
                field.minItems !== undefined &&
                (!Number.isInteger(field.minItems) || field.minItems < 0)
            ) {
                throw new Error('array field minItems must be a non-negative integer');
            }
            let a = z.array(fieldToZod(field.items));
            if (field.minItems !== undefined) a = a.min(field.minItems);
            zod = a;
            break;
        }
        default:
            throw new Error(`Unsupported schema field type: ${(field as { type: string }).type}`);
    }
    if (field.description) zod = zod.describe(field.description);
    if (field.optional) zod = zod.optional();
    return zod;
}

export function convertExternalSchema(
    schema: ExternalInputSchema | undefined,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const out: Record<string, z.ZodTypeAny> = {};
    if (schema) {
        for (const [key, field] of Object.entries(schema)) {
            out[key] = fieldToZod(field);
        }
    }
    return z.object(out);
}
