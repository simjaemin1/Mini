'use strict';
// (@regress 없음 — 러너 밖 · T1340 계측기 · 제품 무변 · 읽기만)
// === scripts/t1340-moment-hook.js — 재기동 순간 전수 덤프: 종료 저장 순간 ↔ 다시 뜬 첫 틱 ==========================================
//   T1308 이어 돌리기 자(`t1308-long-run.js`)의 부르는 쪽 NODE_OPTIONS 에 얹는다. 마디마다 `<T577_OUT>.t1340-save.json`(T728 종료 저장 줄
//   `saveVillagesAndMeta` 이 불리는 순간) · `<T577_OUT>.t1340-ready.json`(다시 뜬 판의 첫 `onGameTick` · 아무 몸도 결정하기 전)을 쓴다.
//   덤프: 몸(마을 이름 + `npcPids` 자리 → 칸마다 정규화 JSON) · 서버 마을 칸 · econ 마을 칸 · econ 세계 칸 · 서버 state 칸(마을 · 몸 · 세계 빼고).
//   견주기: `node scripts/t1340-moment-cmp.js <앞 마디 save> <뒤 마디 ready>`.
const path = require('path');
const fs = require('fs');
const Module = require('module');
if (!process.env.T577_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.join(__dirname, '..');
const VILL = path.join(ROOT, 'server', 'villages.js');
const OUT = process.env.T577_OUT;
const SKIP = new Set(['ws', '_world']);
const crypto = require('crypto');
// 몸 · 마을이 서로를 가리키는 칸은 이름 · pid 로(깊은 순환 대신)
const REF = (x) => (x && typeof x === 'object' && (x.pid != null || x.dbId != null || (x.name != null && x.npcs))) ? ('#' + (x.pid != null ? 'p' + x.pid : x.dbId != null ? 'v' + x.dbId : 'e' + x.name)) : null;

//   값 = 해시(만들지 않고 흘려 넣는다 — 큰 격자 · 지도도 메모리 0) + 앞 160자 맛보기(크기 예산)
//   객체마다 한 번만 센다(같은 하위 그래프를 여러 칸이 가리켜도 — 메모) · 마디 수 예산을 넘으면 크기만
function digest(x, memo, cnt, d, stack) {
  if (x === undefined) return 'u';
  if (typeof x === 'function') return 'ƒ';
  if (typeof x === 'bigint') return 'n' + x;
  if (typeof x === 'number') return '#' + (Number.isFinite(x) ? x : String(x));
  if (x === null || typeof x !== 'object') return typeof x + ':' + String(x);
  if (d > 0) { const ref = REF(x); if (ref != null) return ref; }
  if (memo.has(x)) return memo.get(x);
  if (stack.has(x)) return '↺';
  if (++cnt.n > 3e6) return '…' + (x.length != null ? x.length : x.size != null ? x.size : '');
  stack.add(x);
  const h = crypto.createHash('sha1');
  if (x instanceof Map) { h.update('M'); for (const [k, v] of x) h.update(digest(k, memo, cnt, d + 1, stack) + '=' + digest(v, memo, cnt, d + 1, stack) + ','); }
  else if (x instanceof Set) { h.update('S'); for (const v of x) h.update(digest(v, memo, cnt, d + 1, stack) + ','); }
  else if (ArrayBuffer.isView(x)) { h.update('T' + x.length + ':'); h.update(Buffer.from(x.buffer, x.byteOffset, x.byteLength)); }
  else if (Array.isArray(x)) { h.update('A'); for (const v of x) h.update(digest(v, memo, cnt, d + 1, stack) + ','); }
  else { h.update('O'); for (const k of Object.keys(x).sort()) { if (SKIP.has(k)) continue; h.update(k + ':' + digest(x[k], memo, cnt, d + 1, stack) + ','); } }
  stack.delete(x);
  const r = h.digest('hex').slice(0, 16); memo.set(x, r); return r;
}
function peek(x, budget) {
  let out = '';
  const go = (v, d) => {
    if (out.length > budget) return;
    if (v === undefined) { out += 'u'; return; }
    if (typeof v === 'function') { out += 'ƒ'; return; }
    if (v === null || typeof v !== 'object') { out += (typeof v === 'string' ? JSON.stringify(v) : String(v)); return; }
    if (d > 3) { out += '…'; return; }
    const ref = d > 0 ? REF(v) : null; if (ref) { out += ref; return; }
    if (v instanceof Map) { out += 'M' + v.size + '{'; for (const [k, w] of v) { if (out.length > budget) break; go(k, d + 1); out += '='; go(w, d + 1); out += ','; } out += '}'; return; }
    if (v instanceof Set) { out += 'S' + v.size + '{'; for (const w of v) { if (out.length > budget) break; go(w, d + 1); out += ','; } out += '}'; return; }
    if (Array.isArray(v) || ArrayBuffer.isView(v)) { out += 'A' + v.length + '['; for (const w of v) { if (out.length > budget) break; go(w, d + 1); out += ','; } out += ']'; return; }
    out += '{'; for (const k of Object.keys(v)) { if (out.length > budget) break; out += k + ':'; go(v[k], d + 1); out += ','; } out += '}';
  };
  try { go(x, 0); } catch (e) { out += '(err)'; }
  return out.slice(0, budget);
}
let MEMO = new Map(), CNT = { n: 0 };
const J = (x) => { try { return digest(x, MEMO, CNT, 0, new Set()).slice(0, 16) + ' ' + peek(x, 160); } catch (e) { return '(err ' + e.message + ')'; } };
function flat(o) {
  const r = {};
  for (const k of Object.keys(o).sort()) { if (SKIP.has(k)) continue; const v = o[k]; const ref = REF(v); r[k] = ref != null && v !== o ? ref : J(v); }
  return r;
}
const RING = [];
function dump(st, tag) {
  MEMO = new Map(); CNT = { n: 0 }; const t0 = process.hrtime ? Date.now() : 0;
  const P = st.deps && st.deps.players, W = st.world;
  const out = { tag, V: Date.now(), ticks: RING.slice(), worldDay: W && W.day, vils: {}, state: {}, world: {} };
  for (const v of (st.villages || [])) {
    const rows = [];
    for (let i = 0; i < (v.npcPids || []).length; i++) { const b = P && P.get(v.npcPids[i]); rows.push(b ? flat(b) : null); }
    const side = {}; for (const k of Object.keys(v).sort()) { if (k === 'econ' || k === 'npcPids') continue; side[k] = J(v[k]); }
    const econ = v.econ ? (() => { const o = {}; for (const k of Object.keys(v.econ).sort()) { if (k === '_world' || k === 'npcs') continue; o[k] = J(v.econ[k]); }
      o.npcs = J((v.econ.npcs || []).map((n) => n)); return o; })() : null;
    out.vils[v.name] = { pids: (v.npcPids || []).slice(), rows, side, econ };
  }
  for (const k of Object.keys(st).sort()) { if (k === 'villages' || k === 'world' || k === 'deps' || k === 'byDbId') continue; out.state[k] = J(st[k]); }
  if (W) for (const k of Object.keys(W).sort()) { if (k === 'villages') continue; out.world[k] = J(W[k]); }
  if (P) { const others = []; for (const [pid, b] of P) if (!b.simVillageId) others.push([pid, b.type || b.kind || null]); out.otherBodies = others.length; }
  return out;
}
{
  const _p = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    if (filename !== VILL) return _p(m, filename);
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1340 =') < 0) src += '\n;module.exports.__t1340 = function () { return state; };\n';
      if (process.env.T1340_TRACE) for (const f of String(process.env.T1340_TRACE).split(',')) { const a = 'function ' + f + '('; const i = src.indexOf(a); if (i < 0) continue; const j = src.indexOf('{', i) + 1;
        src = src.slice(0, j) + ` if (!global.__t1340tr_${f}) { global.__t1340tr_${f} = 1; console.log('[t1340] 첫 ${f} V=' + Date.now() + ' ' + new Error().stack.split('\\n').slice(2, 7).map((x) => x.trim()).join(' | ')); }` + src.slice(j); }
      return _c.call(this, src, fn); };
    const r = _p(m, filename);
    const g = m.exports.onGameTick;
    //   다시 뜬 판 = 첫 틱(ready) · `T1340_AT_V=<V>` = 그 V 이상인 첫 틱(at — 한 번에 돈 판에서 다시 뜬 판의 첫 틱과 같은 순간을 뜬다)
    const ATS = String(process.env.T1340_AT_V || '').split(',').map(Number).filter((x) => x > 0), AT = ATS.length ? ATS[0] : 0; let atI = 0;
    if (typeof g === 'function') {
      let done = false, doneAt = false;
      m.exports.onGameTick = function () {
        RING.push(Date.now()); if (RING.length > 6) RING.shift();
        if (!done && process.env.T577_RESUMED === '1') { const st = m.exports.__t1340(); if (st && st.ready) { done = true; try { fs.writeFileSync(OUT + '.t1340-ready.json', JSON.stringify(dump(st, 'ready'))); } catch (e) { console.error('[t1340] 준비 덤프 실패', e.message); } } }
        while (atI < ATS.length && Date.now() >= ATS[atI]) { const st = m.exports.__t1340(); if (!(st && st.ready)) break; try { fs.writeFileSync(OUT + (atI ? `.t1340-at${atI}.json` : '.t1340-at.json'), JSON.stringify(dump(st, 'at'))); } catch (e) { console.error('[t1340] at 덤프 실패', e.message); } atI++; }
        return g.apply(this, arguments);
      };
    }
    return r;
  };
}
//   종료 저장 줄 — 적재 순간에 감싼다(타이머 0 · 가상 시계 줄에 안 든다)
{
  const DBF = path.join(ROOT, 'server', 'zone-local-db.js');
  const _p = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    const r = _p(m, filename);
    if (filename === DBF && m.exports && typeof m.exports.saveVillagesAndMeta === 'function') {
      const f = m.exports.saveVillagesAndMeta;
      m.exports.saveVillagesAndMeta = function (rows) {
        //   미끼(`T1340_BAIT=body`) — 종료 저장 줄에서 몸 칸 전부 줄(`$all` · T1340 ②)을 뺀 사본: 걸음 · 일 진행 시각 · 결정 시각이 다시 뜰 때 사라진다(빨강이어야 한다)
        if (process.env.T1340_BAIT === 'body' && Array.isArray(rows)) { let n = 0; for (const r of rows) { try { const e = typeof r.econ === 'string' ? JSON.parse(r.econ) : r.econ; const B = e && e._t747Body; if (B && Array.isArray(B.rows)) { for (const x of B.rows) if (x && x.$all) { delete x.$all; delete x.$at; n++; } r.econ = typeof r.econ === 'string' ? JSON.stringify(e) : e; } } catch (z) {} } console.log(`[t1340] 미끼 — 몸 칸 전부 줄 ${n} 뺌`); }
        try { const V = require(VILL); const st = V.__t1340 && V.__t1340(); if (st) fs.writeFileSync(OUT + '.t1340-save.json', JSON.stringify(dump(st, 'save'))); } catch (e) { console.error('[t1340] 저장 덤프 실패', e.message); }
        return f.apply(this, arguments);
      };
    }
    return r;
  };
}
