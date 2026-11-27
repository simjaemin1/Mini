#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · 지도 고침 문 · 제품 무변) [T1471 ③ 2026-11-25 · S5]
// === scripts/t1471-map-gate.js — 지도(지형 json · terrain.js)를 고치는 커밋이 **이미 선 세계**의 마을 땅을 산 속에 묻나 ==========
//   T1296(11-13)은 닛폰 원 고개 둘을 골짜기로 바꿨고, 라이브 사키농촌 영토 1,131칸 · 건물 행 102 가 그 밑에서 도로 산이 됐다(보고/T1471).
//   새 세계 판(시딩 · 400날)은 이걸 못 본다 — 새 세계는 새 지도 위에 처음부터 선다. 라이브 사본에 대고 옛 지도 · 새 지도를 둘 다 재야 보인다.
//
//   node scripts/t1471-map-gate.js --db <존 DB 사본> --zone <존> [--old <옛 지도 rev · 기본 origin/main>] [--new <새 지도 rev · 기본 = 이 작업 나무>] [--out <json>]
//   낸다: 마을마다 { 새 지도로 산인데 옛 지도로 산이 아니던 칸 — 영토 · 건물 행 종류별 } · 합 · 옛 지도로도 이미 산이던 칸(따로) · 출구 코드 1 = 새로 묻힌 칸이 있다.
//   판정 = 서버 `terrain.isRockCellLocal(존, 셀 가운데 px)`(마을 지형 정본 `state.ta.isRock` 이 지나가는 그 술어 · 사본 0).
//   ⚠물(해안 · 강) 고침은 이 자가 못 잰다 — 물 칸 술어는 존이 떠야 선다. 물을 바꾸는 고침은 `T1471_LAND_FIT=1` 로 사본을 띄워 [T1471] 줄을 본다(scripts/t1471-live-fit.js).
'use strict';
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DB = arg('db'), ZONE = arg('zone'), OLD = arg('old', 'origin/main'), NEW = arg('new', ''), OUT = arg('out', '');
if (!DB || !ZONE) { console.log('쓰는 법: --db <존 DB 사본> --zone <존> [--old <rev>] [--new <rev>] [--out <json>]'); process.exit(2); }
const tmp = fs.mkdtempSync('/tmp/t1471gate-');
function terrainAt(rev, tag) {
  if (!rev) return require(path.join(ROOT, 'server', 'terrain.js'));
  const d = path.join(tmp, tag); fs.mkdirSync(d);
  execFileSync('bash', ['-c', `git -C "${ROOT}" archive "${rev}" server | tar -x -C "${d}"`]);
  return require(path.join(d, 'server', 'terrain.js'));
}
const TO = terrainAt(OLD, 'old'), TN = terrainAt(NEW, 'new');
const rockO = (x, y) => { try { return !!TO.isRockCellLocal(ZONE, x * 32 + 16, y * 32 + 16); } catch (e) { return false; } };
const rockN = (x, y) => { try { return !!TN.isRockCellLocal(ZONE, x * 32 + 16, y * 32 + 16); } catch (e) { return false; } };
const TerrRows = require(path.join(ROOT, 'server', 'terr-rows.js'));
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(DB, { readOnly: true });
const vils = db.prepare('SELECT id, name, cx, cy FROM villages ORDER BY id').all();
const res = []; let newTerr = 0, newRows = 0, oldTerr = 0, oldRows = 0;
for (const v of vils) {
  const T = new Set();
  for (const r of db.prepare("SELECT id, type, cx, cy, floors, data FROM village_buildings WHERE village_id = ? AND type IN ('terr','terrseq') ORDER BY id").iterate(v.id)) TerrRows.replay([r], T);
  const o = { id: v.id, name: v.name, terr: T.size, newTerr: 0, oldTerr: 0, newRows: {}, oldRows: {} };
  for (const k of T) { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1); if (!rockN(x, y)) continue; if (rockO(x, y)) o.oldTerr++; else o.newTerr++; }
  for (const r of db.prepare("SELECT type, cx, cy FROM village_buildings WHERE village_id = ? AND type NOT IN ('terr','terrseq')").iterate(v.id)) {
    if (!rockN(r.cx, r.cy)) continue;
    const m = rockO(r.cx, r.cy) ? o.oldRows : o.newRows; m[r.type] = (m[r.type] || 0) + 1;
  }
  const sum = (m) => Object.values(m).reduce((s, n) => s + n, 0);
  newTerr += o.newTerr; oldTerr += o.oldTerr; newRows += sum(o.newRows); oldRows += sum(o.oldRows);
  if (o.newTerr || o.oldTerr || sum(o.newRows) || sum(o.oldRows)) res.push(o);
}
console.log(`[T1471 지도 문] ${ZONE} · 사본 ${path.basename(DB)} · 옛 지도 ${OLD} → 새 지도 ${NEW || '작업 나무'} · 마을 ${vils.length}`);
console.log(`  새로 산에 묻힌 칸 — 영토 ${newTerr} · 건물 행 ${newRows}   (옛 지도로도 이미 산 — 영토 ${oldTerr} · 건물 행 ${oldRows})`);
for (const o of res) console.log(`  ${o.name}(#${o.id}) 영토 ${o.terr} 가운데 새로 산 ${o.newTerr}${o.oldTerr ? ` · 이미 산 ${o.oldTerr}` : ''} · 건물 새로 ${JSON.stringify(o.newRows)}${Object.keys(o.oldRows).length ? ` · 이미 ${JSON.stringify(o.oldRows)}` : ''}`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ zone: ZONE, db: DB, old: OLD, new: NEW || 'worktree', newTerr, newRows, oldTerr, oldRows, vils: res }, null, 1));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
process.exit(newTerr || newRows ? 1 : 0);
