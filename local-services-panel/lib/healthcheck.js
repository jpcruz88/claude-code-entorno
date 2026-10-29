'use strict';
const http = require('node:http');
const https = require('node:https');

const DEFAULT_TIMEOUT = 2000;

/**
 * Probes a URL for HTTP liveness.
 * Resolves 'up' when any HTTP status comes back (2xx, 3xx, 401, 403…),
 * 'down' on connection errors, resets, non-HTTP protocols and timeouts.
 * The returned promise never throws, never rejects, and never outlives
 * `timeoutMs` by more than the 100 ms backstop grace.
 * The underlying socket is always destroyed once the result is known.
 */
function probe(url, timeoutMs = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    let settled = false;
    let backstop = null;

    const done = (value) => {
      if (settled) return;
      settled = true;
      if (backstop !== null) clearTimeout(backstop);
      resolve(value);
    };

    let target;
    try { target = new URL(url); } catch { return done('down'); }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return done('down');
    const client = target.protocol === 'https:' ? https : http;

    const request = client.request(target, {
      method: 'GET',
      rejectUnauthorized: false, // local panel: liveness only, cert not judged
      headers: { 'User-Agent': 'local-services-panel/1.0', Connection: 'close' },
    }, (res) => {
      res.on('error', () => { /* premature close on the response stream */ });
      res.resume();
      done('up');
      request.destroy(); // liveness already captured; free the socket now
    });

    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', () => done('down'));
    request.setTimeout(timeoutMs);
    request.end();

    // Total deadline: always frees the socket, even if the inactivity
    // timer is repeatedly reset by a slow-drip response.
    backstop = setTimeout(() => {
      request.destroy();
      done('down');
    }, timeoutMs + 100);
    backstop.unref?.();
  });
}

module.exports = { probe, DEFAULT_TIMEOUT };
