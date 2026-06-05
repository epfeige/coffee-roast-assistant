# Bridge Setup — Next Steps at the Roastery

**Goal:** Get Artisan 2.10.4 pushing live BT/ET to the bridge so the iPhone app gets real data.

---

## Step 1 — Check what drives BT/ET

Open Artisan → **Config → Device** (Ctrl+D) → **ET/BT** tab.

Note what's selected in the **Device** dropdown (e.g. "Santoker", "Kaleido", "WebSocket", "Phidget", etc.)

- **If it says "Santoker", "Kaleido", or "Phidget"** → the WebSocket port is FREE. Go to Step 2.
- **If it says "WebSocket"** → the WebSocket port is already used by the roaster. STOP — we need a different approach (bridge-reads-roaster). Tell Claude.

---

## Step 2 — Point WebSocket at the bridge

Config → Port → **WebSocket** tab. Change:

| Field  | Value       |
|--------|-------------|
| Port   | `8765`      |
| Path   | `artisan`   |
| Host   | `127.0.0.1` (leave as-is) |

Click OK.

---

## Step 3 — Add a 1-second timer event that pushes data

Go to **Config → Events → Sliders** or **Config → Alarms**. Create a repeating 1s action with command:

```
send({{"bt": {BT}, "et": {ET}, "t": {time}}})
```

> Double braces are required — that's not a typo. Artisan uses `{}` for placeholder syntax so literal braces must be doubled.

---

## Step 4 — Test it

1. Make sure `python bridge.py` is running in Command Prompt
2. Press ON in Artisan (start recording)
3. Check the bridge console — should show "Artisan connected" and temperature frames
4. Check the iPhone app — status dot should be green, live BT should appear

---

## Notes

- Bridge is already on the laptop at `C:\Users\roast\Desktop\Peter_Bridge\bridge.py`
- Python 3.14.5 + websockets already installed
- Laptop Wi-Fi IP was `10.20.40.4` (may change — re-check with `ipconfig`)
- iPhone app already has the bridge IP saved from last session
- The Phidget 1048 devices in Extra Devices suggest WebSocket is likely free, but confirm in Step 1
