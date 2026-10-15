'use strict';
// (@regress 없음 — 러너 밖 · T757 계측기 · 제품 무변)
// === scripts/t757-hook.js — 몸 XOR 일괄 증인: 마을 · 날마다 몸이 깎은 덩이 · 일괄이 깎은 덩이 · econ 원석 수식 몫 · 표식 ===
//   T686 자(`t686-spike.js run`)에 `T686_PRELOAD=<이 파일>` 로 얹는다(존 cwd = 자의 작업 트리 — 그 트리의 villages.js 를 사본에서 고친다 · 제품 무변).
//   env T757_OUT=<파일.jsonl> — 채굴 조각(`_oreMineDaily`)이 마을마다 돌 때 한 줄:
//     { d: econ 날, v: 마을, walk: econ._t724Walk(표식), D: econ._oreOutLast(그날 수식이 낼 원석 — 표식이 안 서면 econ 이 수식으로 낸다),
//       body: 지난 채굴 조각 뒤 몸이 그 마을 광맥 셀에서 깎은 덩이(`oreConsumeAt` 을 감싸 셀 → 마을로 센다), batch: 이번 일괄이 깎은 덩이(`r.consumed`) }
const path = require('path');
const fs = require('fs');
const Module = require('module');
const VILL = path.join(process.cwd(), 'server', 'villages.js');
const OUT = process.env.T757_OUT || '/tmp/t757.jsonl';
{
  const _p = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    if (filename !== VILL) return _p(m, filename);
    const _c = m._compile;
    m._compile = function (src, fn) {
      const a = 'const r = _oreMineDaily(vil); if (r) {';
      const n = src.split(a).length - 1;
      src = src.split(a).join('globalThis.__t757Pre && __t757Pre(vil); const r = _oreMineDaily(vil); globalThis.__t757Post && __t757Post(vil, r); if (r) {');
      src += '\n;module.exports.__t757 = function () { return state; };\n';
      console.log(`[t757] 채굴 조각 앵커 ${n}곳`);
      return _c.call(this, src, fn);
    };
    return _p(m, filename);
  };
}
let inBatch = null, wrapped = false;
const body = new Map();   // 마을 이름 → 지난 채굴 조각 뒤 몸이 깎은 덩이
let cellVil = null;       // 'cx,cy' → 마을 이름(광맥 셀 목록에서 · 겹치면 먼저 본 마을)
function wrap() {
  if (wrapped) return;
  let V; try { V = require(VILL); } catch (e) { return; }
  const st = V.__t757 && V.__t757(); if (!st || !st.deps || !st.deps.oreConsumeAt) return;
  wrapped = true;
  const f0 = st.deps.oreConsumeAt;
  st.deps.oreConsumeAt = function (cx, cy, amt) {
    const got = f0.apply(this, arguments);
    if (!inBatch && got > 0) {
      if (!cellVil || cellVil.size === 0) { cellVil = new Map(); for (const v of (st.villages || [])) for (const c of (v._oreCells || [])) { const k = c.cx + ',' + c.cy; if (!cellVil.has(k)) cellVil.set(k, v.name); } }
      const nm = cellVil.get(cx + ',' + cy) || '?';
      body.set(nm, (body.get(nm) || 0) + got);
    }
    return got;
  };
  console.log('[t757] oreConsumeAt 감쌈');
}
const iv = setInterval(() => { wrap(); if (wrapped) clearInterval(iv); }, 500); iv.unref && iv.unref();
globalThis.__t757Pre = (vil) => { wrap(); inBatch = vil.name; if (cellVil && cellVil.size === 0) cellVil = null; };
globalThis.__t757Post = (vil, r) => {
  inBatch = null;
  try {
    const st = require(VILL).__t757();
    const e = vil.econ || {};
    const nMiner = Math.round((e.counts && e.counts.miner) || 0);
    const b = body.get(vil.name) || 0; body.set(vil.name, 0);
    if (nMiner > 0 || b > 0 || (r && r.consumed > 0)) fs.appendFileSync(OUT, JSON.stringify({ d: st.world && st.world.day, v: vil.name, miners: nMiner, walk: e._t724Walk | 0, D: +((e._oreOutLast || 0)).toFixed(4), body: +b.toFixed(4), batch: r ? +(r.consumed || 0).toFixed(4) : 0 }) + '\n');
  } catch (e) { }
};
