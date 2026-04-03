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

import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { Type } from '@sinclair/typebox';
import fs from 'node:fs/promises';
import type { VaultConfig, ToolResult, PluginRuntime } from './types.js';
import { emitPluginNotification } from './notify-utils.js';
import { loadVaultConfig, mutateNudgeQueue, mutatePluginSidecarConfig, nudgeQueuePath, readPluginSidecarConfig, readMasteryStore, masteryJsonPath, writePluginSidecarConfig } from './vault.js';
import { readDiscovery, writeDiscovery } from './discovery.js';
import { importUntracked } from './importer.js';
import { scanVault } from './tools/scan-vault.js';
import { loadWord } from './tools/load-word.js';
import { recordMastery } from './tools/record-mastery.js';
import { updatePage } from './tools/update-page.js';
import { recordSighting } from './tools/record-sighting.js';
import { vaultSummary } from './tools/vault-summary.js';
import { onOutgoingMessage } from './hooks/sighting-hook.js';
import type { CoachingNote } from './hooks/sighting-hook.js';
import { formatCoachingFootnotes } from './coaching-format.js';
import { createWord } from './tools/create-word.js';
import { updateWordMeta } from './tools/update-word-meta.js';
import { startWatcher } from './watcher.js';
import { isWeeklyRecapDue, resolveRecapChannel } from './notifications.js';

/** Pending coaching footnotes keyed by channelId, consumed by message_sending hook. */
const pendingCoachingNotes = new Map<string, CoachingNote[]>();

/** Wrap any ToolResult into the AgentToolResult format OpenClaw expects. */
function toAgentResult(result: ToolResult<unknown>): { content: { type: 'text'; text: string }[]; details: unknown } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    details: result,
  };
}

export default definePluginEntry({
  id: 'words-hunter',
  name: 'Words Hunter',
  description: 'Master vocabulary captured via conversational AI sessions. Provides scan_vault, load_word, record_mastery, update_page, record_sighting, and vault_summary tools.',

  register(api) {
    const explicitRecapChannel = typeof api.pluginConfig?.['recap_channel'] === 'string'
      ? api.pluginConfig['recap_channel'] as string
      : undefined;

    // --- Vault config bootstrap ---
    // Resolution priority:
    //   1. ~/Library/Application Support/WordsHunter/discovery.json (shared with macOS app)
    //   2. api.pluginConfig['vault_path'] (manual override via openclaw config set)
    //   3. Error with instructions for both paths
    //
    // Whichever side (app or plugin) configures first writes the discovery file so the
    // other side can find the directory automatically.

    // Lazy config: resolved once, reused across all tool calls.
    // register() is synchronous so we kick off the async load here.
    const configPromise: Promise<{ ok: true; data: VaultConfig } | { ok: false; error: { message: string } }> =
      (async (): Promise<{ ok: true; data: VaultConfig } | { ok: false; error: { message: string } }> => {
        // 1. Try shared discovery file (written by the macOS app on settings save)
        const discovered = await readDiscovery();
        if (discovered) {
          api.logger.info(`[words-hunter] Discovered words directory: ${discovered.words_directory}`);
          const config: VaultConfig = {
            vault_path: discovered.words_directory,
            words_folder: discovered.words_folder,
          };
          // Ensure .wordshunter/config.json exists so downstream tools can use it
          await ensureConfigBridge(config);
          return { ok: true as const, data: config };
        }

        // 2. Try manual plugin config override
        const rawVaultPath = api.pluginConfig?.['vault_path'] as string | undefined;
        if (rawVaultPath) {
          api.logger.info(`[words-hunter] Using vault_path from plugin config: ${rawVaultPath}`);
          const bridgeResult = await loadVaultConfig(rawVaultPath) as { ok: true; data: VaultConfig } | { ok: false; error: { message: string } };
          if (bridgeResult.ok) {
            // Write to discovery file so the macOS app can find this path
            await writeDiscovery(bridgeResult.data.vault_path, bridgeResult.data.words_folder);
            return bridgeResult;
          }
          // Bridge file missing — treat the path itself as the words directory
          try {
            await fs.access(rawVaultPath);
            const config: VaultConfig = { vault_path: rawVaultPath, words_folder: '' };
            await ensureConfigBridge(config);
            await writeDiscovery(rawVaultPath, '');
            return { ok: true as const, data: config };
          } catch {
            return { ok: false as const, error: { message: `vault_path '${rawVaultPath}' does not exist on disk` } };
          }
        }

        // 3. Nothing configured
        api.logger.error(
          '[words-hunter] Words directory not configured. Either:\n' +
          '  - Install the Words Hunter macOS app and select a words directory, OR\n' +
          '  - Run: openclaw config set plugins.entries.words-hunter.config.vault_path /path/to/words'
        );
        return { ok: false as const, error: { message: 'Words directory not configured. Install the Words Hunter macOS app, or set vault_path in plugin config.' } };
      })();

    // Fire one-time import when config loads
    void configPromise.then(async (result) => {
      if (!result.ok) {
        api.logger.error(`[words-hunter] ${result.error.message}`);
        return;
      }
      const { imported } = await importUntracked(result.data);
      if (imported.length > 0) {
        api.logger.info(`[words-hunter] imported ${imported.length} untracked word(s): ${imported.join(', ')}`);
      }
    });

    // --- Tool registration ---

    api.registerTool({
      name: 'scan_vault',
      label: 'Scan Vault',
      description: "List words in the Words Hunter vault filtered by status. Use filter='due' for today's practice session, 'new' for unreviewed captures, or 'all' for everything.",
      parameters: Type.Object({
        filter: Type.Optional(Type.String({ description: "Filter: 'all' (default), 'due', or 'new'" })),
      }),
      async execute(_id, params) {
        const configResult = await configPromise;
        if (!configResult.ok) return toAgentResult({ ok: false, error: { code: 'VAULT_NOT_FOUND', message: configResult.error.message } }) as never;
        const result = await scanVault(configResult.data, (params.filter ?? 'all') as 'all' | 'due' | 'new');
        return toAgentResult(result) as never;
      },
    });

    api.registerTool({
      name: 'load_word',
      label: 'Load Word',
      description: 'Load a word page from the vault including its markdown content and mastery state. Returns the full .md content plus SRS data (box, score, next_review).',
      parameters: Type.Object({
        word: Type.String({ description: 'The word to load (case-insensitive, e.g. "posit")' }),
      }),
      async execute(_id, params) {
        const configResult = await configPromise;
        if (!configResult.ok) return toAgentResult({ ok: false, error: { code: 'VAULT_NOT_FOUND', message: configResult.error.message } }) as never;
        const result = await loadWord(configResult.data, params.word);
        return toAgentResult(result) as never;
      },
    });

    api.registerTool({
      name: 'record_mastery',
      label: 'Record Mastery',
      description: 'Record a mastery practice session for a word. Advances or drops the Leitner SRS box (threshold: 85/100). Supply the best sentence the user produced.',
      parameters: Type.Object({
        word: Type.String({ description: 'The word practiced' }),
        score: Type.Number({ description: 'Session score 0–100. ≥85 advances the box; <85 drops one box.' }),
        best_sentence: Type.Optional(Type.String({ description: "User's best sentence demonstrating the word" })),
        failure_note: Type.Optional(Type.String({ description: 'Brief note if the user struggled' })),
      }),
      async execute(_id, params) {
        const configResult = await configPromise;
        if (!configResult.ok) return toAgentResult({ ok: false, error: { code: 'VAULT_NOT_FOUND', message: configResult.error.message } }) as never;
        const result = await recordMastery(configResult.data, params);
        return toAgentResult(result) as never;
      },
    });

    api.registerTool({
      name: 'update_page',
      label: 'Update Page',
      description: "Write agent-generated content back to a word's .md page. Use for storing the best sentence after a session or writing a graduation section when the word reaches box 4+.",
      parameters: Type.Object({
        word: Type.String({ description: 'The word to update' }),
        best_sentence: Type.Optional(Type.String({ description: 'Best sentence to store in the ## Best Sentences section' })),
        graduation_sentence: Type.Optional(Type.String({ description: 'Memorable sentence for the ## Graduation section (box 4+ only)' })),
        content_hash: Type.Optional(Type.String({ description: 'MD5 of page content at read time — prevents overwriting concurrent edits' })),
      }),
      async execute(_id, params) {
        const configResult = await configPromise;
        if (!configResult.ok) return toAgentResult({ ok: false, error: { code: 'VAULT_NOT_FOUND', message: configResult.error.message } }) as never;
        const result = await updatePage(configResult.data, params);
        return toAgentResult(result) as never;
      },
    });

    api.registerTool({
      name: 'record_sighting',
      label: 'Record Sighting',
      description: "Append a sighting entry to a word's ## Sightings section. Call this when the user uses a captured word in a message.",
      parameters: Type.Object({
        word: Type.String({ description: 'The word that was sighted' }),
        sentence: Type.String({ description: 'The full sentence in which the word appeared' }),
        channel: Type.Optional(Type.String({ description: 'Channel label, e.g. "Telegram — work chat"' })),
      }),
      async execute(_id, params) {
        const configResult = await configPromise;
        if (!configResult.ok) return toAgentResult({ ok: false, error: { code: 'VAULT_NOT_FOUND', message: configResult.error.message } }) as never;
        const result = await recordSighting(configResult.data, params);
        return toAgentResult(result) as never;
      },
    });

    api.registerTool({
      name: 'create_word',
      label: 'Create Word',
      description: "Create a new word page in the Words Hunter vault and register it for study. Use this when the user wants to manually add a word they didn't capture via the macOS app.",
      parameters: Type.Object({
        word: Type.String({ description: 'The word to add (e.g. "ephemeral")' }),
      }),
      async execute(_id, params) {
        const configResult = await configPromise;
        if (!configResult.ok) return toAgentResult({ ok: false, error: { code: 'VAULT_NOT_FOUND', message: configResult.error.message } }) as never;
        const result = await createWord(configResult.data, params);
        return toAgentResult(result) as never;
      },
    });

    api.registerTool({
      name: 'update_word_meta',
      label: 'Update Word Meta',
      description: "Update per-word coaching metadata without affecting SRS state. Coaching is on by default for all words. Use coaching_mode 'silent' to suppress inline notifications for noisy words. Does not change box, score, or next_review.",
      parameters: Type.Object({
        word: Type.String(),
        coaching_mode: Type.Optional(Type.Union([Type.Literal('silent'), Type.Literal('inline')])),
        synonyms: Type.Optional(Type.Array(Type.String(), { maxItems: 5 })),
      }),
      async execute(_id, input) {
        const configResult = await configPromise;
        if (!configResult.ok) return toAgentResult({ ok: false, error: { code: 'VAULT_NOT_FOUND', message: configResult.error.message } }) as never;
        return toAgentResult(await updateWordMeta(configResult.data, input)) as never;
      },
    });

    api.registerTool({
      name: 'vault_summary',
      label: 'Vault Summary',
      description: 'Get aggregate stats for the Words Hunter vault: total words, mastery breakdown (mastered/reviewing/learning), due count, and last session date.',
      parameters: Type.Object({}),
      async execute() {
        const configResult = await configPromise;
        if (!configResult.ok) return toAgentResult({ ok: false, error: { code: 'VAULT_NOT_FOUND', message: configResult.error.message } }) as never;
        const result = await vaultSummary(configResult.data);
        return toAgentResult(result) as never;
      },
    });

    // --- Message hooks ---
    // message_received: /hunt command + sighting detection → stores coaching notes
    // message_sending: appends coaching footnotes to agent's outgoing reply
    api.on('message_received', async (event, ctx) => {
      const configResult = await configPromise;
      if (!configResult.ok) return;

      // Quick-add words from chat — natural language + legacy /hunt
      // Patterns: "add word X", "add this word X", "add words X Y Z",
      //           "hunt X", "vocab add X", "/hunt X"
      const addMatch = event.content.trim().match(
        /^(?:\/hunt|hunt|add\s+(?:this\s+)?words?|vocab\s+add)\s+(.+)$/i
      );
      if (addMatch) {
        const raw = addMatch[1].trim();
        const words = raw.split(/[\s,]+/).map(w => w.toLowerCase().trim()).filter(Boolean);
        for (const word of words) {
          const result = await createWord(configResult.data, { word });
          if (result.ok) {
            const lookupNote = result.data.lookup === 'ok'
              ? 'Cambridge lookup: ok'
              : `Cambridge lookup: ${result.data.lookup}`;
            api.logger.info(`[words-hunter] add: created page for '${word}' (${lookupNote})`);
          } else {
            api.logger.info(`[words-hunter] add '${word}': ${result.error.message}`);
          }
        }
        return; // don't run sighting scan on an add command
      }

      const notes = await onOutgoingMessage(configResult.data, event.content, ctx.channelId);
      if (notes.length > 0 && ctx.channelId) {
        const existing = pendingCoachingNotes.get(ctx.channelId) ?? [];
        pendingCoachingNotes.set(ctx.channelId, [...existing, ...notes]);
      }
      // Also persist primary_channel for nudge routing
      void persistPrimaryChannel(configResult.data, ctx.channelId);
    });

    api.on('message_sending', async (event) => {
      if (!event.to) return;
      const notes = pendingCoachingNotes.get(event.to);
      if (!notes || notes.length === 0) return;
      pendingCoachingNotes.delete(event.to);
      try {
        const footnotes = formatCoachingFootnotes(notes);
        if (footnotes) {
          api.logger.info(`[words-hunter coaching] appended ${notes.length} footnote(s) to reply`);
          return { content: event.content + '\n\n' + footnotes };
        }
      } catch (err) {
        api.logger.info(`[words-hunter coaching] format error: ${String(err)}`);
      }
    });

    // --- Background crons via gateway_start ---
    // OpenClawPluginApi has no registerCron. Use gateway lifecycle hooks + setInterval.
    let nudgeInterval: ReturnType<typeof setInterval> | null = null;
    let weeklyInterval: ReturnType<typeof setInterval> | null = null;
    let stopWatcherFn: (() => void) | null = null;

    api.on('gateway_start', async (_event, _ctx) => {
      const configResult = await configPromise;
      if (!configResult.ok) return;
      const config = configResult.data;

      if (nudgeInterval) { clearInterval(nudgeInterval); nudgeInterval = null; }
      if (weeklyInterval) { clearInterval(weeklyInterval); weeklyInterval = null; }
      if (stopWatcherFn) { stopWatcherFn(); stopWatcherFn = null; }

      // Start file watcher for 24h capture nudges
      stopWatcherFn = await startWatcher(config, api.logger, {
        sendWarning: (msg) => {
          api.logger.info(`[words-hunter nudge] ${msg}`);
        },
      });

      void fireOverdueNudges(config, api);
      void fireWeeklyRecapIfDue(config, api, explicitRecapChannel);

      // Nudge check every 15 minutes
      nudgeInterval = setInterval(() => {
        void fireOverdueNudges(config, api);
      }, 15 * 60 * 1000);

      // Weekly recap: check every 15 minutes and fire once per weekly slot.
      weeklyInterval = setInterval(() => {
        void fireWeeklyRecapIfDue(config, api, explicitRecapChannel);
      }, 15 * 60 * 1000);
    });

    api.on('gateway_stop', async (_event, _ctx) => {
      if (nudgeInterval) { clearInterval(nudgeInterval); nudgeInterval = null; }
      if (weeklyInterval) { clearInterval(weeklyInterval); weeklyInterval = null; }
      if (stopWatcherFn) { stopWatcherFn(); stopWatcherFn = null; }
    });
  },
});

// --- Helpers ---

/**
 * Ensure .wordshunter/config.json exists inside the words directory.
 * This file is used by loadVaultConfig() and stores primary_channel.
 * When the plugin discovers a path from the discovery file (not from config.json),
 * we need to create a minimal bridge so downstream tools work correctly.
 */
async function ensureConfigBridge(config: VaultConfig): Promise<void> {
  const existing = await readPluginSidecarConfig(config.vault_path);
  if (existing) return;

  await writePluginSidecarConfig(config.vault_path, {
    vault_path: config.vault_path,
    words_folder: config.words_folder,
  });
}

async function fireOverdueNudges(config: VaultConfig, runtime: PluginRuntime): Promise<void> {
  const sidecar = await readPluginSidecarConfig(config.vault_path);
  if (!sidecar?.primary_channel) return;

  const queuePath = nudgeQueuePath(config);
  const now = new Date();
  const queueResult = await mutateNudgeQueue(queuePath, (queue) => {
    const due: typeof queue.nudges = [];
    const remaining = [];

    for (const nudge of queue.nudges) {
      if (new Date(nudge.nudge_due_at) <= now) {
        due.push(nudge);
      } else {
        remaining.push(nudge);
      }
    }

    return {
      queue: { ...queue, nudges: remaining },
      value: due,
    };
  });

  if (!queueResult.ok || queueResult.data.length === 0) return;

  const jsonPath = masteryJsonPath(config);
  const storeResult = await readMasteryStore(jsonPath);
  const store = storeResult.ok ? storeResult.data : null;

  for (const nudge of queueResult.data) {
    if (store?.words[nudge.word]?.sessions && store.words[nudge.word].sessions > 0) continue;
    await emitPluginNotification(
      runtime,
      'nudge',
      sidecar.primary_channel,
      `"${nudge.word}" — captured 24h ago. Say "let's review words" to practice.`,
    );
  }
}

async function fireWeeklyRecapIfDue(
  config: VaultConfig,
  runtime: PluginRuntime,
  explicitRecapChannel: string | undefined,
): Promise<void> {
  const now = new Date();
  const claimResult = await mutatePluginSidecarConfig(config.vault_path, (current) => {
    const next = {
      ...current,
      vault_path: config.vault_path,
      words_folder: current.words_folder || config.words_folder,
    };
    const due = isWeeklyRecapDue(now, next.last_weekly_recap_at);
    if (due) {
      next.last_weekly_recap_at = now.toISOString();
    }
    return {
      next,
      value: {
        due,
        primary_channel: next.primary_channel,
      },
    };
  });
  if (!claimResult.ok || !claimResult.data.due) return;

  const jsonPath = masteryJsonPath(config);
  const storeResult = await readMasteryStore(jsonPath);
  if (!storeResult.ok) return;
  const words = Object.values(storeResult.data.words);
  const mastered = words.filter(w => w.box >= 4).length;
  const reviewing = words.filter(w => w.box === 3).length;
  const learning = words.filter(w => w.box <= 2).length;
  const message = `${words.length} words — ${mastered} mastered, ${reviewing} reviewing, ${learning} learning`;
  const channelId = resolveRecapChannel(explicitRecapChannel, claimResult.data);
  await emitPluginNotification(runtime, 'weekly', channelId, message);
}

async function persistPrimaryChannel(config: VaultConfig, channelId: string): Promise<void> {
  const result = await mutatePluginSidecarConfig(config.vault_path, (current) => ({
    next: current.primary_channel
      ? current
      : {
          ...current,
          vault_path: config.vault_path,
          words_folder: current.words_folder || config.words_folder,
          primary_channel: channelId,
        },
    value: undefined,
  }));

  if (!result.ok) {
    // best effort
  }
}

