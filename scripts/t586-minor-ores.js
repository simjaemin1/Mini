#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T586 ③ 닛폰 자잘 광맥 **적재기** · 기본은 계산만)
// =============================================================================
// 수를 인자로 받아 닛폰 자잘 광맥의 **자리 · 크기 · 이름**만 정본에 넣는다 — **광종 칸(mineral · pk)은 비운다**
//   (T574 추신4 · 세션1 이 `bakeOre` 로 굽는다 · `scripts/t580-bake-nippon.js` 가 광종이 비었으면 "바뀜"으로 보고 pk 까지 매긴다).
//   자리는 계획기 그대로 부른다(사본 0): `plan-ore-clusters.js --zone nippon --minor-only --tier <수>,7,0.30`
//     — 11차 자잘 규칙(반경 4~10셀 흩뿌림 · 소외 편중 · 구역 균등 할당 · 자잘끼리 22셀) · 계획기는 `--out` 계획만 내고(정본 무변)
//     이 적재기가 그 `added` 에서 `name · center · radius · minor` 만 옮긴다.
//   ★정본에 자잘이 이미 있으면 멈춘다(겹쳐 넣지 않는다 — 빼고 다시 놓는 것은 사람이 정한다).
// 쓰는 법: node scripts/t586-minor-ores.js --count 504 [--apply] [--plan <계획.json>]
//   (재민이 수를 고르면 PM 이 그 인자로 --apply 한 줄)
// =============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = parseInt(arg('--count', ''), 10);
if (!(N > 0)) { console.error('--count <수> 가 있어야 한다(재민 값)'); process.exit(2); }
const APPLY = process.argv.includes('--apply');
const raw = fs.readFileSync(GAME, 'utf8');
const doc = JSON.parse(raw);
const have = (doc.nippon.ores || []).filter((o) => o.minor).length;
if (have) { console.error(`닛폰 정본에 자잘 광맥이 이미 ${have}개 있다 — 겹쳐 넣지 않는다(빼고 다시 놓을지는 사람이 정한다)`); process.exit(3); }
const PLAN = arg('--plan', path.join(os.tmpdir(), `t586-minor-plan-${process.pid}.json`));
const QUOTA = path.join(os.tmpdir(), `t586-minor-quota-${process.pid}.json`);   // 한반도 `ore-minor-quota.json` 은 안 덮는다
execFileSync(process.execPath, [path.join(__dirname, 'plan-ore-clusters.js'), '--zone', 'nippon', '--minor-only', '--tier', `${N},7,0.30`, '--out', PLAN, '--quota-out', QUOTA],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 28 });
try { fs.unlinkSync(QUOTA); } catch (e) {}
const P = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
const add = (P.added || []).filter((o) => o.minor).map((o) => ({ name: o.name, center: o.center, radius: o.radius, minor: 1 }));
const rs = add.map((o) => Math.round(o.radius / 32)).sort((a, b) => a - b);
console.log(`닛폰 자잘 광맥 계획 — 요청 ${N} · 놓인 ${add.length} · 반경 ${rs[0]}~${rs[rs.length - 1]}셀(중앙 ${rs[rs.length >> 1]}) · 이름 ${add.length ? add[0].name + ' … ' + add[add.length - 1].name : '-'} · 광종 칸 비움`);
if (!APPLY) { console.log(`계산만 — 정본 무변(계획: ${PLAN}) · 적재는 --apply`); process.exit(0); }
const fresh = JSON.parse(fs.readFileSync(GAME, 'utf8'));   // 새로 읽어 닛폰 광맥 칸만(다른 존 바이트 동일)
fresh.nippon.ores = fresh.nippon.ores.concat(add);
fs.writeFileSync(GAME, raw.includes('\n') ? JSON.stringify(fresh, null, 1) : JSON.stringify(fresh));
console.log(`기록: 닛폰 광맥 ${doc.nippon.ores.length} → ${fresh.nippon.ores.length}(자잘 ${add.length} · 광종 칸 비움)`);
