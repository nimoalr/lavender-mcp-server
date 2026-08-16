import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type NetHandler = (...args: unknown[]) => void;

let handlers: Map<string, NetHandler>;
let emitNetMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    handlers = new Map();
    emitNetMock = vi.fn();
    vi.stubGlobal('onNet', (event: string, handler: NetHandler) => {
        handlers.set(event, handler);
    });
    vi.stubGlobal('emitNet', emitNetMock);
});

afterEach(() => {
    delete (globalThis as { source?: unknown }).source;
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('client callback correlation', () => {
    it('ignores a response from a client other than the target', async () => {
        const { initRpc, triggerClientCallback } = await import('../src/server/rpc');
        const { EVENT_RESULT, EVENT_TRIGGER } = await import('../src/shared/events');

        initRpc();
        const pending = triggerClientCallback(12, 'execute_code', ['return 1'], {
            timeoutMs: 1000,
        });

        expect(emitNetMock).toHaveBeenCalledWith(
            EVENT_TRIGGER,
            12,
            'execute_code',
            1,
            'return 1',
        );

        const handler = handlers.get(EVENT_RESULT);
        (globalThis as { source?: number }).source = 99;
        handler?.(1, { ok: true, value: 'spoofed' });

        let settled = false;
        void pending.finally(() => {
            settled = true;
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);

        (globalThis as { source?: number }).source = 12;
        handler?.(1, { ok: true, value: '1' });
        await expect(pending).resolves.toEqual([{ ok: true, value: '1' }]);
    });
});
