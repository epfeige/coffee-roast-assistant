const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, '../src/data/roastProfiles.json');
const LOGS_FILE = path.join(__dirname, 'roastLogs.json');
const DAILY_NOTES_FILE = path.join(__dirname, 'roastDailyNotes.json');

// Halifax, NS coordinates for Open-Meteo weather API
const WEATHER_LAT = 44.68;
const WEATHER_LON = -63.57;

app.use(express.json());

// CORS — allow mobile app to reach the server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// GET all profiles
app.get('/api/profiles', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(data);
});

// PUT full data (save everything)
app.put('/api/profiles', (req, res) => {
  const data = req.body;
  // Re-index events before saving to keep indexes consistent
  data.profiles.forEach(profile => {
    profile.events.forEach((event, i) => {
      event.index = i;
    });
  });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

// GET roast logs
app.get('/api/roast-logs', (_req, res) => {
  let logs = [];
  try {
    if (fs.existsSync(LOGS_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    }
  } catch {
    logs = [];
  }
  res.json(logs);
});

// POST a roast session log
app.post('/api/roast-logs', (req, res) => {
  const session = req.body;
  let logs = [];
  try {
    if (fs.existsSync(LOGS_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    }
  } catch {
    logs = [];
  }
  logs.push(session);
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
  res.json({ ok: true, count: logs.length });
});

// DELETE a roast session log by index
app.delete('/api/roast-logs/:index', (req, res) => {
  const idx = parseInt(req.params.index, 10);
  let logs = [];
  try {
    if (fs.existsSync(LOGS_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    }
  } catch {
    logs = [];
  }
  if (idx < 0 || idx >= logs.length) {
    return res.status(404).json({ error: 'Index out of range' });
  }
  logs.splice(idx, 1);
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
  res.json({ ok: true, count: logs.length });
});

// --- Daily notes helpers ---
function readDailyNotes() {
  try {
    if (fs.existsSync(DAILY_NOTES_FILE)) {
      return JSON.parse(fs.readFileSync(DAILY_NOTES_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return {};
}

function writeDailyNotes(notes) {
  fs.writeFileSync(DAILY_NOTES_FILE, JSON.stringify(notes, null, 2));
}

// GET daily notes (all dates)
app.get('/api/daily-notes', (_req, res) => {
  res.json(readDailyNotes());
});

// GET daily notes for a specific date
app.get('/api/daily-notes/:date', (req, res) => {
  const notes = readDailyNotes();
  res.json(notes[req.params.date] || {});
});

// PUT daily notes for a specific date
app.put('/api/daily-notes/:date', (req, res) => {
  const notes = readDailyNotes();
  notes[req.params.date] = req.body;
  writeDailyNotes(notes);
  res.json({ ok: true });
});

// GET weather for a date (fetches from Open-Meteo, caches in daily notes)
app.get('/api/weather/:date', async (req, res) => {
  const date = req.params.date;
  const notes = readDailyNotes();

  // Return cached weather if available
  if (notes[date]?.weather) {
    return res.json(notes[date].weather);
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean&timezone=America/Halifax&start_date=${date}&end_date=${date}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Open-Meteo returned ${resp.status}`);
    const data = await resp.json();

    const weather = {
      tempMaxC: data.daily?.temperature_2m_max?.[0] ?? null,
      tempMinC: data.daily?.temperature_2m_min?.[0] ?? null,
      humidityPct: data.daily?.relative_humidity_2m_mean?.[0] ?? null,
      source: 'Open-Meteo',
      fetchedAt: new Date().toISOString(),
    };

    // Cache in daily notes
    if (!notes[date]) notes[date] = {};
    notes[date].weather = weather;
    writeDailyNotes(notes);

    res.json(weather);
  } catch (err) {
    res.status(502).json({ error: 'Weather fetch failed', detail: err.message });
  }
});

// PATCH a roast session log (update notes)
app.patch('/api/roast-logs/:index', (req, res) => {
  const idx = parseInt(req.params.index, 10);
  let logs = [];
  try {
    if (fs.existsSync(LOGS_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    }
  } catch {
    logs = [];
  }
  if (idx < 0 || idx >= logs.length) {
    return res.status(404).json({ error: 'Index out of range' });
  }
  // Merge patch fields into the session
  Object.assign(logs[idx], req.body);
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
  res.json({ ok: true });
});

// Bind 0.0.0.0 so the mobile app can reach this server over the LAN
// (phone -> Mac's LAN IP:3001). The VSCode auto-forward hijack of localhost is
// handled separately by .vscode/settings.json (auto-forward disabled + port
// 3001 ignored), which does not affect LAN access.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Roast Profile Admin running at http://localhost:${PORT} (LAN: http://0.0.0.0:${PORT})\n`);
});
