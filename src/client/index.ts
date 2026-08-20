import { EVENT_RESULT, EVENT_TRIGGER } from '../shared/events';
import { safeStringify } from '../shared/stringify';
import { executeLuaInCurrentRuntime, type ExecResult } from '../shared/luaExecutor';

type CallbackHandler = (...args: unknown[]) => unknown[] | Promise<unknown[]>;

const handlers = new Map<string, CallbackHandler>();

function registerClientCallback(name: string, handler: CallbackHandler): void {
    handlers.set(name, handler);
}

onNet(EVENT_TRIGGER, async (name: string, requestId: number, ...args: unknown[]) => {
    const handler = handlers.get(name);
    if (!handler) {
        emitNet(EVENT_RESULT, requestId, {
            ok: false,
            error: `Unknown client callback: ${name}`,
        });
        return;
    }
    try {
        const result = await handler(...args);
        emitNet(EVENT_RESULT, requestId, ...result);
    } catch (err) {
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        emitNet(EVENT_RESULT, requestId, { ok: false, error: msg });
    }
});

registerClientCallback('execute_code', async (code, language) => [
    await executeCodeOnClient(code, language),
]);

export async function executeCodeOnClient(code: unknown, language: unknown): Promise<ExecResult> {
    if (language === 'lua') {
        return executeLuaInCurrentRuntime(String(code));
    }
    if (language !== undefined && language !== 'javascript') {
        return { ok: false, error: `Unsupported code language: ${String(language)}` };
    }
    return executeJavaScriptOnClient(String(code));
}

async function executeJavaScriptOnClient(code: string): Promise<ExecResult> {
    // Per-call console capture for execute_code only.
    const output: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    const formatArgs = (args: unknown[]) =>
        args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');

    console.log = (...args: unknown[]) => {
        output.push(formatArgs(args));
        origLog.apply(console, args as []);
    };
    console.warn = (...args: unknown[]) => {
        output.push('[WARN] ' + formatArgs(args));
        origWarn.apply(console, args as []);
    };
    console.error = (...args: unknown[]) => {
        output.push('[ERROR] ' + formatArgs(args));
        origError.apply(console, args as []);
    };

    let result: ExecResult;
    try {
        const fn = new Function(code);
        const value = await fn();
        result = {
            ok: true,
            value: safeStringify(value),
            output: output.length ? output : undefined,
        };
    } catch (err) {
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        result = { ok: false, error: msg, output: output.length ? output : undefined };
    } finally {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
    }

    return result;
}
