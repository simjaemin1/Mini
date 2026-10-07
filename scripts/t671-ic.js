#!/usr/bin/env node
// === scripts/t671-ic.js — `t646-anatomy --shape` 판의 IC 덤프(`@@T671IC <k> <함수>` 뒤 `%DebugPrint`) 집계 (T671 ① · 2026-10-07) ===
//   속성 자리(LoadProperty · SetNamed* · DefineNamedOwn · LoadKeyed · StoreKeyed* · HasKeyed …)마다 피드백 상태를 센다:
//   UNINITIALIZED(안 돈 자리) · MONOMORPHIC · POLYMORPHIC(모양 2~4) · MEGAMORPHIC(모양 > 4 — 스텁 캐시 해시 찾기).
//   ⚠상태는 **누적**이다(한 번 메가면 계속 메가) — 판의 마지막 덤프가 그 판의 답이다.
// 실행: node scripts/t671-ic.js <zone 로그> [--all]
'use strict';
const fs = require('fs');
const [file] = process.argv.slice(2);
const L = fs.readFileSync(file, 'utf8').split('\n');
const dumps = [];
let cur = null, slot = null;
for (const x of L) {
  let m = /^@@T671IC (\d+) (\S+)/.exec(x);
  if (m) { cur = { k: +m[1], fn: m[2], slots: [] }; dumps.push(cur); slot = null; continue; }
  if (/^@@T671IC_END/.test(x)) { cur = null; continue; }
  if (!cur) continue;
  m = /^ - slot #(\d+) (\S+) (\S+)/.exec(x);
  if (m) { slot = { i: +m[1], kind: m[2], st: m[3], maps: 0 }; cur.slots.push(slot); continue; }
  if (slot && /^\s+\[(weak|cleared)\][ :]/.test(x)) slot.maps++;
}
const PROP = /^(LoadProperty|SetNamed|DefineNamedOwn|LoadKeyed|StoreKeyed|HasKeyed|DefineKeyedOwn|StoreInArrayLiteral|LoadGlobal)/;
const last = new Map();
for (const d of dumps) last.set(d.fn, d);   // 함수마다 마지막 덤프
const out = {};
for (const [fn, d] of (process.argv.includes('--all') ? dumps.map((d) => [d.fn + '@' + d.k, d]) : last)) {
  const c = { k: d.k, mono: 0, poly: 0, mega: 0, uninit: 0, polyMaps: [], byKind: {} };
  for (const s of d.slots) {
    if (!PROP.test(s.kind)) continue;
    const st = s.st === 'MONOMORPHIC' ? 'mono' : s.st === 'POLYMORPHIC' ? 'poly' : s.st === 'MEGAMORPHIC' ? 'mega' : 'uninit';
    c[st]++; if (st === 'poly') c.polyMaps.push(s.maps);
    const b = c.byKind[s.kind] || (c.byKind[s.kind] = { mono: 0, poly: 0, mega: 0, uninit: 0 }); b[st]++;
  }
  out[fn] = c;
}
console.log(JSON.stringify(out, null, 1));
