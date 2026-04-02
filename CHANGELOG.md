# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-04-02

### Added

- `words-hunter repair` CLI (`npm run repair`, package `bin` entry) to regenerate `> [!mastery]` callouts from `.wordshunter/mastery.json`.
- `tests/mastery-lock.test.ts`, `tests/graduation-guard.test.ts`, and `tests/repair.test.ts`.

### Changed

- **Concurrency:** `withMasteryLock()` around mastery store read/write paths (via `proper-lockfile`) to avoid lost updates when the sighting hook and sessions run together.
- **Graduation:** `update_page` validates `graduation_sentence` (non-empty, contains the word on a word boundary, ≤200 characters) and returns `INVALID_GRADUATION` when invalid.
- **Sighting hook:** parallel `record_sighting` calls via `Promise.allSettled` with warnings on failures.
- **Importer:** skips `_`-prefixed `.md` files and files whose head lacks a `> [!info]` callout, so templates and non-word notes are not imported into `mastery.json`.
- **README:** `## Privacy` section for the sighting hook.

## [1.1.0] - 2026-04-01

### Added

- Open source project structure: MIT license, contributing guide, changelog, GitHub issue/PR templates, and CI workflows.
- `npm` package `files` list and `prepack` script so published packages include a fresh `dist/` build; `dist/` is no longer tracked in git.

[1.2.0]: https://github.com/zzbyy/openclaw-words-hunter/releases/tag/v1.2.0
[1.1.0]: https://github.com/zzbyy/openclaw-words-hunter/releases/tag/v1.1.0
