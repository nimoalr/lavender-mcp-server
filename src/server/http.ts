import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { ErrorRequestHandler, Express, NextFunction, Request, Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import { createMcpServer } from './mcp';
import { bufferSize } from './util/consoleCapture';
import {
    MIN_TOKEN_LENGTH,
    safeStringEqual,
    validateToken,
} from './util/auth';
import { VERSION } from './version';

const DEFAULT_PORT = 3414;
const LISTEN_HOST = '127.0.0.1';

let httpServer: HttpServer | null = null;
let listeningPort: number | null = null;

export function isListening(): boolean {
    return httpServer?.listening === true;
}

export function getListeningPort(): number | null {
    return listeningPort;
}

export function validatePort(port: number): number {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`lavender_mcp_port must be an integer between 1 and 65535; received ${port}.`);
    }
    return port;
}

export async function startHttpServer(): Promise<void> {
    const port = validatePort(GetConvarInt('lavender_mcp_port', DEFAULT_PORT));
    const token = GetConvar('lavender_mcp_token', '').trim();

    const tokenCheck = validateToken(token);
    if (!tokenCheck.ok) {
        if (tokenCheck.reason === 'placeholder') {
            console.error(
                '^1[lavender-mcp]^7 lavender_mcp_token is unset or matches a placeholder value.',
            );
            console.error(
                '^1[lavender-mcp]^7 Generate a random token and declare it with `set` in server.cfg.',
            );
        } else {
            console.error(
                `^1[lavender-mcp]^7 lavender_mcp_token is too short (${tokenCheck.length} characters; minimum ${MIN_TOKEN_LENGTH}).`,
            );
        }
        console.error(
            '^1[lavender-mcp]^7 Do not use `sets` or `setr`; both expose the token outside the server process.',
        );
        console.error('^1[lavender-mcp]^7 HTTP listener was not started.');
        return;
    }

    const app = createHttpApp(token);

    const server = app.listen(port, LISTEN_HOST);
    httpServer = server;

    try {
        await waitUntilListening(server);
    } catch (error) {
        httpServer = null;
        listeningPort = null;
        server.close();
        throw error;
    }

    listeningPort = port;
    server.on('error', (error) => {
        console.error(`^1[lavender-mcp]^7 HTTP server error: ${formatError(error)}`);
    });

    console.log(
        `^5[lavender-mcp]^7 listening on ^2http://${LISTEN_HOST}:${port}/mcp^7 (Bearer token, ${token.length} characters)`,
    );
    console.log(
        '^5[lavender-mcp]^7 lavender_mcp_token must use `set`, never `sets` or `setr`.',
    );
}

export function createHttpApp(token: string): Express {
    const app = createMcpExpressApp({
        host: LISTEN_HOST,
        jsonLimit: '4mb',
    });

    const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) {
            res.status(401)
                .set('WWW-Authenticate', 'Bearer realm="lavender-mcp"')
                .json({
                    jsonrpc: '2.0',
                    error: { code: -32001, message: 'Unauthorized: Bearer token required' },
                    id: null,
                });
            return;
        }

        const presented = header.slice(7).trim();
        if (!safeStringEqual(presented, token)) {
            console.warn(
                `^3[lavender-mcp]^7 authentication rejected (ua=${req.headers['user-agent'] ?? 'unknown'})`,
            );
            res.status(401)
                .set('WWW-Authenticate', 'Bearer realm="lavender-mcp" error="invalid_token"')
                .json({
                    jsonrpc: '2.0',
                    error: { code: -32001, message: 'Unauthorized: invalid token' },
                    id: null,
                });
            return;
        }

        next();
    };

    app.get('/mcp/health', (_req, res) => {
        res.json({
            status: 'ok',
            serverName: 'lavender-mcp-server',
            version: VERSION,
            uptimeSeconds: Math.floor(process.uptime()),
            consoleBufferSize: bufferSize(),
            timestamp: new Date().toISOString(),
        });
    });

    const handler = createMcpHandler(() => createMcpServer(), {
        legacy: 'stateless',
        onerror: logHandlerError,
    });
    const nodeHandler = toNodeHandler(handler, { onerror: logHandlerError });

    app.all('/mcp', requireAuth, (req, res) => {
        logRequest(req);
        void nodeHandler(req, res, req.body);
    });

    const handleExpressError: ErrorRequestHandler = (error, _req, res, next) => {
        if (res.headersSent) {
            next(error);
            return;
        }
        const status = getHttpErrorStatus(error);
        res.status(status).json({
            jsonrpc: '2.0',
            error: {
                code: status === 400 ? -32700 : -32603,
                message: status === 400 ? 'Parse error' : 'Request failed',
            },
            id: null,
        });
    };
    app.use(handleExpressError);

    return app;
}

export async function stopHttpServer(): Promise<void> {
    const server = httpServer;
    httpServer = null;
    listeningPort = null;
    if (!server) return;

    await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        // Resource restarts cannot wait for long-lived MCP connections to
        // drain; force them closed after stopping new connection acceptance.
        server.closeAllConnections();
    });
}

function logRequest(req: Request): void {
    const body = req.body as { method?: string; params?: { name?: string } } | undefined;
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    if (body?.method === 'tools/call') {
        console.log(
            `^5[lavender-mcp]^7 tool call: ^3${body.params?.name ?? '?'}^7 (ua=${userAgent})`,
        );
    } else if (body?.method) {
        console.log(`^5[lavender-mcp]^7 rpc: ^3${body.method}^7 (ua=${userAgent})`);
    }
}

function logHandlerError(error: Error): void {
    console.error(`^1[lavender-mcp]^7 MCP handler error: ${formatError(error)}`);
}

function formatError(error: unknown): string {
    return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function getHttpErrorStatus(error: unknown): number {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status?: unknown }).status;
        if (typeof status === 'number' && status >= 400 && status <= 599) return status;
    }
    return 500;
}

function waitUntilListening(server: HttpServer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const onListening = (): void => {
            server.off('error', onError);
            resolve();
        };
        const onError = (error: Error): void => {
            server.off('listening', onListening);
            reject(error);
        };
        server.once('listening', onListening);
        server.once('error', onError);
    });
}
