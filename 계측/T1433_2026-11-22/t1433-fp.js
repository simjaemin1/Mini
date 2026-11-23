#!/usr/bin/env node
// (@regress 없음 — T1433 세계 지문 자 · DB 사본 둘을 읽기만 · 제품 0)
// === 계측/T1433_2026-11-22/t1433-fp.js — 두 판 DB 의 세계가 같은가(영토는 꼴과 무관하게 되읽어 견준다) ===
//   node 계측/T1433_2026-11-22/t1433-fp.js <A.db> <B.db> [--out 지문.json]
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
  o.roads = tab('roads', 'SELECT zone, cell_key, v, d FROM roads ORDER BY zone, cell_key');
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
const res = { a: path.basename(FA), b: path.basename(FB), same: diff === 0, diff, row, terrRows: [A.terrRows, B.terrRows], terrCells: [A.terrCells, B.terrCells], vilTerrDiff: vd.slice(0, 10), vilEconDiff: ed.slice(0, 10) };
console.log(JSON.stringify(res, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ res, A, B }, null, 1));
process.exit(diff ? 1 : 0);
