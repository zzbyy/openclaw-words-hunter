/**
 * Type stubs for openclaw/plugin-sdk/plugin-entry.
 *
 * The real types come from the `openclaw` package, which is only available
 * at runtime (installed globally by the OpenClaw gateway). These minimal
 * stubs let TypeScript compile without the full package.
 */
declare module 'openclaw/plugin-sdk/plugin-entry' {
  export interface PluginLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  }

  export interface OpenClawPluginApi {
    pluginConfig?: Record<string, unknown>;
    logger: PluginLogger;
    registerTool(tool: {
      name: string;
      label: string;
      description: string;
      parameters: Record<string, unknown>;
      execute(id: string, params: Record<string, unknown>): Promise<unknown>;
    }): void;
    on(event: string, handler: (...args: any[]) => void | Promise<void>): void;
  }

  interface DefinePluginEntryOptions {
    id: string;
    name: string;
    description: string;
    register: (api: OpenClawPluginApi) => void;
  }

  export function definePluginEntry(options: DefinePluginEntryOptions): unknown;
}
