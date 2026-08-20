export interface ExecResult {
    ok: boolean;
    value?: string;
    error?: string;
    output?: string[];
}

export const LUA_EXECUTOR_EXPORT = '__lavenderExecuteLua';

export function executeLuaInCurrentRuntime(code: string): ExecResult {
    const resourceName = GetCurrentResourceName();
    const runtimeExports = (
        globalThis as unknown as {
            exports?: Record<string, Record<string, unknown>>;
        }
    ).exports;
    const evaluator = runtimeExports?.[resourceName]?.[LUA_EXECUTOR_EXPORT];
    if (typeof evaluator !== 'function') {
        return {
            ok: false,
            error: 'Lua evaluator is unavailable. Ensure runtime/luaExecutor.lua is loaded before the JavaScript bundle.',
        };
    }

    try {
        return normaliseExecResult(evaluator(code));
    } catch (err) {
        const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
        return { ok: false, error: message };
    }
}

function normaliseExecResult(value: unknown): ExecResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'Lua evaluator returned an invalid result.' };
    }

    const raw = value as Record<string, unknown>;
    const ok = raw.ok === true;
    const result: ExecResult = { ok };

    if (typeof raw.value === 'string') result.value = raw.value;
    if (typeof raw.error === 'string') result.error = raw.error;
    if (Array.isArray(raw.output)) {
        const output = raw.output.filter((line): line is string => typeof line === 'string');
        if (output.length > 0) result.output = output;
    }

    if (!ok && !result.error) result.error = 'Lua execution failed without an error message.';
    return result;
}
