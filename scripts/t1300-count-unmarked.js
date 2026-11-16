#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1300 · 맥 세션 손 판 — 라이브 DB 스냅샷을 읽기만 한다)
// === scripts/t1300-count-unmarked.js — 라이브 DB 스냅샷의 캐러밴 몸 칸(메타 행 `t1034.b`)에서 축 표지 없는 몸을 센다 (T1300 · T1289 회부 4 · 2026-11-13) ==========
//
// ★왜 — T1289 가 저장 몸 칸에 축 표지 `ax`('e' econ 날 시계 · 'w' 벽시계)를 붙였다(켬만). 그 앞(T1258 ~ T1288 · 켬)이 쓴 저장은 표지가 없고
//   머묾 끝 `lg` · 귀환 보간 시작 `T.t0` 이 econ 날 시계 값이다. T1300 은 되살림이 그 칸을 값 크기로 가린다(경계 = econ 날 시계 최대값 (D + 2) × 하루 ·
//   `server/villages.js` `_t1289In`). 이 자는 스냅샷 안에 그런 몸이 몇인지 센다 — 클라우드 판엔 스냅샷이 없어(맥 `~/Mini/_db/`) 맥 세션이 돌린다.
//
// ★읽기만: 원본 파일은 열지 않는다 — DB 파일(과 곁 `-wal` · `-shm`)을 임시 폴더에 베껴 그 사본을 연다(WAL 되감기가 원본을 건드리지 않게) · 쓰기 문 0 · 끝나면 사본을 지운다.
//   표에 내는 것은 수뿐이다(몸 id · 마을 이름 · 좌표 · 짐은 안 낸다).
//
// 쓰는 법: node scripts/t1300-count-unmarked.js <스냅샷.db> [<스냅샷.db> …] [--json 결과.json]
//   예(맥): node scripts/t1300-count-unmarked.js ~/Mini/_db/<한반도 11-03 스냅샷>.db ~/Mini/_db/<닛폰 11-12 스냅샷>.db --json 계측/T1300_<날짜>/스냅샷_표지.json
//
// 칸마다 가리기(표지 없는 몸만):
//   econ  = 값 ≤ (메타 앵커 날 + 2) × 하루(`anchor.day` · `anchor.dayMs` — T1300 규칙 · 되살린 판의 world.day 는 같은 날 메타만 되살리므로 앵커 날과 같다)
//   wall  = 그보다 크다(Date.now() · `econDayToMs` 경계 — 10^12 ms 넘음)
//   T1289 거리 규칙(저장 순간 `at` 에 더 가까우면 벽시계)과 갈리는 칸 수도 같이 센다(0 이 아니면 규칙이 바뀐 몫이 실제 저장에 닿는다).
const fs = require('fs'), path = require('path'), os = require('os');
const A = process.argv.slice(2);
const jsonAt = A.indexOf('--json'), JSON_OUT = jsonAt >= 0 ? A[jsonAt + 1] : null;
const FILES = A.filter((x, i) => !(jsonAt >= 0 && (i === jsonAt || i === jsonAt + 1)));
if (!FILES.length) { console.error('쓰는 법: node scripts/t1300-count-unmarked.js <스냅샷.db> [...] [--json 결과.json]'); process.exit(2); }
let DatabaseSync; try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { console.error('node:sqlite 가 없다(Node 22.5+ 필요)'); process.exit(2); }

const FIELDS = [['lg', (o) => o.lg], ['da', (o) => o.da], ['aa', (o) => o.aa], ['t0', (o) => (o.T ? o.T.t0 : null)]];
function scanMeta(zone, row) {
  const R = { zone, metaDay: row.day, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null, bodies: 0, marked: { e: 0, w: 0 }, unmarked: 0,
    unmarkedOldOn: 0, unmarkedWall: 0, unmarkedT1182: 0, fieldsEcon: { lg: 0, da: 0, aa: 0, t0: 0 }, fieldsWall: { lg: 0, da: 0, aa: 0, t0: 0 }, ruleSplit: 0, err: null };
  let M; try { M = JSON.parse(row.data); } catch (e) { R.err = '메타 JSON 깨짐'; return R; }
  const an = M.anchor || {}, dayMs = +an.dayMs || 0, D = an.day | 0;
  R.anchor = { day: D, dayMs, at: an.at ? new Date(an.at).toISOString() : null };
  const b = M.t1034 && M.t1034.b;
  if (!b) { R.why = '몸 칸 없음(`t1034` 없음 — 몸 없는 판 · T1034 끔 · 몸이 다 끝남)'; return R; }
  const eMax = (D + 2) * dayMs;
  for (const id of Object.keys(b)) {
    const o = b[id]; R.bodies++;
    if (o.ax) { R.marked[o.ax] = (R.marked[o.ax] | 0) + 1; continue; }
    R.unmarked++; if (o.act) R.unmarkedT1182++;
    let econ = 0;
    for (const [k, get] of FIELDS) {
      const v = get(o); if (!Number.isFinite(v)) continue;
      const f = v <= eMax ? 'e' : 'w', f89 = Math.abs(v - o.at) < Math.abs(v) ? 'w' : 'e';
      if (f === 'e') { econ++; R.fieldsEcon[k]++; } else R.fieldsWall[k]++;
      if (f !== f89) R.ruleSplit++;
    }
    if (econ) R.unmarkedOldOn++; else R.unmarkedWall++;
  }
  return R;
}
function scanFile(file) {
  const out = { file: path.basename(file), size: null, rows: [], err: null };
  if (!fs.existsSync(file)) { out.err = '파일 없음'; return out; }
  out.size = fs.statSync(file).size;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't1300-snap-'));
  try {
    const dst = path.join(tmp, 'snap.db');
    fs.copyFileSync(file, dst);
    for (const sfx of ['-wal', '-shm']) if (fs.existsSync(file + sfx)) fs.copyFileSync(file + sfx, dst + sfx);
    const db = new DatabaseSync(dst);
    try {
      const has = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'world_meta'").get();
      if (!has) { out.err = 'world_meta 표 없음(T728 앞 DB)'; return out; }
      for (const row of db.prepare('SELECT zone, data, day, updated_at FROM world_meta').all()) out.rows.push(scanMeta(row.zone, row));
    } finally { db.close(); }
  } catch (e) { out.err = String(e && e.message || e).slice(0, 200); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
  return out;
}
const res = FILES.map(scanFile);
console.log('| 스냅샷 | 존 | 메타 날 | 몸 | 표지 e · w | 표지 없음 | └ 옛 켬 저장(econ 칸 있음) | └ 칸 다 벽시계 | └ T1182 몸 | econ 칸(lg · da · aa · t0) | T1289 규칙과 갈린 칸 |');
console.log('|---|---|---:|---:|---|---:|---:|---:|---:|---|---:|');
let tot = { bodies: 0, unmarked: 0, oldOn: 0, split: 0 };
for (const f of res) {
  if (f.err) { console.log(`| ${f.file} | — | — | — | — | — | — | — | — | ${f.err} | — |`); continue; }
  for (const r of f.rows) {
    tot.bodies += r.bodies; tot.unmarked += r.unmarked; tot.oldOn += r.unmarkedOldOn; tot.split += r.ruleSplit;
    console.log(`| ${f.file} | ${r.zone} | ${r.metaDay} | ${r.bodies} | ${r.marked.e | 0} · ${r.marked.w | 0} | ${r.unmarked} | ${r.unmarkedOldOn} | ${r.unmarkedWall} | ${r.unmarkedT1182} | ${r.fieldsEcon.lg} · ${r.fieldsEcon.da} · ${r.fieldsEcon.aa} · ${r.fieldsEcon.t0} | ${r.ruleSplit} |${r.err ? ' ' + r.err : ''}${r.why ? ' ' + r.why : ''}`);
  }
}
console.log(`\nT1300-UNMARKED 몸 ${tot.bodies} · 표지 없음 ${tot.unmarked} · 옛 켬 저장 몸 ${tot.oldOn} · T1289 규칙과 갈린 칸 ${tot.split}`);
if (JSON_OUT) { fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true }); fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ files: res, total: tot }, null, 1)); }
