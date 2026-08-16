import type { McpServer, StandardSchemaV1 } from '@modelcontextprotocol/server';

export const BUILTIN_RESOURCE = 'lavender-mcp-server';

// McpServer.registerTool is heavily overloaded; Parameters<...> collapses
// to `never`. We model the shape we use and cast at the boundary in
// applyToolsTo.
export interface ToolDef {
    name: string;
    config: {
        description?: string;
        inputSchema?: StandardSchemaV1;
        annotations?: Record<string, unknown>;
    };
    handler: (args: any) => Promise<unknown> | unknown;
    registeredBy: string;
}

const registry = new Map<string, ToolDef>();

export function registerTool(def: ToolDef): void {
    if (registry.has(def.name)) {
        throw new Error(
            `Tool already registered: ${def.name} (previously by ${registry.get(def.name)?.registeredBy})`,
        );
    }
    registry.set(def.name, def);
}

export function unregisterTool(name: string): boolean {
    return registry.delete(name);
}

export function unregisterByResource(resource: string): string[] {
    const removed: string[] = [];
    for (const [name, def] of registry) {
        if (def.registeredBy === resource) {
            registry.delete(name);
            removed.push(name);
        }
    }
    return removed;
}

export function isToolRegistered(name: string): boolean {
    return registry.has(name);
}

export function isBuiltInTool(name: string): boolean {
    const def = registry.get(name);
    return def?.registeredBy === BUILTIN_RESOURCE;
}

export function listToolSummaries(): Array<{ name: string; registeredBy: string }> {
    return Array.from(registry.values()).map((d) => ({
        name: d.name,
        registeredBy: d.registeredBy,
    }));
}

export function applyToolsTo(server: McpServer): void {
    const reg = server.registerTool.bind(server) as (
        name: string,
        config: ToolDef['config'],
        handler: ToolDef['handler'],
    ) => unknown;
    for (const def of registry.values()) {
        reg(def.name, def.config, def.handler);
    }
}
