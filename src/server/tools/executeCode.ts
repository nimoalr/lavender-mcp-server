import { z } from 'zod';
import { BUILTIN_RESOURCE, registerTool } from '../registry';
import { triggerClientCallback } from '../rpc';
import { playerExists } from '../util/players';
import { safeStringify } from '../../shared/stringify';

interface ClientExecResult {
    ok: boolean;
    value?: string;
    error?: string;
    output?: string[];
}

export function registerExecuteCode(): void {
    registerTool({
        name: 'execute_code',
        config: {
            description:
                'Execute JavaScript in the server runtime or selected connected clients. Returns the value and console output. This is arbitrary code execution for local development only.',
            inputSchema: z.object({
                target: z
                    .union([z.literal('server'), z.array(z.number().int().nonnegative()).min(1)])
                    .describe(
                        'Where to run: the string "server", or an array of client server IDs.',
                    ),
                code: z.string().describe('JavaScript source. Use `return <expr>` to capture a value.'),
                timeoutMs: z
                    .number()
                    .min(100)
                    .max(60000)
                    .optional()
                    .describe('Per-client timeout (clients only). Defaults to 10000.'),
            }),
        },
        handler: async ({ target, code, timeoutMs }) => {
            if (target === 'server') {
                return runOnServer(code);
            }
            return runOnClients(target, code, timeoutMs ?? 10000);
        },
        registeredBy: BUILTIN_RESOURCE,
    });
}

async function runOnServer(code: string) {
    const output: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    const fmt = (args: unknown[]) =>
        args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');

    console.log = (...args: unknown[]) => {
        output.push(fmt(args));
        origLog.apply(console, args as []);
    };
    console.warn = (...args: unknown[]) => {
        output.push('[WARN] ' + fmt(args));
        origWarn.apply(console, args as []);
    };
    console.error = (...args: unknown[]) => {
        output.push('[ERROR] ' + fmt(args));
        origError.apply(console, args as []);
    };

    try {
        const fn = new Function(code);
        const value = await fn();
        const payload = {
            ok: true,
            value: safeStringify(value),
            output: output.length ? output : undefined,
        };
        return {
            content: [{ type: 'text' as const, text: `[server]\n${JSON.stringify(payload, null, 2)}` }],
        };
    } catch (err) {
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        const payload = { ok: false, error: msg, output: output.length ? output : undefined };
        return {
            isError: true,
            content: [{ type: 'text' as const, text: `[server]\n${JSON.stringify(payload, null, 2)}` }],
        };
    } finally {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
    }
}

async function runOnClients(serverIds: number[], code: string, timeoutMs: number) {
    const results = await Promise.all(
        serverIds.map(async (serverId) => {
            if (!playerExists(serverId)) {
                return { serverId, ok: false, error: 'player not connected' };
            }
            try {
                const args = await triggerClientCallback(
                    serverId,
                    'execute_code',
                    [code],
                    { timeoutMs },
                );
                const result = (args[0] ?? {}) as ClientExecResult;
                return { serverId, ...result };
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return { serverId, ok: false, error: msg };
            }
        }),
    );
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
    };
}
