// Multiplexed server↔client callback bus. All round-trip RPCs ride two
// net events; new round-trip tools register a name rather than adding
// new events.

import { EVENT_RESULT, EVENT_TRIGGER } from '../shared/events';

interface PendingEntry {
    serverId: number;
    resolve: (args: unknown[]) => void;
    timer: NodeJS.Timeout;
}

const pending = new Map<number, PendingEntry>();
let nextRequestId = 1;

export function initRpc(): void {
    onNet(EVENT_RESULT, (requestId: number, ...args: unknown[]) => {
        const src = Number((globalThis as { source?: number | string }).source);
        const entry = pending.get(requestId);
        if (!entry) {
            console.warn(
                `^3[lavender-mcp]^7 cb result for unknown id ${requestId} from src=${src ?? '?'} (already resolved or timed out?)`,
            );
            return;
        }
        if (src !== entry.serverId) {
            console.warn(
                `^3[lavender-mcp]^7 ignored cb result for id ${requestId} from src=${Number.isFinite(src) ? src : '?'}; expected src=${entry.serverId}`,
            );
            return;
        }
        clearTimeout(entry.timer);
        pending.delete(requestId);
        entry.resolve(args);
    });
}

export interface TriggerOptions {
    timeoutMs?: number;
}

export function triggerClientCallback(
    serverId: number,
    name: string,
    args: unknown[],
    opts: TriggerOptions = {},
): Promise<unknown[]> {
    const requestId = nextRequestId++;
    const timeoutMs = opts.timeoutMs ?? 10000;

    return new Promise<unknown[]>((resolve, reject) => {
        const timer = setTimeout(() => {
            if (pending.has(requestId)) {
                pending.delete(requestId);
                reject(
                    new Error(
                        `Client ${serverId} did not respond to "${name}" within ${timeoutMs}ms`,
                    ),
                );
            }
        }, timeoutMs);

        pending.set(requestId, { serverId, resolve, timer });
        emitNet(EVENT_TRIGGER, serverId, name, requestId, ...args);
    });
}
