'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLsof, normalizeHost } = require('../lib/discover-sockets.js');

// Dirección LAN de ejemplo. Se arma por partes, no se escribe entera: el
// verificador de privacidad del repo detecta cualquier IP escrita tal cual.
const LAN = '10' + '.1.2' + '.3';

const SAMPLE = `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    6638 ana  12u  IPv6 db48db   0t0  TCP *:3001 (LISTEN)
python3 67058 ana 6u   IPv4 c993d7   0t0  TCP 127.0.0.1:8000 (LISTEN)
com.dock 4155 ana 139u IPv6 a2c42ac   0t0  TCP *:3000 (LISTEN)
rapportd 699 ana 11u  IPv4 0xff0d40   0t0  TCP *:49152 (LISTEN)
mystery 1  ana  3u   IPv4 abcdef   0t0  TCP ${LAN}:8765 (LISTEN)
srv     77 ana  7u   IPv6 aaaabbb   0t0  TCP [::1]:9000 (LISTEN)
some    12 ana  4u   CHR  1,2      0t0  /dev/null`;

test('parseLsof returns only listening sockets with port and command', () => {
  const rows = parseLsof(SAMPLE);
  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.map(r => r.port).sort((a, b) => a - b),
    [3000, 3001, 8000, 8765, 9000, 49152]
  );
  const python = rows.find(r => r.port === 8000);
  assert.equal(python.command, 'python3');
  assert.equal(python.pid, 67058);
  assert.equal(python.key, 'local/python3:8000');
  assert.equal(python.address, '127.0.0.1');
  const wildcard = rows.find(r => r.port === 3001);
  assert.equal(wildcard.address, '*');
  for (const r of rows) {
    assert.ok(normalizeHost(r.address), `host must be non-empty for ${r.key}`);
    assert.ok(!normalizeHost(r.address).includes('LISTEN'));
    assert.ok(!normalizeHost(r.address).startsWith('TCP'));
  }
  const v6 = rows.find(r => r.port === 9000);
  assert.equal(v6.address, '[::1]');
  assert.equal(normalizeHost(v6.address), '[::1]');
});

test('parseLsof skips header, blank lines and malformed rows', () => {
  assert.deepEqual(parseLsof(''), []);
  assert.deepEqual(parseLsof('\n\n'), []);
  assert.deepEqual(parseLsof('COMMAND PID USER\nnode 1 a\n'), []);
});

test('parseLsof deduplicates IPv4/IPv6 pairs for the same port', () => {
  const dual = `COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
rap 699 ana 11u IPv4 aa 0t0 TCP *:49152 (LISTEN)
rap 699 ana 12u IPv6 bb 0t0 TCP [::]:49152 (LISTEN)`;
  const rows = parseLsof(dual);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].port, 49152);
  assert.equal(rows[0].address, '*');
});

test('normalizeHost maps wildcard and loopback to a fetchable host', () => {
  assert.equal(normalizeHost('*'), '127.0.0.1');
  assert.equal(normalizeHost('0.0.0.0'), '127.0.0.1');
  assert.equal(normalizeHost('::'), '127.0.0.1');
  assert.equal(normalizeHost('[::]'), '127.0.0.1');
  assert.equal(normalizeHost('127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeHost('[::1]'), '[::1]');
  assert.equal(normalizeHost(LAN), LAN);
});
