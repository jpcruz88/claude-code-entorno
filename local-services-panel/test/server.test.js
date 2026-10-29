'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-server-'));
process.env.PANEL_STATE_FILE = path.join(tmpDir, 'state.json');

const { server, prunableKeys } = require('../server.js');

function listen() {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
function close() {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}
function request(port, { method = 'GET', path: reqPath = '/', body = null, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      // Conexión independiente por request: el handler de 403 destruye el
      // socket a propósito, y el pool keep-alive global reutilizaría uno muerto.
      { host: '127.0.0.1', port, method, path: reqPath, headers, agent: false },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function firstSnapshot(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      let buffer = '';
      const onData = (chunk) => {
        buffer += chunk;
        const idx = buffer.indexOf('\n\n');
        if (idx !== -1) {
          req.destroy();
          const frame = buffer.slice(0, idx);
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) return reject(new Error('no data line in first frame'));
          resolve({ headers: res.headers, snapshot: JSON.parse(dataLine.slice(6)) });
        }
      };
      res.on('data', onData);
      res.on('end', () => reject(new Error('stream ended before a snapshot frame')));
    });
    req.on('error', () => {});
    req.end();
    setTimeout(() => { req.destroy(); reject(new Error('SSE timeout')); }, 5000).unref?.();
  });
}

test('SSE /events sends a parseable snapshot on connect', async () => {
  const port = await listen();
  try {
    const { headers, snapshot } = await firstSnapshot(port);
    assert.match(headers['content-type'], /text\/event-stream/);
    assert.ok(Array.isArray(snapshot.rows), 'rows must be an array');
    assert.equal(typeof snapshot.sources.docker, 'boolean');
    assert.equal(typeof snapshot.sources.sockets, 'boolean');
    assert.ok(snapshot.updated, 'updated timestamp required');
  } finally { await close(); }
});

test('POST /state validates action and persists a valid rename', async () => {
  const port = await listen();
  try {
    const bad = await request(port, {
      method: 'POST', path: '/state',
      headers: { 'Content-Type': 'application/json', 'X-Panel-Client': '1' },
      body: JSON.stringify({ action: 'nuke', key: 'local/x:1', value: true }),
    });
    assert.equal(bad.status, 400);

    const invalidJson = await request(port, {
      method: 'POST', path: '/state',
      headers: { 'Content-Type': 'application/json', 'X-Panel-Client': '1' },
      body: '{not json',
    });
    assert.equal(invalidJson.status, 400);

    const ok = await request(port, {
      method: 'POST', path: '/state',
      headers: { 'Content-Type': 'application/json', 'X-Panel-Client': '1' },
      body: JSON.stringify({ action: 'rename', key: 'local/python3:8765', value: '  Nombre Probado  ' }),
    });
    assert.equal(ok.status, 200);
    const onDisk = JSON.parse(fs.readFileSync(process.env.PANEL_STATE_FILE, 'utf8'));
    assert.equal(onDisk.renames['local/python3:8765'], 'Nombre Probado', 'value must be trimmed and persisted');
  } finally { await close(); }
});

test('static file serving cannot escape public/', async () => {
  const port = await listen();
  try {
    for (const p of ['/../server.js', '/..%2fserver.js', '/%2e%2e/server.js']) {
      const res = await request(port, { path: p, headers: { 'X-Ignore': '1' } });
      assert.equal(res.status, 404, `${p} must not serve files outside public/`);
      assert.ok(!res.body.includes('buildSnapshot'), `${p} leaked server source`);
    }
  } finally { await close(); }
});

test('oversized /state body is rejected with 413', async () => {
  const port = await listen();
  try {
    const res = await request(port, {
      method: 'POST', path: '/state',
      headers: { 'Content-Type': 'application/json', 'X-Panel-Client': '1' },
      body: JSON.stringify({ action: 'rename', key: 'a:1', value: 'x'.repeat(70000) }),
    });
    assert.equal(res.status, 413);
  } finally { await close(); }
});

test('prunableKeys retains a degraded source and prunes vanished keys of a healthy one', async () => {
  const state = {
    renames: { 'docker/app:3000': 'Panel', 'local/gone:1': 'Fuera' },
    favorites: { 'docker/app:3000': true, 'local/python3:8765': true },
    hidden: {},
  };

  // docker degraded, sockets healthy: docker key survives, vanished local key is pruned
  let keys = prunableKeys(state, { docker: false, sockets: true }, [{ key: 'local/python3:8765' }]);
  assert.ok(keys.has('docker/app:3000'), 'degraded source must retain its personalization');
  assert.ok(keys.has('local/python3:8765'), 'healthy source keeps its discovered key');
  assert.ok(!keys.has('local/gone:1'), 'healthy source prunes its vanished key');

  // both healthy: nothing extra retained
  keys = prunableKeys(state, { docker: true, sockets: true }, [{ key: 'local/python3:8765' }]);
  assert.ok(!keys.has('docker/app:3000'), 'healthy sources prune vanished keys normally');
  assert.ok(!keys.has('local/gone:1'));

  // both degraded: everything in state survives
  keys = prunableKeys(state, { docker: false, sockets: false }, []);
  assert.ok(keys.has('docker/app:3000'));
  assert.ok(keys.has('local/python3:8765'));
  assert.ok(keys.has('local/gone:1'));

  // a healthy source with no state at all
  keys = prunableKeys({ renames: {}, favorites: {}, hidden: {} }, { docker: true, sockets: true }, []);
  assert.equal(keys.size, 0);
});

test('POST /state requires the custom client header', async () => {
  const port = await listen();
  try {
    const noHeader = await request(port, {
      method: 'POST', path: '/state',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'rename', key: 'local/x:1', value: 'cross-site' }),
    });
    assert.equal(noHeader.status, 403);
    assert.ok(!fs.existsSync(process.env.PANEL_STATE_FILE) ||
      !fs.readFileSync(process.env.PANEL_STATE_FILE, 'utf8').includes('cross-site'),
      'cross-site write must not reach disk');

    const wrongValue = await request(port, {
      method: 'POST', path: '/state',
      headers: { 'Content-Type': 'application/json', 'X-Panel-Client': 'nope' },
      body: JSON.stringify({ action: 'rename', key: 'local/x:1', value: 'wrong' }),
    });
    assert.equal(wrongValue.status, 403);
  } finally { await close(); }
});
