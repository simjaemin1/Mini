#!/usr/bin/env node
// (@regress 없음 — T1448 세계 지문 자 · DB 사본 둘을 읽기만 · 제품 0 · T1433 `t1433-fp.js` 사본 + 길을 꼴과 무관하게 되읽는 줄)
// === 계측/T1448_2026-11-23/t1448-fp.js — 두 판 DB 의 세계가 같은가(영토 · 길은 꼴과 무관하게 되읽어 견준다) ===
//   node 계측/T1448_2026-11-23/t1448-fp.js <A.db> <B.db> [--out 지문.json] [--day <길 날>]
//   ★[T1448] 길 — 칸 행(`roads`) + 구역 행(`road_chunks` · `server/road-grid.js` 덩이)을 칸 키로 되읽어 칸 전수(키 · 값 · 날) ·
//     그 판 마지막 날(`--day` · 없으면 칸들의 가장 늦은 날)의 등급 칸 · 다진 길 모음(등급 2) · 코스 지도(4칸 격자 최대 등급) — 종전 식 그대로(T1 8 · T2 28 · 0.995)
//     ★날은 `d | 0` 로 접어 견준다 — 끔 칸 행은 날을 `d | 0` 로 적는다(`zone-local-db upsertRoadCell` 종전 글자 · 판 자의 길 날 70억은 Int32 를 넘어 접힌다) ·
//       켬 구역 행은 날 그대로라 같은 접기를 해야 같은 칸이 같은 글자가 된다(라이브 날 124만은 접어도 그대로 · 한 판 안 날 차는 접어도 같다)
//   칸마다 sha1 앞 12자리:
//     영토 — 마을마다 되읽은 칸(칸 행 + 묶음 행 · id 차례 · 두 마을이 가진 칸은 먼저 든 마을 — 부팅과 같은 규칙)의 모인 것(정렬) · 넣은 차례 · 부팅 반지름(가장 먼 점 거리)
//     마을 행(이름 · 자리 · 인구 · 날 · econ 전부) · 마을 건물 행(영토 행 뺀 전부 — 종류 · 칸 · 층 · data · id 차례) · 길 · 지은 것 · 벤 그루 장부 · 연대기 · 사건 · 의뢰 · 교역로 · 도적 · 메타
//   행 id 는 견주지 않는다(영토 행 수가 달라 뒤 행 id 가 밀린다 — 차례만 본다).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const TR = require(path.join(__dirname, '..', '..', 'server', 'terr-rows.js'));
const RG = require(path.join(__dirname, '..', '..', 'server', 'road-grid.js'));
const ZONES = (() => { const l = console.log; console.log = () => {}; try { return require(path.join(__dirname, '..', '..', 'server', 'zone-config.js')).ZONES; } finally { console.log = l; } })();
const DAYOPT = (() => { const i = process.argv.indexOf('--day'); return i >= 0 ? +process.argv[i + 1] : null; })();
function roadCells(d, tabs) {   // 존마다 칸 [k, v, d] (키 오름) — 두 꼴을 칸으로(같은 칸이 둘 다 있으면 칸 행 — 부팅과 같은 줄)
  const by = {};
  const put = (z, k, v, dd) => { (by[z] || (by[z] = new Map())).set(k, [k, v, dd | 0]); };   // 날 = d | 0(위 머리말)
  if (tabs.has('road_chunks')) for (const r of d.prepare('SELECT zone, ck, data FROM road_chunks ORDER BY zone, ck').all()) {
    const Z = ZONES[r.zone], W = Math.ceil(Z.zoneWidth / 32), GW = Math.ceil(W / RG.C), gy = (r.ck / GW) | 0, gx = r.ck - gy * GW, p = RG.decodeChunk(r.data);
    for (let j = 0; j < p.n; j++) { const i = p.li[j]; put(r.zone, ((gy << RG.SHIFT) + (i >> RG.SHIFT)) * W + (gx << RG.SHIFT) + (i & (RG.C - 1)), p.v[j], p.d[j]); }
  }
  if (tabs.has('roads')) for (const r of d.prepare('SELECT zone, cell_key, v, d FROM roads').all()) put(r.zone, r.cell_key, r.v, r.d);
  const out = {};
  for (const [z, m] of Object.entries(by)) out[z] = [...m.values()].sort((a, b) => a[0] - b[0]);
  return out;
}
function roadFp(cellsBy) {   // 칸 전수 · 등급 칸 · 다진 길 · 코스 지도(마지막 날 감쇠로)
  const o = {};
  for (const [z, a] of Object.entries(cellsBy)) {
    const W = Math.ceil(ZONES[z].zoneWidth / 32), gw = Math.ceil(W / 4);
    const t = DAYOPT != null ? DAYOPT : a.reduce((m, x) => Math.max(m, x[2]), 0);
    const grade = [], paved = [], coarse = new Map();
    for (const [k, v0, dd] of a) {
      const v = t > dd ? v0 * Math.pow(0.995, t - dd) : v0, lv = v >= 28 ? 2 : (v >= 8 ? 1 : 0);
      if (!lv) continue;
      grade.push(k + ':' + lv); if (lv === 2) paved.push(k);
      const ck = (((k / W) | 0) >> 2) * gw + ((k % W) >> 2); if ((coarse.get(ck) || 0) < lv) coarse.set(ck, lv);
    }
    o[z] = { n: a.length, day: t, cells: H(a.map((x) => x.join(','))), graded: grade.length, grades: H(grade), paved: paved.length, pavedH: H(paved), coarse: coarse.size, coarseH: H([...coarse].sort((x, y) => x[0] - y[0]).map((x) => x.join(':'))) };
  }
  return o;
}
const [FA, FB] = process.argv.slice(2);
const OUT = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : null; })();
const H = (a) => crypto.createHash('sha1').update(Array.isArray(a) ? a.join('\n') : String(a)).digest('hex').slice(0, 12);
function fp(f) {
  const d = new DatabaseSync(f, { readOnly: true });
  const tabs = new Set(d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
  const all = (s) => d.prepare(s).all();
  const o = { terr: {}, terrSum: null };
  const vils = all('SELECT id, name, cx, cy, population, day, econ_state FROM villages ORDER BY id');
  o.villages = H(vils.map((v) => [v.id, v.name, v.cx, v.cy, v.population, v.day, H(v.econ_state || '')].join('|')));
  o.econ = Object.fromEntries(vils.map((v) => [v.name, H(v.econ_state || '')]));
  const st = d.prepare("SELECT id, type, cx, cy, data FROM village_buildings WHERE village_id = ? AND type IN ('terr','terrseq') ORDER BY id");
  const far = d.prepare('SELECT cx, cy FROM village_buildings WHERE village_id = ?');
  const V = [];
  for (const v of vils) {
    const cur = new Map();
    for (const r of st.iterate(v.id)) {
      if (r.type === 'terr') { const k = r.cx + ',' + r.cy; if (!cur.has(k)) cur.set(k, [r.id, 0]); continue; }
      TR.decode(r.data, (op, x, y, i) => { const k = x + ',' + y; if (op === TR.ADD) { if (!cur.has(k)) cur.set(k, [r.id, i]); } else if (op === TR.DEL) cur.delete(k); });
    }
    let m = 4; for (const r of far.iterate(v.id)) { const h = Math.hypot(r.cx - v.cx, r.cy - v.cy); if (h > m) m = h; }
    V.push({ v, cur, rad: +m.toFixed(6) });
  }
  const best = new Map();
  for (const x of V) for (const [k, p] of x.cur) { const b = best.get(k); if (!b) best.set(k, [p[0], p[1], x.v.id, 1]); else { b[3]++; if (p[0] < b[0] || (p[0] === b[0] && p[1] < b[1])) { b[0] = p[0]; b[1] = p[1]; b[2] = x.v.id; } } }
  for (const [k, b] of best) if (b[3] > 1) for (const x of V) if (x.v.id !== b[2]) x.cur.delete(k);
  let cells = 0;
  for (const x of V) { const K = [...x.cur.keys()]; cells += K.length; o.terr[x.v.name] = { n: K.length, set: H([...K].sort()), ord: H(K), rad: x.rad }; }
  o.terrCells = cells;
  o.terrSum = H(Object.entries(o.terr).map(([k, t]) => [k, t.n, t.set, t.ord, t.rad].join('|')));
  o.terrRows = d.prepare("SELECT COUNT(*) n FROM village_buildings WHERE type IN ('terr','terrseq')").get().n;
  o.vbOther = H(all("SELECT village_id, type, cx, cy, floors, data FROM village_buildings WHERE type NOT IN ('terr','terrseq') ORDER BY id").map((r) => [r.village_id, r.type, r.cx, r.cy, r.floors, r.data].join('|')));
  const tab = (t, sql) => { if (!tabs.has(t)) return null; return H(all(sql).map((r) => Object.values(r).join('|'))); };
  const rc = roadCells(d, tabs); o.road = roadFp(rc);   // ★[T1448] 꼴과 무관하게
  o.roads = H(Object.entries(o.road).map(([z, r]) => [z, r.n, r.cells, r.grades, r.pavedH, r.coarseH].join('|')));
  o.roadRows = { cell: tabs.has('roads') ? d.prepare('SELECT COUNT(*) n FROM roads').get().n : 0, chunk: tabs.has('road_chunks') ? d.prepare('SELECT COUNT(*) n FROM road_chunks').get().n : 0 };
  o.buildings = tab('buildings', 'SELECT type, owner_id, owner_name, x, y, data, village_id FROM buildings ORDER BY id');
  o.harvested = tab('harvested_seeds', 'SELECT seed_key, harvested_day FROM harvested_seeds ORDER BY seed_key');
  o.chronicle = tab('village_chronicle', 'SELECT zone, vid, day, type, item, mag FROM village_chronicle ORDER BY id');
  o.events = tab('village_events', 'SELECT zone, vid, day, type, item, mag, meta FROM village_events ORDER BY id');
  o.requests = tab('village_requests', 'SELECT * FROM village_requests ORDER BY zone, vid, item');
  o.routes = tab('trade_routes', 'SELECT * FROM trade_routes ORDER BY 1, 2');
  o.bandit = tab('bandit_state', 'SELECT zone, data, day FROM bandit_state ORDER BY zone');
  o.meta = tab('world_meta', 'SELECT zone, data, day FROM world_meta ORDER BY zone');
  o.mobs = tab('mobs', 'SELECT * FROM mobs ORDER BY id');
  d.close();
  return o;
}
const A = fp(FA), B = fp(FB);
const keys = ['terrSum', 'terrCells', 'villages', 'vbOther', 'roads', 'buildings', 'harvested', 'chronicle', 'events', 'requests', 'routes', 'bandit', 'meta', 'mobs'];
const row = {}; let diff = 0;
for (const k of keys) { const same = A[k] === B[k]; if (!same) diff++; row[k] = same ? 'same' : `${A[k]} ≠ ${B[k]}`; }
const vd = Object.keys(A.terr).filter((n) => JSON.stringify(A.terr[n]) !== JSON.stringify(B.terr[n]));
const ed = Object.keys(A.econ).filter((n) => A.econ[n] !== B.econ[n]);
const res = { a: path.basename(FA), b: path.basename(FB), same: diff === 0, diff, row, terrRows: [A.terrRows, B.terrRows], terrCells: [A.terrCells, B.terrCells], vilTerrDiff: vd.slice(0, 10), vilEconDiff: ed.slice(0, 10),
  road: [A.road, B.road], roadRows: [A.roadRows, B.roadRows] };
console.log(JSON.stringify(res, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ res, A, B }, null, 1));
process.exit(diff ? 1 : 0);
