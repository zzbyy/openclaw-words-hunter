import type { PluginRuntime } from './types.js';

export async function emitPluginNotification(
  runtime: PluginRuntime,
  tag: 'nudge' | 'weekly' | 'inline',
  channelId: string | null,
  message: string,
): Promise<void> {
  const sender = resolveNotificationSender(runtime);

  if (channelId && sender) {
    try {
      await sender(channelId, message);
      return;
    } catch (error) {
      runtime.logger.info(`[words-hunter ${tag}] channel delivery failed for ${channelId}: ${String(error)}`);
    }
  }

  const channelSuffix = channelId ? ` [channel:${channelId}]` : '';
  runtime.logger.info(`[words-hunter ${tag}]${channelSuffix} ${message}`);
}

export function resolveNotificationSender(
  runtime: PluginRuntime,
): ((channelId: string, message: string) => Promise<void>) | null {
  if (typeof runtime.sendMessage === 'function') {
    return async (channelId: string, message: string) => {
      await runtime.sendMessage!(channelId, message);
    };
  }
  if (typeof runtime.postMessage === 'function') {
    return async (channelId: string, message: string) => {
      await runtime.postMessage!(channelId, message);
    };
  }
  if (typeof runtime.channels?.send === 'function') {
    return async (channelId: string, message: string) => {
      await runtime.channels!.send!(channelId, message);
    };
  }
  return null;
}
