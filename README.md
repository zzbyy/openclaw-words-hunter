# Words Hunter — OpenClaw plugin

[![CI](https://github.com/zzbyy/openclaw-words-hunter/actions/workflows/ci.yml/badge.svg)](https://github.com/zzbyy/openclaw-words-hunter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

OpenClaw extension for [Words Hunter](https://github.com/zzbyy/words-hunter): vocabulary tools for Obsidian vaults.

## Features

- Scan your vault for vocabulary notes
- Load a word into context for study or conversation
- Record sightings and mastery
- SRS-related helpers and weekly recap channel support (see plugin config)

## Install

Download the pre-built tarball from the [latest release](https://github.com/zzbyy/openclaw-words-hunter/releases/latest) and install it.

**Via curl:**

```bash
curl -fsSL -o /tmp/openclaw-words-hunter.tgz \
  "https://github.com/zzbyy/openclaw-words-hunter/releases/latest/download/words-hunter-openclaw.tgz"
openclaw plugins install /tmp/openclaw-words-hunter.tgz
```

**Or manually:** go to [Releases](https://github.com/zzbyy/openclaw-words-hunter/releases/latest), download `words-hunter-openclaw.tgz`, then:

```bash
openclaw plugins install /path/to/words-hunter-openclaw.tgz
```

Add `words-hunter` to `plugins.allow` in OpenClaw config if you use an allowlist.

### Local dev

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

Download the new release tarball and re-run the install command above. Archive installs are not tracked by `openclaw plugins update`.

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
