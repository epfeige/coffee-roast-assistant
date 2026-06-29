# Bridge Setup Guide — Step by Step

Follow this guide to get live Artisan data flowing to the iPhone app.
You need: the Windows laptop (running Artisan), your iPhone, and both
on the same Wi-Fi network.

---

## Part 1 — Install Python on the Windows laptop (one-time, ~3 min)

1. Open a browser on the Windows laptop
2. Go to **https://www.python.org/downloads/**
3. Click the big yellow **"Download Python 3.x.x"** button
4. Run the installer. **IMPORTANT:** check the box that says
   **"Add Python to PATH"** at the bottom of the first screen
5. Click "Install Now" and wait for it to finish
6. Open **Command Prompt** (press Win+R, type `cmd`, press Enter)
7. Type this and press Enter:

   ```
   python --version
   ```

   You should see something like `Python 3.12.4`. If you see an error,
   restart the computer and try again (the PATH change needs a restart
   on some machines).

8. Install the one library the bridge needs:

   ```
   pip install websockets
   ```

   You should see `Successfully installed websockets-...`. Done.

---

## Part 2 — Copy the bridge file (one-time, ~1 min)

1. Copy the file `bridge.py` from this folder to the Windows laptop
   - USB stick, email, AirDrop-to-email, whatever is easiest
   - Put it somewhere easy to find, like `C:\Users\YourName\Desktop\bridge.py`

That's the only file you need. Nothing else from this repo.

---

## Part 3 — Find the laptop's IP address (one-time, ~1 min)

1. On the Windows laptop, open Command Prompt
2. Type:

   ```
   ipconfig
   ```

3. Look for **"Wireless LAN adapter Wi-Fi"** (or Ethernet if wired)
4. Find the line **"IPv4 Address"** — it will be something like `192.168.1.42`
5. Write this number down — you'll enter it in the iPhone app

**Tip:** This IP can change if the router restarts. If the app stops
connecting, re-check with `ipconfig`.

---

## Part 4 — Start the bridge (~10 seconds)

Every time you roast, do this before starting Artisan:

1. Open Command Prompt on the Windows laptop
2. Navigate to where you put bridge.py:

   ```
   cd Desktop
   ```

3. Start the bridge:

   ```
   python bridge.py
   ```

4. You should see:

   ```
   E46 Roast Assistant — Artisan Bridge
   Artisan  -> ws://localhost:8765/artisan
   App      -> ws://<your-ip>:8765/
   listening on ws://0.0.0.0:8765  (Ctrl+C to stop)
   ```

**Leave this window open** for the entire roast session. The bridge
runs in this window. Close it when you're done roasting.

---

## Part 5 — Configure Artisan to send data (one-time, ~5 min)

This tells Artisan to push temperature readings to the bridge every second.

### Option A — WebSocket Event (simplest)

1. In Artisan, go to **Config → Events → Sliders**
2. You need to configure Artisan's WebSocket output. The exact location
   depends on your Artisan version. Look for one of these:
   - **Config → Events → Sliders** → WebSocket tab
   - **Config → Device → Extra Devices** → WebSocket option
3. Set the WebSocket URL to:

   ```
   ws://localhost:8765/artisan
   ```

4. The data Artisan should send (JSON format):

   ```json
   {"bt": {BT}, "et": {ET}, "t": {t}}
   ```

   Where `{BT}`, `{ET}`, and `{t}` are Artisan's built-in placeholders
   for Bean Temperature, Environmental Temperature, and elapsed time.

### Option B — WebLCDs (alternative)

If your Artisan version has WebLCDs support:

1. In Artisan, go to **Config → WebLCDs**
2. Enable WebLCDs
3. Set the address to `ws://localhost:8765/artisan`
4. Artisan will automatically push `{bt, et, t}` frames

### Verify it works

With the bridge running (Part 4) and Artisan recording:
- The bridge console should show: `Artisan connected`
- You should see temperature frames scrolling by

If not, check:
- Is the bridge still running? (check the Command Prompt window)
- Did you use the exact URL `ws://localhost:8765/artisan`?
- Is Windows Firewall blocking port 8765? (see Troubleshooting below)

---

## Part 6 — Connect the iPhone app (~30 seconds)

1. Make sure your iPhone is on the **same Wi-Fi** as the Windows laptop
2. Open the E46 Roast app
3. Tap the **gear icon** (Settings)
4. Under **"Artisan Bridge"**, enter the laptop's IP address from Part 3
   (e.g. `192.168.1.42`)
5. The status dot should turn:
   - **Grey** → disconnected (not entered yet)
   - **Orange** → connecting (trying...)
   - **Green** → connected (data flowing!)
   - **Red** → error (check IP, check bridge is running)

6. Start a roast profile — you should see live BT in the header bar
   and the **LIVE** indicator

---

## Roast day workflow (every session)

1. Turn on laptop, connect to roastery Wi-Fi
2. Open Command Prompt → `cd Desktop` → `python bridge.py`
3. Open Artisan (it remembers the WebSocket config)
4. Open the app on iPhone — it auto-connects if IP is saved
5. Verify green dot in Settings
6. Roast! The app shows live BT, alerts, and step guidance
7. When done: close Artisan, close the Command Prompt window (Ctrl+C)

---

## Troubleshooting

### "python is not recognized"
Python wasn't added to PATH. Either:
- Re-run the Python installer and check "Add Python to PATH"
- Or restart the computer after installing

### "No module named websockets"
Run `pip install websockets` again. If you get a permission error,
try `pip install --user websockets`.

### Bridge starts but Artisan doesn't connect
- Verify the URL in Artisan is exactly `ws://localhost:8765/artisan`
  (note the `/artisan` at the end — this is important!)
- Make sure Artisan is actually recording (not just open, but running
  a roast or playback)

### Bridge starts but iPhone can't connect
- Check both devices are on the same Wi-Fi network
- Check the IP address is correct (`ipconfig` on Windows)
- Windows Firewall may be blocking port 8765:
  1. Open Windows Defender Firewall
  2. Click "Allow an app through firewall"
  3. Click "Change settings" → "Allow another app"
  4. Browse to `python.exe` (usually `C:\Users\YourName\AppData\Local\Programs\Python\Python3xx\python.exe`)
  5. Check both "Private" and "Public" boxes
  6. OK → restart the bridge

### App shows "MANUAL" instead of "LIVE"
- Check the status dot in Settings (should be green)
- If orange: bridge is running but phone can't reach it (firewall or wrong IP)
- If red: bridge crashed — restart it
- If grey: enter the IP address in Settings

### Temperature seems wrong or delayed
- The bridge adds no delay — if Artisan shows the right temp, the app will too
- RoR needs ~3 seconds of data before it starts showing
- If values seem stuck, check the bridge console for errors

---

## How to stop / uninstall everything

**Stop the bridge:** Close the Command Prompt window or press Ctrl+C

**Remove from Artisan:** Delete the WebSocket event you added in Part 5.
Artisan goes back to exactly how it was.

**Remove Python:** Windows Settings → Apps → Python 3.x → Uninstall

**Remove the bridge file:** Delete `bridge.py` from your Desktop.

Nothing persists. No registry changes, no services, no startup items.
