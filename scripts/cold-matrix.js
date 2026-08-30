#!/usr/bin/env node
// === scripts/cold-matrix.js — 겨울 난이도 대리 지표(계측기) ======================
//
// ★★[온도 소배치 2026-08-31] 재민 확정 목표를 **실측**한다:
//     ① 마을 안 맨몸 = **무한 버팀**(추위가 심각 단계로 안 간다)
//     ② 야생 맨몸 한겨울 밤 = **5~8분에 3단계**
//   "겨울이 어렵다"는 느낌이 아니라 **시간**으로 말해야 손잡이를 옳게 돌릴 수 있다.
//
// ★★하루치 표본을 믿지 마라 — 날씨 편차(±DEV_C ℃)가 계절 신호보다 클 수 있다.
//   그래서 **같은 연중일을 여러 해에 걸쳐** 뽑아 중앙값·최악값으로 말한다.
//   (초안은 단일 날짜를 찍었다가 "한겨울 밤이 초겨울보다 따뜻하다"는 표를 냈다 — 그건
//    곡선이 틀린 게 아니라 계측기가 틀린 것이었다. 족보 ㊻: 계측기가 먼저 틀린다.)
//
// ⚠**계측기다. 손잡이가 아니다.** 아무것도 바꾸지 않고 `Body.tick` 을 그대로 돌린다.
//   러너(`run-regress.sh`)에 넣지 마라 — 판정이 아니라 표다(판정은 `test-body ⑭` 가 한다).
//
// 사용: node scripts/cold-matrix.js [--years N] [--csv]
'use strict';

const Body = require('../server/body');
const W = require('../server/weather');

const DT = 1;                       // 1초 적분(서버 틱보다 촘촘 — 도달 시간 오차 <1초)
const MAX_SEC = 3 * 3600;           // 3시간이면 "안 온다"로 본다(게임 하루 24분의 7.5배)
const S3 = Body.STAGE_AT.cold[2] + Body.CFG.STAGE_HYST;   // 3단계 **진입** 문턱(히스테리시스 포함)
const argN = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? (parseInt(process.argv[i + 1], 10) || d) : d; };
const YEARS = argN('--years', 12);
const YD = 365;                     // ★캐논(econ). 여러 해 표본을 뜨기 위한 보폭일 뿐 — 여기서 정하지 않는다.

function run(ctx) {
  const p = { hunger: 100, thirst: 100 };
  Body.ensure(p);
  const tgt = Body.coldTarget(ctx);
  let t3 = null;
  for (let s = DT; s <= MAX_SEC; s += DT) {
    Body.tick(p, DT, Object.assign({ moving: false, now: Date.now() }, ctx));
    if (Body.ensure(p).cold >= S3) { t3 = s; break; }
  }
  return { tgt, t3 };
}
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
// 여러 해 표본 — 같은 연중일, 다른 절대일(날씨 편차가 해마다 다르다)
function sample(doy, ctx) {
  const rows = [];
  for (let k = 0; k < YEARS; k++) rows.push(run(Object.assign({ day: doy + YD * k }, ctx)));
  const tgts = rows.map((r) => r.tgt);
  const hit = rows.filter((r) => r.t3 !== null);
  return {
    tgtMed: med(tgts), tgtMax: Math.max(...tgts),
    hitFrac: hit.length / rows.length,
    t3Med: hit.length ? med(hit.map((r) => r.t3)) : null,
    t3Min: hit.length ? Math.min(...hit.map((r) => r.t3)) : null,
  };
}

const A = W.anchors();
const fmtS = (s) => (s === null ? '  —  ' : `${(s / 60).toFixed(1)}분`.padStart(6));
const DAYS = [
  ['한여름', Math.round(A.summerMid)], ['가을중', Math.round((A.summerMid + A.winterMid) / 2)],
  ['초겨울', 275], ['한겨울', Math.round(A.winterMid)], ['늦겨울', 350], ['이른봄', 20],
];
const PLACES = [
  ['야생 맨몸', { villageShelter: 0, warmth: 0 }],
  ['야생 조잡한옷(w15)', { villageShelter: 0, warmth: 15 }],
  ['마을 맨몸', { villageShelter: 1, warmth: 0 }],
  ['마을 가장자리', { villageShelter: 0.5, warmth: 0 }],
  ['야생 모닥불', { villageShelter: 0, warmth: 0, nearFire: true }],
  ['실내 맨몸', { villageShelter: 0, warmth: 0, indoor: true }],
];

const csv = process.argv.includes('--csv');
console.log(`# 추위 대리 지표 — τ=${Body.CFG.COLD_TAU_SEC}s · 마을완충=${Body.CFG.COLD_VILLAGE_SHELTER} · 3단계 문턱 ${S3.toFixed(3)} · ${YEARS}년 표본`);
console.log(`# econ 기온 정본: 최난 doy ${A.summerMid} (${A.tSummerDay}℃/${A.tSummerNight}℃) · 최한 doy ${A.winterMid} (${A.tWinterDay}℃/${A.tWinterNight}℃) · 일교차 ±${A.diurnalAmp}℃`);
console.log(`# 하루 24분(낮 ~12분·밤 ~12분) · 1년 365게임일 — ★시간 구조 불변 캐논`);
if (csv) console.log('place,doy,dayname,night,tgt_med,tgt_max,hit_frac,t3_med_sec,t3_min_sec');
for (const [pn, pctx] of PLACES) {
  if (!csv) { console.log(`\n■ ${pn}`); console.log('  날        |   낮 평형  낮 3단계 |   밤 평형  밤 3단계 도달률'); }
  for (const [dn, d] of DAYS) {
    const D = sample(d, Object.assign({ night: false }, pctx));
    const N = sample(d, Object.assign({ night: true }, pctx));
    if (csv) {
      console.log([pn, d, dn, 0, D.tgtMed, D.tgtMax, D.hitFrac, D.t3Med ?? '', D.t3Min ?? ''].join(','));
      console.log([pn, d, dn, 1, N.tgtMed, N.tgtMax, N.hitFrac, N.t3Med ?? '', N.t3Min ?? ''].join(','));
    } else {
      console.log(`  ${dn}(${String(d).padStart(3)}) |   ${D.tgtMed.toFixed(3)}   ${fmtS(D.t3Med)}  |   ${N.tgtMed.toFixed(3)}   ${fmtS(N.t3Med)}  ${(N.hitFrac * 100).toFixed(0)}%`);
    }
  }
}
if (!csv) {
  console.log('\n— 판정 목표 —');
  const wn = sample(Math.round(A.winterMid), { night: true, villageShelter: 0, warmth: 0 });
  const vn = sample(Math.round(A.winterMid), { night: true, villageShelter: 1, warmth: 0 });
  const ok3 = wn.t3Med !== null && wn.t3Med >= 300 && wn.t3Med <= 480;
  console.log(`  야생 한겨울 밤 3단계 중앙값 ${wn.t3Med === null ? '안 옴' : (wn.t3Med / 60).toFixed(1) + '분'} (목표 5~8분) ${ok3 ? '✅' : '❌'}`
    + ` · 도달률 ${(wn.hitFrac * 100).toFixed(0)}% · 가장 추운 밤 ${wn.t3Min === null ? '—' : (wn.t3Min / 60).toFixed(1) + '분'}`);
  console.log(`  마을 한겨울 밤 평형 중앙 ${vn.tgtMed} (최악 ${vn.tgtMax}) · 3단계 도달률 ${(vn.hitFrac * 100).toFixed(0)}%`
    + ` ${vn.hitFrac === 0 ? '→ 무한 버팀 ✅' : '❌'}`);
}
