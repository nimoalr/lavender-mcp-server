export function safeStringify(v: unknown): string {
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
    try {
        return JSON.stringify(v, replacer, 2);
    } catch {
        return String(v);
    }
}

function replacer(_key: string, value: unknown) {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
    }
    return value;
}
