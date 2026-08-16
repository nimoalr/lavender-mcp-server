import { BUILTIN_RESOURCE, registerTool } from '../registry';
import { z } from 'zod';

export function registerGetServerInfo(): void {
    registerTool({
        name: 'get_server_info',
        config: {
            description:
                'Return the resource name, game identifier, server version, uptime, player count, and Node.js version.',
            inputSchema: z.object({}),
        },
        handler: async () => {
            const info = {
                resource: GetCurrentResourceName(),
                game: GetConvar('gamename', 'gta5'),
                serverVersion: GetConvar('version', 'unknown'),
                uptimeSeconds: Math.floor(process.uptime()),
                playerCount: GetNumPlayerIndices(),
                nodeVersion: process.version,
                timestamp: new Date().toISOString(),
            };
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });
}
