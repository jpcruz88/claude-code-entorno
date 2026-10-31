'use strict';
const { execFile } = require('node:child_process');

const DOCKER_ARGS = ['ps', '--format', '{{json .}}'];
const WILDCARDS = ['0.0.0.0', '::', '127.0.0.1', '[::]'];

function toFetchHost(host) {
  return WILDCARDS.includes(host) ? '127.0.0.1' : host;
}

/**
 * Parses docker's `Ports` field.
 * Accepted forms: "0.0.0.0:3000->8080/tcp", "54322->5432/tcp",
 * and comma-separated lists of those.
 */
function parsePorts(portsField) {
  const out = [];
  const seen = new Set();
  const push = (port) => {
    // Docker prints the same publish twice for IPv4 + IPv6 ("0.0.0.0:3000->8080/tcp,
    // [::]:3000->8080/tcp"); after normalizing the host both are identical, keep one.
    const dedupeKey = `${port.host}:${port.hostPort}->${port.containerPort}/${port.protocol}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push(port);
  };
  if (!portsField) return out;
  for (const chunk of String(portsField).split(',')) {
    const entry = chunk.trim();
    if (!entry) continue;
    let m = entry.match(/^(.+):(\d+)->(\d+)\/(tcp|udp)$/);
    if (m) {
      push({ host: toFetchHost(m[1]), hostPort: Number(m[2]),
             containerPort: Number(m[3]), protocol: m[4] });
      continue;
    }
    m = entry.match(/^(\d+)->(\d+)\/(tcp|udp)$/);
    if (m) {
      push({ host: '127.0.0.1', hostPort: Number(m[1]),
             containerPort: Number(m[2]), protocol: m[3] });
    }
  }
  return out;
}

/** Parses `docker ps --format '{{json .}}'` output (one JSON object per line). */
function parseDockerPs(stdout) {
  const rows = [];
  for (const line of String(stdout || '').split('\n')) {
    if (!line.trim()) continue;
    let info;
    try { info = JSON.parse(line); } catch { continue; }
    if (!info || !info.Names || !info.Ports) continue;
    for (const port of parsePorts(info.Ports)) {
      if (port.protocol !== 'tcp') continue;
      rows.push({
        container: info.Names,
        image: info.Image || '',
        state: String(info.State || '').toLowerCase(),
        status: info.Status || '',
        host: port.host,
        port: port.hostPort,
        containerPort: port.containerPort,
        key: `docker/${info.Names}:${port.hostPort}`,
      });
    }
  }
  return rows;
}

/** Runs docker ps. Resolves {ok, rows, error}; never throws. */
function discoverDocker() {
  return new Promise((resolve) => {
    execFile('docker', DOCKER_ARGS, { timeout: 12000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) return resolve({ ok: false, rows: [], error: error.message });
        resolve({ ok: true, rows: parseDockerPs(stdout), error: null });
      });
  });
}

module.exports = { parseDockerPs, parsePorts, discoverDocker, DOCKER_ARGS };
