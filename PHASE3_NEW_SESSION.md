# New Session Starter — Phase 3 Artisan Integration
_Copy the prompt below into a new Claude Code session_

---

## Recommended model / agent

**Use Claude Sonnet 4.6 (default)** for this session — it handles the mix of
TypeScript app code, Python bridge code, and terminal testing well.

If the session gets into heavy architectural design (e.g. deciding how
ArtisanProvider manages WebSocket state), you can use **`/fast`** to toggle
faster output, or switch to **Opus 4.6** for deeper reasoning on tricky
decisions. For simple file edits and searches, Sonnet is the right choice.

---

## Copy-paste prompt for new session

---

Hi Claude. I am continuing development on the E46 Roast Assistant — a React Native / Expo app that guides coffee roasters through temperature-driven roast profiles on iPhone. We are starting Phase 3: wiring in live temperature data from Artisan roasting software via a WebSocket bridge.

**The codebase is at:** `/Users/peter/PycharmProjects/coffee-roast-assistant`
**Working branch:** `feat/phase-3-artisan`

**Please read these files before we start:**
1. `PHASE3_STATUS.md` — what already exists for Phase 3
2. `PHASE3_TODO.md` — the step-by-step plan
3. `CLAUDE.md` — project architecture and conventions
4. `TODO.md` — overall project roadmap
5. `bridge/README.md` — what the bridge does
6. `src/engine/temperatureProvider.ts` — the TemperatureProvider abstraction already in place

**First task:** Merge PR #4 from raphaeltm into `feat/phase-3-artisan`.
PR #4 URL: https://github.com/epfeige/coffee-roast-assistant/pull/4

Check if it merges cleanly, then we will do a local end-to-end test on my MacBook with the mock Artisan simulator before writing any app code. The goal today is to get the bridge running locally and confirm the data pipeline works, so I can test with my iPhone on the same Wi-Fi network.

Key things to know:
- The Windows roasting laptop is not available for testing yet — we are doing everything locally on Mac first
- Expo SDK is 54 (not 56) — read https://docs.expo.dev/versions/v54.0.0/ for Expo-specific APIs
- Temperature is the ONLY authoritative trigger for roast events — time is advisory only, this must not change
- The `TemperatureProvider` interface is already in `src/engine/temperatureProvider.ts` — `ArtisanProvider` will implement it

---

## What was completed in the previous sessions (for context)

- MVP 1: Profile selection → Recipe screen → Active roast screen with action checkboxes
- MVP 2: Timer, pre-alerts (haptic + sound), overdue blink, Settings screen (sound + threshold)
- Phase 3 scaffolding: `TemperatureProvider` abstraction, `bridge.py` WebSocket relay, docs
- PR #1 (app work) merged to main
- PR #2 (agent config docs) open, targeting main — needs minor updates from Sam before merging
- PR #4 (bridge hardening by raphaeltm) open, targeting `feat/phase-3-artisan` — merge this first

## Temporary files to clean up when done
- `PHASE3_STATUS.md`
- `PHASE3_TODO.md`
- `PHASE3_NEW_SESSION.md`
