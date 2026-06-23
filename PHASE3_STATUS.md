# Phase 3 — Artisan Integration: Current State
_Temporary reference file — delete after new session is underway_

---

## Branch

`feat/phase-3-artisan` — branched from `main` after MVP 1 + MVP 2 merged.

---

## What already exists

### 1. TemperatureProvider abstraction (`src/engine/temperatureProvider.ts`)
A TypeScript interface that decouples the roast engine from any specific data source.

```
TemperatureProvider (interface)
├── getBT()  → number | null   (Bean Temp, °F)
├── getET()  → number | null   (Environmental Temp, °F)
└── getRoR() → number | null   (Rate of Rise, °F/min)

ManualProvider (Phase 1/2 — already wired in)
└── returns null for everything → engine stays in manual mode

ArtisanProvider (Phase 3 — NOT YET BUILT)
└── will read from the WebSocket bridge
```

The engine is ready for Phase 3 — swapping `ManualProvider` for `ArtisanProvider` is the key step.

---

### 2. Python WebSocket bridge (`bridge/bridge.py`)
Runs on the same machine as Artisan. Listens on port 8765.

**Data flow:**
```
Artisan → ws://localhost:8765/artisan → bridge.py → ws://<ip>:8765/ → iPhone app
```

**Broadcast payload (every ~1 second):**
```json
{ "bt": 318.2, "et": 592.1, "t": 427, "ror": 11.3 }
```

- `bt` = Bean Temperature (°F)
- `et` = Environmental Temperature (°F)
- `t` = elapsed seconds
- `ror` = Rate of Rise (°F/min, computed by bridge)

---

### 3. PR #4 — Bridge hardening (raphaeltm, not yet merged into feat/phase-3-artisan)
Fixes and improvements on top of `bridge.py`:
- Fixes websockets ≥13 path routing bug (was silently routing everything wrong)
- Defensive coercion for Artisan's `-`/`""`/`null` values
- Time-windowed RoR calculation (replaces naive delta)
- Per-client bounded queues (prevents slow iPhone stalling Artisan ingest)
- Single-Artisan enforcement, keepalive, port-conflict error handling, logging

Also adds `bridge/proto/` — a Node.js test harness:
- `mock_artisan.js` — simulates Artisan sending realistic roast temperature data
- `mock_iphone.js` — simulates the iPhone app receiving data
- `run-tests.js` — 5 automated test scenarios

---

### 4. Documentation
- `bridge/README.md` — end-user guide (risk assessment, setup, network requirements)
- `bridge/DEVELOPER.md` — developer setup, Artisan config, deployment options (Python script vs .exe)

---

### 5. App settings (partially scaffolded)
- `SettingsScreen.tsx` has alert threshold + sound picker
- Bridge IP address field **not yet added** to Settings — needed for Phase 3
- `useRoastStore` has no WebSocket connection state yet

---

## What is NOT built yet (app side)

- `ArtisanProvider` class (reads from WebSocket)
- WebSocket connection management in the Zustand store
- Bridge IP address input in Settings screen
- Live BT/ET/RoR display in RoastScreen
- Automatic event advancement based on live temperature thresholds

---

## Key architectural decision (already made)

> **Temperature is the only authoritative trigger.**
> The engine advances based on temperature thresholds, not time.
> Time is advisory only. Pre-alerts must never trigger state transitions.

Phase 3 wires live temperature into the same engine that already exists —
it does not change the state machine logic, only the data source.
