# 🤖 Enabling CI (one paste)

The agent that builds this repo isn't allowed to create `.github/workflows/` files,
so CI ships as a paste. **One-time setup, ~30 seconds:**

1. Copy the YAML below.
2. In this repo: **Add file → Create new file** → name it exactly
   `.github/workflows/ci.yml` → paste → commit.
3. Done — every push and PR now runs syntax checks + the full test suite.

> That commit is yours, so it counts on your graph too. 🥷

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    name: syntax + tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Syntax-check every JS file
        run: |
          status=0
          while IFS= read -r f; do
            node --check "$f" || status=1
          done < <(find assets/js tests -name '*.js')
          exit $status

      - name: Run test suite
        run: npm test

      - name: Sanity-check static files
        run: |
          test -f index.html
          test -f assets/css/style.css
          test -f assets/banner.png
          echo "all static assets present"
```

What the badges will look like once merged to `main`:

![CI](https://github.com/UCHIHA-MADARA-ANUJ/Commit/actions/workflows/ci.yml/badge.svg)
