// Mock WebLCD — simulates Artisan's built-in WebLCD WebSocket server.
//
// The real Artisan WebLCD listens on ws://<ip>:8080/websocket and pushes
// JSON frames like {"data":{"time":"05:30","bt":"385.2","et":"397.4"}}
// on every sample. This script reproduces that exact wire format using
// the same realistic E46 roast curve from mock_artisan.js.
//
// Usage:
//   node mock_weblcd.js
//   → Then in the app Settings, enter: <your-mac-ip>:8080
//
// Env:
//   PORT               server port              (default 8080)
//   FRAME_INTERVAL_MS  real ms between frames   (default 1000)
//   TIME_SCALE         sim seconds per frame     (default 1)
//   SIM_SECONDS        total simulated roast     (default 930)
//   SCENARIO           happy | linear            (default happy)

const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 8080);
const FRAME_INTERVAL_MS = Number(process.env.FRAME_INTERVAL_MS || 1000);
const TIME_SCALE = Number(process.env.TIME_SCALE || 1);
const SIM_SECONDS = Number(process.env.SIM_SECONDS || 930);
const SCENARIO = process.env.SCENARIO || "happy";

// ── Temperature curves (copied from mock_artisan.js) ──────────────

function happyBT(t) {
  const RISE_END = 150, RISE_START = 368, CHARGE_T = 405;
  const DROP_END = 240, TP_TEMP = 175;
  if (t <= 0) return RISE_START;
  if (t < RISE_END) return RISE_START + (CHARGE_T - RISE_START) * (t / RISE_END);
  if (t < DROP_END) {
    const p = (t - RISE_END) / (DROP_END - RISE_END);
    return CHARGE_T + (TP_TEMP - CHARGE_T) * (1 - Math.pow(1 - p, 2));
  }
  return climbBT(t - DROP_END);
}

const _climbCache = [175];
function climbBT(dt) {
  while (_climbCache.length <= dt) {
    const s = _climbCache.length;
    const ror = climbRoR(s);
    _climbCache.push(_climbCache[s - 1] + ror / 60);
  }
  return _climbCache[dt];
}

function climbRoR(s) {
  if (s < 15)  return 18 + (30 - 18) * (s / 15);
  if (s < 100) return 30 + 2 * ((s - 15) / 85);
  if (s < 220) return 32 - 4 * ((s - 100) / 120);
  if (s < 380) return 28 - 8 * ((s - 220) / 160);
  if (s < 520) return 20 - 6 * ((s - 380) / 140);
  return 14 - 2 * Math.min(1, (s - 520) / 200);
}

function happyET(t) {
  if (t <= 0) return 460;
  if (t < 150) return 460 + 10 * (t / 150);
  if (t < 240) return 470 - 50 * ((t - 150) / 90);
  const bt = happyBT(t);
  return bt + 80 - 20 * Math.min(1, (t - 240) / 660);
}

function round1(x) { return Math.round(x * 10) / 10; }

// ── Format helpers ────────────────────────────────────────────────

function formatTime(totalSeconds) {
  const sign = totalSeconds < 0 ? "-" : "";
  const abs = Math.abs(Math.floor(totalSeconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function webLcdFrame(simT) {
  let bt, et;
  if (SCENARIO === "linear") {
    bt = 200 + 0.5 * simT;
    et = bt + 70;
  } else {
    bt = happyBT(simT);
    et = happyET(simT);
  }
  return {
    data: {
      time: formatTime(simT),
      bt: String(round1(bt)),
      et: String(round1(et)),
    }
  };
}

// ── WebSocket server ──────────────────────────────────────────────

const wss = new WebSocket.Server({ port: PORT, path: "/websocket" });
const clients = new Set();
let index = 0;
let timer = null;

wss.on("listening", () => {
  console.log(`[mock_weblcd] WebLCD server listening on ws://0.0.0.0:${PORT}/websocket`);
  console.log(`[mock_weblcd] scenario=${SCENARIO}  interval=${FRAME_INTERVAL_MS}ms  scale=${TIME_SCALE}x`);
  console.log(`[mock_weblcd] Enter this in app Settings: <your-mac-ip>:${PORT}`);
  console.log();
  startBroadcast();
});

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[mock_weblcd] app client connected — ${clients.size} client(s)`);
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[mock_weblcd] app client disconnected — ${clients.size} client(s)`);
  });
});

function startBroadcast() {
  timer = setInterval(() => {
    const simT = index * TIME_SCALE;
    if (simT > SIM_SECONDS) {
      clearInterval(timer);
      console.log(`[mock_weblcd] roast complete — sent ${index} frames`);
      return;
    }
    const frame = webLcdFrame(simT);
    const json = JSON.stringify(frame);

    if (index % 30 === 0) {
      console.log(`[mock_weblcd] ${frame.data.time}  BT=${frame.data.bt}  ET=${frame.data.et}  → ${clients.size} client(s)`);
    }

    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
    index++;
  }, FRAME_INTERVAL_MS);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[mock_weblcd] shutting down");
  if (timer) clearInterval(timer);
  wss.close();
  process.exit(0);
});
