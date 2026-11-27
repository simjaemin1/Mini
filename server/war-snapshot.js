'use strict';
// Data graph only. Functions are rebound by their owning module; code is never persisted.
const crypto = require('crypto');
const fail = (s) => { const e = new Error('WAR_SNAP: ' + s); e.code = 'WAR_SNAP_INVALID'; throw e; };
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const CTORS = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView };
function pack(root, hooks = {}) {
  const seen = new Map(), nodes = [];
  function put(v, parent, key) {
    const atom = hooks.atom && hooks.atom(v, parent, key); if (atom !== undefined) return atom;
    if (v === undefined) return { u: 1 };
    if (typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0))) return { n: Object.is(v, -0) ? '-0' : String(v) };
    if (typeof v === 'bigint') return { b: String(v) };
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') return v;
    if (typeof v !== 'object' && typeof v !== 'function') fail('unregistered ' + typeof v + ' at ' + String(key));
    const ext = hooks.external && hooks.external.get(v); if (ext !== undefined) return { x: ext };
    if (seen.has(v)) return { r: seen.get(v) };
    const id = nodes.length; seen.set(v, id); const n = {}; nodes.push(n);
    if (v instanceof ArrayBuffer) { n.t = 'buffer'; n.v = Buffer.from(v).toString('base64'); }
    else if (ArrayBuffer.isView(v)) { n.t = 'view'; n.c = Buffer.isBuffer(v) ? 'Buffer' : v.constructor.name; if (n.c !== 'Buffer' && !CTORS[n.c]) fail('typed view'); n.b = put(v.buffer); n.o = v.byteOffset; n.l = v instanceof DataView ? v.byteLength : v.length; }
    else if (v instanceof Map) { n.t = 'map'; n.v = [...v].map(([k, x]) => [put(k, v, '$key'), put(x, v, k)]); }
    else if (v instanceof Set) { n.t = 'set'; n.v = [...v].map((x) => put(x, v)); }
    else {
      const p = hooks.project ? hooks.project(v) : null;
      if (!p && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) fail('unsupported prototype at ' + String(key));
      if (Object.getOwnPropertySymbols(v).some((s) => Object.getOwnPropertyDescriptor(v, s).enumerable)) fail('symbol state');
      n.t = p ? p.type : Array.isArray(v) ? 'array' : Object.getPrototypeOf(v) === null ? 'null-object' : 'object';
      if (n.t === 'array') n.l = v.length;
      const data = p ? p.data : v;
      n.v = Object.keys(data).map((k) => [k, put(data[k], v, k)]);
    }
    return { r: id };
  }
  const graph = { root: put(root), nodes };
  return { version: 1, complete: true, graph, sha256: digest(graph) };
}
function validate(s) {
  if (!s || s.version !== 1 || s.complete !== true || !s.graph || !Array.isArray(s.graph.nodes) || s.sha256 !== digest(s.graph)) fail('incomplete, corrupt or unsupported snapshot');
  return s;
}
function unpack(s, hooks = {}) {
  validate(s);
  const ns = s.graph.nodes, objects = ns.map((n) => {
    if (n.t === 'buffer') return Uint8Array.from(Buffer.from(n.v, 'base64')).buffer;
    if (n.t === 'map') return new Map(); if (n.t === 'set') return new Set();
    if (n.t === 'view') return null;
    if (n.t === 'null-object') return Object.create(null);
    if (n.t === 'array' && Number.isSafeInteger(n.l) && n.l >= 0) return new Array(n.l);
    if (n.t === 'object' || (hooks.types || []).includes(n.t)) return {};
    fail('unknown node type');
  });
  function get(v) {
    if (v === null || typeof v !== 'object') return v;
    if ('r' in v) { if (!Number.isInteger(v.r) || v.r < 0 || v.r >= ns.length) fail('dangling graph reference'); return objects[v.r]; }
    if ('x' in v) { const x = hooks.resolve && hooks.resolve(v.x); if (x === undefined) fail('missing external ' + v.x); return x; }
    if ('t' in v && typeof v.t === 'number' && hooks.time) return hooks.time(v.t);
    if ('p' in v) { const p = hooks.pid && hooks.pid(v.p); if (p === undefined) fail('missing pid ' + v.p); return p; }
    if ('u' in v) return undefined;
    if ('b' in v) return BigInt(v.b);
    if ('n' in v && ['NaN', 'Infinity', '-Infinity', '-0'].includes(v.n)) return v.n === '-0' ? -0 : Number(v.n);
    fail('invalid atom');
  }
  ns.forEach((n, i) => { if (n.t === 'view') { const b = get(n.b); if (!(b instanceof ArrayBuffer) || (n.c !== 'Buffer' && !CTORS[n.c])) fail('invalid typed buffer'); try { objects[i] = n.c === 'Buffer' ? Buffer.from(b, n.o, n.l) : new CTORS[n.c](b, n.o, n.l); } catch (_) { fail('invalid typed bounds'); } } });
  ns.forEach((n, i) => {
    const o = objects[i];
    if (n.t === 'map') for (const [k, v] of n.v) o.set(get(k), get(v));
    else if (n.t === 'set') for (const v of n.v) o.add(get(v));
    else if (n.v && Array.isArray(n.v) && !['buffer', 'view'].includes(n.t)) for (const [k, v] of n.v) Object.defineProperty(o, k, { value: get(v), writable: true, enumerable: true, configurable: true });
  });
  if (hooks.revive) ns.forEach((n, i) => hooks.revive(objects[i], n.t));
  return get(s.graph.root);
}
module.exports = { pack, unpack, validate, fail };
