# Contributing to CommitQuest

Thanks for helping! This repo is deliberately dependency-free — please keep it that way.

## The fast path (also the fun path)

1. Read [`docs/ALL-FIVE-GUIDE.md`](docs/ALL-FIVE-GUIDE.md) — opening an issue, PR or
   review here is both a contribution *to* the project and a contribution *type* on
   your GitHub graph. Everyone wins.
2. The [`good-first-pr`](https://github.com/UCHIHA-MADARA-ANUJ/Commit/tree/good-first-pr)
   branch exists specifically for first pull requests.

## Ground rules

- **Vanilla only** — no frameworks, no npm packages at runtime, no build step.
- **Test the pure logic** — anything data-ish goes in `assets/js/engine.js`
  (node-safe, no DOM) with tests in `tests/run.tests.js`. DOM glue stays in `app.js`.
- **Run before you push:**
  ```bash
  npm test
  ```
  CI runs the same thing once activated — it's a one-paste workflow, see
  [docs/CI.md](docs/CI.md).
- **Commits:** conventional style — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.
- **Be kind.** Shinobi code of conduct: no genjutsu in the issue tracker.

## Adding a quest / rank / chart idea

Great! Quests live in `assets/js/quests.js`, ranks in `assets/js/engine.js`.
Both are pure modules — add tests for new behavior and you're golden.
