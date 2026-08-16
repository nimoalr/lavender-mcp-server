import { beforeEach, describe, expect, it } from 'vitest';
import {
    BUILTIN_RESOURCE,
    isBuiltInTool,
    isToolRegistered,
    listToolSummaries,
    registerTool,
    unregisterByResource,
    unregisterTool,
    type ToolDef,
} from '../src/server/registry';

function tool(name: string, registeredBy: string): ToolDef {
    return {
        name,
        config: { description: `desc-${name}`, inputSchema: {} },
        handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
        registeredBy,
    };
}

// The registry is module-singleton; reset state between tests by
// removing everything registered.
beforeEach(() => {
    for (const summary of listToolSummaries()) {
        unregisterTool(summary.name);
    }
});

describe('registry.registerTool', () => {
    it('registers a tool and makes it queryable', () => {
        registerTool(tool('foo', BUILTIN_RESOURCE));
        expect(isToolRegistered('foo')).toBe(true);
        expect(isBuiltInTool('foo')).toBe(true);
        expect(listToolSummaries()).toEqual([{ name: 'foo', registeredBy: BUILTIN_RESOURCE }]);
    });

    it('refuses to register a duplicate name', () => {
        registerTool(tool('foo', BUILTIN_RESOURCE));
        expect(() => registerTool(tool('foo', 'other-resource'))).toThrow(/already registered/);
    });

    it('distinguishes built-ins from third-party tools', () => {
        registerTool(tool('builtin_tool', BUILTIN_RESOURCE));
        registerTool(tool('third_party_tool', 'other-resource'));
        expect(isBuiltInTool('builtin_tool')).toBe(true);
        expect(isBuiltInTool('third_party_tool')).toBe(false);
    });

    it('isBuiltInTool returns false for unknown names', () => {
        expect(isBuiltInTool('never-registered')).toBe(false);
    });
});

describe('registry.unregisterTool', () => {
    it('returns true and removes the tool when it existed', () => {
        registerTool(tool('foo', BUILTIN_RESOURCE));
        expect(unregisterTool('foo')).toBe(true);
        expect(isToolRegistered('foo')).toBe(false);
    });

    it('returns false for unknown names', () => {
        expect(unregisterTool('does-not-exist')).toBe(false);
    });
});

describe('registry.unregisterByResource', () => {
    it('removes every tool owned by a given resource and reports them', () => {
        registerTool(tool('one', 'resource-a'));
        registerTool(tool('two', 'resource-a'));
        registerTool(tool('three', 'resource-b'));
        registerTool(tool('four', BUILTIN_RESOURCE));

        const removed = unregisterByResource('resource-a');
        expect(new Set(removed)).toEqual(new Set(['one', 'two']));
        expect(isToolRegistered('one')).toBe(false);
        expect(isToolRegistered('two')).toBe(false);
        expect(isToolRegistered('three')).toBe(true);
        expect(isToolRegistered('four')).toBe(true);
    });

    it('returns an empty list when the resource has nothing registered', () => {
        registerTool(tool('foo', 'a'));
        expect(unregisterByResource('b')).toEqual([]);
    });
});

describe('registry.listToolSummaries', () => {
    it('returns a name + registrar pair per tool', () => {
        registerTool(tool('a', BUILTIN_RESOURCE));
        registerTool(tool('b', 'plugin'));
        const sums = listToolSummaries();
        expect(sums).toHaveLength(2);
        expect(sums).toContainEqual({ name: 'a', registeredBy: BUILTIN_RESOURCE });
        expect(sums).toContainEqual({ name: 'b', registeredBy: 'plugin' });
    });
});
