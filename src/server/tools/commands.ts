import { z } from 'zod';
import { BUILTIN_RESOURCE, registerTool } from '../registry';

export function registerCommandTools(): void {
    registerTool({
        name: 'execute_command',
        config: {
            description:
                'Execute a server-console command. Output is written to the server console. Requires the corresponding `command.<name>` ACE.',
            inputSchema: z.object({
                command: z
                    .string()
                    .describe('Full command line, exactly as you would type it in the server console.'),
            }),
        },
        handler: async ({ command }) => {
            ExecuteCommand(command);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Executed: ${command}\nOutput is written to the server console.`,
                    },
                ],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });

    registerTool({
        name: 'get_convar',
        config: {
            description:
                'Read a server convar value as a string. Returns the provided default (or empty string) if the convar is unset.',
            inputSchema: z.object({
                name: z
                    .string()
                    .describe('Convar name (e.g. "sv_hostname", "version", "sv_maxclients").'),
                default: z
                    .string()
                    .optional()
                    .describe('Fallback value if the convar is unset. Defaults to empty string.'),
            }),
        },
        handler: async ({ name, default: defaultValue }) => {
            const value = GetConvar(name, defaultValue ?? '');
            return {
                content: [
                    { type: 'text' as const, text: JSON.stringify({ name, value }, null, 2) },
                ],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });

    registerTool({
        name: 'set_convar',
        config: {
            description:
                'Set a server convar to a string value. Some convars are read-only or only effective when set at startup — the call may succeed but have no observable effect. Verify with get_convar afterwards.',
            inputSchema: z.object({
                name: z.string().describe('Convar name.'),
                value: z.string().describe('String value to assign.'),
            }),
        },
        handler: async ({ name, value }) => {
            SetConvar(name, value);
            const current = GetConvar(name, '');
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            { name, requested: value, current },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
        registeredBy: BUILTIN_RESOURCE,
    });
}
