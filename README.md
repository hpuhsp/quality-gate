# quality-gate — Shift-Left Local Quality Gates

Pre-commit & pre-push hooks. Zero project files. Install once, use everywhere.

## Install

```bash
npm install -g ./quality-gate
```

## Usage

```bash
cd my-project
quality-gate enable       # Activate hooks (sets git config core.hooksPath)
quality-gate status       # Show hook status + project detection
quality-gate disable      # Deactivate hooks
```

## What it checks

**pre-commit** (< 5s, deterministic):
- Secret scan (AWS keys, private keys, tokens, passwords)
- Auto-format (ktlint for Kotlin, prettier for JS)

**pre-push** (< 2min, deterministic):
- Unit tests (JUnit5 for Kotlin/Java, Vitest/Jest for JS)
- Coverage threshold (default 60%)

## Multi-project config

```bash
# Team-wide config from a shared GitLab repo:
export QG_REMOTE_REPO=https://gitlab.com/ci/shared-pipeline.git
quality-gate enable
```

## Architecture

Same as the CI pipeline — "install once, use everywhere":
- CI: Docker Runner image + include:project
- Local: npm global install + git core.hooksPath
