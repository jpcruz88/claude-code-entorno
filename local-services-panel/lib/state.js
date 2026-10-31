'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BLANK = { renames: {}, favorites: {}, hidden: {} };

function loadState(file) {
  if (!fs.existsSync(file)) return structuredClone(BLANK);
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch { return structuredClone(BLANK); }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch {
    try { fs.renameSync(file, `${file}.bak`); } catch { /* best effort */ }
    return structuredClone(BLANK);
  }
  if (!parsed || typeof parsed !== 'object') return structuredClone(BLANK);
  return {
    renames: sanitize(parsed.renames),
    favorites: sanitize(parsed.favorites),
    hidden: sanitize(parsed.hidden),
  };
}

function sanitize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === '__proto__') continue; // never let a hand-edited file retarget a bucket
    if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * Writes state atomically (temp file + rename).
 * @throws {Error} when the disk write fails — callers inside Task 6's 10s
 * discovery loop must wrap this in try/catch so one failed save cannot kill
 * the cycle. The target `state.json` is never left partial.
 */
function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw error;
  }
}

/**
 * Overlays personalization on a discovered snapshot.
 * Returns every row (including hidden) with `displayName`, `favorite`, `hidden`.
 * Rows only ever come from `snapshot` — state cannot invent entries.
 */
function merge(snapshot, state) {
  const s = state || {};
  const renames = s.renames || {};
  const favorites = s.favorites || {};
  const hidden = s.hidden || {};
  return snapshot.map(row => ({
    ...row,
    displayName: typeof renames[row.key] === 'string' && renames[row.key].trim()
      ? renames[row.key].trim()
      : row.name,
    favorite: favorites[row.key] === true,
    hidden: hidden[row.key] === true,
  }));
}

/**
 * Removes personalization whose key is no longer present in the snapshot.
 * @param {Set<string>} liveKeys — must be a Set; callers in Task 6 build it
 *   from discovered rows.
 * Note: values pass through unsanitized on purpose; `merge` re-validates
 * every value at read time, so pruning only needs to concern itself with keys.
 */
function prune(state, liveKeys) {
  const s = state || {};
  const keep = (obj) => Object.fromEntries(
    Object.entries(obj || {}).filter(([k]) => liveKeys.has(k))
  );
  return { renames: keep(s.renames), favorites: keep(s.favorites), hidden: keep(s.hidden) };
}

module.exports = { loadState, saveState, merge, prune, BLANK };
