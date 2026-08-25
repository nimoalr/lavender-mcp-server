# Extending lavender-mcp-server

Server-side resources can register MCP tools through the `lavender-mcp-server` exports. Registration requires an explicit ACE grant for each resource.

## Operator configuration

Grant the registering resource permission in `server.cfg`:

```cfg
add_ace resource.my-resource lavender_mcp.register_tool allow
```

Without this ACE, `registerTool` returns `{ ok: false, error }` and logs the rejection.

## Exports

| Export | Return value |
|---|---|
| `isAvailable()` | `boolean` indicating whether the HTTP listener is active |
| `getPort()` | Active listening port, or `null` |
| `getRegisteredTools()` | Array of `{ name, registeredBy }` entries |
| `registerTool(definition, handler)` | `{ ok: true, fullName }` or `{ ok: false, error }` |
| `unregisterTool(localName)` | `true` when a tool owned by the caller was removed |

Expected registration failures return `{ ok: false, error }`:

- Missing `lavender_mcp.register_tool` ACE
- Collision with a built-in tool
- Duplicate registration by the same resource

Invalid definitions and handlers throw because they indicate an integration error.

## Tool definition

```ts
interface ToolDefinition {
    name: string;
    description?: string;
    inputSchema?: Record<string, SchemaField>;
    timeoutMs?: number;
}
```

Rules:

- `name` contains 1–64 ASCII letters, digits, underscores, or hyphens.
- The exposed name is `<resource-name>.<local-name>`.
- `description` is at most 1,000 characters.
- `timeoutMs` is an integer from 100 to 300,000; the default is 30,000.
- Input fields are required unless `optional: true` is set.

### Input schema fields

| Type | Options |
|---|---|
| `string` | `description`, `optional` |
| `number` | `description`, `optional`, `min`, `max`, `integer` |
| `boolean` | `description`, `optional` |
| `enum` | `description`, `optional`, `values: string[]` |
| `array` | `description`, `optional`, `items`, `minItems` |

Object fields are not supported. Arrays may contain another supported schema field.

## Examples

### JavaScript

```js
// my-resource/server.js
let lavenderToolsRegistered = false;

function registerLavenderTools() {
    if (lavenderToolsRegistered) return;

    let lavender;
    try {
        lavender = exports['lavender-mcp-server'];
        if (!lavender.isAvailable()) return;
    } catch {
        // The export may not be live yet during FiveM's onResourceStart event.
        return;
    }

    const result = lavender.registerTool(
        {
            name: 'get_open_jobs',
            description: 'List open jobs.',
            inputSchema: {
                status: {
                    type: 'enum',
                    values: ['open', 'in_progress', 'all'],
                    optional: true,
                },
                limit: {
                    type: 'number',
                    integer: true,
                    min: 1,
                    max: 100,
                    optional: true,
                },
            },
        },
        async ({ status, limit }) => {
            return fetchJobs({
                status: status ?? 'open',
                limit: limit ?? 20,
            });
        },
    );

    if (!result.ok) {
        console.warn(`[my-resource] ${result.error}`);
        return;
    }

    lavenderToolsRegistered = true;
}

// Authoritative re-registration signal. lavender emits this with no payload
// after its exports are live and its MCP HTTP listener is accepting requests.
on('lavender_mcp:requestToolRegistration', () => {
    lavenderToolsRegistered = false;
    registerLavenderTools();
});

// Fallback for this resource starting while lavender is already ready.
on('onResourceStart', (resourceName) => {
    if (
        resourceName === GetCurrentResourceName() ||
        resourceName === 'lavender-mcp-server'
    ) {
        registerLavenderTools();
    }
});

on('onResourceStop', (resourceName) => {
    if (resourceName === 'lavender-mcp-server') {
        lavenderToolsRegistered = false;
    }
});
```

### Lua

```lua
-- my-resource/server.lua
local lavenderToolsRegistered = false

local function registerLavenderTools()
    if lavenderToolsRegistered then return end

    -- The export may not be live yet during FiveM's onResourceStart event.
    local availableOk, available = pcall(function()
        return exports['lavender-mcp-server']:isAvailable()
    end)
    if not availableOk or not available then return end

    local callOk, result = pcall(function()
        return exports['lavender-mcp-server']:registerTool({
            name = 'get_open_jobs',
            description = 'List open jobs.',
            inputSchema = {
                status = {
                    type = 'enum',
                    values = { 'open', 'in_progress', 'all' },
                    optional = true,
                },
                limit = {
                    type = 'number',
                    integer = true,
                    min = 1,
                    max = 100,
                    optional = true,
                },
            },
        }, function(args)
            return fetchJobs({
                status = args.status or 'open',
                limit = args.limit or 20,
            })
        end)
    end)

    if not callOk then
        print(('[my-resource] registerTool failed: %s'):format(result))
        return
    end
    if not result.ok then
        print(('[my-resource] %s'):format(result.error))
        return
    end

    lavenderToolsRegistered = true
end

-- Authoritative re-registration signal. lavender emits this with no payload
-- after its exports are live and its MCP HTTP listener is accepting requests.
AddEventHandler('lavender_mcp:requestToolRegistration', function()
    lavenderToolsRegistered = false
    registerLavenderTools()
end)

-- Fallback for this resource starting while lavender is already ready.
AddEventHandler('onResourceStart', function(resourceName)
    if resourceName == GetCurrentResourceName()
        or resourceName == 'lavender-mcp-server' then
        registerLavenderTools()
    end
end)

AddEventHandler('onResourceStop', function(resourceName)
    if resourceName == 'lavender-mcp-server' then
        lavenderToolsRegistered = false
    end
end)
```

`lavender_mcp:requestToolRegistration` is emitted on every successful lavender start, including restarts. Treat it as the authoritative signal to register: handlers can immediately call `registerTool`. Keep the `onResourceStart` fallback for the opposite ordering, where the consumer starts after lavender and therefore missed its earlier signal.

## Handler results

A handler may return a JSON-serializable value. lavender-mcp-server converts it into one MCP text content block.

To control the MCP result directly, return a `CallToolResult`-compatible object:

JavaScript:

```js
return {
    content: [
        { type: 'text', text: 'completed' },
    ],
};
```

Lua:

```lua
return {
    content = {
        { type = 'text', text = 'completed' },
    },
}
```

Thrown errors and handler timeouts are returned to the MCP client with `isError: true`; they do not stop the owning resource.

## Lifecycle

- Tools remain registered until their owning resource stops or calls `unregisterTool`.
- Stopping an owning resource removes all tools registered by that resource.
- After `lavender-mcp-server` restarts, consumers must register again in response to `lavender_mcp:requestToolRegistration`.
- A resource cannot unregister another resource's tools because `unregisterTool` always applies the caller's namespace.

## Internal client callbacks

Do not use the internal `lavender_mcp:cb:trigger` or `lavender_mcp:cb:result` events. They are reserved for lavender-mcp-server's private server-to-client callbacks.
