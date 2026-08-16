import { z } from 'zod';
import { BUILTIN_RESOURCE, registerTool } from '../registry';
import { getIdentifiers, getTokens, playerExists } from '../util/players';

export function registerGetClientInfo(): void {
    registerTool({
        name: 'get_client_info',
        config: {
            description:
                'Get detailed information about a single connected client by server ID. Returns name, ping, endpoint, identifiers, tokens, GUID.',
            inputSchema: z.object({
                serverId: z
                    .number()
                    .int()
                    .nonnegative()
                    .describe('The server ID of the target player (from list_clients).'),
            }),
        },
        handler: async ({ serverId }) => {
            if (!playerExists(serverId)) {
                throw new Error(`No connected player with serverId ${serverId}`);
            }
            const playerId = String(serverId);
            const info = {
                serverId,
                name: GetPlayerName(playerId) ?? 'Unknown',
                ping: GetPlayerPing(playerId),
                endpoint: GetPlayerEndpoint(playerId),
                guid: GetPlayerGuid(playerId),
                identifiers: getIdentifiers(playerId),
                tokens: getTokens(playerId),
            };
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });
}
