#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1448 이관 도구 · 존 DB 사본에만 쓴다 · 실서버 0 · 판정 0 · 새 수 0)
// === scripts/t1448-road-migrate.js — 길 행 꼴 옮기기(칸 행 `roads` ↔ 구역 행 `road_chunks`) [T1448 · S2 · 2026-11-23] ====================
//
//   node scripts/t1448-road-migrate.js --count <존 DB>                          ← 읽기만: 존마다 칸 행 · 구역 행 · 되읽은 칸 · 등급 칸 · 덩이 바이트 · 쪽 수
//   node scripts/t1448-road-migrate.js --forward <존 DB> --out <새 파일>         ← 사본에 앞으로(켬 부팅 이관과 같은 일 — 존마다 칸 행 → 구역 행 · 칸 행 지움)
//   node scripts/t1448-road-migrate.js --back <존 DB> --out <새 파일>            ← 사본에 뒤로(구역 행 → 칸 행 · 구역 행 지움) — 손잡이 이전 코드로 되돌릴 때
//   공통: --zone <존 이름>(기본 = DB 에 든 존 전부) · --cells-w <칸 폭> --cells-h <칸 높이>(기본 = zone-config 의 그 존 넓이 ÷ 32 — 존 부팅 `Roads.init` 과 같은 식)
//
//   ★원본은 절대 안 쓴다(`--out` 은 없는 새 파일 · t721-apply · t1433-terr-migrate 규약). 쓰기는 **한 거래**(도중에 죽으면 사본이 통째로 앞 그대로).
//   ★켬 부팅 이관(roads.js `T1448_ROAD_GRID=1` · `_t1448Boot`)이 정본이다 — `--forward` 는 같은 규칙(구역마다 칸 자리 오름 · `road-grid.js encodeChunk`)을
//     존 없이 돌린다(하네스가 둘이 같은 행을 내는지 대조). 다른 점 하나: 부팅은 미래 날(d > 오늘)을 오늘로 접어 옮긴다 — 이 도구는 저장된 날 그대로(그런 칸이 있으면 `--count` 가 센다).
//   ★`--back` = 끈 부팅의 되돌림(`_t1448BackBoot`)과 같은 일 — 칸 키 오름으로 칸 행을 넣는다(종전 부팅이 읽는 차례 = 표의 열쇠 차례 · 넣은 차례 무관).
'use strict';
const fs = require('fs');
const path = require('path');
const RG = require(path.join(__dirname, '..', 'server', 'road-grid'));

const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const MODE = A.includes('--count') ? 'count' : A.includes('--forward') ? 'forward' : A.includes('--back') ? 'back' : null;
const SRC = opt('--count') || opt('--forward') || opt('--back');
if (!MODE || !SRC || !fs.existsSync(SRC)) { console.error('쓰는 법: --count <DB> | --forward <DB> --out <새 파일> | --back <DB> --out <새 파일> [--zone z] [--cells-w W --cells-h H]'); process.exit(2); }

function sizeOf(zone) {
  const w = parseInt(opt('--cells-w', ''), 10), h = parseInt(opt('--cells-h', ''), 10);
  if (w > 0 && h > 0) return { W: w, H: h };
  const Z = require(path.join(__dirname, '..', 'server', 'zone-config')).ZONES[zone];
  if (!Z) throw new Error(`존 ${zone} 이 zone-config 에 없다 — --cells-w · --cells-h 를 준다`);
  return { W: Math.ceil(Z.zoneWidth / 32), H: Math.ceil(Z.zoneHeight / 32) };
}
const hasTab = (db, t) => !!db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
function zones(db) {
  const z = new Set();
  if (hasTab(db, 'roads')) for (const r of db.prepare('SELECT DISTINCT zone FROM roads').all()) z.add(r.zone);
  if (hasTab(db, 'road_chunks')) for (const r of db.prepare('SELECT DISTINCT zone FROM road_chunks').all()) z.add(r.zone);
  const only = opt('--zone', ''); return only ? [only] : [...z].sort();
}
const SH = RG.SHIFT, MK = RG.C - 1;   // 구역 크기 = road-grid 정본(16)
const keyOf = (W, ck, i) => { const GW = Math.ceil(W / RG.C), gy = (ck / GW) | 0, gx = ck - gy * GW; return ((gy << SH) + (i >> SH)) * W + (gx << SH) + (i & MK); };
const ckOf = (W, k) => { const GW = Math.ceil(W / RG.C), x = k % W, y = (k / W) | 0; return (y >> SH) * GW + (x >> SH); };
const liOf = (W, k) => { const x = k % W, y = (k / W) | 0; return ((y & MK) << SH) | (x & MK); };
// 칸 행 → 구역 묶음(구역 키 오름 · 칸 자리 오름) — 켬 부팅 `S.cells.packChunk` 와 같은 꼴
function packRows(W, rows) {
  const by = new Map();
  for (const r of rows) { const k = r.cell_key | 0, ck = ckOf(W, k); let a = by.get(ck); if (!a) by.set(ck, a = []); a.push([liOf(W, k), r.v, r.d | 0]); }
  const out = [];
  for (const ck of [...by.keys()].sort((a, b) => a - b)) {
    const a = by.get(ck).sort((x, y) => x[0] - y[0]);
    out.push({ ck, n: a.length, data: RG.encodeChunk({ n: a.length, li: a.map((x) => x[0]), v: a.map((x) => x[1]), d: a.map((x) => x[2]) }) });
  }
  return out;
}
function count(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  const out = { file: path.basename(file), bytes: fs.statSync(file).size, zones: {} };
  const pg = db.prepare('PRAGMA page_count').get().page_count, fr = db.prepare('PRAGMA freelist_count').get().freelist_count, ps = db.prepare('PRAGMA page_size').get().page_size;
  out.pages = pg; out.free = fr; out.usedMB = +((pg - fr) * ps / 1048576).toFixed(1);
  for (const z of zones(db)) {
    const { W, H } = sizeOf(z);
    const cellRows = hasTab(db, 'roads') ? db.prepare('SELECT COUNT(*) AS n FROM roads WHERE zone = ?').get(z).n : 0;
    let chunkRows = 0, chunkCells = 0, blob = 0, outside = 0, dMax = null;
    if (hasTab(db, 'road_chunks')) for (const r of db.prepare('SELECT ck, n, data FROM road_chunks WHERE zone = ?').iterate(z)) { chunkRows++; chunkCells += r.n; blob += r.data.length; }
    if (cellRows) for (const r of db.prepare('SELECT cell_key, d FROM roads WHERE zone = ?').iterate(z)) { const k = r.cell_key | 0; if (k < 0 || k >= W * H) outside++; if (dMax === null || r.d > dMax) dMax = r.d; }
    out.zones[z] = { cellsW: W, cellsH: H, cellRows, chunkRows, chunkCells, chunkBlobKB: +(blob / 1024).toFixed(1), outside, dMax };   // outside = 존 칸 밖 키(있으면 옮기지 말 것) · dMax = 칸 행의 가장 늦은 날
  }
  db.close();
  return out;
}
function copyTo(src, dst) {
  if (!dst || fs.existsSync(dst) || path.resolve(dst) === path.resolve(src)) { console.error('--out <없는 새 파일> 이 있어야 한다(원본에는 쓰지 않는다)'); process.exit(2); }
  fs.copyFileSync(src, dst); try { fs.copyFileSync(src + '-wal', dst + '-wal'); } catch (e) {}
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dst);
  db.exec('PRAGMA journal_mode = WAL');
  return db;
}
function tx(db, fn) { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (x) {} throw e; } }
function ensureChunks(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS road_chunks (
    zone  TEXT    NOT NULL,
    ck    INTEGER NOT NULL,
    n     INTEGER NOT NULL,
    data  BLOB    NOT NULL,
    PRIMARY KEY (zone, ck)
  );`);
}
function forward(db) {
  ensureChunks(db);
  const R = {};
  tx(db, () => {
    for (const z of zones(db)) {
      const { W } = sizeOf(z);
      const rows = hasTab(db, 'roads') ? db.prepare('SELECT cell_key, v, d FROM roads WHERE zone = ? ORDER BY cell_key').all(z) : [];
      if (!rows.length) { R[z] = { cellRows: 0, chunkRows: 0 }; continue; }
      //   구역 행이 이미 있으면(켰다 끄고 칸 행이 다시 쌓인 DB) 그 칸 위에 칸 행이 덧쓴다(부팅과 같은 줄)
      const have = new Map();
      for (const r of db.prepare('SELECT ck, data FROM road_chunks WHERE zone = ?').all(z)) { const p = RG.decodeChunk(r.data); for (let j = 0; j < p.n; j++) have.set(keyOf(W, r.ck, p.li[j]), { cell_key: keyOf(W, r.ck, p.li[j]), v: p.v[j], d: p.d[j] }); }
      for (const r of rows) have.set(r.cell_key | 0, r);
      const P = packRows(W, [...have.values()]);
      db.prepare('DELETE FROM road_chunks WHERE zone = ?').run(z);
      const up = db.prepare('INSERT INTO road_chunks (zone, ck, n, data) VALUES (?, ?, ?, ?)');
      for (const p of P) up.run(z, p.ck, p.n, p.data);
      db.prepare('DELETE FROM roads WHERE zone = ?').run(z);
      R[z] = { cellRows: rows.length, chunkRows: P.length };
    }
  });
  return R;
}
function back(db) {
  const R = {};
  if (!hasTab(db, 'road_chunks')) return R;
  tx(db, () => {
    for (const z of zones(db)) {
      const { W } = sizeOf(z);
      const have = new Set(hasTab(db, 'roads') ? db.prepare('SELECT cell_key FROM roads WHERE zone = ?').all(z).map((r) => r.cell_key | 0) : []);   // 칸 행이 이미 있으면 그쪽이 새 값(끈 부팅과 같은 줄)
      const cells = [];
      for (const r of db.prepare('SELECT ck, data FROM road_chunks WHERE zone = ?').all(z)) { const p = RG.decodeChunk(r.data); for (let j = 0; j < p.n; j++) { const k = keyOf(W, r.ck, p.li[j]); if (!have.has(k)) cells.push([k, p.v[j], p.d[j]]); } }
      cells.sort((a, b) => a[0] - b[0]);
      const up = db.prepare('INSERT INTO roads (zone, cell_key, v, d) VALUES (?, ?, ?, ?) ON CONFLICT(zone, cell_key) DO UPDATE SET v = excluded.v, d = excluded.d');
      for (const [k, v, d] of cells) up.run(z, k, v, d | 0);
      const ch = db.prepare('DELETE FROM road_chunks WHERE zone = ?').run(z).changes;
      R[z] = { chunkRows: ch, cellRows: cells.length, kept: have.size };
    }
  });
  return R;
}

if (MODE === 'count') { console.log(JSON.stringify(count(SRC), null, 1)); process.exit(0); }
const db = copyTo(SRC, opt('--out'));
const t0 = Date.now();
const R = MODE === 'forward' ? forward(db) : back(db);
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
console.log(JSON.stringify({ mode: MODE, src: path.basename(SRC), out: path.basename(opt('--out')), ms: Date.now() - t0, zones: R }));
