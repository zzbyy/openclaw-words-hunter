/**
 * Words Hunter OpenClaw Plugin
 *
 * Registers 6 agent tools and 1 message hook for vocabulary mastery.
 * All state is in {vault}/.wordshunter/mastery.json.
 * Word .md pages are display/content layer.
 *
 * Entry point follows the real OpenClaw SDK contract:
 *   - default export via definePluginEntry
 *   - api.registerTool({name, description, parameters, execute})
 *   - api.on('message_received', handler) for sighting detection
 *   - api.on('gateway_start', handler) for background crons
 *   - Vault path from api.pluginConfig.vault_path (set on plugin install)
 */
declare const _default: {
    id: string;
    name: string;
    description: string;
    configSchema: import("openclaw/plugin-sdk/plugin-entry").OpenClawPluginConfigSchema;
    register: NonNullable<import("openclaw/plugin-sdk/plugin-entry").OpenClawPluginDefinition["register"]>;
} & Pick<import("openclaw/plugin-sdk/plugin-entry").OpenClawPluginDefinition, "kind">;
export default _default;
//# sourceMappingURL=index.d.ts.map