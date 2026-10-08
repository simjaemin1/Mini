#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T662 자 · 제품 무변)
// =============================================================================
// 두 존 걸음표(`server/xzone-geo.js crossGeo`)의 시간 해부 — 존 서버 워커와 **같은 질문**(A<B · coast 켬 · splitR 없음)을 같은 프로세스에서.
//   table <out.json>  : crossGeo 그대로 한 판(손잡이 `T662_GEO_CACHE` 무관 — 한 벌 파일을 안 거친다) → dist + split JSON(바이트 대조용) · 시간
//   pairs <out.json>  : crossGeo 와 같은 차례(합친 어댑터 → BFS → 쌍마다 정본 교역로)를 밟되 쌍마다 ms · 판/못 판을 적는다
//   명부 = T524 시딩 표(`scripts/t524-land-audit.js <존> <dir>` 의 `vills` 중 seeded · 서버 시딩과 같은 길)
// 쓰는 법: node scripts/t662-geo-anatomy.js table|pairs <T524 dir> <out.json> [--lim N]
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const [MODE, AD, OUT] = process.argv.slice(2);
const LIM = process.argv.includes('--lim') ? +process.argv[process.argv.indexOf('--lim') + 1] : Infinity;
const G = require(path.join(__dirname, '..', 'server', 'xzone-geo.js'));
const ros = (z) => JSON.parse(fs.readFileSync(path.join(AD, `${z}.json`), 'utf8')).vills.filter((v) => v.seeded).map((v) => ({ name: v.name, cx: v.ccx, cy: v.ccy }));
const A = 'hanbando', B = 'nippon', rA = ros(A), rB = ros(B);
if (MODE === 'table') {
  const t0 = Date.now();
  const r = G.crossGeo({ A, B, rosterA: rA, rosterB: rB, coast: true });
  fs.writeFileSync(OUT, JSON.stringify({ dist: r.dist, split: r.split, routed: r.routed, multi: r.multi, failed: r.failed }));
  console.log(JSON.stringify({ wall: Date.now() - t0, ms: r.ms, nA: r.nA, nB: r.nB, routed: r.routed, failed: r.failed }));
} else if (MODE === 'pairs') {
  const { ZONES, P, SZ } = G._mods();
  const t0 = Date.now();
  const U = G.unionAdapter([A, B], { coast: true });
  const offA = { x: ZONES[A].worldOffsetX - U.x0, y: ZONES[A].worldOffsetY - U.y0 }, offB = { x: ZONES[B].worldOffsetX - U.x0, y: ZONES[B].worldOffsetY - U.y0 };
  const vil = rA.map((v) => ({ ux: v.cx + offA.x / SZ, uy: v.cy + offA.y / SZ })).concat(rB.map((v) => ({ ux: v.cx + offB.x / SZ, uy: v.cy + offB.y / SZ })));
  const M = G.bfsMatrix(U.ta, U.ZONE, vil.map((v) => ({ x: v.ux * 2.5, y: v.uy * 2.5 })));
  const bfsMs = Date.now() - t0, nA = rA.length, rows = [];
  P._routeProbe.reset();
  const ql = console.log; console.log = () => {};
  let k = 0;
  for (let i = 0; i < nA && k < LIM; i++) for (let j = nA; j < vil.length && k < LIM; j++, k++) {
    const d = M[i][j]; if (d == null || !isFinite(d)) { rows.push({ i, j, d: null }); continue; }
    const s = process.hrtime.bigint();
    const pts = P._routeProbe.pts((vil[i].ux + 0.5) * SZ, (vil[i].uy + 0.5) * SZ, (vil[j].ux + 0.5) * SZ, (vil[j].uy + 0.5) * SZ);
    rows.push({ i, j, d: +d.toFixed(1), ms: +(Number(process.hrtime.bigint() - s) / 1e6).toFixed(1), ok: !!pts });
  }
  console.log = ql;
  fs.writeFileSync(OUT, JSON.stringify({ bfsMs, rows }));
  const ok = rows.filter((r) => r.ok), bad = rows.filter((r) => r.d != null && !r.ok), sum = (a) => Math.round(a.reduce((s, r) => s + r.ms, 0));
  console.log(JSON.stringify({ bfsMs, pairs: rows.length, ok: ok.length, okMs: sum(ok), bad: bad.length, badMs: sum(bad) }));
} else { console.error('mode = table | pairs'); process.exit(2); }
