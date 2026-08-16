export function playerExists(serverId: number): boolean {
    const raw = (globalThis as { getPlayers: () => string[] }).getPlayers();
    return raw.some((s) => parseInt(s, 10) === serverId);
}

export function getIdentifiers(playerId: string): Record<string, string> {
    const out: Record<string, string> = {};
    const num = GetNumPlayerIdentifiers(playerId);
    for (let i = 0; i < num; i++) {
        const ident = GetPlayerIdentifier(playerId, i);
        const colon = ident.indexOf(':');
        if (colon > 0) {
            out[ident.slice(0, colon)] = ident.slice(colon + 1);
        }
    }
    return out;
}

export function getTokens(playerId: string): string[] {
    const out: string[] = [];
    const num = GetNumPlayerTokens(playerId);
    for (let i = 0; i < num; i++) {
        out.push(GetPlayerToken(playerId, i));
    }
    return out;
}
