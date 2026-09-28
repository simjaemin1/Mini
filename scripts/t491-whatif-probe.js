// === scripts/t491-whatif-probe.js — "몸이 안 멈추면" 판 — 나무꾼 몸의 결함 둘을 **계측 판에서만** 걷어 본다(T491 ② 대조) =====
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 레포 `server/villages.js` 는 **한 글자도 안 만진다** —
//   적재 순간에만 원문 글자를 바꿔 컴파일한다(`t449-toggle-probe.js` 와 같은 문법). 제품 판정이 아니라 **되물음**(what-if)이다.
//   `scripts/t491-probe.js`(몸의 하루 · 마을 하루 줄)를 같이 싣는다.
// ★`T491_WHATIF`
//   `a` — 자리 고르기에서 **그날 비운 셀을 건넌다**(몸이 그 셀을 비웠다는 것을 안다 — 일괄 절이 셀마다 먼저 묻는 그 문 `t325TreesAtCell`).
//         제품 몸은 그날 목록(`_lifeJobSites` 하루 캐시)에서 가장 가까운 셀을 다시 골라 **빈 셀에 하루 내내 선다**(보고/T491 §2-ⓑ).
//   `b` — `a` + 곳간 사다리에서 **목재도 내린다**(`_t325Deliver` — 캐논 "귀환하면 곳간에"). 제품 몸은 짐이 차면 사다리까지 가서
//         곡식 손(`GRAIN_ITEM`)만 내리고 통나무는 해 질 녘(econ 틱 앞 `_lifeHandsIn`)까지 든다.
'use strict';
require('./t491-probe.js');
const Module = require('module');
const path = require('path');
const MODE = process.env.T491_WHATIF || '';
const VJS = path.join('server', 'villages.js');
const _compile = Module.prototype._compile;
function rep(src, a, b, name) {
  const n = src.split(a).length - 1;
  if (n !== 1) throw new Error(`[t491-whatif] ${name}: 원문 글자 ${n}곳(1곳이어야 한다)`);
  return src.replace(a, b);
}
Module.prototype._compile = function (content, filename) {
  if (MODE && filename.endsWith(VJS)) {
    content = rep(content,
      `      for (let i = 0; i < _tr.length; i++) {
        const t = _tr[(i + h) % _tr.length];
        const d2 = (t.x - npc.x) * (t.x - npc.x) + (t.y - npc.y) * (t.y - npc.y);
        if (d2 < bd) { bd = d2; best = t; }
      }
      npc._t325Site = { cx: best.cx, cy: best.cy, x: best.x, y: best.y, day };`,
      `      const _wiE = (vil._wiE && vil._wiE.day === day) ? vil._wiE.s : null;
      for (let i = 0; i < _tr.length; i++) {
        const t = _tr[(i + h) % _tr.length];
        if (_wiE && _wiE.has(t.cx + ',' + t.cy)) continue;
        const d2 = (t.x - npc.x) * (t.x - npc.x) + (t.y - npc.y) * (t.y - npc.y);
        if (d2 < bd) { bd = d2; best = t; }
      }
      if (!best) return false;
      npc._t325Site = { cx: best.cx, cy: best.cy, x: best.x, y: best.y, day };`, 'a-고르기');
    content = rep(content,
      `if (!_peek || !_peek.length) { npc._t325Site = null; return true; }`,
      `if (!_peek || !_peek.length) { const _E = (vil._wiE && vil._wiE.day === day) ? vil._wiE : (vil._wiE = { day, s: new Set() }); _E.s.add(ts.cx + ',' + ts.cy); npc._t325Site = null; return true; }`, 'a-빈 셀');
    if (MODE === 'b') {
      content = rep(content,
        `else { _granStockAdd(vil, g, _handOf(npc)); _handSet(npc, 0); if (npc._t368H) _t368Deliver(vil, npc, 'gran'); }`,
        `else { _granStockAdd(vil, g, _handOf(npc)); _handSet(npc, 0); if (npc._t368H) _t368Deliver(vil, npc, 'gran'); if (npc.inventory && (npc.inventory.wood || 0) > 0 && _lifeEcon().T325_WOOD_ACT && _lifeEcon().woodActOn(vil.econ)) { vil._wiDep = (vil._wiDep || 0) + (npc.inventory.wood || 0); _t325Deliver(vil, npc); vil._t325PreWalked = (vil._t325PreWalked | 0) + 1; } }`, 'b-사다리');   // 낮에 넣은 몸도 "그날 걸은 몸"(몸 XOR 일괄 — 일괄이 또 베지 않게)
    }
    content += `\n;globalThis.__t491whatif = ${JSON.stringify(MODE)};\n`;
  }
  return _compile.call(this, content, filename);
};
