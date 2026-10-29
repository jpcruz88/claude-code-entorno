'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function boot() {
  const els = {};
  const el = (id) => {
    if (!els[id]) {
      els[id] = {
        innerHTML: '', textContent: '', dataset: {}, isContentEditable: false,
        classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
        addEventListener() {}, focus() {}, blur() {},
      };
    }
    return els[id];
  };

  let snapshotHandler = null;
  class FakeEventSource {
    addEventListener(type, fn) { if (type === 'snapshot') snapshotHandler = fn; }
    close() {}
  }

  const sandbox = {
    console,
    document: { getElementById: el, addEventListener() {} },
    EventSource: FakeEventSource,
    fetch: () => Promise.resolve({ ok: true }),
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
    location: { reload() {} },
    setTimeout: () => 0,
  };

  vm.runInContext(HTML.split('<script>')[1].split('</script>')[0], vm.createContext(sandbox));
  assert.ok(snapshotHandler, 'page must subscribe to SSE snapshots');

  return {
    els,
    snapshot(payload) { snapshotHandler({ data: JSON.stringify(payload) }); },
  };
}

function hostileRow(overrides = {}) {
  return Object.assign({
    // El key lleva `">` a propósito: es el único campo en comillas de atributo,
    // necesario para ejercitar la invariant de escaping de comillas.
    key: 'local/"><img src=x onerror=alert(1)>:80',
    name: '<script>alert(1)</script>',
    displayName: '<img src=x onerror=alert(1)>',
    origin: 'local',
    host: '127.0.0.1',
    port: 80,
    httpUrl: 'http://127.0.0.1:80/',
    web: true,
    status: 'activo',
    favorite: false,
    hidden: false,
  }, overrides);
}

function frame(rows) {
  return { rows, sources: { docker: true, sockets: true }, updated: '2026-10-29T00:00:00.000Z' };
}

test('discovery data can never inject markup into the table', () => {
  const { els, snapshot } = boot();
  snapshot(frame([hostileRow()]));
  const html = els.rows.innerHTML;
  assert.ok(html.length > 0, 'rows must render');
  assert.ok(!/<img src=x onerror/.test(html), 'raw markup must never reach innerHTML');
  assert.ok(!/<script>alert/.test(html), 'script tag must never reach innerHTML');
  assert.ok(html.includes('&lt;img'), 'displayName must be escaped');
  assert.ok(html.includes('&lt;script'), 'name must be escaped');
  assert.ok(html.includes('&quot;') || !html.includes('"'), 'attribute values are quoted');
});

test('hostile origin and status render inert, never undefined', () => {
  const { els, snapshot } = boot();
  snapshot(frame([hostileRow({ origin: '"><svg onload=alert(1)>', status: 'mystery' })]));
  const html = els.rows.innerHTML;
  assert.ok(!/<svg onload/.test(html), 'origin must be escaped');
  assert.ok(html.includes('mystery'), 'unknown status must render as itself');
  assert.ok(!html.includes('undefined'), 'unknown status must never render undefined');
});

test('the page requires the state-write header', () => {
  // Aferrado al cuerpo de post(): el string en cualquier otro sitio no bastaría.
  const m = HTML.match(/function post\(payload\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'post() must exist');
  assert.ok(m[0].includes('X-Panel-Client'), 'post() must send the CSRF header');
});
