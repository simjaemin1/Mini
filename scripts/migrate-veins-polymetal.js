#!/usr/bin/env node
// === scripts/migrate-veins-polymetal.js — 광맥 마이그레이션 (한 번에) ===
//
// ★[재민 확정 2026-08-01 "그렇게 일단 쭉 구현해봐"] 세 가지를 한 번의 지도 수정으로:
//
//   ① 주요 광맥에서 철 제거 — "철은 기본 마을에서는 안 생기도록. 플레이어가 탐험해서 찾는 거야"
//      철 주요 14개 → 주석 4(마을 가까운 순) · 구리 6 · 납 2 · 흑요석 2.
//      자잘 광맥의 철 184개는 그대로 = 플레이어 탐험 보상.
//
//   ② 다광종화 — "광맥 하나에 오직 한 종류만 나오는 게 문제인가?" → 문제였다.
//      단광종이면 선광 한 번으로 광맥 정체가 확정돼 종류 감정이 1회용 퍼즐이 된다.
//      고증대로 분포를 준다(자잘 포함 — 감정이 제일 쓰이는 곳이 자잘이다):
//        납 광맥    → { lead .85, silver .15 }   방연석 — 은은 여기서 회취법으로 나온다
//        구리 광맥  → { copper .90, gold .05, silver .05 }   황동석 부산 귀금속
//        금 광맥    → { gold .80, silver .20 }   일렉트럼
//        주석·철·옥·흑요석 → 단광종 유지(석석·자철석·옥은 실제로 단독)
//
//   ③ 은 단독 광맥 폐지 — 자연에 거의 없다. 전부(주요 9 + 자잘 82) 연은 광맥으로 흡수:
//      mineral='lead', minerals={ lead .85, silver .15 }. 고대 은의 실제 출처가 이거다.
//
//   o.mineral 은 **지배 광종**으로 남긴다(하위 호환 — 옛 코드는 단광종으로 읽는다).
//   pk·center·radius 불변 — 총 부존과 얼룩·모양은 안 흔들린다.
//
// 실행: node scripts/migrate-veins-polymetal.js [--apply]   (기본 미리보기)
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const APPLY = process.argv.includes('--apply');
const Z = 'hanbando', SZ = 32;

const T = JSON.parse(fs.readFileSync(P, 'utf8'));
const ores = T[Z].ores;

// ── ① 철 주요 광맥 교체 ──────────────────────────────────────────────────────
const Terr = require(path.join(__dirname, '..', 'server', 'terrain'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
if (Terr.setZonesMeta) Terr.setZonesMeta(ZONES);
const vs = Terr.getZoneVillages(Z) || [];
const distToVillage = (o) => {
  let best = Infinity;
  for (const v of vs) { const d = Math.hypot(o.center[0] - v.x, o.center[1] - v.y); if (d < best) best = d; }
  return best;
};
const ironMajors = ores.filter((o) => !o.minor && o.mineral === 'iron')
  .map((o) => ({ o, d: distToVillage(o) })).sort((a, b) => a.d - b.d);
const SWAP_ORDER = [];
for (const m of ['tin', 'tin', 'tin', 'tin', 'copper', 'copper', 'copper', 'copper', 'copper', 'copper', 'lead', 'lead', 'obsidian', 'obsidian']) SWAP_ORDER.push(m);
console.log(`① 철 주요 광맥 ${ironMajors.length}개 교체 (마을 가까운 순으로 주석 우선):`);
ironMajors.forEach(({ o, d }, i) => {
  const to = SWAP_ORDER[i] || 'copper';
  console.log(`   ${o.name.padEnd(10)} iron → ${to.padEnd(8)} 최근접 마을 ${Math.round(d / SZ)}셀`);
  o._swapTo = to;
});

// ── ②③ 다광종 분포 ───────────────────────────────────────────────────────────
const POLY = {
  lead:   { lead: 0.85, silver: 0.15 },
  copper: { copper: 0.90, gold: 0.05, silver: 0.05 },
  gold:   { gold: 0.80, silver: 0.20 },
};
// ★★pk 재산출 — 광종이 바뀌면 품위도 그 광종의 눈금을 따라야 한다.
//   pk 는 좌표 결정론이다: orePeakFor(광종, 0.30, hash2(cx, cy, 500)) [plan-ore-clusters.js:396 정본].
//   철(가치 4)→주석(가치 4)은 우연히 눈금이 같지만, 은(가치 30)→납(가치 4)은 pk 가 약 5배 뛴다 —
//   은 광맥의 pk 를 그대로 두면 "품위가 은 눈금인 납 광맥"이라는 유령이 남는다. 역산 금지, 재호출만.
const Specialty = require(path.join(__dirname, '..', 'server', 'specialty'));
const hash2 = (ix, iy, s) => { let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (s | 0) * 1274126177; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const CELL = 32;
// ⚠해시 좌표는 **floor** 다 — 저장본 787개 중 683개가 floor 기준으로 공식과 일치한다(round 는 108개뿐).
//   plan-ore-clusters.js:396 의 round 는 셀 정렬 좌표에서만 우연히 같았던 것. 검증 하네스도 floor 를 쓴다.
const repk = (o) => { o.pk = Specialty.orePeakFor(o.mineral, 0.30, hash2(Math.floor(o.center[0] / CELL), Math.floor(o.center[1] / CELL), 500)); };
let swapN = 0, polyN = 0, agN = 0, repkN = 0;
for (const o of ores) {
  let changed = false;
  if (o._swapTo) { o.mineral = o._swapTo; delete o._swapTo; swapN++; changed = true; }
  if (o.mineral === 'silver') { o.mineral = 'lead'; agN++; changed = true; }   // ③ 은 단독 → 연은
  if (changed) { repk(o); repkN++; }
  const dist = POLY[o.mineral];
  if (dist) { o.minerals = { ...dist }; polyN++; }
  else delete o.minerals;                                              // 단광종은 필드 없음(하위 호환)
}
console.log(`\n② 다광종화 ${polyN}개 · ③ 은 단독 → 연은 ${agN}개 (주요+자잘) · pk 재산출 ${repkN}개`);

// ── 사후 구성 검증 ───────────────────────────────────────────────────────────
const comp = (arr) => {
  const c = {};
  for (const o of arr) {
    const d = o.minerals || { [o.mineral]: 1 };
    for (const m in d) c[m] = (c[m] || 0) + d[m] * (o.pk || 0);       // pk 가중 산출 기대
  }
  const t = Object.values(c).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / t * 100).toFixed(1)}%`).join(' · ');
};
const maj = ores.filter((o) => !o.minor), min = ores.filter((o) => o.minor);
console.log('\n산출 기대 구성(pk×비중 가중):');
console.log('  주요(NPC 경제): ' + comp(maj));
console.log('  자잘(플레이어): ' + comp(min));
const cnt = (arr) => { const c = {}; for (const o of arr) c[o.mineral] = (c[o.mineral] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '); };
console.log('  주요 지배광종 수: ' + cnt(maj));
console.log('  자잘 지배광종 수: ' + cnt(min));

if (APPLY) { fs.writeFileSync(P, JSON.stringify(T)); console.log(`\n✅ 저장: ${P}`); }
else console.log('\n(미리보기 — 적용은 --apply)');
