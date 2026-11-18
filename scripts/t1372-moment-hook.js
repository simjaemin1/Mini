'use strict';
// (@regress 없음 — 러너 밖 · T1372 계측기 · 제품 무변 · 읽기만)
// === scripts/t1372-moment-hook.js — 재기동 순간 캐러밴 몸 · 첫 거름 표(T1322) 덤프 =====================================================
//   T1340 계측기(`t1340-moment-hook.js`)가 안 보는 두 갈래를 같은 세 순간에 뜬다:
//     save  = 종료 저장 줄(`saveVillagesAndMeta`)이 불리는 순간(마디 판 · 앞 마디)
//     ready = 다시 뜬 판의 첫 `onGameTick`(뒤 마디 · 아무 몸도 결정하기 전)
//     at    = `T1340_AT_V=<V>` 이상인 첫 틱(한 번에 돈 판 — 다시 뜬 판의 첫 틱과 같은 순간)
//   ⇒ `<T577_OUT>.t1372-<꼴>.json` = { V · day · cars: { 캐러밴 번호: { body: 칸 → 값, p: 상인 몸 칸 → 값, esc: [호위 몸 칸 → 값] } } · ss: { pid: 표 열 } · maxPid }
//   견주기: `node scripts/t1372-moment-cmp.js <at|save> <ready>`.
const path = require('path');
const fs = require('fs');
const Module = require('module');
if (!process.env.T577_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));   // 판을 띄운 트리(워크트리에서 띄워도 그 트리의 server/)
const VILL = path.join(ROOT, 'server', 'villages.js');
const SSF = path.join(ROOT, 'server', 'stand-skip.js');
const OUT = process.env.T577_OUT;
//   값 = 짧은 정규화 글자(남을 가리키는 칸은 열쇠로 — 몸 pid · 마을 이름 · 캐러밴 번호)
const REF = (x) => (x && typeof x === 'object') ? (x.pid != null ? '#p' + x.pid : x.dbId != null ? '#v' + x.dbId : (x.id != null && x.giveRes != null) ? '#c' + x.id : null) : null;
function norm(x, d) {
  if (x === undefined) return 'u';
  if (typeof x === 'function') return 'ƒ';
  if (typeof x === 'number') return Number.isFinite(x) ? String(Math.round(x * 1e6) / 1e6) : String(x);
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (d > 0) { const r = REF(x); if (r) return r; }
  if (d > 4) return '…';
  if (x instanceof Map) return 'M{' + [...x].map(([k, v]) => norm(k, d + 1) + '=' + norm(v, d + 1)).join(',') + '}';
  if (x instanceof Set) return 'S{' + [...x].map((v) => norm(v, d + 1)).join(',') + '}';
  if (Array.isArray(x) || ArrayBuffer.isView(x)) return x.length > 400 ? 'A' + x.length + ':' + norm(Array.from(x).slice(0, 400), d + 1) : '[' + Array.from(x).map((v) => norm(v, d + 1)).join(',') + ']';
  return '{' + Object.keys(x).sort().filter((k) => k !== 'ws').map((k) => k + ':' + norm(x[k], d + 1)).join(',') + '}';
}
const flat = (o) => { const r = {}; if (!o) return null; for (const k of Object.keys(o).sort()) { if (k === 'ws') continue; r[k] = norm(o[k], 1).slice(0, 2000); } return r; };
let SS = null;
function ssRow(pid) {
  if (!SS || !SS.ON) return null;
  const s = SS.slot(pid); if (s < 0) return null;
  const r = { own: SS.own[s] && SS.own[s].pid === pid ? 1 : 0 };
  for (const k of Object.keys(SS.A)) r[k] = norm(SS.A[k][s], 1);
  r.WPA = SS.WPA[s] ? 'A' + SS.WPA[s].length : 'null';
  return r;
}
function dump(st, tag) {
  const P = st.deps && st.deps.players;
  const out = { tag, V: Date.now(), day: st.world && st.world.day, cars: {}, ss: {}, ssN: SS && SS.ON ? SS.count() : 0, maxPid: 0, bodies: 0 };
  if (P) for (const pid of P.keys()) { const n = +String(pid).replace(/^p/, ''); if (n > out.maxPid) out.maxPid = n; }
  const B = st.caravanBodies;
  if (B) for (const [id, b] of [...B].sort((x, y) => (+x[0]) - (+y[0]))) {
    const body = flat(b), p = P && P.get(b.pid);
    out.cars[String(id)] = { body, p: flat(p), esc: (b.escorts || []).map((e) => flat(P && P.get(e.pid))), escRec: (b.escorts || []).map((e) => flat(e)) };
  }
  for (const v of (st.villages || [])) for (const pid of (v.npcPids || [])) { out.bodies++; const r = ssRow(pid); if (r && (r.TK !== '0' || r.DS !== '0')) out.ss[pid] = r; }
  if (B) for (const [, b] of B) { const r = ssRow(b.pid); if (r) out.ss[b.pid] = r; }
  return out;
}
{
  const _p = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    if (filename === SSF) { const r = _p(m, filename); SS = m.exports; return r; }
    if (filename !== VILL) return _p(m, filename);
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1372 =') < 0) src += '\n;module.exports.__t1372 = function () { return state; };\n'; return _c.call(this, src, fn); };
    const r = _p(m, filename);
    const g = m.exports.onGameTick;
    const ATS = String(process.env.T1340_AT_V || '').split(',').map(Number).filter((x) => x > 0); let atI = 0;
    if (typeof g === 'function') {
      let done = false;
      m.exports.onGameTick = function () {
        if (!done && process.env.T577_RESUMED === '1') { const st = m.exports.__t1372(); if (st && st.ready) { done = true; try { fs.writeFileSync(OUT + '.t1372-ready.json', JSON.stringify(dump(st, 'ready'))); } catch (e) { console.error('[t1372] ready 덤프 실패', e.message); } } }
        while (atI < ATS.length && Date.now() >= ATS[atI]) { const st = m.exports.__t1372(); if (!(st && st.ready)) break; try { fs.writeFileSync(OUT + (atI ? `.t1372-at${atI}.json` : '.t1372-at.json'), JSON.stringify(dump(st, 'at'))); } catch (e) { console.error('[t1372] at 덤프 실패', e.message); } atI++; }
        return g.apply(this, arguments);
      };
    }
    return r;
  };
}
{
  const DBF = path.join(ROOT, 'server', 'zone-local-db.js');
  const _p = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    const r = _p(m, filename);
    if (filename === DBF && m.exports && typeof m.exports.saveVillagesAndMeta === 'function') {
      const f = m.exports.saveVillagesAndMeta;
      m.exports.saveVillagesAndMeta = function () {
        try { const V = require(VILL); const st = V.__t1372 && V.__t1372(); if (st) fs.writeFileSync(OUT + '.t1372-save.json', JSON.stringify(dump(st, 'save'))); } catch (e) { console.error('[t1372] save 덤프 실패', e.message); }
        return f.apply(this, arguments);
      };
    }
    return r;
  };
}
