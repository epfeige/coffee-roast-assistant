const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, '../src/data/roastProfiles.json');
const LOGS_FILE = path.join(__dirname, 'roastLogs.json');

app.use(express.json());

// CORS — allow mobile app to reach the server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Roast Profile Admin running at http://0.0.0.0:${PORT}\n`);
});
