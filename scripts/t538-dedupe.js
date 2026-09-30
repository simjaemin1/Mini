#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T538 ③ 마이그레이션 · 재민 손)
// =============================================================================
// T538 ③ — `village_buildings` 의 **중복 행**(같은 village_id · type · cx · cy 가 두 줄 이상)을 지운다. 가장 작은 id 하나만 남긴다.
//   8주 산 한반도 DB 사본 실측: 중복 2묶음 · 지울 행 2(마을 45 의 `dryfield` 두 셀) — 중복은 OOM 의 원인이 **아니다**(보고 T538 §0).
//   그래도 카드 ③: 중복이 있으면 지운다(세계를 줄이지 않는다 — 같은 셀의 같은 행이 둘일 뿐 · 부팅의 `_farmSet`·`_drySet` 은 이미 한 셀로 모은다 ·
//   달라지는 것은 행 수로 세는 `_dryN`/`_farmN` 뿐이다 — 중복만큼 줄어 **셀 수와 같아진다**).
//
//   ★존이 멎은 뒤에만 돌린다(열린 DB 에 쓰지 않는다). **먼저 `.bak` 를 만든다**(`VACUUM INTO` — WAL 까지 한 파일로).
//   ★멱등 — 두 번 돌리면 두 번째는 0행.
//
//   node scripts/t538-dedupe.js <db>            ← 지운다(.bak 먼저)
//   node scripts/t538-dedupe.js <db> --dry      ← 세기만
// =============================================================================
'use strict';
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const DB = process.argv[2]; const DRY = process.argv.includes('--dry');
if (!DB || !fs.existsSync(DB)) { console.log('쓰는 법: node scripts/t538-dedupe.js <db> [--dry]'); process.exit(2); }
const d = new DatabaseSync(DB);
const groups = d.prepare('SELECT village_id, type, cx, cy, COUNT(*) c, MIN(id) keep, GROUP_CONCAT(id) ids FROM village_buildings GROUP BY 1,2,3,4 HAVING c > 1').all();
const n = groups.reduce((s, g) => s + g.c - 1, 0);
console.log(`[T538 ③] ${DB} — 중복 ${groups.length}묶음 · 지울 행 ${n}` + (groups.length ? ' — ' + groups.slice(0, 10).map((g) => `${g.village_id}/${g.type}/${g.cx},${g.cy}×${g.c}(남김 ${g.keep} · [${g.ids}])`).join(' · ') : ''));
if (!n || DRY) { process.exit(0); }
const bak = DB + '.bak-t538-' + new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
d.exec(`VACUUM INTO '${bak.replace(/'/g, "''")}'`);
console.log(`  .bak → ${bak} (${(fs.statSync(bak).size / 1048576).toFixed(1)}MB)`);
d.exec('BEGIN');
try {
  const r = d.prepare('DELETE FROM village_buildings WHERE id NOT IN (SELECT MIN(id) FROM village_buildings GROUP BY village_id, type, cx, cy)').run();
  d.exec('COMMIT');
  console.log(`  지웠다 ${r.changes}행`);
} catch (e) { try { d.exec('ROLLBACK'); } catch (_) {} console.error('  실패(되돌림):', e.message); process.exit(1); }
const left = d.prepare('SELECT COUNT(*) n FROM (SELECT 1 FROM village_buildings GROUP BY village_id, type, cx, cy HAVING COUNT(*) > 1)').get().n;
console.log(`  남은 중복 ${left}묶음`);
process.exit(left ? 1 : 0);
