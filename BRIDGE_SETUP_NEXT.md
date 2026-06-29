# Bridge Setup — Next Steps at the Roastery

**Goal:** Get Artisan 2.10.4 pushing live BT/ET to the bridge so the iPhone app gets real data.

---

## Completed

- **ET/BT device is Phidget** ✅ — WebSocket port is free
- **WebSocket port configured** ✅ — Port `8765`, Path `artisan`, Host `127.0.0.1`
- **Bridge running on laptop** ✅ — `C:\Users\roast\Desktop\Peter_Bridge\bridge.py`
- **iPhone connected to bridge** ✅ — green dot confirmed

---

## Ruled out approaches

### ❌ Option: Artisan `send()` on every sample
**Not possible →** `send()` only fires on manual button/slider clicks. There is no repeating timer trigger in Artisan 2.10.4 (or any version). Alarms are one-shot only.

### ❌ Option: Autosave log file tailing
**Not possible →** Artisan writes `.alog` files only on explicit save (end of roast or manual `a` key), NOT incrementally during recording. No streaming CSV exists either. File format is Python repr, not JSON.

### ❌ Option: Bridge reads Phidget sensors directly
**Not possible →** USB devices allow only one process. Artisan owns the Phidget 1048 — a second process would conflict and could crash the roast.

### ❌ Option: Bridge receives `getData` requests
**Not possible →** `getData` is Artisan asking FOR data, not sending its own BT/ET. The bridge can't extract readings from these requests.

### ❌ Option: Upgrade Artisan for WebSocket push
**Not possible →** No version of Artisan (2.x, 3.x, 4.x) has native outbound WebSocket push of BT/ET. The architecture is always request/response. Not worth the upgrade risk.

---

## Best remaining option: WebLCD server

Research found that Artisan has a **built-in WebLCD WebSocket server** that pushes BT, ET, and time on every sample — exactly what we need.

- **Endpoint:** `ws://<laptop-ip>:8080/websocket`
- **Push format:** `{"data":{"time":"05:30","bt":"385.2","et":"397.4"}}`
- **Latency:** Matches sampling interval (1-3s), with 30ms throttle
- **Read-only** — zero risk to Artisan's operation
- **Multi-client** — multiple devices can connect
- Values are display strings (e.g. `"385.2"`) — need parsing to numbers
- No RoR included — bridge or app computes from successive BT readings

**Unknown:** Whether WebLCDs exists in Artisan 2.10.4. We checked Config menu and didn't see "WebLCDs" as a top-level item, but it may be under Config → Curves.

### If WebLCDs works → we may not even need the bridge

The iPhone could connect directly to `ws://<laptop-ip>:8080/websocket` on the same WiFi. The bridge becomes optional (only needed if we want RoR computation server-side or remote access).

---

## Steps for next visit

### Step 1 — Check if WebLCDs exists

Open Artisan → **Config → Curves** (Ctrl+U). Look through all tabs for:
- A **UI** tab
- Any mention of **WebLCDs**, **LCD**, or **Web**
- A toggle/checkbox to enable it with a port number

Also try: **Help → About** or the Artisan console for any mention of WebLCD/aiohttp.

**Screenshot whatever you find** — even if it doesn't look relevant.

### Step 2a — If WebLCDs IS available

1. Enable it, set port to `8080` (or whatever is offered)
2. Start a recording in Artisan (press ON)
3. On the laptop, open a browser to `http://localhost:8080/artisan` — you should see an LCD display page
4. If that works, try from the **iPhone browser**: `http://<laptop-ip>:8080/artisan`
5. Tell me what you see — if this works, I'll update the app to connect directly to Artisan's WebSocket instead of the bridge

### Step 2b — If WebLCDs is NOT available in 2.10.4

We have two fallback paths:

**Fallback A: Upgrade Artisan to get WebLCDs**
- Check what the latest stable version is (currently 4.0.2)
- This is risky mid-season — only do this if you're comfortable and have a backup of your Artisan config
- Export your current settings first: File → Save Settings

**Fallback B: Modify bridge to act as Artisan's WebSocket "device"**
- Since we configured the WebSocket port (8765/artisan), Artisan sends `getData` every sample
- We can't extract BT/ET from `getData`, BUT we could modify the bridge to:
  - Respond to `getData` with dummy values (Artisan ignores them since Phidget provides real data)
  - Meanwhile, read the Artisan window title or use the Artisan HTTP API (if available) to get actual BT/ET
- This is hacky — only as a last resort

---

## Laptop details

- Bridge: `C:\Users\roast\Desktop\Peter_Bridge\bridge.py`
- Python 3.14.5 + websockets installed
- Last known Wi-Fi IP: `10.20.40.4` (re-check with `ipconfig`)
- Artisan: 2.10.4 (2078c52)
- Roaster: Dietrich, sensors via Phidget 1048 USB thermocouples
