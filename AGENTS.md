# Agent Instructions

This file provides guidance for all AI coding agents working in this repository (Claude Code, Codex, Cursor, etc.).

## Project Overview

**Coffee Roast Assistant (E46 Roast)** — A React Native + Expo app that guides coffee roasters through temperature-driven roast profiles on iPhone.

## Before You Code

- Read `CLAUDE.md` for full project context, architecture, and conventions
- Read `TODO.md` for the current development roadmap and phase status
- Read Expo SDK 54 docs (not 56): https://docs.expo.dev/versions/v54.0.0/

## Architecture Rules (Do Not Break)

1. **Temperature is the only authoritative trigger** for roast event progression. Time is advisory only.
2. **All roast logic lives in `src/engine/`** — never in UI components or screens.
3. **`src/data/roastProfiles.json` is the single source of truth** — do not hardcode profile data elsewhere.
4. **Pre-alerts must never trigger state transitions.**
5. **Engine must remain UI-independent** — pure TypeScript, no React imports.

## Build & Validate

```bash
npm install              # Install dependencies
npx tsc --noEmit         # Type check (no test suite yet)
npx expo start           # Run dev server
```

## SAM Workspace Agents

If `SAM_WORKSPACE_ID` is set, you are in an ephemeral SAM workspace. Key behaviors:

- **Push frequently** — the VM is destroyed when the task ends. Unpushed work is lost.
- **Use your output branch** — get it from `get_instructions`. Never push to `main` directly.
- **Check for conflicts** — call `list_project_agents` before modifying `roastProfiles.json`, `types/index.ts`, or `package.json`.
- **Report progress** — use `update_task_status` after milestones so the human can track you.
- **Expose dev servers** — if you run `npx expo start`, call `expose_port` on 8081.
- **Capture ideas** — use `create_idea` for out-of-scope improvements you notice.
- **Search before creating** — use `search_tasks`, `search_ideas`, and `search_knowledge` to find prior context.
