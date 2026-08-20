import { z } from 'zod';
import { BUILTIN_RESOURCE, registerTool } from '../registry';
import { triggerClientCallback } from '../rpc';
import { playerExists } from '../util/players';
import { safeStringify } from '../../shared/stringify';
import { executeLuaInCurrentRuntime, type ExecResult } from '../../shared/luaExecutor';

type CodeLanguage = 'javascript' | 'lua';

export function registerExecuteCode(): void {
    registerTool({
        name: 'execute_code',
        config: {
            description:
                "Execute JavaScript or Lua in Lavender's server runtime or on selected connected clients. Returns the value and direct console output. Code runs in Lavender's runtime, not another resource's private environment. This is arbitrary code execution for local development only.",
            inputSchema: z.object({
                target: z
                    .union([z.literal('server'), z.array(z.number().int().nonnegative()).min(1)])
                    .describe(
                        'Where to run: the string "server", or an array of client server IDs.',
                    ),
                language: z
                    .enum(['javascript', 'lua'])
                    .optional()
                    .describe('Source language. Defaults to "javascript" for compatibility.'),
                code: z
                    .string()
                    .describe(
                        'Source code. Use `return <expr>` to capture a value. Lua execution is synchronous; create a thread for background work instead of yielding the chunk.',
                    ),
                timeoutMs: z
                    .number()
                    .min(100)
                    .max(60000)
                    .optional()
                    .describe('Per-client timeout (clients only). Defaults to 10000.'),
            }),
        },
        handler: async ({ target, language, code, timeoutMs }) => {
            const selectedLanguage: CodeLanguage = language ?? 'javascript';
            if (target === 'server') {
                return runOnServer(code, selectedLanguage);
            }
            return runOnClients(target, selectedLanguage, code, timeoutMs ?? 10000);
        },
        registeredBy: BUILTIN_RESOURCE,
    });
}

export async function runOnServer(code: string, language: CodeLanguage) {
    if (language === 'lua') {
        return formatServerResult(executeLuaInCurrentRuntime(code));
    }

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
        const payload: ExecResult = {
            ok: true,
            value: safeStringify(value),
            output: output.length ? output : undefined,
        };
        return formatServerResult(payload);
    } catch (err) {
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        return formatServerResult({
            ok: false,
            error: msg,
            output: output.length ? output : undefined,
        });
    } finally {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
    }
}

function formatServerResult(result: ExecResult) {
    return {
        ...(result.ok ? {} : { isError: true }),
        content: [
            {
                type: 'text' as const,
                text: `[server]\n${JSON.stringify(result, null, 2)}`,
            },
        ],
    };
}

export async function runOnClients(
    serverIds: number[],
    language: CodeLanguage,
    code: string,
    timeoutMs: number,
) {
    const results = await Promise.all(
        serverIds.map(async (serverId) => {
            if (!playerExists(serverId)) {
                return { serverId, ok: false, error: 'player not connected' };
            }
            try {
                const args = await triggerClientCallback(
                    serverId,
                    'execute_code',
                    [code, language],
                    { timeoutMs },
                );
                const result = (args[0] ?? {}) as ExecResult;
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
