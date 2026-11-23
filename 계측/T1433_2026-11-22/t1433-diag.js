#!/usr/bin/env node
// (@regress 없음 — T1433 진단 자 · DB 사본을 읽기만 · 제품 0)
// === 계측/T1433_2026-11-22/t1433-diag.js — 영토 행이 왜 느는가(T1433 §1 ⓐ ⓑ ⓒ) + 다른 표 셋이 왜 안 주는가 ===
//   node 계측/T1433_2026-11-22/t1433-diag.js <snaps 폴더> [--out 표.json] [--vil dEnd]
//   ⓐ 영토 칸 하나 = 행 하나인가 — 영토 행 · (마을, 칸) 쌍 · 칸 · 같은 칸 두 행 · 두 마을이 가진 칸 · 진 쪽(죽은) 행 · 산 칸 · 빈 마을의 행
//   ⓑ 영토가 넓어지나 — 산 칸 ÷ 인구 · 인구 상한 식(T538 · T579 ⌈인구 ÷ 6⌉ × 600 + 1,500) 대비 · 목표 식(max(땅 × 25, ⌈주거 ÷ 6⌉ × 600 + 1,500)) 대비 · 상한을 넘은 마을(인구가 줄어도 안 준다)
//   다른 표 — roads(그날 값 v·0.995^(오늘−d) < 1 = 접근하면 지워질 행) · harvested_seeds(벤 날) · buildings(종류)
//   묶음 행(`terrseq`)이 있는 DB 면 칸을 되읽는다(`server/terr-rows.js`).
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.join(__dirname, '..', '..');
const TR = require(path.join(ROOT, 'server', 'terr-rows.js'));
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const DIR = A[0], OUT = opt('--out', null), VIL = opt('--vil', 'dEnd');
const snaps = JSON.parse(fs.readFileSync(path.join(DIR, 'snaps.json'), 'utf8'));
const cap = (pop) => Math.ceil(pop / 6) * 600 + 1500;
const res = [];
let vilTable = null;
for (const s of snaps) {
  const f = path.join(DIR, s.name + '.db');
  const db = new DatabaseSync(f, { readOnly: true });
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  const g = (sql, ...a) => db.prepare(sql).get(...a);
  const tabs = q("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name);
  const rows = {}; for (const t of tabs) rows[t] = g(`SELECT COUNT(*) n FROM "${t}"`).n;
  const byType = Object.fromEntries(q('SELECT type, COUNT(*) n FROM village_buildings GROUP BY type ORDER BY n DESC').map((r) => [r.type, r.n]));
  const pg = g('PRAGMA page_count').page_count, fr = g('PRAGMA freelist_count').freelist_count, ps = g('PRAGMA page_size').page_size;
  // 영토 — 마을마다 행 차례로 되읽기(칸 행 · 묶음 행) · 칸마다 든 자리(행 id · 행 안 차례)
  const vils = q('SELECT id, name, cx, cy, population, econ_state FROM villages ORDER BY id');
  const st = db.prepare("SELECT id, type, cx, cy, data FROM village_buildings WHERE village_id = ? AND type IN ('terr','terrseq') ORDER BY id");
  const V = [];
  let terrRows = 0, seqRows = 0, dupRows = 0;
  for (const v of vils) {
    const cur = new Map(); let n = 0, dup = 0;
    for (const r of st.iterate(v.id)) {
      n++;
      if (r.type === 'terr') { const k = r.cx + ',' + r.cy; if (cur.has(k)) dup++; else cur.set(k, [r.id, 0]); continue; }
      seqRows++;
      TR.decode(r.data, (op, x, y, i) => { const k = x + ',' + y; if (op === TR.ADD) { if (cur.has(k)) dup++; else cur.set(k, [r.id, i]); } else if (op === TR.DEL) cur.delete(k); });
    }
    terrRows += n; dupRows += dup;
    let land = null, housing = null, npcs = null;
    try { const e = JSON.parse(v.econ_state || 'null'); if (e) { land = e.land && e.land.size; housing = e.housing; npcs = (e.npcs || []).length; } } catch (e) {}
    V.push({ id: v.id, name: v.name, pop: v.population, npcs, land, housing, rows: n, dup, cur });
  }
  // 두 마을 이상이 가진 칸 — 먼저 든 마을(행 id · 행 안 차례)
  const best = new Map();
  for (const v of V) for (const [k, p] of v.cur) { const b = best.get(k); if (!b) best.set(k, [p[0], p[1], v.id, 1]); else { b[3]++; if (p[0] < b[0] || (p[0] === b[0] && p[1] < b[1])) { b[0] = p[0]; b[1] = p[1]; b[2] = v.id; } } }
  let contested = 0, dead = 0;
  for (const [k, b] of best) { if (b[3] < 2) continue; contested++; for (const v of V) if (v.id !== b[2] && v.cur.has(k)) { v.dead = (v.dead || 0) + 1; dead++; } }
  const pairs = V.reduce((a, v) => a + v.cur.size, 0);
  const live = pairs - dead;
  const pop = V.reduce((a, v) => a + (v.pop || 0), 0);
  const empty = V.filter((v) => !(v.pop > 0));
  let atCap = 0, overCap = 0, underCap = 0, capSum = 0, tgtSum = 0, overBy = 0;
  const per = V.map((v) => {
    const L = v.cur.size - (v.dead || 0), c = cap(v.pop || 0);
    const tgt = v.land != null ? Math.max(Math.round(v.land * 25), Math.ceil((v.housing || 0) / 6) * 600 + 1500) : null;
    capSum += c; if (tgt != null) tgtSum += tgt;
    if (L > c) { overCap++; overBy += L - c; } else if (L >= c - 60) atCap++; else underCap++;
    return { id: v.id, name: v.name, pop: v.pop, rows: v.rows, cells: v.cur.size, dup: v.dup, dead: v.dead || 0, live: L, cap: c, target: tgt, perPop: v.pop ? +(L / v.pop).toFixed(1) : null };
  });
  // 다른 표
  let roads = null;
  if (tabs.includes('roads')) {
    const R = q('SELECT v, d FROM roads'); let md = -Infinity; for (const r of R) if (r.d > md) md = r.d;
    const o = { rows: R.length, dead: 0, g0: 0, g1: 0, g2: 0, never: 0 };
    for (const r of R) { const v = r.v * Math.pow(0.995, md - r.d); if (v < 1) o.dead++; else if (v < 8) o.g0++; else if (v < 28) o.g1++; else o.g2++; }
    roads = o;
  }
  const seeds = tabs.includes('harvested_seeds') ? g('SELECT COUNT(*) n, MIN(harvested_day) a, MAX(harvested_day) b, SUM(harvested_day < 0) neg FROM harvested_seeds') : null;
  const bld = tabs.includes('buildings') ? Object.fromEntries(q("SELECT (CASE WHEN owner_id LIKE 'npc_%' THEN 'npc_' WHEN owner_id LIKE 'village_%' THEN 'village_' ELSE 'other' END) o, COUNT(*) n FROM buildings GROUP BY o").map((r) => [r.o, r.n])) : null;
  const bldType = tabs.includes('buildings') ? Object.fromEntries(q('SELECT type, COUNT(*) n FROM buildings GROUP BY type ORDER BY n DESC LIMIT 6').map((r) => [r.type, r.n])) : null;
  db.close();
  const o = { name: s.name, day: s.day, bytes: fs.statSync(f).size, usedMB: +((pg - fr) * ps / 1048576).toFixed(1), rows, byType,
    terr: { rows: terrRows, seqRows, pairs, dupRows, contested, dead, live, emptyVils: empty.length, emptyRows: empty.reduce((a, v) => a + v.rows, 0) },
    pop, livePerPop: +(live / pop).toFixed(1), capSum, tgtSum, liveOverCap: +(live / capSum).toFixed(3), atCap, overCap, overBy, underCap, roads, seeds, bld, bldType };
  res.push(o);
  if (s.name === VIL) vilTable = per;
  console.log(JSON.stringify({ name: o.name, day: o.day, MB: o.usedMB, vb: rows.village_buildings, terr: o.terr, pop, livePerPop: o.livePerPop, capSum, liveOverCap: o.liveOverCap, atCap, overCap, overBy, underCap, roads, seeds: seeds && seeds.n, bld }));
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ snaps: res, vil: vilTable }, null, 1));
