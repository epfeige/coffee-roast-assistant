# E46 Coffee Roast Assistant

Expo (React Native) app that guides an E46 coffee roast step-by-step and can
read live Bean/Env temps from Artisan over WebSocket. This README covers the
moving parts and how to start each one.

## The moving parts

| Piece | What it is | Where | Port |
|-------|-----------|-------|------|
| **App** | The Expo roast app (phone / simulator) | project root | Metro dev server |
| **Mock Artisan** | Fake WebLCD server that streams a realistic roast, for testing live data with no roaster | `bridge/proto/mock_weblcd.js` | 8080 |
| **Admin server** | Local web tool to edit roast profiles and view roast logs | `admin/` | 3001 |

The app talks to Artisan's **WebLCD** directly (`ws://<ip>/websocket`), so for
local testing you only need the app + the mock.

> **Note:** the `bridge/` relay (`bridge.py`, port 8765) is **no longer used** —
> the app reads Artisan's WebLCD directly. The folder is kept only because the
> mock (`bridge/proto/mock_weblcd.js`) still lives there.

## Start the app

```bash
npm install          # first time only
npm run ios          # iOS simulator
# or
npm start            # then press i (iOS), a (Android), w (web)
```

On a physical device on a locked-down network: `npx expo start --tunnel`.

## Run a mock roast (test live data, no roaster)

1. Start the mock Artisan:
   ```bash
   cd bridge/proto
   node mock_weblcd.js        # streams ~15.5 min on ws://0.0.0.0:8080/websocket
   ```
2. Find your Mac's LAN IP: `ipconfig getifaddr en0`
3. In the app: **Settings → ARTISAN CONNECTION → Dev/Mock**, enter
   `<your-mac-ip>:8080`.
4. Pick a profile (the curve is calibrated to **Prato**) and **Start Roast**.
   The header shows **LIVE** and BT climbs through the simulated roast.

Stop the mock with **Ctrl-C**. Phone and Mac must be on the same Wi-Fi. If it
won't connect, allow `node` through the macOS firewall (System Settings →
Network → Firewall).

### Run it faster

`TIME_SCALE` = sim-seconds advanced per frame (default 1). Bump it to compress
the roast so you don't wait 15 minutes to reach a late step:

```bash
TIME_SCALE=5 node mock_weblcd.js    # 5 sim-sec/frame → whole roast in ~3 min
TIME_SCALE=10 node mock_weblcd.js   # 10x → ~1.5 min
```

Alternatively, keep real time-per-second but send frames faster with
`FRAME_INTERVAL_MS=200` (5 frames/sec). Either way, note the app computes RoR
from wall-clock deltas, so the ΔBT reading runs high when sped up — fine for
exercising steps/UI, not for judging RoR accuracy.

Other env vars: `SCENARIO=happy|linear`, `SIM_SECONDS` — see the header of
`bridge/proto/mock_weblcd.js`.

## Run the admin tool (edit profiles / view logs)

```bash
cd admin
npm install          # first time only
npm start            # http://localhost:3001
```

- Profile Admin: `http://localhost:3001/`
- Roast Logs: `http://localhost:3001/logs.html`

The app POSTs completed roast logs here (set the admin server IP in the app's
Settings). `admin/roastLogs.json` and `admin/roastDailyNotes.json` are runtime
data written by this server and are not tracked in git.

## Typical local test loop

1. `npm run ios` — launch the app
2. `cd bridge/proto && node mock_weblcd.js` — start the mock roast feed
3. (optional) `cd admin && npm start` — if you want to save/inspect roast logs
4. In the app: Settings → Dev/Mock → `<mac-ip>:8080`, then Start Roast
