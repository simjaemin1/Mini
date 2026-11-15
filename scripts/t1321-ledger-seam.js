#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1321 ⓑ 진단 자 · 읽기만)
// === scripts/t1321-ledger-seam.js — 야생 그림자 장부(사냥터 개체 장부 `_gameRich`)가 이음매에서 어떻게 생겼나 =====================
//   두 존 DB(판 끝 · 마을 행 econ 곁 칸 `_t728Game` — 장부 셀 → 마릿수 · T728 저장 그대로)를 읽어:
//   ① 존마다 장부 셀 수 · 이음매에서 k 칸 안(1 · 2 · 10 · 40 · 130 — 130 = 밴드 바깥 반지름 `HUNT_BAND1`) 셀 수 · 그 셀을 가진 마을
//   ② 존 사각 **밖** 장부 셀(한반도 cx ≥ NX — 밴드 훑기가 존 동쪽 끝을 안 자른다 · 닛폰은 cx ≥ 1 만 훑는다) — 이웃 존 칸과 같은 몸 칸인가(두 장부가 같은 땅을 센다)
//   ③ 이음매 맞은편 짝(한반도 cx ↔ 닛폰 cx − NX_한 · 같은 cy) — 두 장부가 같이 가진 땅 칸 수 · 마릿수 합
// 쓰는 법: node scripts/t1321-ledger-seam.js <한반도 DB> <닛폰 DB>
'use strict';
const path = require('path');
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const [HDB, NDB] = process.argv.slice(2);
if (!HDB || !NDB) { console.error('쓰는 법: <한반도 DB> <닛폰 DB>'); process.exit(2); }
const { DatabaseSync } = require('node:sqlite');
const NXH = Math.ceil(ZONES.hanbando.zoneWidth / 32), NXN = Math.ceil(ZONES.nippon.zoneWidth / 32);
const seamCell = (ZONES.nippon.worldOffsetX - ZONES.hanbando.worldOffsetX) / 32;   // 닛폰 cx 0 = 한반도 cx 이 값
function ledger(file, zone) {
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = db.prepare('SELECT name, cx, cy, econ_state FROM villages WHERE zone = ?').all(zone);
  db.close();
  const cells = [];   // { cx, cy, g, vil }
  let vils = 0, withG = 0;
  for (const r of rows) {
    vils++;
    let e = null; try { e = JSON.parse(r.econ_state); } catch (x) { continue; }
    const G = e && e._t728Game; if (!G || !Array.isArray(G.m)) continue;
    withG++;
    for (let i = 0; i + 1 < G.m.length; i += 2) { const k = String(G.m[i]), ci = k.indexOf(','); cells.push({ cx: +k.slice(0, ci), cy: +k.slice(ci + 1), g: +G.m[i + 1], vil: r.name, vcx: r.cx }); }
  }
  return { cells, vils, withG };
}
const H = ledger(HDB, 'hanbando'), N = ledger(NDB, 'nippon');
const distH = (c) => (NXH - 1) - c.cx;   // 한반도: 동쪽 끝 셀까지(음수 = 존 밖)
const distN = (c) => c.cx;              // 닛폰: 서쪽 끝 셀까지
const within = (L, f, k) => L.filter((c) => f(c) >= 0 && f(c) < k);
const out = { NX: { hanbando: NXH, nippon: NXN }, seamCell, hanbando: {}, nippon: {} };
for (const [z, L, f] of [['hanbando', H, distH], ['nippon', N, distN]]) {
  const o = out[z];
  o.villages = L.vils; o.villagesWithLedger = L.withG; o.cells = L.cells.length; o.sum = +L.cells.reduce((a, c) => a + c.g, 0).toFixed(1);
  o.near = {};
  for (const k of [1, 2, 10, 40, 130]) { const S = within(L.cells, f, k); o.near[k] = { cells: S.length, sum: +S.reduce((a, c) => a + c.g, 0).toFixed(1), vils: [...new Set(S.map((c) => c.vil))].length }; }
  const outside = L.cells.filter((c) => f(c) < 0);
  o.outsideZone = { cells: outside.length, sum: +outside.reduce((a, c) => a + c.g, 0).toFixed(1), vils: [...new Set(outside.map((c) => c.vil))], maxBeyond: outside.reduce((a, c) => Math.max(a, -f(c)), 0) };
}
//   ③ 같은 땅 칸 — 한반도 존 밖 셀(cx ≥ NXH)을 닛폰 칸으로 옮겨(cx − seamCell) 닛폰 장부에 같은 칸이 있나
const nKey = new Map(N.cells.map((c) => [c.cx + ',' + c.cy, c]));
const shared = [];
for (const c of H.cells) if (c.cx >= NXH) { const k = (c.cx - seamCell) + ',' + c.cy; if (nKey.has(k)) shared.push({ h: c, n: nKey.get(k) }); }
out.sameGround = { cells: shared.length, sumH: +shared.reduce((a, s) => a + s.h.g, 0).toFixed(1), sumN: +shared.reduce((a, s) => a + s.n.g, 0).toFixed(1), sample: shared.slice(0, 3).map((s) => ({ h: [s.h.cx, s.h.cy, s.h.vil], n: [s.n.cx, s.n.cy, s.n.vil] })) };
console.log(JSON.stringify(out, null, 1));
