# Words Hunter — OpenClaw plugin

[![CI](https://github.com/zzbyy/openclaw-words-hunter/actions/workflows/ci.yml/badge.svg)](https://github.com/zzbyy/openclaw-words-hunter/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/words-hunter-openclaw.svg)](https://www.npmjs.com/package/words-hunter-openclaw)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

OpenClaw extension for [Words Hunter](https://github.com/zzbyy/words-hunter): vocabulary tools for Obsidian vaults.

## Features

- Scan your vault for vocabulary notes
- Load a word into context for study or conversation
- Record sightings and mastery
- SRS-related helpers and weekly recap channel support (see plugin config)

## Install

OpenClaw only accepts **npm registry packages**, **ClawHub** (`clawhub:…`), **local paths**, or **archives** (`.tgz` / `.zip`). It does **not** accept `github:user/repo` or git URLs as an npm spec.

### Option A — npm (recommended; supports `plugins update`)

After the package is published to npm as `words-hunter-openclaw`:

```bash
openclaw plugins install words-hunter-openclaw
```

Add `words-hunter` to `plugins.allow` in OpenClaw config if you use an allowlist.

**Publish** (maintainers only, requires npm login):

```bash
npm publish --access public
```

### Option B — GitHub source tarball (no npm account)

Download the default branch as a tarball and install the archive:

```bash
curl -fsSL -o /tmp/openclaw-words-hunter.tgz \
  "https://codeload.github.com/zzbyy/openclaw-words-hunter/tar.gz/refs/heads/main"
openclaw plugins install /tmp/openclaw-words-hunter.tgz
```

Re-install from a fresh tarball when you want a new version (archive installs are skipped by `openclaw plugins update`).

### Option C — local dev

```bash
git clone https://github.com/zzbyy/openclaw-words-hunter.git
cd openclaw-words-hunter
npm install && npm run build
openclaw plugins install -l .
```

## Configuration

Optional plugin settings (see `openclaw.plugin.json` in this repo):

| Key | Description |
| --- | --- |
| `vault_path` | Absolute path to your words directory. Usually auto-discovered from the Words Hunter macOS app — set manually only if auto-discovery fails. |
| `recap_channel` | Channel ID for weekly vocab recap. Defaults to the channel where the first session ran. |

## Update

**npm install:** `openclaw plugins update words-hunter`
**Archive install:** download a new tarball and re-run `openclaw plugins install` (no tracked update).

## Development

```bash
npm install
npm run build
npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE).
