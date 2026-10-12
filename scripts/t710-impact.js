#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T710 지형 마이그레이션 도구 ③ 영향 표 · 판정 0 · 새 수 0 · **읽기만**)
// === scripts/t710-impact.js — 차분(`t710-diff.js`)의 바뀐 셀 위에 **무엇이 있나**를 존 DB 사본에서 센다 ==========
//   실서버 접속 0 — 재민이 준 DB 사본(존 로컬 DB · 선택: central DB)만 `readonly` 로 연다.
//   영향 칸(갈래): 막힘 = 통행→막힘(뭍→바다 · 뭍→강호수 · 바위 생김) · 다리 빠짐 · 개울 생김 · 광맥 빠짐/바뀜 · 숲 빠짐 · 물→뭍(새 뭍 — 그 위 것은 없지만 영토 · 길 판단에 쓴다)
//   센 것(표가 있는 것만 — 옛 DB 는 표가 모자랄 수 있다):
//     마을 셀(village_buildings: 영토 · 집 · 집터 · 곳간 · 회관 · 쉼터 · 마당 · 광장 · 논밭 · 텃밭 · 도랑) · 마을 가운데(villages)
//     지은 것(buildings: 바닥 · 벽 · 상자 · 움집터 — 임자별) · 사유지(claims 사각 → 셀) · 다리 공사(village_bridges)
//     길(roads 칸 · 등급) · 교역로(trade_routes 정점이 지나는 칸) · 캔 칸(mined_cells) · 벤 나무(harvested_seeds — 청크 단위) · 짐승(mobs)
//     도적 소굴 · 은거지(bandit_state) · [--central] 사람 몸(players last_x/last_y · 그 존)
//   쓰는 법: node scripts/t710-impact.js <차분.json> --db <존 DB 사본> [--central <central DB 사본>] [--out <표.json>]
'use strict';
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const DIFF = JSON.parse(fs.readFileSync(A[0], 'utf8'));
const DBP = opt('--db', null), CEN = opt('--central', null), OUT = opt('--out', null);
if (!DBP) { console.error('쓰는 법: <차분.json> --db <존 DB 사본> [--central <central DB>] [--out <표.json>]'); process.exit(2); }
const Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
const W = DIFF.W, H = DIFF.H, ZONE = DIFF.zone, SZ = 32, CHUNK = 1024;
const dec = (b64) => new Uint32Array(Buffer.from(b64 || '', 'base64').buffer.slice(0));
const SET = {}; for (const [k, v] of Object.entries(DIFF.cells)) SET[k] = new Set(dec(v));
for (const k of ['통행→막힘', '다리 빠짐', '다리가 뭍 위로']) if (!SET[k]) SET[k] = new Set();
const blocked = new Set([...SET['통행→막힘']]);
const KINDS = ['통행→막힘', '뭍→바다', '뭍→강호수', '다리 빠짐', '다리가 뭍 위로', '개울 생김', '광맥 빠짐', '광맥 바뀜', '숲 빠짐', '물→뭍'];
const hit = (i) => KINDS.filter((k) => SET[k] && SET[k].has(i));
const cellOfPx = (x, y) => { const cx = Math.floor(x / SZ), cy = Math.floor(y / SZ); return (cx < 0 || cy < 0 || cx >= W || cy >= H) ? -1 : cy * W + cx; };
const db = new Database(DBP, { readonly: true, fileMustExist: true });
const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const out = { diff: { zone: ZONE, old: DIFF.old, new: DIFF.new }, db: path.basename(DBP), tables: {}, rows: {} };
const tally = (obj, key, kinds) => { const o = obj[key] || (obj[key] = {}); for (const k of kinds) o[k] = (o[k] || 0) + 1; };
const vName = new Map();
if (has('villages')) for (const v of db.prepare('SELECT id, name, cx, cy, zone FROM villages WHERE zone = ?').all(ZONE)) vName.set(v.id, v);
// ① 마을 셀
if (has('village_buildings')) {
  const T = {}, perV = {};
  const it = db.prepare('SELECT village_id, type, cx, cy FROM village_buildings').iterate();
  for (const r of it) {
    if (!vName.has(r.village_id)) continue;
    if (r.cx < 0 || r.cy < 0 || r.cx >= W || r.cy >= H) continue;
    const k = hit(r.cy * W + r.cx); if (!k.length) continue;
    tally(T, r.type, k);
    const vn = vName.get(r.village_id).name; const pv = perV[vn] || (perV[vn] = {});
    tally(pv, r.type, k);
  }
  out.tables.village_buildings = T; out.rows.villageCells = perV;
}
// ② 마을 가운데
out.rows.villageCenter = [];
for (const v of vName.values()) { const k = hit(v.cy * W + v.cx); if (k.length) out.rows.villageCenter.push({ name: v.name, cx: v.cx, cy: v.cy, kinds: k }); }
// ②-ⓑ 마을 터가 옮겨지는 마을 — 그 마을이 가진 것 전부(옮김이면 그 위 것을 어떻게 할지가 먼저다)
out.rows.villageMoves = [];
for (const s of (DIFF.villageSites || [])) {
  const v = [...vName.values()].find((x) => x.name === s.name);
  const row = { name: s.name, what: s.what, siteFrom: s.from || null, siteTo: s.to || null, cells: s.cells || null, live: null };
  if (v && has('village_buildings')) {
    const cnt = {}; for (const r of db.prepare('SELECT type, COUNT(*) c FROM village_buildings WHERE village_id = ? GROUP BY type').all(v.id)) cnt[r.type] = r.c;
    let b = 0; if (has('buildings')) b = db.prepare("SELECT COUNT(*) c FROM buildings WHERE owner_id = ?").get('npc_simvil_' + v.id).c;
    let pop = null; try { const e = JSON.parse(db.prepare('SELECT econ_state FROM villages WHERE id = ?').get(v.id).econ_state); pop = (e.npcs || []).length; } catch (e) {}
    row.live = { center: [v.cx, v.cy], liveVsSite: s.from ? +Math.hypot(v.cx - s.from[0], v.cy - s.from[1]).toFixed(1) : null, pop, cells: cnt, builtPieces: b };
  }
  out.rows.villageMoves.push(row);
}
// ③ 지은 것(임자별)
if (has('buildings')) {
  const T = {}, perOwner = {};
  for (const r of db.prepare('SELECT type, owner_id, owner_name, x, y FROM buildings').iterate()) {
    const i = cellOfPx(r.x, r.y); if (i < 0) continue;
    const k = hit(i); if (!k.length) continue;
    tally(T, r.type, k);
    const who = /^npc_/.test(r.owner_id) ? `NPC ${r.owner_name}` : `${r.owner_id === 'public' ? '공용' : '사람'} ${r.owner_name}`;
    tally(perOwner, `${who} · ${r.type}`, k);
  }
  out.tables.buildings = T; out.rows.buildingsByOwner = perOwner;
}
// ④ 사유지(사각 → 셀)
if (has('claims')) {
  const rows = [];
  for (const c of db.prepare('SELECT * FROM claims').all()) {
    const x0 = Math.floor(c.x / SZ), y0 = Math.floor(c.y / SZ), x1 = Math.floor((c.x + c.w - 1) / SZ), y1 = Math.floor((c.y + c.h - 1) / SZ);
    let total = 0; const k = {};
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; total++; for (const kk of hit(y * W + x)) k[kk] = (k[kk] || 0) + 1; }
    if (Object.keys(k).length) rows.push({ id: c.id, owner: c.owner_name, kind: c.kind || null, cells: total, hit: k });
  }
  out.tables.claims = { total: db.prepare('SELECT COUNT(*) c FROM claims').get().c, hit: rows.length }; out.rows.claims = rows;
}
// ⑤ 다리 공사(T527 — 행이 있을 때만)
if (has('village_bridges')) out.tables.village_bridges = { total: db.prepare('SELECT COUNT(*) c FROM village_bridges WHERE zone = ?').get(ZONE).c };
// ⑥ 길 칸
if (has('roads')) {
  const T = {}; const lv = {};
  for (const r of db.prepare('SELECT cell_key, v FROM roads WHERE zone = ?').iterate(ZONE)) {
    const k = hit(r.cell_key); if (!k.length) continue;
    tally(T, '길 칸', k); const g = r.v >= 100 ? '다져짐(≥100)' : r.v >= 30 ? '오솔길(30~99)' : '자국(<30)'; tally(lv, g, k);
  }
  out.tables.roads = T; out.rows.roadLevels = lv;
}
// ⑦ 교역로(정점이 막힘 · 다리 빠짐 칸을 지나는 쌍)
if (has('trade_routes')) {
  let total = 0, cut = 0; const pairs = [];
  for (const r of db.prepare('SELECT pair, pts FROM trade_routes WHERE zone = ?').iterate(ZONE)) {
    total++; if (!r.pts) continue;
    let pts; try { pts = JSON.parse(r.pts); } catch (e) { continue; }
    let n = 0; for (const p of pts) { const i = cellOfPx(p.x, p.y); if (i >= 0 && (blocked.has(i) || SET['다리 빠짐'].has(i))) n++; }
    if (n) { cut++; const ids = String(r.pair).split('_').map(Number); pairs.push({ pair: ids.map((d) => (vName.get(d) || {}).name || d).join('↔'), cells: n }); }
  }
  out.tables.trade_routes = { total, cut }; out.rows.routesCut = pairs.sort((a, b) => b.cells - a.cells);
}
// ⑧ 캔 칸 · 벤 나무
if (has('mined_cells')) {
  const T = {};
  for (const r of db.prepare('SELECT cell_key FROM mined_cells').iterate()) { const [x, y] = String(r.cell_key).split('_').map(Number); if (!(x >= 0 && y >= 0 && x < W && y < H)) continue; const k = hit(y * W + x); if (k.length) tally(T, '캔 칸', k); }
  out.tables.mined_cells = T;
}
if (has('harvested_seeds')) {
  // 청크 단위 — 그 청크 안에 바뀐 칸이 하나라도 있으면 센다(씨앗 자리는 청크 안 셈이라 칸 단위로 못 짚는다)
  const chunkHit = new Map();
  const CW = Math.ceil(W * SZ / CHUNK);
  for (const k of ['통행→막힘', '숲 빠짐', '광맥 빠짐']) for (const i of SET[k]) { const cx = Math.floor((i % W) * SZ / CHUNK), cy = Math.floor(Math.floor(i / W) * SZ / CHUNK); const key = cy * CW + cx; const o = chunkHit.get(key) || new Set(); o.add(k); chunkHit.set(key, o); }
  const T = {};
  for (const r of db.prepare('SELECT seed_key FROM harvested_seeds').iterate()) { const [cx, cy] = String(r.seed_key).split('_').map(Number); const o = chunkHit.get(cy * CW + cx); if (o) tally(T, '벤 나무(그 청크)', [...o]); }
  out.tables.harvested_seeds = T;
}
// ⑨ 짐승
if (has('mobs')) { const T = {}; for (const r of db.prepare('SELECT type, x, y FROM mobs').iterate()) { const i = cellOfPx(r.x, r.y); if (i < 0) continue; const k = hit(i); if (k.length) tally(T, r.type, k); } out.tables.mobs = T; }
// ⑩ 도적 소굴 · 은거지
if (has('bandit_state')) {
  const r = db.prepare('SELECT data FROM bandit_state WHERE zone = ?').get(ZONE); const rows = [];
  if (r) { const d = JSON.parse(r.data);
    for (const x of d.dens || []) { const k = hit(x.cy * W + x.cx); rows.push({ what: `소굴#${x.id}`, cx: x.cx, cy: x.cy, kinds: k }); }
    for (const g of d.gangs || []) if (g.camp) { const k = hit(g.camp.cy * W + g.camp.cx); rows.push({ what: `은거지(도적단#${g.id})`, cx: g.camp.cx, cy: g.camp.cy, kinds: k }); } }
  out.rows.bandit = rows.filter((x) => x.kinds.length); out.tables.bandit = { total: rows.length, hit: out.rows.bandit.length };
}
// ⑪ 사람 몸(central)
if (CEN) {
  const c = new Database(CEN, { readonly: true, fileMustExist: true }); const rows = [];
  for (const p of c.prepare('SELECT player_id, name, last_zone, last_x, last_y FROM players WHERE last_zone = ?').iterate(ZONE)) { const i = cellOfPx(p.last_x, p.last_y); if (i < 0) continue; const k = hit(i); if (k.length) rows.push({ name: p.name, kinds: k }); }
  out.rows.players = rows; out.tables.players = { hit: rows.length };
} else out.tables.players = { note: 'central DB 사본 없음 — 사람 몸 위치는 central players(last_x · last_y)에 있다(--central)' };
// 출력
const fmt = (o) => Object.entries(o || {}).map(([k, v]) => `${k} ${v}`).join(' · ');
console.log(`\n[t710 영향] 존 ${ZONE} · DB ${out.db}`);
for (const [t, v] of Object.entries(out.tables)) {
  if (v && typeof v === 'object' && !('total' in v) && !('note' in v) && !('hit' in v)) { console.log(`* ${t}:`); for (const [k, kk] of Object.entries(v)) console.log(`    ${k}: ${fmt(kk)}`); }
  else console.log(`* ${t}: ${JSON.stringify(v)}`);
}
if (out.rows.villageCenter.length) console.log('* 마을 가운데가 바뀐 칸:', out.rows.villageCenter.map((v) => `${v.name}(${v.kinds.join('·')})`).join(' · '));
if (out.rows.villageMoves.length) for (const m of out.rows.villageMoves) console.log(`* 마을 터 ${m.what}: ${m.name} ${m.siteFrom ? `(${m.siteFrom})` : ''}${m.siteTo ? ` → (${m.siteTo})` : ''}${m.cells ? ` ${m.cells}셀` : ''}${m.live ? ` · 실서버 가운데 (${m.live.center}) · 정본 옛 자리와 ${m.live.liveVsSite}셀 · 인구 ${m.live.pop} · 셀 ${fmt(m.live.cells)} · 큰집 조각 ${m.live.builtPieces}` : ' · 실서버 DB 에 없음'}`);
if (out.rows.villageCells) { console.log('* 마을별(영향 셀):'); for (const [vn, o] of Object.entries(out.rows.villageCells)) console.log(`    ${vn}: ${Object.entries(o).map(([t, kk]) => `${t}[${fmt(kk)}]`).join(' · ')}`); }
if (out.rows.buildingsByOwner && Object.keys(out.rows.buildingsByOwner).length) { console.log('* 지은 것(임자별):'); for (const [w, kk] of Object.entries(out.rows.buildingsByOwner)) console.log(`    ${w}: ${fmt(kk)}`); }
if (out.rows.routesCut && out.rows.routesCut.length) console.log(`* 끊기는 교역로 ${out.rows.routesCut.length}쌍(위 10): ${out.rows.routesCut.slice(0, 10).map((r) => `${r.pair}(${r.cells})`).join(' · ')}`);
if (out.rows.bandit && out.rows.bandit.length) console.log('* 도적:', out.rows.bandit.map((b) => `${b.what}(${b.kinds.join('·')})`).join(' · '));
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(`\n→ ${OUT}`); }
