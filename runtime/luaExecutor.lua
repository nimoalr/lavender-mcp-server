local MAX_DEPTH = 8
local MAX_TABLE_ITEMS = 100
local MAX_VALUE_LENGTH = 262144
local MAX_OUTPUT_ENTRIES = 500
local MAX_OUTPUT_LENGTH = 8192

local function truncate(value, limit)
    if #value <= limit then
        return value
    end
    local suffix = '... [truncated]'
    if limit <= #suffix then
        return value:sub(1, limit)
    end
    return value:sub(1, limit - #suffix) .. suffix
end

local function inspect(value, seen, depth)
    local valueType = type(value)
    if valueType == 'nil' then
        return 'nil'
    end
    if valueType == 'string' then
        return string.format('%q', value)
    end
    if valueType == 'number' or valueType == 'boolean' then
        return tostring(value)
    end
    if valueType ~= 'table' then
        return string.format('<%s: %s>', valueType, tostring(value))
    end

    if seen[value] then
        return '[Circular]'
    end
    if depth >= MAX_DEPTH then
        return '[MaxDepth]'
    end

    seen[value] = true
    local count = 0
    local maxIndex = 0
    local array = true
    for key in pairs(value) do
        count = count + 1
        if type(key) ~= 'number' or key < 1 or key % 1 ~= 0 then
            array = false
        elseif key > maxIndex then
            maxIndex = key
        end
    end
    array = array and maxIndex == count

    local parts = {}
    if array then
        local limit = math.min(maxIndex, MAX_TABLE_ITEMS)
        for index = 1, limit do
            parts[#parts + 1] = inspect(value[index], seen, depth + 1)
        end
        if maxIndex > limit then
            parts[#parts + 1] = string.format('[Truncated %d item(s)]', maxIndex - limit)
        end
        seen[value] = nil
        return '[' .. table.concat(parts, ', ') .. ']'
    end

    local entries = {}
    for key, entryValue in pairs(value) do
        entries[#entries + 1] = {
            key = key,
            value = entryValue,
            sortKey = tostring(key),
        }
    end
    table.sort(entries, function(left, right)
        return left.sortKey < right.sortKey
    end)

    local limit = math.min(#entries, MAX_TABLE_ITEMS)
    for index = 1, limit do
        local entry = entries[index]
        parts[#parts + 1] = string.format(
            '[%s] = %s',
            inspect(entry.key, seen, depth + 1),
            inspect(entry.value, seen, depth + 1)
        )
    end
    if #entries > limit then
        parts[#parts + 1] = string.format('[Truncated %d item(s)]', #entries - limit)
    end
    seen[value] = nil
    return '{' .. table.concat(parts, ', ') .. '}'
end

local function stringify(value)
    local ok, result = pcall(inspect, value, {}, 0)
    if not ok then
        local fallbackOk, fallback = pcall(tostring, value)
        result = fallbackOk and fallback or '<unprintable value>'
    end
    return truncate(result, MAX_VALUE_LENGTH)
end

local function formatOutputArg(value)
    if type(value) == 'string' then
        return value
    end
    return stringify(value)
end

local function executeLua(code)
    if type(code) ~= 'string' then
        return { ok = false, error = 'Lua source must be a string.' }
    end

    local output = {}
    local outputTruncated = false

    local function appendOutput(message)
        if #output >= MAX_OUTPUT_ENTRIES then
            if not outputTruncated then
                outputTruncated = true
                output[#output] = '[output truncated]'
            end
            return
        end
        output[#output + 1] = truncate(tostring(message), MAX_OUTPUT_LENGTH)
    end

    local environment = {}
    setmetatable(environment, { __index = _G })
    environment._G = environment

    environment.print = function(...)
        local args = table.pack(...)
        local formatted = {}
        for index = 1, args.n do
            formatted[index] = formatOutputArg(args[index])
        end
        appendOutput(table.concat(formatted, '\t'))
        print(table.unpack(args, 1, args.n))
    end

    if type(Citizen) == 'table' and type(Citizen.Trace) == 'function' then
        local citizenProxy = {}
        setmetatable(citizenProxy, { __index = Citizen })
        citizenProxy.Trace = function(message)
            appendOutput(tostring(message):gsub('\n$', ''))
            return Citizen.Trace(message)
        end
        environment.Citizen = citizenProxy
    end

    local chunk, compileError = load(code, '@lavender-mcp/execute_code', 't', environment)
    if not chunk then
        return { ok = false, error = tostring(compileError) }
    end

    local function errorHandler(err)
        local message = tostring(err)
        if debug and type(debug.traceback) == 'function' then
            return debug.traceback(message, 2)
        end
        return message
    end

    local packed = table.pack(xpcall(chunk, errorHandler))
    if not packed[1] then
        local result = { ok = false, error = truncate(tostring(packed[2]), MAX_VALUE_LENGTH) }
        if #output > 0 then
            result.output = output
        end
        return result
    end

    local returnCount = packed.n - 1
    local value
    if returnCount <= 1 then
        value = stringify(packed[2])
    else
        local values = {}
        for index = 1, returnCount do
            values[index] = stringify(packed[index + 1])
        end
        value = '[' .. table.concat(values, ', ') .. ']'
    end

    local result = { ok = true, value = value }
    if #output > 0 then
        result.output = output
    end
    return result
end

exports('__lavenderExecuteLua', executeLua)
