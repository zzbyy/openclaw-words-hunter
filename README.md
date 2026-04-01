# Words Hunter — OpenClaw plugin

OpenClaw extension for [Words Hunter](https://github.com/zzbyy/words-hunter): vocabulary tools for Obsidian vaults (scan, load word, record mastery, etc.).

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

## Update

**npm install:** `openclaw plugins update words-hunter`
**Archive install:** download a new tarball and re-run `openclaw plugins install` (no tracked update).

## Development

```bash
npm install
npm run build
npm test
```

## License

Same as the parent Words Hunter project (see main repo).
