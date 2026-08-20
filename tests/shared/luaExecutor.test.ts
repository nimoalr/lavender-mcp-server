import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    executeLuaInCurrentRuntime,
    LUA_EXECUTOR_EXPORT,
} from '../../src/shared/luaExecutor';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Lua runtime bridge', () => {
    it('invokes the current resource Lua export and normalises its result', () => {
        const evaluator = vi.fn(() => ({
            ok: true,
            value: '{["answer"] = 42}',
            output: ['hello', 123],
        }));
        vi.stubGlobal('GetCurrentResourceName', () => 'lavender-mcp-server');
        vi.stubGlobal('exports', {
            'lavender-mcp-server': { [LUA_EXECUTOR_EXPORT]: evaluator },
        });

        expect(executeLuaInCurrentRuntime('return { answer = 42 }')).toEqual({
            ok: true,
            value: '{["answer"] = 42}',
            output: ['hello'],
        });
        expect(evaluator).toHaveBeenCalledWith('return { answer = 42 }');
    });

    it('returns a useful error when the Lua evaluator is unavailable', () => {
        vi.stubGlobal('GetCurrentResourceName', () => 'lavender-mcp-server');
        vi.stubGlobal('exports', { 'lavender-mcp-server': {} });

        expect(executeLuaInCurrentRuntime('return 1')).toMatchObject({
            ok: false,
            error: expect.stringContaining('Lua evaluator is unavailable'),
        });
    });

    it('rejects malformed evaluator results and thrown bridge errors', () => {
        vi.stubGlobal('GetCurrentResourceName', () => 'lavender-mcp-server');
        vi.stubGlobal('exports', {
            'lavender-mcp-server': {
                [LUA_EXECUTOR_EXPORT]: vi
                    .fn()
                    .mockReturnValueOnce('bad')
                    .mockImplementationOnce(() => {
                        throw new Error('bridge failed');
                    }),
            },
        });

        expect(executeLuaInCurrentRuntime('return 1')).toEqual({
            ok: false,
            error: 'Lua evaluator returned an invalid result.',
        });
        expect(executeLuaInCurrentRuntime('return 2')).toMatchObject({
            ok: false,
            error: expect.stringContaining('bridge failed'),
        });
    });
});
