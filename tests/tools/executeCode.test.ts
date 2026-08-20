import { afterEach, describe, expect, it, vi } from 'vitest';
import { runOnClients, runOnServer } from '../../src/server/tools/executeCode';
import { initRpc } from '../../src/server/rpc';
import { LUA_EXECUTOR_EXPORT } from '../../src/shared/luaExecutor';

afterEach(() => {
    delete (globalThis as { source?: unknown }).source;
    vi.unstubAllGlobals();
});

describe('execute_code server language dispatch', () => {
    it('preserves JavaScript execution', async () => {
        const result = await runOnServer('return 6 * 7', 'javascript');

        expect(result).not.toHaveProperty('isError');
        expect(JSON.parse(result.content[0].text.split('\n').slice(1).join('\n'))).toEqual({
            ok: true,
            value: '42',
        });
    });

    it('dispatches Lua to the shared runtime export', async () => {
        const evaluator = vi.fn(() => ({ ok: true, value: '42', output: ['lua output'] }));
        vi.stubGlobal('GetCurrentResourceName', () => 'lavender-mcp-server');
        vi.stubGlobal('exports', {
            'lavender-mcp-server': { [LUA_EXECUTOR_EXPORT]: evaluator },
        });

        const result = await runOnServer('print("lua output"); return 42', 'lua');

        expect(result).not.toHaveProperty('isError');
        expect(evaluator).toHaveBeenCalledWith('print("lua output"); return 42');
        expect(JSON.parse(result.content[0].text.split('\n').slice(1).join('\n'))).toEqual({
            ok: true,
            value: '42',
            output: ['lua output'],
        });
    });

    it('marks Lua failures as MCP errors', async () => {
        vi.stubGlobal('GetCurrentResourceName', () => 'lavender-mcp-server');
        vi.stubGlobal('exports', {
            'lavender-mcp-server': {
                [LUA_EXECUTOR_EXPORT]: () => ({ ok: false, error: 'compile failed' }),
            },
        });

        const result = await runOnServer('not valid', 'lua');

        expect(result).toMatchObject({ isError: true });
        expect(result.content[0].text).toContain('compile failed');
    });

    it('forwards the selected language through the existing client callback bus', async () => {
        let resultHandler: ((requestId: number, ...args: unknown[]) => void) | undefined;
        const emitNet = vi.fn();
        vi.stubGlobal('getPlayers', () => ['12']);
        vi.stubGlobal('onNet', (_event: string, handler: typeof resultHandler) => {
            resultHandler = handler;
        });
        vi.stubGlobal('emitNet', emitNet);
        initRpc();

        const pending = runOnClients([12], 'lua', 'return 42', 1000);
        expect(emitNet).toHaveBeenCalledWith(
            'lavender_mcp:cb:trigger',
            12,
            'execute_code',
            1,
            'return 42',
            'lua',
        );

        (globalThis as { source?: number }).source = 12;
        resultHandler?.(1, { ok: true, value: '42' });
        const result = await pending;
        expect(JSON.parse(result.content[0].text)).toEqual([
            { serverId: 12, ok: true, value: '42' },
        ]);
    });
});
