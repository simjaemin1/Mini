// ═══════════════════════════════════════════════════════════════════════════
// _cellbuy-probe.js — ★영토 확장 셀 단위 전환(주 1슬롯→일 최대 4셀) 실측 프로브.
//   사용자 승인 설계(2026-07-12): 슬롯(25셀) 뭉텅 지불 → 매일 셀 구매(비용=슬롯 공식/25, MB/MC 셀마다).
//   실측 항목:
//     ① 일일 구매 셀 수 분포(0~4) — 페이스가 맵 크립 4/일과 정합하는지
//     ② treasury 흐름 — 주 80 뭉텅 스파이크 소멸 → 일 ~3.2×n 스며듦(구매일 Δ금고)
//     ③ MB<MC 도달 시 '소수점 크기'에서 정지(25셀 양자화 없는 정지점) + size*25 ≡ base*25+ex 정합
//     ④ LT19 동형 집계(시드 42 v2 3500일: stalled·maxN·alive·spread) — 회귀 불변식 #19 A/B용
//   실행: node sim/_cellbuy-probe.js   (시드당 단일 프로세스 · DB/git 없음 · Math.random 미사용)
// ═══════════════════════════════════════════════════════════════════════════
const EE = require('./economy-sim-v2.js');
const w2 = EE.createWorldV2({ seed: 42, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
const _l = console.log; console.log = () => {};

const WATCH = '나';                       // 활발 확장 마을(기준선 실측에서 슬롯 33회)
const hist = [0, 0, 0, 0, 0];             // 일일 구매 셀 수 히스토그램(전마을·전일)
const flow = [];                          // WATCH 마을: 첫 구매일부터 28일 창
let flowOn = false, flowLeft = 28;
let buyDays = 0, totCells = 0;

for (let d = 1; d <= 3500; d++) {
  const pre = w2.villages.map(v => ({ ex: v.expansions, f: v.treasury.food || 0, w: v.treasury.wood || 0, s: v.treasury.stone || 0 }));
  EE.tickWorldV2(w2);
  w2.villages.forEach((v, i) => {
    const dEx = v.expansions - pre[i].ex;
    hist[Math.min(4, dEx)]++;
    if (dEx > 0) { buyDays++; totCells += dEx; }
    if (v.name === WATCH) {
      if (!flowOn && dEx > 0) flowOn = true;
      if (flowOn && flowLeft > 0) {
        flowLeft--;
        flow.push(`  d${d} +${dEx}셀 size=${v.land.size.toFixed(3)} Δ금고 f${(v.treasury.food - pre[i].f).toFixed(1)} w${(v.treasury.wood - pre[i].w).toFixed(1)} s${(v.treasury.stone - pre[i].s).toFixed(1)} | 잔고 f${(v.treasury.food || 0).toFixed(0)} w${(v.treasury.wood || 0).toFixed(0)} s${(v.treasury.stone || 0).toFixed(0)}`);
      }
    }
  });
}
console.log = _l;

// ④ LT19 동형 집계
const alive = w2.villages.filter(v => v.npcs.length > 5);
const lt = {
  alive: alive.length,
  maxN: Math.max(...w2.villages.map(v => v.npcs.length)),
  stalled: w2.villages.filter(v => v._expandMBMC && v._expandMBMC.mb < v._expandMBMC.mc).length,
  spread: alive.length >= 2 ? +(Math.max(...alive.map(v => v.npcs.length)) / Math.max(1, Math.min(...alive.map(v => v.npcs.length)))).toFixed(2) : 0,
  pop: w2.villages.reduce((a, v) => a + v.npcs.length, 0),
};
console.log('LT19', JSON.stringify(lt));

// ③ 최종 상태 — 소수 정지점·정합 검사
let fracStall = 0, coherent = true;
for (const v of w2.villages) {
  const cells = v.land.baseSize * 25 + v.expansions;              // 기대 총 셀
  const drift = Math.abs(v.land.size * 25 - cells);               // FP 누적 오차(셀)
  if (drift > 1e-6) coherent = false;
  const stalled = v._expandMBMC && v._expandMBMC.mb < v._expandMBMC.mc;
  const frac = Math.abs(v.land.size - Math.round(v.land.size)) > 1e-9;
  if (stalled && frac) fracStall++;
  console.log(`  ${v.name} N=${v.npcs.length} size=${v.land.size.toFixed(3)} base=${v.land.baseSize} ex=${v.expansions}셀 MBMC=${v._expandMBMC ? v._expandMBMC.mb + '/' + v._expandMBMC.mc : '-'}${stalled ? ' ◀정지' : ''}${frac ? '(소수)' : ''} drift=${drift.toExponential(1)} 금고 f=${(v.treasury.food || 0).toFixed(0)} w=${(v.treasury.wood || 0).toFixed(0)} s=${(v.treasury.stone || 0).toFixed(0)}`);
}
console.log(`정합: size*25 ≡ base*25+ex ${coherent ? 'OK' : 'FAIL'} · 소수 크기 정지 마을 ${fracStall}`);

// ① 페이스
console.log(`일일 구매 셀 히스토그램(마을·일 합산) 0셀:${hist[0]} 1셀:${hist[1]} 2셀:${hist[2]} 3셀:${hist[3]} 4셀:${hist[4]} — 구매일 ${buyDays}, 총 ${totCells}셀(평균 ${(totCells / Math.max(1, buyDays)).toFixed(2)}셀/구매일)`);

// ② 스며듦 창
console.log(`${WATCH} 첫 구매 28일 창(스파이크 vs 스며듦):`);
for (const r of flow) console.log(r);
