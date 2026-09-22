#!/usr/bin/env node
// === scripts/plan-zone-villages.js — 존의 마을 후보를 **정본 칸에 적는다** [T351] =====
//
// ★왜 [T351 2026-09-22]
//   T343 이 후보를 묻는 문을 하나로 모았다(`terrain.siteCandidates`): 정본 json 의 `villages` 칸에
//   사람이 찍어 둔 것이 있으면 그것(한반도 51), 없으면 **같은 꼴을 내는 절차 배치기**
//   (`chunk.generateVillagesForZone` · 존 하나당 `villageSeed` 결정론).
//   닛폰은 둘째 갈래로 돌고 있었다 — 돌긴 도는데 **세계가 어디에도 안 적혀 있다.**
//   그러면 ⓐ 정본을 읽는 도구(다리 계획기·감사·지도)와 ⓑ 서버가 각자 다시 계산해야 하고,
//   ⓒ 절차 배치기가 읽는 것(지형·광맥)이 바뀌면 **마을이 조용히 움직인다** —
//   실제로 T348 이 광맥 55개를 놓자 후지로의 타입이 `plain → mining` 으로 바뀌었다.
//   ⇒ 그 출력을 **한 번 정본에 적어** 못 박는다. 값은 계획기가 내고, 이 스크립트는 **옮겨 적기만** 한다.
//
// ★이 스크립트가 **안 하는 것**
//   · 고르지 않는다 — 후보 전수를 그대로 적는다. 한반도 정본도 **후보 51**이고(시딩은 50),
//     솎는 일은 부팅 때 `pickSeedVillages` 가 한다. 여기서 솎으면 그 판정을 두 곳에서 하게 된다.
//   · 이름을 짓지 않는다 — `makeVillageName`(존 biome 음절표)이 낸 이름 그대로다.
//   · 좌표를 고치지 않는다. 새 수 0 · 새 표 0 — **정본의 빈 칸을 채우는 일**이다.
//
// ★정본 파일의 **꼴을 그대로 돌려준다**(T348 의 교훈) — 레포 정본은 한 줄(minify)이라
//   `indent` 로 다시 쓰면 한 줄 바뀐 판이 십수만 줄 diff 가 되어 아무도 못 읽는다.
//
// 실행:
//   node scripts/plan-zone-villages.js --zone nippon            # 계산만(표)
//   node scripts/plan-zone-villages.js --zone nippon --apply    # server/hanbando-terrain.json 에 쓴다
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', '');
const APPLY = has('--apply');
if (!ZID) { console.error('--zone <존id> 를 달아라(예: --zone nippon)'); process.exit(1); }

const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
// ★정본 지형 파일은 **하나**다 — 안이 존 여럿 맵이다(`hanbando` 는 파일 이름일 뿐 · T348 §0-ⓑ-2).
const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');

const Z = ZONES[ZID];
if (!Z) { console.error(`존 ${ZID} 가 zone-config 에 없다`); process.exit(1); }

const doc = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const d = doc[ZID];
if (!d) { console.error(`정본에 존 ${ZID} 절이 없다`); process.exit(1); }

const already = Array.isArray(d.villages) ? d.villages.length : 0;
const cand = terrain.siteCandidates(ZID) || [];

console.log(`=== 마을 후보 → 정본 · ${ZID} (${Z.displayName}) ===`);
console.log(`정본 villages 칸: ${already}곳 · 후보 문(siteCandidates): ${cand.length}곳`);
if (Z.isOcean) { console.log('바다 존 — 후보 0곳. 적을 것이 없다.'); process.exit(0); }
if (already > 0) {
  // ★이미 적혀 있으면 `siteCandidates` 는 **그 칸을 그대로** 돌려준다(첫 갈래).
  //   그래서 여기서 다시 쓰는 것은 항등이고, 덮어쓸 이유가 없다 — 사람이 찍은 것을 지울 위험만 있다.
  console.log('이미 정본에 적혀 있다 — 손대지 않는다(후보 문이 그 칸을 그대로 돌려준다).');
  process.exit(0);
}
if (!cand.length) { console.log('후보 0곳 — 적을 것이 없다.'); process.exit(0); }

const byType = {};
for (const v of cand) byType[v.type] = (byType[v.type] || 0) + 1;
console.log(`타입: ${Object.entries(byType).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
for (const v of cand) console.log(`  ${String(v.name).padEnd(10)} (${Math.round(v.x)},${Math.round(v.y)}) ${v.type}`);

// ★꼴은 한반도 정본과 **같은 네 칸**이다: name · x · y · type. 다른 칸을 더하지 않는다.
const rows = cand.map((v) => ({ name: v.name, x: v.x, y: v.y, type: v.type }));

if (!APPLY) { console.log('\n★계산만 — 쓰려면 --apply'); process.exit(0); }

d.villages = rows;
const _wasMinified = !fs.readFileSync(GAME, 'utf8').includes('\n');
fs.writeFileSync(GAME, _wasMinified ? JSON.stringify(doc) : JSON.stringify(doc, null, 1));
console.log(`\n★적용됨 → ${GAME} (${ZID}.villages ${rows.length}곳 · 꼴 ${_wasMinified ? '한 줄 보존' : 'indent 1'})`);
console.log('  다음: node scripts/test-nippon-boot.js (정본을 읽어도 세계가 같은지)');
