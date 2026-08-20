import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LUA_EXECUTOR_EXPORT } from '../../src/shared/luaExecutor';

beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('onNet', vi.fn());
    vi.stubGlobal('emitNet', vi.fn());
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('execute_code client language dispatch', () => {
    it('defaults to JavaScript when language is omitted', async () => {
        const { executeCodeOnClient } = await import('../../src/client/index');

        await expect(executeCodeOnClient('return 6 * 7', undefined)).resolves.toEqual({
            ok: true,
            value: '42',
        });
    });

    it('dispatches Lua through the current client runtime export', async () => {
        const evaluator = vi.fn(() => ({ ok: true, value: '42', output: ['client lua'] }));
        vi.stubGlobal('GetCurrentResourceName', () => 'lavender-mcp-server');
        vi.stubGlobal('exports', {
            'lavender-mcp-server': { [LUA_EXECUTOR_EXPORT]: evaluator },
        });
        const { executeCodeOnClient } = await import('../../src/client/index');

        await expect(executeCodeOnClient('return 42', 'lua')).resolves.toEqual({
            ok: true,
            value: '42',
            output: ['client lua'],
        });
        expect(evaluator).toHaveBeenCalledWith('return 42');
    });

    it('rejects unknown languages received outside MCP validation', async () => {
        const { executeCodeOnClient } = await import('../../src/client/index');

        await expect(executeCodeOnClient('return 1', 'python')).resolves.toEqual({
            ok: false,
            error: 'Unsupported code language: python',
        });
    });
});
