'use strict';
/*
 * Panel de servicios locales — 0.0.0.0:8790
 * Descubre todo en cada ciclo; nada de servicios hardcodeados.
 * Solo lectura: sirve HTML y datos descubiertos, no ejecuta acciones.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { discoverSockets, normalizeHost } = require('./lib/discover-sockets.js');
const { discoverDocker } = require('./lib/discover-docker.js');
const { probe } = require('./lib/healthcheck.js');
const { loadState, saveState, merge, prune } = require('./lib/state.js');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 8790;
const CYCLE_MS = 10000;
const STATE_FILE = process.env.PANEL_STATE_FILE || path.join(__dirname, 'state.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const state = loadState(STATE_FILE);
// Cada snapshot que sale por SSE lleva `updated`, incluido el inicial: un
// cliente conectado antes del primer ciclo no debe recibir `null`.
let snapshot = { rows: [], sources: { docker: true, sockets: true }, updated: new Date().toISOString() };
const clients = new Set();

/**
 * Keys that survive pruning in this cycle.
 * Contains the keys of every discovered row plus, when a discovery source is
 * degraded (ok:false), that source's existing personalization keys — a failed
 * `docker ps`/`lsof` must never erase the user's renames, favorites or hides.
 */
function prunableKeys(state, sources, discoveredRows) {
  const liveKeys = new Set(discoveredRows.map((row) => row.key));
  if (!sources.docker || !sources.sockets) {
    const stateKeys = Object.keys(state.renames)
      .concat(Object.keys(state.favorites), Object.keys(state.hidden));
    for (const key of stateKeys) {
      const belongsToDocker = key.startsWith('docker/');
      if (belongsToDocker && !sources.docker) liveKeys.add(key);
      else if (!belongsToDocker && !sources.sockets) liveKeys.add(key);
    }
  }
  return liveKeys;
}

/** Builds one merged row per discovered service, deduplicated by key. */
async function buildSnapshot() {
  const [dockerResult, socketsResult] = await Promise.all([discoverDocker(), discoverSockets()]);

  const byKey = new Map();
  for (const row of dockerResult.rows) {
    byKey.set(row.key, {
      key: row.key, name: row.container, origin: 'docker', host: row.host,
      port: row.port, container: row.container, containerPort: row.containerPort,
      image: row.image, dockerState: row.state,
    });
  }
  for (const row of socketsResult.rows) {
    if (byKey.has(row.key)) continue;
    const host = normalizeHost(row.address);
    byKey.set(row.key, {
      key: row.key, name: row.command, origin: 'local', host,
      port: row.port, process: row.command, pid: row.pid,
    });
  }

  // El panel no se lista a sí mismo: nada más puede estar a la escucha en su
  // propio puerto (HOST/PORT es la única configuración fija permitida).
  const discovered = [...byKey.values()].filter((row) => row.port !== PORT);
  const sources = { docker: dockerResult.ok, sockets: socketsResult.ok };
  const liveKeys = prunableKeys(state, sources, discovered);
  const next = prune(state, liveKeys);
  if (JSON.stringify(next) !== JSON.stringify(state)) {
    // Save first: a failed save must leave `state` untouched so the next
    // cycle retries, and must never abort discovery for the whole cycle.
    try {
      saveState(STATE_FILE, next);
      Object.assign(state, next);
    } catch (error) {
      console.error('[state] no se pudo guardar:', error.message);
    }
  }

  await Promise.all(discovered.map(async (row) => {
    const url = `http://${row.host}:${row.port}/`;
    const httpStatus = await probe(url);
    row.httpUrl = url;
    row.web = httpStatus === 'up';
    const dockerDown = row.origin === 'docker' && row.dockerState && row.dockerState !== 'running';
    row.status = dockerDown ? 'caido' : (row.web ? 'activo' : 'sin-web');
  }));

  const merged = merge(discovered, state);
  return {
    rows: merged,
    sources,
    updated: new Date().toISOString(),
  };
}

function broadcast(payload) {
  const frame = `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(frame); } catch { clients.delete(res); }
  }
}

let cycleRunning = false;

async function cycle() {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    snapshot = await buildSnapshot();
    broadcast(snapshot);
  } catch (error) {
    console.error('[cycle]', error.message);
  } finally {
    cycleRunning = false;
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  } catch {
    // Un request-line o Host ilegal no debe tumbar el panel.
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400');
  }

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    clients.add(res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000);
    keepAlive.unref();
    req.on('close', () => { clearInterval(keepAlive); clients.delete(res); });
    return;
  }

  if (url.pathname === '/state' && req.method === 'POST') {
    // Custom header forces a CORS preflight, which cross-origin no-cors
    // requests cannot satisfy — a same-site page cannot rewrite panel state.
    if (req.headers['x-panel-client'] !== '1') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('{"error":"missing client header"}');
      req.destroy();
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 65536 && !res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end('{"error":"payload too large"}');
        req.destroy();
      }
    });
    req.on('end', () => {
      let input;
      try { input = JSON.parse(body); } catch { input = null; }
      if (!input || typeof input.key !== 'string' || input.key.length > 200) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end('{"error":"bad request"}');
      }
      const bucket = input.action === 'rename' ? 'renames'
        : input.action === 'favorite' ? 'favorites'
        : input.action === 'hide' ? 'hidden' : null;
      if (!bucket) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end('{"error":"unknown action"}');
      }
      // Se muta una copia: el estado en memoria solo avanza si el disco acepta
      // la escritura (saveState lanza) — nunca se queda por delante del archivo.
      const candidate = { renames: { ...state.renames }, favorites: { ...state.favorites }, hidden: { ...state.hidden } };
      if (bucket === 'renames') {
        if (typeof input.value === 'string' && input.value.trim()) candidate.renames[input.key] = input.value.trim();
        else delete candidate.renames[input.key];
      } else {
        if (input.value) candidate[bucket][input.key] = true;
        else delete candidate[bucket][input.key];
      }
      try {
        saveState(STATE_FILE, candidate);
      } catch (error) {
        console.error('[state] no se pudo guardar:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end('{"error":"save failed"}');
      }
      Object.assign(state, candidate);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      void cycle();
    });
    return;
  }

  const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(PUBLIC_DIR, path.normalize(relative));
  let info = null;
  if (file.startsWith(PUBLIC_DIR + path.sep)) {
    try { info = fs.statSync(file); } catch { info = null; }
  }
  if (!info || !info.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  const stream = fs.createReadStream(file);
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. Cierra la otra instancia o define PORT=<otro_puerto>.`);
    process.exit(1);
  }
  console.error('[server]', error.message);
  process.exit(1);
});

if (require.main === module) {
  server.listen(PORT, HOST, async () => {
    console.log(`Panel de servicios locales → http://localhost:${PORT} (escuchando en ${HOST})`);
    await cycle();
    setInterval(cycle, CYCLE_MS);
  });
}

module.exports = { server, cycle, buildSnapshot, prunableKeys, PORT, STATE_FILE, PUBLIC_DIR };
