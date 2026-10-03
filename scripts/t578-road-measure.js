#!/usr/bin/env node
// === scripts/t578-road-measure.js — 존 DB 한 판의 길을 잰다(T573 표의 같은 칸들) [T578 ⑤ · 2026-10-03] ======================
//
// 재는 것(같은 DB 의 `roads` · `trade_routes` · `villages` 만 읽는다 · 지형은 `server/terrain.js` 술어 그대로):
//   ① 길 셀 수(v ≥ 1 · 8 · 28 — v 는 표의 마지막 저장일까지 감쇠 · roads.js 와 같은 식)
//   ② 길 셀 중 **교역로 직선 위** 비율 — 교역로 노드열(`trade_routes.pts`)을 4px 간격으로 보간해 밟은 셀(T573 ① 과 같은 자)
//   ③ 길 셀이 밟은 지형 — 물(다리 아님) · 바위 · 숲 비율
//   ④ 부채꼴 단면 가닥 수 — 이름으로 고른 마을 쌍(기본 T573 의 셋) 중심을 잇는 선의 가운데 수직 단면 ±40칸에서 흙길(v ≥ 8) 덩어리 수
//   ⑤ 마을 둘레 가닥 — 마을 중심에서 반경 40·80칸 원 위의 흙길 덩어리 수(마을마다 · 합 · 평균) = 한 마을에서 나가는 길이 몇 줄인가
//   ⑥ 교역로끼리 겹침 — 교역로 래스터 셀 합 ÷ 합집합 · 둘 이상이 지나는 셀 비율(같은 표의 노드열)
// 실행: node scripts/t578-road-measure.js --db <zone.db> [--out f.json] [--pairs 임업2-어촌12,광산3-임업5,임업3-농촌22]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const DBP = val('--db', null), OUT = val('--out', null), ZID = val('--zone', 'hanbando');
const PAIRS = val('--pairs', '임업2-어촌12,광산3-임업5,임업3-농촌22').split(',').map((s) => s.split('-'));
if (!DBP || !fs.existsSync(DBP)) { console.log('DB 가 없다 — --db <zone.db>'); process.exit(2); }
const { DatabaseSync } = require('node:sqlite');
const zc = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain.js'));
try { if (T.setZonesMeta) T.setZonesMeta(zc.ZONES); } catch (e) {}
{ const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')); for (const [z, d] of Object.entries(all)) T.setHardcoded(z, d); }
const Z = zc.ZONES[ZID], W = Math.ceil(Z.zoneWidth / 32);
const br = new Set(); { const b = Z.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) br.add(b[i] * 100000 + b[i + 1]); }
const db = new DatabaseSync(DBP, { readOnly: true });
const rows = db.prepare('SELECT cell_key k, v, d FROM roads WHERE zone = ?').all(ZID);
const routes = db.prepare('SELECT pair, pts FROM trade_routes WHERE zone = ?').all(ZID).filter((r) => r.pts).map((r) => ({ pair: r.pair, pts: JSON.parse(r.pts) }));
const vils = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all(ZID);
db.close();
const dMax = rows.reduce((m, r) => Math.max(m, r.d), 0);
const V = new Map(); for (const r of rows) { const v = r.v * Math.pow(0.995, dMax - r.d); if (v >= 1) V.set(r.k, v); }
// ② 교역로 직선 래스터
const onLine = new Set();
for (const R of routes) {
  const P = R.pts;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], n = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 4));
    for (let s = 0; s <= n; s++) { const x = a.x + (b.x - a.x) * s / n, y = a.y + (b.y - a.y) * s / n; onLine.add(Math.floor(y / 32) * W + Math.floor(x / 32)); }
  }
}
const out = { db: path.basename(DBP), dMax, routes: routes.length, thr: {} };
for (const thr of [1, 8, 28]) {
  let n = 0, on = 0, water = 0, rock = 0, forest = 0, bridge = 0;
  for (const [k, v] of V) {
    if (v < thr) continue; n++;
    if (onLine.has(k)) on++;
    const cx = k % W, cy = (k / W) | 0, x = cx * 32 + 16, y = cy * 32 + 16;
    const isBr = br.has(cx * 100000 + cy);
    if (T.isWaterCellLocal(ZID, x, y)) { if (isBr) bridge++; else water++; }
    else if (T.isRockCellLocal(ZID, x, y)) rock++;
    if (T.getForestMultiplier(ZID, x, y) > 1) forest++;
  }
  out.thr['v>=' + thr] = { cells: n, onLine: n ? +(on / n).toFixed(4) : 0, waterNoBridge: water, rock, bridge, forest: n ? +(forest / n).toFixed(4) : 0 };
}
// ④ 부채꼴 단면
const byName = new Map(vils.map((v) => [v.name, v]));
out.fans = [];
for (const [an, bn] of PAIRS) {
  const A = byName.get(an), B = byName.get(bn);
  if (!A || !B) { out.fans.push({ pair: an + '–' + bn, missing: true }); continue; }
  const dx = B.cx - A.cx, dy = B.cy - A.cy, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, mx = A.cx + dx / 2, my = A.cy + dy / 2;
  let runs = 0, inRun = false, vmax = [];
  for (let s = -40; s <= 40; s++) {
    const cx = Math.floor(mx + nx * s), cy = Math.floor(my + ny * s), v = V.get(cy * W + cx) || 0;
    if (v >= 8) { if (!inRun) { runs++; vmax.push(0); } inRun = true; vmax[vmax.length - 1] = Math.max(vmax[vmax.length - 1], Math.round(v)); } else inRun = false;
  }
  out.fans.push({ pair: an + '–' + bn, len: Math.round(L), strands: runs, vmax });
}
// ⑤ 마을 둘레 가닥
out.ring = {};
for (const R of [40, 80]) {
  const per = [];
  for (const v of vils) {
    const n = Math.ceil(2 * Math.PI * R); let runs = 0, inRun = false, first = null;
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n, cx = Math.floor(v.cx + Math.cos(a) * R), cy = Math.floor(v.cy + Math.sin(a) * R);
      const on = (V.get(cy * W + cx) || 0) >= 8;
      if (i === 0) first = on;
      if (on && !inRun) runs++;
      inRun = on;
    }
    if (first && inRun && runs > 1) runs--;   // 원을 한 바퀴 돌아 처음 덩어리와 이어지면 하나
    per.push(runs);
  }
  out.ring['r' + R] = { sum: per.reduce((a, b) => a + b, 0), mean: +(per.reduce((a, b) => a + b, 0) / Math.max(1, per.length)).toFixed(2), max: Math.max(...per) };
}
// ⑥ 교역로끼리 겹침
{
  const cnt = new Map(); let sum = 0;
  for (const R of routes) {
    const own = new Set(), P = R.pts;
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], n = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let s2 = 0; s2 <= n; s2++) own.add(Math.floor((a.y + (b.y - a.y) * s2 / n) / 32) * W + Math.floor((a.x + (b.x - a.x) * s2 / n) / 32));
    }
    sum += own.size; for (const k of own) cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  let shared = 0; for (const c of cnt.values()) if (c >= 2) shared++;
  out.routeOverlap = { cellSum: sum, union: cnt.size, ratio: +(sum / Math.max(1, cnt.size)).toFixed(2), sharedShare: +(shared / Math.max(1, cnt.size)).toFixed(3) };
}
console.log(JSON.stringify(out));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
