'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadState, saveState, merge, prune } = require('../lib/state.js');

function tmpfile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'panel-')), name);
}

const SNAPSHOT = [
  { key: 'docker/app:3000', name: 'App', origin: 'docker' },
  { key: 'local/python3:8765', name: 'python3', origin: 'local' },
];

test('loadState returns a blank shape when the file is missing', () => {
  const s = loadState(tmpfile('absent.json'));
  assert.deepEqual(s, { renames: {}, favorites: {}, hidden: {} });
});

test('loadState recovers from corrupt JSON by quarantining the file', () => {
  const file = tmpfile('state.json');
  fs.writeFileSync(file, '{{not json');
  const s = loadState(file);
  assert.deepEqual(s, { renames: {}, favorites: {}, hidden: {} });
  assert.ok(fs.existsSync(`${file}.bak`), 'corrupt file must be preserved');
  assert.ok(!fs.existsSync(file), 'corrupt file must be replaced');
});

test('saveState round-trips and loadState reads it back', () => {
  const file = tmpfile('state.json');
  saveState(file, { renames: { 'a:1': 'Mi App' }, favorites: { 'a:1': true }, hidden: {} });
  assert.deepEqual(loadState(file).renames, { 'a:1': 'Mi App' });
});

test('merge applies rename, favorite and hide on top of the snapshot', () => {
  const state = { renames: { 'docker/app:3000': 'Panel' }, favorites: { 'docker/app:3000': true }, hidden: { 'local/python3:8765': true } };
  const rows = merge(SNAPSHOT, state);
  const visible = rows.filter(r => !r.hidden);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].displayName, 'Panel');
  assert.equal(visible[0].favorite, true);
  const all = merge(SNAPSHOT, state);
  assert.equal(all.length, 2, 'hidden rows stay in the model, only filtered for render');
});

test('merge never invents rows from stale personalization', () => {
  const state = { renames: { 'ghost:1': 'Viejo' }, favorites: { 'ghost:1': true }, hidden: { 'ghost:1': true } };
  const rows = merge(SNAPSHOT, state);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.displayName !== 'Viejo'));
});

test('prune drops personalization for keys no longer discovered', () => {
  const state = { renames: { 'a:1': 'x', 'gone:9': 'y' }, favorites: { 'gone:9': true }, hidden: {} };
  const pruned = prune(state, new Set(['a:1']));
  assert.deepEqual(pruned.renames, { 'a:1': 'x' });
  assert.deepEqual(pruned.favorites, {});
  assert.notStrictEqual(pruned.renames, state.renames, 'prune must return fresh containers');
});

test('merge tolerates a missing state field', () => {
  const rows = merge(SNAPSHOT, {});
  assert.equal(rows.length, 2);
  assert.equal(rows[0].favorite, false);
  assert.equal(rows[0].hidden, false);
});

test('loadState drops prototype-pollution payloads from a hand-edited file', () => {
  const file = tmpfile('state.json');
  // JSON.stringify drops `__proto__` keys from object literals, so write the
  // raw bytes a hand-edited malicious file would actually contain.
  fs.writeFileSync(file, '{"renames":{"__proto__":"evil","normal:1":"ok"},"favorites":{"a":1,"b":true},"hidden":[]}');
  const s = loadState(file);
  assert.equal(s.renames['normal:1'], 'ok');
  assert.equal(Object.prototype.evil, undefined, 'Object.prototype must stay clean');
  assert.ok(!Object.hasOwn(s.renames, '__proto__'), 'pollution key must be dropped');
  assert.deepEqual(s.favorites, { b: true }, 'non-boolean values must be dropped');
  assert.deepEqual(s.hidden, {}, 'non-object bucket must be blanked');
});

test('merge does not mutate the snapshot or the state', () => {
  const snapshot = [{ key: 'docker/app:3000', name: 'App', origin: 'docker' }];
  const state = { renames: { 'docker/app:3000': 'Panel' }, favorites: {}, hidden: {} };
  const frozenSnapshot = JSON.parse(JSON.stringify(snapshot));
  const frozenState = JSON.parse(JSON.stringify(state));
  const rows = merge(snapshot, state);
  assert.notStrictEqual(rows[0], snapshot[0], 'rows must be fresh objects');
  assert.deepEqual(snapshot, frozenSnapshot, 'snapshot must be untouched');
  assert.deepEqual(state, frozenState, 'state must be untouched');
  assert.equal(snapshot[0].name, 'App', 'rename must not reach the source row');
});

test('loadState blanks buckets that are valid JSON of the wrong shape', () => {
  const file = tmpfile('state.json');
  fs.writeFileSync(file, JSON.stringify({ renames: 42, favorites: [], hidden: null }));
  const s = loadState(file);
  assert.deepEqual(s, { renames: {}, favorites: {}, hidden: {} });
});
