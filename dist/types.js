// ============================================================
// ToolResult<T> — discriminated union for all tool returns
// ============================================================
export function ok(data) {
    return { ok: true, data };
}
export function err(error) {
    return { ok: false, error };
}
//# sourceMappingURL=types.js.map