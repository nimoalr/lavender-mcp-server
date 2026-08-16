import { z } from 'zod';
import { BUILTIN_RESOURCE, registerTool } from '../registry';

interface ResourceEntry {
    name: string;
    state: string;
    version?: string;
    author?: string;
}

function listAllResources(): ResourceEntry[] {
    const count = GetNumResources();
    const out: ResourceEntry[] = [];
    for (let i = 0; i < count; i++) {
        const name = GetResourceByFindIndex(i);
        if (!name) continue;
        out.push({
            name,
            state: GetResourceState(name),
            version: GetResourceMetadata(name, 'version', 0) || undefined,
            author: GetResourceMetadata(name, 'author', 0) || undefined,
        });
    }
    return out;
}

function refuseSelf(action: string, name: string): void {
    if (name === GetCurrentResourceName()) {
        throw new Error(
            `Cannot ${action} ${name} through its own MCP connection. Use the server console.`,
        );
    }
}

function assertExists(name: string): void {
    const state = GetResourceState(name);
    if (state === 'missing' || state === '') {
        throw new Error(`Resource not found: ${name}`);
    }
}

const NAME_SCHEMA = {
    name: z.string().describe('Resource name (case-sensitive).'),
};

export function registerResourceTools(): void {
    registerTool({
        name: 'list_resources',
        config: {
            description:
                'List every resource known to the server with its current state (started/stopped/starting/stopping/uninitialized) and version/author metadata if present.',
            inputSchema: z.object({}),
        },
        handler: async () => {
            const resources = listAllResources();
            const grouped: Record<string, string[]> = {};
            for (const r of resources) {
                (grouped[r.state] ??= []).push(r.name);
            }
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            { count: resources.length, byState: grouped, resources },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });

    registerTool({
        name: 'start_resource',
        config: {
            description:
                'Start a stopped resource by name. Uses the StartResource native (no ACE required).',
            inputSchema: z.object(NAME_SCHEMA),
        },
        handler: async ({ name }) => {
            assertExists(name);
            refuseSelf('start', name);
            const issued = StartResource(name);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            { name, issued, state: GetResourceState(name) },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });

    registerTool({
        name: 'stop_resource',
        config: {
            description:
                'Stop a running resource by name. Uses the StopResource native (no ACE required). Refuses to act on lavender-mcp-server itself.',
            inputSchema: z.object(NAME_SCHEMA),
        },
        handler: async ({ name }) => {
            assertExists(name);
            refuseSelf('stop', name);
            const issued = StopResource(name);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            { name, issued, state: GetResourceState(name) },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });

    registerTool({
        name: 'restart_resource',
        config: {
            description:
                'Restart a resource via the `restart` console command. Requires the `command.restart` ACE granted to this resource (see README). Refuses to act on lavender-mcp-server itself.',
            inputSchema: z.object(NAME_SCHEMA),
        },
        handler: async ({ name }) => {
            assertExists(name);
            refuseSelf('restart', name);
            ExecuteCommand(`restart ${name}`);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                name,
                                issued: true,
                                state: GetResourceState(name),
                                note: 'Restart issued. If state did not change, the resource may be missing the `command.restart` ACE — check the server console for "Access denied for command restart".',
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });

    registerTool({
        name: 'refresh_resources',
        config: {
            description:
                'Rescan the resources directory for newly added folders. Requires the `command.refresh` ACE granted to this resource (see README).',
            inputSchema: z.object({}),
        },
        handler: async () => {
            ExecuteCommand('refresh');
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Refresh issued. Use list_resources to verify the result.',
                    },
                ],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });
}
