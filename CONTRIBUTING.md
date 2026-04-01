# Contributing

Thanks for helping improve Words Hunter for OpenClaw.

## Build output

Compiled JavaScript lives in `dist/`, which is **not** committed. Run `npm run build` after pulling changes. The `prepack` script runs `build` automatically before `npm pack` / `npm publish`.

## Development setup

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/zzbyy/openclaw-words-hunter.git
   cd openclaw-words-hunter
   npm install
   ```

2. Build and test:

   ```bash
   npm run build
   npm test
   ```

3. Optional: run tests in watch mode while developing:

   ```bash
   npm run test:watch
   ```

4. Optional: run eval tests:

   ```bash
   npm run test:evals
   ```

## Branch and PR workflow

- Open PRs against `main`.
- Use a short, descriptive branch name (e.g. `fix/scan-edge-case`, `feat/recap-tuning`).
- Keep changes focused; split unrelated work into separate PRs.

## Pull request checklist

- [ ] `npm run build` succeeds.
- [ ] `npm test` passes.
- [ ] For user-facing behavior, update [README.md](README.md) or [CHANGELOG.md](CHANGELOG.md) as needed.

## Maintainer: npm publish via GitHub Actions

Releases can publish to npm automatically when you create a **GitHub Release** (not only a tag), if the workflow is enabled.

1. In the repository **Settings → Secrets and variables → Actions**, add a secret named `NPM_TOKEN` with an [npm automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens) that has publish rights to `words-hunter-openclaw`.
2. Create a release on GitHub with a new version tag; the publish workflow runs `npm publish`.

## Code style

There is no enforced ESLint/Prettier config in this repo yet. Match existing TypeScript style in `src/` and keep new code readable and tested.

## Questions

Open an [issue](https://github.com/zzbyy/openclaw-words-hunter/issues) if something is unclear.
