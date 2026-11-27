#!/usr/bin/env node
'use strict';
// (@regress 없음 — 계측 · 하네스 공용 자 · 제품 무변)
// === scripts/t1453-seed.js — 존 DB 에 라이브 크기 길을 심는다(T1453 · 서버가 실제로 45만 칸을 들고 welcome · 청크 몫을 짓게) ==========
//   길 칸 = `t1446-synth.js synthRoads`(라이브 크기 456,479칸 · 등급 1 · 2 — T1446 이 welcome 에 싣던 그 목록)를 존 DB `roads` 표에 넣는다.
//   표는 제품 모듈(`server/zone-local-db.js` — 아이 프로세스 · DB_PATH · ZONE_ID 로)이 짓고 쓴다(표 글자 사본 0 · `upsertRoadCell` 그대로).
//   값: 등급 1 = v 15 · 등급 2 = v 60(문턱 8 · 28 에서 멀다 — 시험 중 발걸음 몇 번으로 등급이 안 바뀐다) · d = 오늘(존 부팅이 오늘로 죈다 — `Roads.init`).
// 쓰는 법: node scripts/t1453-seed.js <db 경로> [존=hanbando]   (모듈: require('./t1453-seed').seed(db, zone) → { n, ms })
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function seedFlat(db, zone, flat, W) {   // flat [cx, cy, lv, …](존 로컬 칸) → 그 존 DB roads 표(W = 존 칸 폭 — 열쇠 cy·W + cx · Roads.init 과 같은 식)
  const tmp = path.join(require('os').tmpdir(), `t1453-seed-${process.pid}-${Date.now()}.json`);
  require('fs').writeFileSync(tmp, JSON.stringify({ flat, W }));
  const code = `const D = require(${JSON.stringify(path.join(ROOT, 'server', 'zone-local-db.js'))}); const J = JSON.parse(require('fs').readFileSync(${JSON.stringify(tmp)}, 'utf8'));
    const t0 = Date.now(); D.db.exec('BEGIN'); let n = 0;
    for (let i = 0; i < J.flat.length; i += 3) { D.upsertRoadCell(${JSON.stringify(zone)}, J.flat[i + 1] * J.W + J.flat[i], J.flat[i + 2] === 2 ? 60 : 15, 2147483647); n++; }
    D.db.exec('COMMIT'); console.log(JSON.stringify({ n, ms: Date.now() - t0 }));`;
  const r = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, DB_PATH: db, ZONE_ID: zone }, encoding: 'utf8', maxBuffer: 1 << 24 });
  try { require('fs').unlinkSync(tmp); } catch (e) {}
  const line = (r.stdout || '').trim().split('\n').pop();
  try { return JSON.parse(line); } catch (e) { return { n: 0, err: (r.stderr || '').slice(-400) }; }
}
function seed(db, zone) {   // 한반도 라이브 크기 길(t1446-synth)
  const SY = require('./t1446-synth');
  return seedFlat(db, zone || 'hanbando', SY.synthRoads({}).flat, SY.villageCenters().W);
}
module.exports = { seed, seedFlat };
if (require.main === module) console.log(JSON.stringify(seed(process.argv[2], process.argv[3])));
