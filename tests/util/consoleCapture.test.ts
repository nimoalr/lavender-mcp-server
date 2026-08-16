import { beforeEach, describe, expect, it } from 'vitest';
import {
    CircularBuffer,
    captureConsoleChunk,
    formatArg,
    getEntries,
    inferLogLevel,
    resetConsoleCaptureForTests,
    stripConsoleColorCodes,
    type LogEntry,
    type LogLevel,
} from '../../src/server/util/consoleCapture';

function entry(level: LogLevel, message: string, ts = Date.now()): LogEntry {
    return { ts, channel: 'script:test', level, message };
}

describe('CircularBuffer', () => {
    it('tracks size as entries are pushed', () => {
        const buf = new CircularBuffer<LogEntry>(5);
        expect(buf.size).toBe(0);
        buf.push(entry('log', 'a'));
        buf.push(entry('log', 'b'));
        expect(buf.size).toBe(2);
    });

    it('trims the oldest entries past max', () => {
        const buf = new CircularBuffer<LogEntry>(3);
        for (let i = 0; i < 10; i++) buf.push(entry('log', `m${i}`, i));
        expect(buf.size).toBe(3);
        const all = buf.slice(10);
        expect(all.map((e) => e.message)).toEqual(['m7', 'm8', 'm9']);
    });

    it('slice(n) returns the last n entries', () => {
        const buf = new CircularBuffer<LogEntry>(10);
        for (let i = 0; i < 5; i++) buf.push(entry('log', `m${i}`, i));
        expect(buf.slice(2).map((e) => e.message)).toEqual(['m3', 'm4']);
        expect(buf.slice(100).map((e) => e.message)).toEqual([
            'm0',
            'm1',
            'm2',
            'm3',
            'm4',
        ]);
    });

    it('slice with filter applies before the tail cut', () => {
        const buf = new CircularBuffer<LogEntry>(10);
        buf.push(entry('log', 'a'));
        buf.push(entry('error', 'oops'));
        buf.push(entry('log', 'b'));
        buf.push(entry('error', 'again'));
        const errors = buf.slice(10, (e) => e.level === 'error');
        expect(errors.map((e) => e.message)).toEqual(['oops', 'again']);
    });

    it('preserves insertion order (no implicit sort)', () => {
        const buf = new CircularBuffer<LogEntry>(5);
        buf.push(entry('log', 'a', 3000));
        buf.push(entry('log', 'b', 1000));
        buf.push(entry('log', 'c', 2000));
        expect(buf.slice(5).map((e) => e.message)).toEqual(['a', 'b', 'c']);
    });
});

describe('formatArg', () => {
    it('passes strings through unchanged', () => {
        expect(formatArg('hello')).toBe('hello');
    });

    it('JSON-stringifies plain objects', () => {
        expect(formatArg({ a: 1 })).toBe('{"a":1}');
    });

    it('returns Error stack when available, else message', () => {
        const err = new Error('boom');
        const out = formatArg(err);
        expect(out).toContain('boom');
    });

    it('falls back to String() for non-serialisable objects', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(typeof formatArg(cyclic)).toBe('string');
    });

    it('handles primitives via String()', () => {
        expect(formatArg(42)).toBe('42');
        expect(formatArg(true)).toBe('true');
        expect(formatArg(null)).toBe('null');
        expect(formatArg(undefined)).toBe('undefined');
    });
});

describe('global console capture helpers', () => {
    beforeEach(() => {
        resetConsoleCaptureForTests();
    });

    it('derives level from channel suffix before falling back to color', () => {
        expect(inferLogLevel('script:renegade:warning', 'hello')).toBe('warn');
        expect(inferLogLevel('script:renegade:error', 'hello')).toBe('error');
        expect(inferLogLevel('script:renegade', '^1red message')).toBe('error');
        expect(inferLogLevel('cmd', '^3yellow message')).toBe('warn');
        expect(inferLogLevel('cmd', '\u001b[31mred message')).toBe('error');
        expect(inferLogLevel('cmd', '\u001b[33myellow message')).toBe('warn');
        expect(inferLogLevel('cmd', '^5normal message')).toBe('log');
    });

    it('strips CFX and ANSI color codes from stored messages', () => {
        expect(stripConsoleColorCodes('^1bad ^7then normal')).toBe('bad then normal');
        expect(stripConsoleColorCodes('\u001b[32mgood\u001b[39m')).toBe('good');
    });

    it('coalesces listener chunks into complete non-empty lines', () => {
        captureConsoleChunk('script:renegade', '[DATA/SUCCESS] Registered 901', 1000);
        expect(getEntries(10)).toEqual([]);

        captureConsoleChunk('script:renegade', '\n', 2000);
        captureConsoleChunk('script:renegade', 'a\nb\nc', 3000);
        captureConsoleChunk('script:renegade', ' + tail', 4000);
        captureConsoleChunk('script:renegade', '\n', 5000);
        captureConsoleChunk('script:renegade', '\n', 6000);

        expect(getEntries(10).map((e) => e.message)).toEqual([
            '[DATA/SUCCESS] Registered 901',
            'a',
            'b',
            'c + tail',
        ]);
        expect(getEntries(10).every((e) => e.message.trim().length > 0)).toBe(true);
        expect(getEntries(2).map((e) => e.message)).toEqual(['b', 'c + tail']);
    });

    it('keeps channel and level filters over completed lines', () => {
        captureConsoleChunk('script:renegade', '^5hello\n', 1000);
        captureConsoleChunk('script:renegade:warning', '^3careful\n', 2000);
        captureConsoleChunk('cmd', '^1failed\n', 3000);

        expect(getEntries(10, 'warn').map((e) => e.channel)).toEqual([
            'script:renegade:warning',
        ]);
        expect(getEntries(10, undefined, 'SCRIPT:RENEGADE').map((e) => e.channel)).toEqual([
            'script:renegade',
            'script:renegade:warning',
        ]);
        expect(getEntries(10, 'error').map((e) => e.channel)).toEqual(['cmd']);
    });
});
