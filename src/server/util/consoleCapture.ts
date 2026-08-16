export type LogLevel = 'log' | 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
    ts: number;
    channel: string;
    level: LogLevel;
    message: string;
}

export class CircularBuffer<T> {
    private entries: T[] = [];
    constructor(readonly max: number) {}

    push(entry: T): void {
        this.entries.push(entry);
        if (this.entries.length > this.max) this.entries.shift();
    }

    get size(): number {
        return this.entries.length;
    }

    clear(): void {
        this.entries = [];
    }

    slice(lines: number, filter?: (e: T) => boolean): T[] {
        const filtered = filter ? this.entries.filter(filter) : this.entries;
        return filtered.slice(-lines);
    }
}

const MAX_BUFFER = 1000;
const buffer = new CircularBuffer<LogEntry>(MAX_BUFFER);
const pendingByChannel = new Map<string, string>();
let installed = false;
let inListener = false;

export function initConsoleCapture(): void {
    if (installed) return;
    installed = true;
    seedFromConsoleBuffer();
    RegisterConsoleListener((channel: string, message: string) => {
        if (inListener) return;
        inListener = true;
        try {
            captureConsoleChunk(channel, message);
        } finally {
            inListener = false;
        }
    });
}

export function formatArg(arg: unknown): string {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack ?? arg.message;
    if (typeof arg === 'object' && arg !== null) {
        try {
            return JSON.stringify(arg);
        } catch {
            return String(arg);
        }
    }
    return String(arg);
}

export function captureConsoleChunk(channel: unknown, message: unknown, ts = Date.now()): void {
    const rawChannel = typeof channel === 'string' ? channel : String(channel ?? '');
    const rawMessage = typeof message === 'string' ? message : String(message ?? '');
    const pending = (pendingByChannel.get(rawChannel) ?? '') + rawMessage.replace(/\r\n/g, '\n');
    const parts = pending.split('\n');
    const remainder = parts.pop() ?? '';
    pendingByChannel.set(rawChannel, remainder);

    for (const part of parts) {
        const line = part.endsWith('\r') ? part.slice(0, -1) : part;
        pushCompletedLine(rawChannel, line, ts);
    }
}

function pushCompletedLine(channel: string, line: string, ts: number): void {
    const message = stripConsoleColorCodes(line);
    if (message.trim().length === 0) return;
    buffer.push({
        ts,
        channel,
        level: inferLogLevel(channel, line),
        message,
    });
}

export function inferLogLevel(channel: string, message: string): LogLevel {
    const lower = channel.toLowerCase();
    if (lower.endsWith(':error') || lower.endsWith(':fatal')) return 'error';
    if (lower.endsWith(':warning') || lower.endsWith(':warn')) return 'warn';
    if (lower.endsWith(':debug')) return 'debug';
    if (lower.endsWith(':info')) return 'info';

    const firstColor = message.match(/\^[0-9]/)?.[0];
    if (firstColor === '^1') return 'error';
    if (firstColor === '^3') return 'warn';

    const ansiColors = getLeadingAnsiColorCodes(message);
    if (ansiColors.some((code) => code === 31 || code === 91)) return 'error';
    if (ansiColors.some((code) => code === 33 || code === 93)) return 'warn';
    return 'log';
}

export function stripConsoleColorCodes(message: string): string {
    return message.replace(/\^[0-9]/g, '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

export function getEntries(
    lines: number,
    level?: LogLevel,
    channelFilter?: string,
): LogEntry[] {
    const channelNeedle = channelFilter?.toLowerCase();
    return buffer.slice(
        lines,
        level || channelNeedle
            ? (e) =>
                  (!level || e.level === level) &&
                  (!channelNeedle || e.channel.toLowerCase().includes(channelNeedle))
            : undefined,
    );
}

export function bufferSize(): number {
    return buffer.size;
}

export const maxBufferSize = MAX_BUFFER;

function seedFromConsoleBuffer(): void {
    if (typeof GetConsoleBuffer !== 'function') return;
    const raw = GetConsoleBuffer();
    if (!raw) return;
    captureConsoleChunk('buffer', raw.endsWith('\n') ? raw : `${raw}\n`, Date.now());
}

export function resetConsoleCaptureForTests(): void {
    buffer.clear();
    pendingByChannel.clear();
    installed = false;
    inListener = false;
}

function getLeadingAnsiColorCodes(message: string): number[] {
    const codes: number[] = [];
    let rest = message;
    while (true) {
        const match = /^\x1B\[([0-9;]*)m/.exec(rest);
        if (!match) return codes;
        const rawCodes = match[1] ? match[1].split(';') : ['0'];
        for (const rawCode of rawCodes) {
            const code = Number(rawCode);
            if (Number.isFinite(code)) codes.push(code);
        }
        rest = rest.slice(match[0].length);
    }
}
