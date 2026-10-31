'use strict';
const { execFile } = require('node:child_process');

const LSOFT_ARGS = ['-nP', '-iTCP', '-sTCP:LISTEN'];

/** Turns a bound address from lsof into a host we can fetch. */
function normalizeHost(address) {
  if (!address || address === '*' || address === '0.0.0.0' ||
      address === '::' || address === '[::]') return '127.0.0.1';
  return address;
}

/** Parses `lsof -nP -iTCP -sTCP:LISTEN` output into socket rows. */
function parseLsof(stdout) {
  const rows = [];
  const seen = new Set();
  const lines = String(stdout || '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('COMMAND')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 9) continue;
    const [command, pid, , , type] = parts;
    if (type !== 'IPv4' && type !== 'IPv6') continue;
    const name = parts.slice(8).join(' ');
    const match = name.match(/:(\d+)\s+\(LISTEN\)$/);
    if (!match) continue;
    const port = Number(match[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    if (seen.has(port)) continue;
    seen.add(port);
    rows.push({
      command,
      pid: Number(pid),
      port,
      address: name.slice(0, name.length - match[0].length),
      key: `local/${command}:${port}`,
    });
  }
  return rows;
}

/** Runs lsof and resolves with parsed rows. Never throws: reports `ok:false`. */
function discoverSockets() {
  return new Promise((resolve) => {
    execFile('lsof', LSOFT_ARGS, { timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) return resolve({ ok: false, rows: [], error: error.message });
        resolve({ ok: true, rows: parseLsof(stdout), error: null });
      });
  });
}

module.exports = { parseLsof, normalizeHost, discoverSockets, LSOFT_ARGS };
