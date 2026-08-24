import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { z } from 'zod';
import { createHttpApp, validatePort } from '../src/server/http';
import { registerTool, unregisterTool } from '../src/server/registry';
import { registerExecuteCode } from '../src/server/tools/executeCode';
import { VERSION } from '../src/server/version';

const TOKEN = 'a'.repeat(32);
let server: Server;
let baseUrl: string;

beforeAll(async () => {
    registerExecuteCode();
    registerTool({
        name: 'test_http_tool',
        config: {
            description: 'Test HTTP protocol dispatch.',
            inputSchema: z.object({}),
        },
        handler: () => ({ content: [{ type: 'text', text: 'ok' }] }),
        registeredBy: 'http-test',
    });
    const app = createHttpApp(TOKEN);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
    baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
    unregisterTool('test_http_tool');
    unregisterTool('execute_code');
});

describe('HTTP security boundary', () => {
    it('serves health without authentication', async () => {
        const response = await fetch(`${baseUrl}/mcp/health`);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            status: 'ok',
            serverName: 'lavender-mcp-server',
            version: VERSION,
        });
    });

    it('rejects a non-local Origin on every route', async () => {
        const response = await fetch(`${baseUrl}/mcp/health`, {
            headers: { Origin: 'https://attacker.example' },
        });
        expect(response.status).toBe(403);
    });

    it('requires a Bearer token for the MCP endpoint', async () => {
        const response = await fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toContain('Bearer');
    });

    it('returns a JSON-RPC parse error for malformed JSON', async () => {
        const response = await fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: mcpHeaders(),
            body: '{',
        });
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            jsonrpc: '2.0',
            error: { code: -32700 },
            id: null,
        });
    });
});

describe('MCP protocol handling', () => {
    it('serves the 2026-07-28 per-request protocol', async () => {
        const response = await postMcp(
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {
                    _meta: {
                        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                        'io.modelcontextprotocol/clientInfo': {
                            name: 'lavender-test',
                            version: '1.0.0',
                        },
                        'io.modelcontextprotocol/clientCapabilities': {},
                    },
                },
            },
            {
                'MCP-Protocol-Version': '2026-07-28',
                'Mcp-Method': 'tools/list',
            },
        );
        expect(response.status).toBe(200);
        await expect(readMcpResponse(response)).resolves.toMatchObject({
            jsonrpc: '2.0',
            id: 1,
            result: {
                resultType: 'complete',
                tools: expect.arrayContaining([
                    expect.objectContaining({ name: 'test_http_tool' }),
                    expect.objectContaining({
                        name: 'execute_code',
                        description: expect.stringContaining('JavaScript or Lua'),
                    }),
                ]),
            },
        });
    });

    it('negotiates the 2025 protocol for legacy clients', async () => {
        const response = await postMcp({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 'lavender-test', version: '1.0.0' },
            },
        });
        expect(response.status).toBe(200);
        await expect(readMcpResponse(response)).resolves.toMatchObject({
            jsonrpc: '2.0',
            id: 1,
            result: {
                protocolVersion: '2025-11-25',
                serverInfo: { name: 'lavender-mcp-server', version: VERSION },
                instructions: expect.stringContaining(
                    String.raw`%LOCALAPPDATA%\FiveM\FiveM.app\logs\CitizenFX_log_*.log`,
                ),
            },
        });
    });

    it('acknowledges notifications with HTTP 202', async () => {
        const response = await postMcp({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
        });
        expect(response.status).toBe(202);
        expect(await response.text()).toBe('');
    });

    it('rejects unsupported protocol-version headers', async () => {
        const response = await postMcp(
            { jsonrpc: '2.0', id: 2, method: 'tools/list' },
            { 'MCP-Protocol-Version': '2099-01-01' },
        );
        expect(response.status).toBe(400);
    });

    it('rejects a non-JSON request body', async () => {
        const response = await fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                Accept: 'application/json, text/event-stream',
                'Content-Type': 'text/plain',
            },
            body: '{}',
        });
        expect(response.status).toBe(415);
    });
});

describe('port validation', () => {
    it('accepts the full TCP port range', () => {
        expect(validatePort(1)).toBe(1);
        expect(validatePort(65535)).toBe(65535);
    });

    it.each([0, -1, 65536, 3414.5, Number.NaN])('rejects invalid port %s', (port) => {
        expect(() => validatePort(port)).toThrow(/between 1 and 65535/);
    });
});

function mcpHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        ...extra,
    };
}

function postMcp(body: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
    return fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: mcpHeaders(extraHeaders),
        body: JSON.stringify(body),
    });
}

async function readMcpResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (response.headers.get('content-type')?.includes('application/json')) {
        return JSON.parse(text);
    }
    const data = text
        .split(/\r?\n/)
        .find((line) => line.startsWith('data: '))
        ?.slice(6);
    if (!data) throw new Error(`SSE response did not contain a data event: ${text}`);
    return JSON.parse(data);
}
