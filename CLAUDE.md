# Coffee Roast Assistant (E46 Roast)

A real-time, temperature-driven roast guidance app for iPhone built with React Native + Expo. The app walks a roaster step-by-step through a roast profile, advancing based on temperature thresholds.

## Quick Reference

- **Build/run:** `npx expo start` (requires Expo Go or dev build on device)
- **Install deps:** `npm install`
- **TypeScript check:** `npx tsc --noEmit`
- **No test suite yet** — validate changes with `npx tsc --noEmit`
- **Expo SDK:** 54 (not 56 — see Tech Debt in TODO.md)
- **React Native:** 0.81.5, React 19.1.0

## Architecture (Three Layers)

1. **Data Layer** (`src/data/roastProfiles.json`) — Single JSON source of truth for all roast profiles. Immutable at runtime. All logic derives from this.
2. **Engine Layer** (`src/engine/`) — Pure TypeScript state machine. Accepts temperature input, evaluates events, returns active/next event and required actions. Zero UI dependencies.
3. **UI Layer** (`src/screens/`, `src/components/`) — Displays state from the engine. Contains zero roast logic.

### Critical Rule: Temperature is the only authoritative trigger

The engine must never advance roast steps based on time alone. Time is advisory only (ROR analysis, historical comparison, UI hints). Pre-alerts must never trigger state transitions.

## Key Files

| Path | Purpose |
|---|---|
| `src/data/roastProfiles.json` | All roast profile definitions |
| `src/types/index.ts` | TypeScript interfaces for profiles, events, triggers |
| `src/engine/roastEngine.ts` | Core state machine (pure functions) |
| `src/store/roastStore.ts` | Zustand store — bridges engine to UI |
| `src/screens/ProfileSelectScreen.tsx` | Profile picker |
| `src/screens/RoastScreen.tsx` | Active roast UI |
| `src/utils/phaseColors.ts` | Phase-to-color mapping |
| `TODO.md` | Development roadmap and tracking |

## Conventions

- All roast logic lives in `src/engine/` — never in UI components
- JSON is the single source of truth — do not duplicate profile logic in code
- Engine must remain reusable across manual, assisted, and automated modes
- State management via Zustand (single store pattern)
- Dark UI theme (`userInterfaceStyle: "dark"` in app.json)
- TypeScript strict mode enabled

## Expo Docs

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing Expo-specific code. Do NOT assume SDK 56 APIs are available.

## SAM Workspace Integration

When running inside a SAM workspace (detected via `SAM_WORKSPACE_ID` env var), follow these additional guidelines:

### Ephemeral Environment

SAM workspaces are cloud VMs that are destroyed when the task ends. **Unpushed work is lost.**

- Commit and push after every meaningful unit of work (passing typecheck, completed function, fixed bug)
- Push to the output branch from `get_instructions` — never directly to `main`
- Don't rely on local state outside the repo (installed global tools, env customizations)

### Starting Work

1. Call `get_instructions` to get task context and output branch
2. Call `list_project_agents` to check for other agents working on the same files
3. Call `search_tasks` and `search_ideas` for relevant context
4. Read this file and `TODO.md` for project state

### During Work

- `update_task_status` after each significant milestone so the human has visibility
- After pushing, check `get_ci_status` to verify CI (when CI is configured)
- If running the Expo dev server, use `expose_port` on port 8081 so the human can access it
- Use `create_idea` when you notice improvements outside your current scope
- Use `request_human_input` when blocked on ambiguous requirements

### High-Conflict Files

Before modifying these shared files, check `list_project_agents` for conflicts:
- `src/data/roastProfiles.json` — the single source of truth
- `src/types/index.ts` — type changes affect every layer
- `package.json` / `package-lock.json` — dependency changes

### Wrapping Up

1. Run `npx tsc --noEmit` to verify no type errors
2. `get_workspace_diff_summary` to review all changes
3. Push all changes to the output branch
4. `complete_task` with a clear summary (task mode only)

### Knowledge & History

- `search_knowledge` before making key decisions (architecture, libraries, conventions)
- `search_messages` and `search_tasks` to understand prior context and decisions
- `add_knowledge` when you learn user preferences, project conventions, or important context
- `search_ideas` before creating new ideas to avoid duplicates
