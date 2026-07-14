// ═══════════════════════════════════════════════════════════════════════════
// bandit-lab.js — 도적 조우 랩 (Phase 1: 헤드리스 전사 효과 측정)
//   설계: 오픈월드에서 교역 캐러밴(호위=전사 그룹)이 이동 중 도적 갱과 조우 → 자동 전투.
//         승리 = 도적 격퇴(화물 보존), 패배 = 호위 전멸·화물 전손.
//   전투 해결: sim/war-core.js runBattleHeadless (battle-core 유닛별 전술 시뮬, 결정론 rng).
//   도적: 각자 "무작위 스킬레벨3 무기" 하나 — player-items.craftItem('weapon',3,{랜덤재질}).
//         battle-core quality는 side당 단일 weapQ라, 갱의 무기 q 평균을 side B weapQ로 집계.
//   목적: 호위 규모(E)·도적 갱 크기(G)·전사 티어(석기/청동)별 격퇴율·사상자 → 전사 한계효과·손익분기.
//   사용: node sim/bandit-lab.js            (기본 sweep)
//         node sim/bandit-lab.js --n 500 --seed 7
//   ★비파괴·econ 무접촉: 이 랩은 측정 전용. 서버 공간층 이식은 Phase 2(검증 후).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const WC = require('./war-core.js');
const PI = require('../server/player-items.js');

// ── CLI ──
function argOf(flag, def) { const i = process.argv.indexOf(flag); return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : def; }
const N       = +argOf('--n', 300);        // 셀당 조우 표본 수
const SEED0   = +argOf('--seed', 20260714); // 마스터 시드
const GANGS   = (argOf('--gangs', '3,5,8')).split(',').map(Number);   // 도적 갱 크기(BDT_GMIN 3 ~ BDT_GMAX 8)
const ESCORTS = (argOf('--escorts', '0,1,2,3,4,5,6,8,10')).split(',').map(Number);
// 경제 손익분기 가정(food-eq) — 물리 곡선이 1차, 이건 명시적 가정하 2차 지표(사용자 조정용)
const CARGO_V = +argOf('--cargo', 200);    // 캐러밴 화물 가치
const WARRIOR_C = +argOf('--wcost', 45);   // 전사 1인 손실 비용(무장+양성 근사)

// ── 결정론 rng (xorshift32) ──
function mkRng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hashSeed(a, b, c) { let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0; h = (h ^ (h >>> 13)) >>> 0; h = (h * 1274126177) >>> 0; return h >>> 0; }

// ── 도적 무기: 무작위 스킬3 무기 재질 ──
const WEAP_MATS = ['stone', 'wood', 'bone', 'iron', 'obsidian', 'bronze'];
function banditWeaponQ(rng) { const mat = WEAP_MATS[(rng() * WEAP_MATS.length) | 0]; return PI.craftItem('weapon', 3, { [mat]: 3 }).q; }
function gangMeanWeapQ(G, rng) { let s = 0; for (let i = 0; i < G; i++) s += banditWeaponQ(rng); return s / Math.max(1, G); }

// ── 전사(호위) 프로파일 ──
//   econ 고증: "대다수 전사는 석기"(마제석검 병기고) → 기본 = dagger(석검). 청동은 champion(청동전사, hp2배↑).
//   battle-core UNITS: dagger hp84/atk40, champion hp175/atk46. weapQ는 atk를 ±15% 스케일.
const PROFILES = {
  석기전사: { unit: 'dagger',   weapQ: 0.42 },   // 마제석검 병기고 기준 q≈0.42
  청동전사: { unit: 'champion', weapQ: 0.58 },   // 청동 스킬3 등가 q≈0.58
};

// ── 단일 조우 해결 ──
function encounter(profile, E, G, seed) {
  if (E <= 0) return { repel: false, escDead: 0, banDead: 0 };   // 호위 0 = 무전투·화물 전손
  const rng = mkRng(seed);
  const bQ = gangMeanWeapQ(G, rng);
  const spec = {
    A: { [profile.unit]: E, form: 'line' },
    B: { dagger: G, form: 'line' },                 // 도적 = 비정규 근접(석검형)
    terrain: 'plain',                               // 도로 매복 = 개활지
    quality: { A: { weapQ: profile.weapQ }, B: { weapQ: bQ } },
    playerCmd: false,
  };
  const r = WC.runBattleHeadless(spec, rng);
  return { repel: r.winner === 'A', escDead: r.atkDead, banDead: r.defDead };
}

// ── sweep ──
function sweepCell(profName, profile, E, G) {
  let repels = 0, escDeadSum = 0, banDeadSum = 0;
  for (let i = 0; i < N; i++) {
    const seed = hashSeed(SEED0 ^ (E * 101 + G * 7919), i + 1, (profName === '청동전사') ? 3 : 1);
    const o = encounter(profile, E, G, seed);
    if (o.repel) repels++;
    escDeadSum += o.escDead; banDeadSum += o.banDead;
  }
  return { repelRate: repels / N, escDead: escDeadSum / N, banDead: banDeadSum / N };
}

// ── 실행 + 리포트 ──
const t0 = Date.now();
const pad = (s, n) => String(s).padStart(n);
const pct = x => (x * 100).toFixed(0) + '%';
console.log(`\n═══ 도적 조우 랩 · 전사 효과 측정 ═══`);
console.log(`표본 N=${N}/셀 · seed=${SEED0} · 도적무기=무작위 스킬3 · 전투=runBattleHeadless(battle-core)\n`);

const results = {};   // results[prof][G][E] = cell
const minWarriors = {};  // minWarriors[prof][G] = { r50, r90 }

for (const profName in PROFILES) {
  const profile = PROFILES[profName];
  results[profName] = {}; minWarriors[profName] = {};
  console.log(`▓▓ ${profName} (unit=${profile.unit}, weapQ=${profile.weapQ}) ▓▓`);
  for (const G of GANGS) {
    results[profName][G] = {};
    console.log(`  도적 갱 ${G}명:`);
    console.log(`    호위 │ ${ESCORTS.map(e => pad(e, 4)).join(' ')}   (E=호위 전사 수)`);
    const rrRow = [], edRow = [], bdRow = [];
    let r50 = null, r90 = null;
    for (const E of ESCORTS) {
      const c = sweepCell(profName, profile, E, G);
      results[profName][G][E] = c;
      rrRow.push(pad(pct(c.repelRate), 4));
      edRow.push(pad(c.escDead.toFixed(1), 4));
      bdRow.push(pad(c.banDead.toFixed(1), 4));
      if (r50 === null && c.repelRate >= 0.5) r50 = E;
      if (r90 === null && c.repelRate >= 0.9) r90 = E;
    }
    minWarriors[profName][G] = { r50, r90 };
    console.log(`   격퇴율│ ${rrRow.join(' ')}`);
    console.log(`  전사사망│ ${edRow.join(' ')}`);
    console.log(`  도적사망│ ${bdRow.join(' ')}`);
    console.log(`    → 격퇴 50% 최소 호위=${r50 == null ? '>' + Math.max(...ESCORTS) : r50}, 90%=${r90 == null ? '>' + Math.max(...ESCORTS) : r90}\n`);
  }
}

// ── 전사 한계효과 & 손익분기(가정 CARGO_V/WARRIOR_C) ──
console.log(`▓▓ 전사 한계효과·손익분기 (가정: 화물 ${CARGO_V} / 전사손실 ${WARRIOR_C} food-eq) ▓▓`);
console.log(`  EV(E) = 격퇴율(E)×화물 − 전사사망(E)×전사비용.  E*=EV 최대 호위수.`);
for (const profName in PROFILES) {
  for (const G of GANGS) {
    let bestE = 0, bestEV = -Infinity, evAt = {};
    for (const E of ESCORTS) {
      const c = results[profName][G][E];
      const ev = c.repelRate * CARGO_V - c.escDead * WARRIOR_C;
      evAt[E] = ev;
      if (ev > bestEV) { bestEV = ev; bestE = E; }
    }
    console.log(`  ${profName} vs 갱${G}: E*=${bestE} (EV=${bestEV.toFixed(0)}), 격퇴 ${pct(results[profName][G][bestE].repelRate)}, 전사사망 ${results[profName][G][bestE].escDead.toFixed(1)}`);
  }
}

// ── 헤드라인 ──
console.log(`\n▓▓ 헤드라인 ▓▓`);
for (const G of GANGS) {
  const s = minWarriors['석기전사'][G], b = minWarriors['청동전사'][G];
  const fmt = v => v == null ? '>' + Math.max(...ESCORTS) : v;
  console.log(`  갱${G}명 격퇴 90%: 석기전사 ${fmt(s.r90)}명 vs 청동전사 ${fmt(b.r90)}명 필요`);
}
console.log(`\n(경과 ${(Date.now() - t0) / 1000}s)`);
