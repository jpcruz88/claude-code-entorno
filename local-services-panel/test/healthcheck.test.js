'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const { probe } = require('../lib/healthcheck.js');

function serve(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

function origin(server) {
  return `http://127.0.0.1:${server.address().port}/`;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('probe returns "up" for 2xx', async () => {
  const s = await serve((req, res) => { res.writeHead(200); res.end('ok'); });
  try { assert.equal(await probe(origin(s), 1000), 'up'); }
  finally { s.close(); }
});

test('probe returns "up" for 3xx (login redirect)', async () => {
  const s = await serve((req, res) => { res.writeHead(307, { Location: '/login' }); res.end(); });
  try { assert.equal(await probe(origin(s), 1000), 'up'); }
  finally { s.close(); }
});

test('probe returns "up" for 401/403 — the HTTP service is alive', async () => {
  const s = await serve((req, res) => { res.writeHead(401, { 'WWW-Authenticate': 'Negotiate' }); res.end(); });
  try { assert.equal(await probe(origin(s), 1000), 'up'); }
  finally { s.close(); }
});

test('probe returns "down" when nothing listens', async () => {
  const s = await serve((req, res) => res.end());
  const url = origin(s);
  await new Promise((r) => s.close(r));
  assert.equal(await probe(url, 500), 'down');
});

test('probe respects the timeout on a hanging server', async () => {
  const s = await serve(() => { /* never respond */ });
  try {
    const started = Date.now();
    assert.equal(await probe(origin(s), 300), 'down');
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 250 && elapsed < 1000, `bounded resolution, got ${elapsed}ms`);
  } finally { s.close(); }
});

test('probe returns "down" for a malformed URL instead of throwing', async () => {
  assert.equal(await probe('not a url', 300), 'down');
  assert.equal(await probe('', 300), 'down');
  assert.equal(await probe('ftp://127.0.0.1:80/', 300), 'down');
  assert.equal(await probe('file:///etc/hosts', 300), 'down');
});

test('probe frees the socket so the server sees zero connections', async () => {
  const s = await serve((req, res) => { res.writeHead(200); res.end('ok'); });
  try {
    assert.equal(await probe(origin(s), 1000), 'up');
    await sleep(150);
    assert.equal(s._connections, 0, 'socket must be closed after the probe resolves');
  } finally { s.close(); }
});

test('probe returns "down" when the server accepts then resets the socket', async () => {
  const s = await serve((req, res) => { req.socket.destroy(); });
  try { assert.equal(await probe(origin(s), 800), 'down'); }
  finally { s.close(); }
});

test('probe settles 40 concurrent probes within the timeout', async () => {
  const s = await serve((req, res) => { res.writeHead(200); res.end('ok'); });
  try {
    const url = origin(s);
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 40 }, () => probe(url, 1500)));
    const elapsed = Date.now() - started;
    assert.deepEqual([...new Set(results)], ['up']);
    assert.ok(elapsed < 3000, `40 probes must not serialize, got ${elapsed}ms`);
    await sleep(150);
    assert.equal(s._connections, 0, 'all sockets released');
  } finally { s.close(); }
});

test('probe stays "down" even if the server answers after the timeout', async () => {
  const s = await serve(() => setTimeout(() => { /* late response, never sent to a client */ }, 600));
  try {
    const result = await probe(origin(s), 200);
    assert.equal(result, 'down');
    await sleep(700);
    assert.equal(result, 'down', 'single-settle: a late response must not flip the result');
  } finally { s.close(); }
});

test('probe releases the socket even while the body is still streaming', async () => {
  let drip = null;
  const s = await serve((req, res) => {
    res.writeHead(200, { 'Content-Length': String(10 * 1024 * 1024) });
    drip = setInterval(() => { try { res.write('x'.repeat(1024)); } catch {} }, 250);
    res.on('close', () => clearInterval(drip));
    res.on('error', () => clearInterval(drip));
    req.on('close', () => clearInterval(drip));
  });
  try {
    assert.equal(await probe(origin(s), 1000), 'up');
    await sleep(400);
    assert.equal(s._connections, 0, 'streaming response must not hold the socket after resolve');
  } finally {
    if (drip) clearInterval(drip);
    s.close();
    s.closeAllConnections();
  }
});

test('probe destroys the request when the backstop fires on a dribbling response', async () => {
  const sockets = new Set();
  const drips = new Set();
  const s = net.createServer((c) => {
    sockets.add(c);
    c.write('HTTP/1.1 200 OK\r\n');
    const drip = setInterval(() => { try { c.write('X-A: b\r\n'); } catch {} }, 250);
    drips.add(drip);
    c.on('close', () => clearInterval(drip));
    c.on('error', () => clearInterval(drip));
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  try {
    const url = `http://127.0.0.1:${s.address().port}/`;
    assert.equal(await probe(url, 500), 'down');
    await sleep(450);
    assert.equal(s._connections, 0, 'backstop must destroy the request');
  } finally {
    for (const drip of drips) clearInterval(drip);
    for (const c of sockets) c.destroy();
    s.close();
  }
});
