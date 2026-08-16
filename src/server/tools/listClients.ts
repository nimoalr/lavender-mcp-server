import { BUILTIN_RESOURCE, registerTool } from '../registry';
import { getIdentifiers } from '../util/players';
import { z } from 'zod';

export function registerListClients(): void {
    registerTool({
        name: 'list_clients',
        config: {
            description:
                'List all currently connected players with their server IDs, names, pings, and identifiers (steam, license, discord, etc). Use the serverId values as targets for execute_code and get_client_info.',
            inputSchema: z.object({}),
        },
        handler: async () => {
            const count = GetNumPlayerIndices();
            const players: Array<{
                serverId: number;
                name: string;
                ping: number;
                identifiers: Record<string, string>;
            }> = [];
            for (let i = 0; i < count; i++) {
                const playerId = GetPlayerFromIndex(i);
                const serverId = parseInt(playerId, 10);
                players.push({
                    serverId,
                    name: GetPlayerName(playerId) ?? 'Unknown',
                    ping: GetPlayerPing(playerId),
                    identifiers: getIdentifiers(playerId),
                });
            }
            players.sort((a, b) => a.serverId - b.serverId);
            return {
                content: [
                    { type: 'text' as const, text: JSON.stringify({ count, players }, null, 2) },
                ],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });
}
