#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1433 이관 도구 · 존 DB 사본에만 쓴다 · 실서버 0 · 판정 0 · 새 수 0)
// === scripts/t1433-terr-migrate.js — 영토 행 꼴 옮기기(칸 행 `terr` ↔ 묶음 행 `terrseq`) [T1433 · S2 · 2026-11-22] ====================
//
//   node scripts/t1433-terr-migrate.js --count <존 DB>                    ← 읽기만: 표별 행 · 영토 꼴별 행 · 되읽은 영토 칸 · 이관하면 남을 행 · 쪽 수
//   node scripts/t1433-terr-migrate.js --forward <존 DB> --out <새 파일>   ← 사본에 앞으로(부팅 이관과 같은 일 — 겹친 칸 가르기 T569 → 마을마다 묶음 행 하나)
//   node scripts/t1433-terr-migrate.js --back <존 DB> --out <새 파일>      ← 사본에 뒤로(묶음 행 → 칸 행 · 마을 사이 차례까지 그대로) — 손잡이 이전 코드로 되돌릴 때
//
//   ★원본은 절대 안 쓴다(`--out` 은 없는 새 파일 · t721-apply 규약). 쓰기는 **한 거래**(도중에 죽으면 사본이 통째로 앞 그대로).
//   ★부팅 이관(villages.js `T1433_TERR_SEQ` 켬)이 정본이다 — 이 도구의 `--forward` 는 같은 규칙을 존 없이 돌린다(하네스가 둘이 같은 행을 내는지 대조).
//   ★`--back` 은 칸 행을 **처음 든 차례(행 id · 행 안 차례)대로 전 마을을 한 줄로 세워** 다시 넣는다 — 새 id 의 차례 = 종전 차례
//     ⇒ 부팅 Set 차례 · 겹친 칸의 "먼저 가진 마을"(MIN(id)) 이 같다. 증거 점(`@` — 이관이 지운 죽은 행의 가장 먼 점)은 칸이 아니라 되살리지 않는다
//     (부팅 반지름만 그 점을 봤다 · 기본 판 T740 은 반지름을 곁 칸에서 되살린다 — 보고 T1433 §2).
'use strict';
const fs = require('fs');
const path = require('path');
const TR = require(path.join(__dirname, '..', 'server', 'terr-rows'));

const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };

// ── 되읽기: 마을마다 지금 칸(차례) + 칸마다 든 자리(행 id · 행 안 차례) — 부팅 `eachVillageCell` 과 같은 규칙 ──
function readTerr(db) {
  const vils = db.prepare('SELECT id, cx, cy FROM villages ORDER BY id').all();
  const st = db.prepare("SELECT id, type, cx, cy, floors, data FROM village_buildings WHERE village_id = ? AND type IN ('terr','terrseq') ORDER BY id");
  const out = [];
  for (const v of vils) {
    const cur = new Map();   // 열쇠 → [행 id, 행 안 차례] (Map 차례 = Set 차례 — 지웠다 다시 들면 끝으로)
    let rows = 0, seq = 0, far = null, fd = -1;
    for (const r of st.iterate(v.id)) {
      rows++;
      const dx = r.cx - v.cx, dy = r.cy - v.cy, d = dx * dx + dy * dy; if (d > fd) { fd = d; far = [r.cx, r.cy]; }   // 종전 반지름이 본 점
      if (r.type === 'terr') { const k = r.cx + ',' + r.cy; if (!cur.has(k)) cur.set(k, [r.id, 0]); continue; }
      seq++;
      TR.decode(r.data, (op, x, y, i) => { const k = x + ',' + y; if (op === TR.ADD) { if (!cur.has(k)) cur.set(k, [r.id, i]); } else if (op === TR.DEL) cur.delete(k); });
    }
    out.push({ id: v.id, cx: v.cx, cy: v.cy, cur, rows, seq, far, fd });
  }
  return out;
}
// ── T569 — 두 마을 이상이 가진 칸은 먼저 든(행 id · 행 안 차례가 가장 작은) 마을에만 남긴다(`T569_OVERLAP=0` 이면 안 가른다 · 존과 같은 손잡이) ──
function resolve(V) {
  if (process.env.T569_OVERLAP === '0') return 0;
  const best = new Map();
  for (const v of V) for (const [k, p] of v.cur) { const b = best.get(k); if (!b) best.set(k, [p[0], p[1], v.id, 1]); else { b[3]++; if (p[0] < b[0] || (p[0] === b[0] && p[1] < b[1])) { b[0] = p[0]; b[1] = p[1]; b[2] = v.id; } } }
  let n = 0;
  for (const [k, b] of best) { if (b[3] < 2) continue; for (const v of V) if (v.id !== b[2] && v.cur.delete(k)) n++; }
  return n;
}
function count(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  const tabs = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  const rows = {}; for (const t of tabs) { try { rows[t] = db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n; } catch (e) {} }
  const byType = db.prepare("SELECT type, COUNT(*) n FROM village_buildings WHERE type IN ('terr','terrseq') GROUP BY type").all();
  const V = readTerr(db);
  const live0 = V.reduce((s, v) => s + v.cur.size, 0);
  const cut = resolve(V);
  const live = V.reduce((s, v) => s + v.cur.size, 0);
  const pg = db.prepare('PRAGMA page_count').get().page_count, fr = db.prepare('PRAGMA freelist_count').get().freelist_count, ps = db.prepare('PRAGMA page_size').get().page_size;
  db.close();
  const terrRows = V.reduce((s, v) => s + v.rows, 0);
  const after = V.filter((v) => v.cur.size || v.rows).length;
  return { file: path.basename(file), bytes: fs.statSync(file).size, pages: pg, free: fr, pageSize: ps, usedMB: +((pg - fr) * ps / 1048576).toFixed(1),
    rows, terr: Object.fromEntries(byType.map((r) => [r.type, r.n])), terrRows, cellsRead: live0, contestCut: cut, cellsLive: live, rowsAfterForward: after,
    villagesBuildingsAfter: (rows.village_buildings || 0) - terrRows + after };
}
function copyTo(src, out) {
  if (!out || fs.existsSync(out) || path.resolve(out) === path.resolve(src)) { console.error('--out <없는 새 파일> 이 있어야 한다(원본에는 쓰지 않는다)'); process.exit(2); }
  fs.copyFileSync(src, out); try { fs.copyFileSync(src + '-wal', out + '-wal'); } catch (e) {}
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(out);
  db.exec('PRAGMA journal_mode = WAL');
  return db;
}
function tx(db, fn) { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (x) {} throw e; } }
// ── 앞으로: 부팅 이관과 같은 일(되읽기 → T569 → 마을마다 지금 차례 그대로 묶음 행 하나 · 죽은 행이 더 멀면 증거) ──
function forward(db) {
  const V = readTerr(db);
  const cut = resolve(V);
  const del = db.prepare("DELETE FROM village_buildings WHERE village_id = ? AND type IN ('terr','terrseq')");
  const ins = db.prepare("INSERT INTO village_buildings (village_id, type, cx, cy, floors, data, created_at) VALUES (?, 'terrseq', ?, ?, ?, ?, ?)");
  let vils = 0, before = 0, cells = 0, wit = 0;
  tx(db, () => {
    for (const v of V) {
      if (!v.rows) continue;
      const ops = TR.opsOfKeys(v.cur.keys());
      let ld = -1; for (const o of ops) { const d = (o[1] - v.cx) ** 2 + (o[2] - v.cy) ** 2; if (d > ld) ld = d; }
      if (v.far && v.fd > ld) { ops.push([TR.WIT, v.far[0], v.far[1]]); wit++; }
      del.run(v.id);
      if (ops.length) { const w = TR.farthest(ops.filter((o) => o[0] !== TR.DEL).map((o) => [o[1], o[2]]), v.cx, v.cy); ins.run(v.id, w[0], w[1], v.cur.size, TR.encode(ops, v.cx, v.cy), Date.now()); }
      vils++; before += v.rows; cells += v.cur.size;
    }
  });
  return { vils, before, after: vils, cells, contestCut: cut, wit };
}
// ── 뒤로: 묶음 행 → 칸 행(전 마을 칸을 든 자리 차례 한 줄로 · 새 id 차례 = 종전 차례) ──
function back(db) {
  const V = readTerr(db);
  if (!V.some((v) => v.seq)) return { vils: 0, before: 0, after: 0, note: '묶음 행 없음 — 할 일 없다' };
  //   묶음 행이 하나라도 있으면 **영토 행이 있는 마을 전부**를 다시 쓴다 — 안 쓴 마을의 옛 칸 행 id 가 새 행보다 작아져 겹친 칸의 "먼저 가진 마을"이 바뀌지 않게
  const all = [];
  for (const v of V) if (v.rows) for (const [k, p] of v.cur) all.push([p[0], p[1], v.id, k]);
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const del = db.prepare("DELETE FROM village_buildings WHERE village_id = ? AND type IN ('terr','terrseq')");
  const ins = db.prepare("INSERT INTO village_buildings (village_id, type, cx, cy, floors, data, created_at) VALUES (?, 'terr', ?, ?, 0, NULL, ?)");
  let vils = 0, before = 0;
  const t = Date.now();
  tx(db, () => {
    for (const v of V) if (v.rows) { del.run(v.id); vils++; before += v.rows; }
    for (const c of all) { const ci = c[3].indexOf(','); ins.run(c[2], +c[3].slice(0, ci), +c[3].slice(ci + 1), t); }
  });
  return { vils, before, after: all.length };
}

if (require.main === module) {
  const say = (o) => console.log(JSON.stringify(o));
  if (A[0] === '--count') say(count(A[1]));
  else if (A[0] === '--forward' || A[0] === '--back') {
    const src = A[1], out = opt('--out', null);
    const t0 = Date.now();
    const db = copyTo(src, out);
    const r = A[0] === '--forward' ? forward(db) : back(db);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
    r.ms = Date.now() - t0; r.mode = A[0].slice(2); r.out = out;
    say(r);
  } else { console.error('쓰는 법: --count <db> | --forward <db> --out <새 파일> | --back <db> --out <새 파일>'); process.exit(2); }
}
module.exports = { readTerr, resolve, count, forward, back };
