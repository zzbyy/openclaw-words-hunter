#!/usr/bin/env node
/**
 * Postinstall hook: ensure Words Hunter tools are in `tools.alsoAllow`.
 *
 * When the user has a restrictive tool profile (e.g. "coding"), plugin tools
 * are invisible to the agent unless explicitly listed in `tools.alsoAllow`.
 * This script patches ~/.openclaw/openclaw.json on install so the plugin
 * works out of the box — no manual configuration required.
 *
 * Best-effort: failures are logged but never block the install.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/** Every tool name our plugin registers via api.registerTool(). */
const PLUGIN_TOOLS = [
  'scan_vault',
  'load_word',
  'record_mastery',
  'update_page',
  'record_sighting',
  'create_word',
  'update_word_meta',
  'vault_summary',
  'prepare_review',
] as const;

/** Profiles that already grant all tools — no patching needed. */
const UNRESTRICTED_PROFILES = new Set(['full', undefined]);

async function main(): Promise<void> {
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');

  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch {
    // No config file — nothing to patch (fresh install, or non-standard location).
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Malformed config — don't touch it.
    return;
  }

  // If profile is 'full' or unset, all tools are already available.
  const tools = (config.tools ?? {}) as Record<string, unknown>;
  const profile = tools.profile as string | undefined;
  if (UNRESTRICTED_PROFILES.has(profile)) {
    return;
  }

  // Merge our tool names into tools.alsoAllow (create if missing).
  const existing = Array.isArray(tools.alsoAllow) ? tools.alsoAllow as string[] : [];
  const existingSet = new Set(existing);
  const toAdd = PLUGIN_TOOLS.filter(t => !existingSet.has(t));

  if (toAdd.length === 0) {
    // Already configured — nothing to do.
    return;
  }

  tools.alsoAllow = [...existing, ...toAdd];
  config.tools = tools;

  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  } catch {
    // Write failed (permissions?) — log but don't block install.
    console.warn(
      '[words-hunter] Could not auto-configure tools.alsoAllow. ' +
      'If the agent cannot call Words Hunter tools, run:\n' +
      `  openclaw config set tools.alsoAllow '${JSON.stringify([...existing, ...PLUGIN_TOOLS])}'`,
    );
  }
}

void main().catch(() => {
  // Swallow all errors — postinstall must never fail the install.
});
