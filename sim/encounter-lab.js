// ═══════════════════════════════════════════════════════════════════════════
// encounter-lab.js — 도적 습격 전체 경제 랩 (Phase 2 설계 검증)
//   per-entity 전투(skirmish-lab 모델) 위에 "여정 경제"를 얹어 호위 정책의 순가치·손익분기를 측정.
//   구성요소:
//     - 의도적 진행형 갱: 초반(경장 소규모) → 후반(베테랑 대규모)
//     - 호위 정책: E = round(k × 예상갱크기)  (k = 0/0.5/1/1.5/2)
//     - 전투: per-entity(hp100·atk=10+무기×0.2·평면) — zone.js 충실
//     - 경제: 화물가치 V, 호위 여정당 유지비, 전사 대체비, 조우확률 P_ENC
//   출력: (위협×전사티어) 별 정책 순가치/여정 → 최적 호위계수 + 손익분기(E=0 대비).
//   사용: node sim/encounter-lab.js  [--V 120] [--cw 35] [--upkeep 1.5] [--penc 0.35] [--n 3000]
//   ★측정 전용·비파괴.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const PI = require('../server/player-items.js');
function argOf(f, d) { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : d; }

// 경제 파라미터(가정 — 조정 가능)
const V      = +argOf('--V', 120);       // 화물 순이익(food-eq)
const CW     = +argOf('--cw', 35);       // 전사 1인 손실 대체비(무기+양성)
const UPKEEP = +argOf('--upkeep', 1.5);  // 호위 1인 여정당 유지비
const P_ENC  = +argOf('--penc', 0.35);   // 길목 여정당 도적 조우 확률
const M      = +argOf('--n', 3000);      // 여정 표본/셀

// per-entity 전투(zone.js 충실)
const HP = 100, BASE_ATK = 10, WSCALE = 0.2;
const meleeAtk = wa => BASE_ATK + Math.round(wa * WSCALE);
function mkRng(s) { s = (s >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const w3atk = (mat) => PI.craftItem('weapon', 3, { [mat]: 3 }).attrs.attack;
function fight(E, warAtk, gangUnits, rng) {
  const a = []; for (let i = 0; i < E; i++) a.push({ hp: HP, atk: warAtk });
  const b = gangUnits.map(u => ({ hp: u.hp, atk: u.atk }));
  const live = arr => { const x = []; for (let i = 0; i < arr.length; i++) if (arr[i].hp > 0) x.push(i); return x; };
  let round = 0;
  while (round++ < 500) {
    const aL = live(a), bL = live(b); if (!aL.length || !bL.length) break;
    const dA = new Array(a.length).fill(0), dB = new Array(b.length).fill(0);
    for (const i of aL) dB[bL[(rng() * bL.length) | 0]] += a[i].atk;
    for (const i of bL) dA[aL[(rng() * aL.length) | 0]] += b[i].atk;
    for (let i = 0; i < a.length; i++) if (a[i].hp > 0) a[i].hp -= dA[i];
    for (let i = 0; i < b.length; i++) if (b[i].hp > 0) b[i].hp -= dB[i];
  }
  const aSurv = a.filter(u => u.hp > 0).length, bSurv = b.filter(u => u.hp > 0).length;
  return { repel: bSurv === 0 && aSurv > 0, wDead: E - aSurv };
}

// 의도적 진행형 위협
const THREATS = {
  '초반·경장 소규모': { gmin: 3, gmax: 5, pool: ['stone', 'wood', 'bone'] },
  '중반·혼성':        { gmin: 4, gmax: 6, pool: ['stone', 'bone', 'iron'] },
  '후반·베테랑 대규모': { gmin: 6, gmax: 8, pool: ['iron', 'obsidian', 'bronze'] },
};
const WTIERS = { '석기전사': 'stone', '청동전사': 'bronze' };
const POLICIES = [0, 0.5, 1, 1.5, 2];   // k: E = round(k × 예상갱크기)

function gangUnits(th, rng) {
  const G = th.gmin + ((rng() * (th.gmax - th.gmin + 1)) | 0);
  const u = []; for (let i = 0; i < G; i++) u.push({ hp: HP, atk: meleeAtk(w3atk(th.pool[(rng() * th.pool.length) | 0])) });
  return u;
}

// 한 (위협,티어,정책) 셀의 여정당 순가치 시뮬
function cell(th, warMat, k, seed) {
  const warAtk = meleeAtk(w3atk(warMat));
  const gmid = Math.round((th.gmin + th.gmax) / 2);
  const E = Math.round(k * gmid);   // 마을은 예상 갱크기에 맞춰 호위 편성
  const rng = mkRng(seed);
  let deliveredV = 0, upkeepC = 0, deathC = 0, encN = 0, repelN = 0, wDeadSum = 0;
  for (let t = 0; t < M; t++) {
    upkeepC += E * UPKEEP;                       // 유지비는 매 여정
    if (rng() < P_ENC) {                          // 조우
      encN++;
      const g = gangUnits(th, rng);
      const r = fight(E, warAtk, g, rng);
      wDeadSum += r.wDead; deathC += r.wDead * CW;
      if (r.repel) { repelN++; deliveredV += V; } // 격퇴 → 배송
      // 패배 → 화물 전손(배송 0)
    } else { deliveredV += V; }                   // 무조우 → 배송
  }
  const net = (deliveredV - upkeepC - deathC) / M;
  return { E, net, repelOfEnc: encN ? repelN / encN : 1, wDeadPerTrip: wDeadSum / M };
}

console.log(`\n═══ 도적 습격 전체 경제 랩 ═══`);
console.log(`가정: 화물 V=${V} · 전사대체 CW=${CW} · 호위유지 ${UPKEEP}/여정 · 조우확률 ${P_ENC} · 표본 ${M}/셀`);
console.log(`전투: per-entity(hp100·atk=10+무기×0.2). 정책 k = 호위/예상갱크기.\n`);

for (const wname in WTIERS) {
  const mat = WTIERS[wname];
  console.log(`▓▓ ${wname} (atk=${meleeAtk(w3atk(mat))}) ▓▓`);
  console.log(`  위협\\정책       ${POLICIES.map(k => 'k=' + k).map(s => s.padStart(9)).join('')}    최적`);
  for (const tname in THREATS) {
    const th = THREATS[tname];
    let best = { net: -Infinity, k: 0, E: 0, repel: 0, wd: 0 };
    const cells = POLICIES.map((k, i) => {
      const c = cell(th, mat, k, 0xBEEF ^ (tname.length * 131 + i * 7919 + mat.length));
      if (c.net > best.net) best = { net: c.net, k, E: c.E, repel: c.repelOfEnc, wd: c.wDeadPerTrip };
      return c;
    });
    const row = cells.map(c => c.net.toFixed(1).padStart(9)).join('');
    console.log(`  ${tname.padEnd(13)}${row}   k=${best.k}(E=${best.E})`);
  }
  // 기준선 E=0 순가치 = (1-P_ENC)*V
  console.log(`  (E=0 기준선 순가치/여정 = ${((1 - P_ENC) * V).toFixed(1)})\n`);
}

console.log(`▓▓ 요약 ▓▓`);
for (const wname in WTIERS) {
  const mat = WTIERS[wname];
  const parts = [];
  for (const tname in THREATS) {
    const th = THREATS[tname];
    let best = { net: -Infinity, k: 0, E: 0, repel: 0, wd: 0 };
    for (const k of POLICIES) { const c = cell(th, mat, k, 0xBEEF ^ (tname.length * 131 + mat.length)); if (c.net > best.net) best = { net: c.net, k, E: c.E, repel: c.repelOfEnc, wd: c.wDeadPerTrip }; }
    parts.push(`${tname.split('·')[0]}: k=${best.k}·E=${best.E}(격퇴${(best.repel * 100).toFixed(0)}%·전사사망${best.wd.toFixed(2)}/여정)`);
  }
  console.log(`  ${wname}: ${parts.join(' / ')}`);
}
console.log('');
