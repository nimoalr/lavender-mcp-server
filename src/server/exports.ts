// Server-side exports for other resources. Read-only status calls plus
// ACE-gated tool registration; tools auto-unregister when the owning
// resource stops.

import { getListeningPort, isListening } from './http';
import {
    BUILTIN_RESOURCE,
    isBuiltInTool,
    isToolRegistered,
    listToolSummaries,
    registerTool,
    unregisterByResource,
    unregisterTool,
} from './registry';
import {
    convertExternalSchema,
    type ExternalInputSchema,
} from './util/schema';
import type { StandardSchemaV1 } from '@modelcontextprotocol/server';

const ACE_REGISTER_TOOL = 'lavender_mcp.register_tool';
const DEFAULT_HANDLER_TIMEOUT_MS = 30000;
const MIN_HANDLER_TIMEOUT_MS = 100;
const MAX_HANDLER_TIMEOUT_MS = 300000;
const LOCAL_TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export interface ExternalToolDefinition {
    name: string;
    description?: string;
    inputSchema?: ExternalInputSchema;
    timeoutMs?: number;
}

type ExternalToolHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

export type RegisterToolResult =
    | { ok: true; fullName: string }
    | { ok: false; error: string };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
        promise.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            (e) => {
                clearTimeout(timer);
                reject(e);
            },
        );
    });
}

function isCallToolResult(value: unknown): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        'content' in value &&
        Array.isArray((value as { content: unknown }).content)
    );
}

// Coerce any handler return value into a text block. `text: undefined`
// would fail Zod validation on the way back out.
function valueToText(v: unknown): string {
    if (v === undefined) return '(no return value)';
    if (v === null) return 'null';
    if (typeof v === 'string') return v;
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
}

export function registerExports(): void {
    exports('isAvailable', (): boolean => isListening());

    exports('getPort', (): number | null => getListeningPort());

    exports('getRegisteredTools', (): Array<{ name: string; registeredBy: string }> =>
        listToolSummaries(),
    );

    exports(
        'registerTool',
        (
            definition: ExternalToolDefinition,
            handler: ExternalToolHandler,
        ): RegisterToolResult => {
            // Programmer errors (wrong arg shape, called from us): throw.
            const caller = (GetInvokingResource() as string | null) ?? null;
            if (!caller) {
                throw new Error(
                    'registerTool must be called from another resource (GetInvokingResource returned null).',
                );
            }
            if (caller === BUILTIN_RESOURCE) {
                throw new Error('registerTool cannot be called from lavender-mcp-server itself.');
            }
            definition = validateExternalToolDefinition(definition);
            if (typeof handler !== 'function') {
                throw new Error('registerTool requires a handler function as the second argument.');
            }

            const localName = definition.name;
            const fullName = `${caller}.${localName}`;

            // Expected failures: return a tagged result instead of
            // throwing across the CFX function-reference boundary
            // (throws produce a noisy `Error in call ref` dump even when
            // the caller handles them cleanly).
            if (!IsPrincipalAceAllowed(`resource.${caller}`, ACE_REGISTER_TOOL)) {
                const error =
                    `Resource ${caller} is not authorized to register MCP tools. ` +
                    `Grant the ACE in server.cfg: add_ace resource.${caller} ${ACE_REGISTER_TOOL} allow`;
                console.warn(
                    `^3[lavender-mcp]^7 registerTool denied: ${caller} (missing ${ACE_REGISTER_TOOL} ACE)`,
                );
                return { ok: false, error };
            }

            if (isBuiltInTool(localName) || isBuiltInTool(fullName)) {
                const error = `Tool name conflicts with a built-in: ${localName}`;
                console.warn(
                    `^3[lavender-mcp]^7 registerTool rejected: ${fullName} collides with a built-in`,
                );
                return { ok: false, error };
            }

            if (isToolRegistered(fullName)) {
                const error = `Tool already registered: ${fullName}. Call unregisterTool('${localName}') first.`;
                console.warn(
                    `^3[lavender-mcp]^7 registerTool rejected: ${fullName} already registered`,
                );
                return { ok: false, error };
            }

            let inputSchemaZod: StandardSchemaV1;
            try {
                inputSchemaZod = convertExternalSchema(definition.inputSchema);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`Invalid inputSchema for tool ${localName}: ${msg}`);
            }

            const timeoutMs = definition.timeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;

            registerTool({
                name: fullName,
                config: {
                    description:
                        definition.description ??
                        `Custom tool registered by resource '${caller}'.`,
                    inputSchema: inputSchemaZod,
                },
                handler: async (args: Record<string, unknown>) => {
                    try {
                        const raw = await withTimeout(
                            Promise.resolve().then(() => handler(args)),
                            timeoutMs,
                            `Tool ${fullName} handler`,
                        );
                        if (isCallToolResult(raw)) return raw;
                        return {
                            content: [{ type: 'text' as const, text: valueToText(raw) }],
                        };
                    } catch (err) {
                        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
                        return {
                            isError: true,
                            content: [
                                {
                                    type: 'text' as const,
                                    text: `Tool ${fullName} errored:\n${msg}`,
                                },
                            ],
                        };
                    }
                },
                registeredBy: caller,
            });

            console.log(
                `^5[lavender-mcp]^7 tool registered: ^3${fullName}^7 (by ${caller})`,
            );
            return { ok: true, fullName };
        },
    );

    exports('unregisterTool', (localName: string): boolean => {
        const caller = (GetInvokingResource() as string | null) ?? null;
        if (!caller) {
            throw new Error('unregisterTool must be called from another resource.');
        }
        const fullName = `${caller}.${localName}`;
        const removed = unregisterTool(fullName);
        if (removed) {
            console.log(`^5[lavender-mcp]^7 tool unregistered: ^3${fullName}^7 (by ${caller})`);
        }
        return removed;
    });

    on('onResourceStop', (resourceName: string) => {
        if (resourceName === GetCurrentResourceName()) return;
        const removed = unregisterByResource(resourceName);
        if (removed.length > 0) {
            console.log(
                `^5[lavender-mcp]^7 cleaned up ${removed.length} tool(s) from ${resourceName}: ${removed.join(', ')}`,
            );
        }
    });
}

export function validateExternalToolDefinition(value: unknown): ExternalToolDefinition {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('registerTool definition must be an object.');
    }

    const definition = value as ExternalToolDefinition;
    if (typeof definition.name !== 'string' || !LOCAL_TOOL_NAME.test(definition.name)) {
        throw new Error(
            'registerTool definition.name must contain 1-64 ASCII letters, digits, underscores, or hyphens.',
        );
    }
    if (
        definition.description !== undefined &&
        (typeof definition.description !== 'string' || definition.description.length > 1000)
    ) {
        throw new Error('registerTool definition.description must be a string of at most 1000 characters.');
    }
    if (
        definition.inputSchema !== undefined &&
        (!definition.inputSchema ||
            typeof definition.inputSchema !== 'object' ||
            Array.isArray(definition.inputSchema))
    ) {
        throw new Error('registerTool definition.inputSchema must be an object.');
    }
    if (
        definition.timeoutMs !== undefined &&
        (!Number.isInteger(definition.timeoutMs) ||
            definition.timeoutMs < MIN_HANDLER_TIMEOUT_MS ||
            definition.timeoutMs > MAX_HANDLER_TIMEOUT_MS)
    ) {
        throw new Error(
            `registerTool definition.timeoutMs must be an integer between ${MIN_HANDLER_TIMEOUT_MS} and ${MAX_HANDLER_TIMEOUT_MS}.`,
        );
    }

    return definition;
}
