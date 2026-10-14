'use strict';
// (@regress 없음 — 러너 밖 · T747 계측기 · 제품 무변)
// === scripts/t747-body-hook.js — 마을 몸(NPC) 칸 통째 덤프: 종료 저장 순간 ↔ 다시 뜬 첫 틱 ======================================
//   `scripts/t747-real.js` 가 NODE_OPTIONS 로 얹는다. 읽기만 — 세계에 0.
//   env: T747_SAVE_DUMP=<파일>  종료 저장 줄(`saveVillagesAndMeta` — T728 경계 종료)이 불리는 순간 몸 칸 전부
//        T747_READY_DUMP=<파일> 다시 뜬 판의 첫 틱(준비 뒤 · 아무 몸도 결정하기 전) 몸 칸 전부
//   몸 열쇠 = 마을 이름 + `npcPids` 자리(i). 값 = 칸마다 정규화 JSON(Map · Set 풀어서 · 함수 'ƒ' · undefined 'u' · 깊이 8).
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const VILL = path.join(ROOT, 'server', 'villages.js');
{
  const _p = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    if (filename !== VILL) return _p(m, filename);
    const _c = m._compile;
    m._compile = function (src, fn) { src += '\n;module.exports.__t747 = function () { return state; };\n'; return _c.call(this, src, fn); };
    const r = _p(m, filename);
    const g = m.exports.onGameTick;
    if (typeof g === 'function' && process.env.T747_READY_DUMP) {
      let done = false;
      m.exports.onGameTick = function () {
        if (!done) { const st = m.exports.__t747(); if (st && st.ready) { done = true; try { fs.writeFileSync(process.env.T747_READY_DUMP, JSON.stringify(dump(st, 'ready'))); } catch (e) { console.error('[t747] 준비 덤프 실패', e.message); } } }
        return g.apply(this, arguments);
      };
    }
    return r;
  };
}
const SKIP = new Set(['ws', 'path', 'pathIndex']);   // 소켓 · 길 배열(존 이동이 다시 찾는다 — 표에 따로 적는다)
function canon(x, d) {
  if (d > 8) return '…';
  if (x === undefined) return 'u';
  if (typeof x === 'function') return 'ƒ';
  if (x instanceof Map) return ['M', [...x].map(([k, v]) => [canon(k, d + 1), canon(v, d + 1)])];
  if (x instanceof Set) return ['S', [...x].map((v) => canon(v, d + 1))];
  if (Array.isArray(x)) return x.map((v) => canon(v, d + 1));
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) o[k] = canon(x[k], d + 1); return o; }
  if (typeof x === 'number' && !Number.isFinite(x)) return String(x);
  return x;
}
function dump(st, tag) {
  const P = st.deps && st.deps.players, out = { tag, at: Date.now(), worldDay: st.world && st.world.day, vils: {} };
  for (const v of (st.villages || [])) {
    const rows = [];
    for (let i = 0; i < (v.npcPids || []).length; i++) {
      const b = P && P.get(v.npcPids[i]); if (!b) { rows.push(null); continue; }
      const o = {};
      for (const k of Object.keys(b)) { if (SKIP.has(k)) { o[k] = '(skip)'; continue; } try { o[k] = JSON.stringify(canon(b[k], 0)); } catch (e) { o[k] = '(err)'; } }
      rows.push(o);
    }
    out.vils[v.name] = { n: rows.length, claim: v._claim ? v._claim.size : null, clearCrew: v._clearCrew, buildCrew: v._buildCrew, psiteCrew: v._psiteCrew, cropClaim: v._cropClaim ? v._cropClaim.size : null, rows };
  }
  return out;
}
if (process.env.T747_SAVE_DUMP) {
  const DBF = path.join(ROOT, 'server', 'zone-local-db.js');
  const iv = setInterval(() => {
    const m = require.cache[DBF]; if (!m || !m.exports || !m.exports.saveVillagesAndMeta) return;
    clearInterval(iv);
    const f0 = m.exports.saveVillagesAndMeta;
    m.exports.saveVillagesAndMeta = function () {
      try { const st = require(VILL).__t747(); fs.writeFileSync(process.env.T747_SAVE_DUMP, JSON.stringify(dump(st, 'save'))); } catch (e) { console.error('[t747] 저장 덤프 실패', e.message); }
      return f0.apply(this, arguments);
    };
  }, 20);
  iv.unref && iv.unref();
}
