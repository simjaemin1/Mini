#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T762 표 기계 · 판 파일만 읽는다)
// === scripts/t762-lab-table.js — 랩 자(t17 · `scripts/t474-arm.js` 3시드) 팔마다 여덟 수 + 캐러밴(띄운 수 · 날 · 손절 · 약탈) + 장부 사건 ==========
//   node scripts/t762-lab-table.js <폴더> [팔 …]   ⇒ `<폴더>/t17-<팔>-<시드>.json`(t17 JSON) · `<폴더>/arm-<팔>-<시드>.json`(t474-arm 관측)
'use strict';
const fs = require('fs');
const path = require('path');
const [DIR, ...A] = process.argv.slice(2);
const ARMS = A.length ? A : ['off', 'a474', 'a496'];
const SEEDS = [1020, 7, 42];
const rd = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
console.log('| 팔 | 시드 | 인구 | 소멸 | 무기Q · 확장 · 곡물 | 띄운 캐러밴 | 교역 기록(t17 · 5,000 상한) | 날 p50 · 평균 · 최대 | 손절 · 약탈 · 재경로 | 장부 사건 | 밀도 ㉮(마을·일 ÷ 사건) |');
console.log('|---|---|---:|---:|---|---:|---:|---|---|---:|---:|');
const sums = {};
for (const arm of ARMS) for (const s of SEEDS) {
  let T, M; try { T = rd(`t17-${arm}-${s}.json`); M = rd(`arm-${arm}-${s}.json`); } catch (e) { console.log(`| ${arm} | ${s} | 읽기 실패 ${e.message} |`); continue; }
  const pop = T.base.pop, dead = T.base.dead;   // t17 여덟 수 = base(pop · dead · ever · weapQ · expand · trades) + eight(grain · 밀도 · 사건)
  const C = M.caravan, td = C.travelDays, L = M.ledger;
  const dens = M.scale && L ? M.scale.villageDaysLive / Math.max(1, L.emitted) : null;
  console.log(`| ${arm} | ${s} | ${pop} | ${dead} | ${T.base.weapQ} · ${T.base.expand} · ${T.eight.grain} | ${C.launched} | ${C.log} | ${td.p50} · ${td.mean.toFixed(2)} · ${td.max} | ${C.abandoned} · ${C.raided} · ${C.rerouted} | ${L.emitted} | ${dens == null ? '—' : dens.toFixed(2)} |`);
  const S = sums[arm] || (sums[arm] = { pop: 0, launched: 0, log: 0, emitted: 0, raided: 0, abandoned: 0 });
  S.pop += +pop || 0; S.launched += C.launched; S.log += C.log; S.emitted += L.emitted; S.raided += C.raided; S.abandoned += C.abandoned;
}
const b = sums[ARMS[0]];
console.log(`\n| 팔 ÷ ${ARMS[0]}(3시드 합) | 인구 | 띄운 캐러밴 | 교역 기록(상한) | 장부 사건 | 약탈(건) | 손절(건) |`);
console.log('|---|---:|---:|---:|---:|---:|---:|');
for (const arm of ARMS) { const S = sums[arm]; if (!S) continue; console.log(`| ${arm} | ${(S.pop / b.pop).toFixed(3)} | ${(S.launched / b.launched).toFixed(3)} | ${(S.log / b.log).toFixed(3)} | ${(S.emitted / b.emitted).toFixed(3)} | ${S.raided} | ${S.abandoned} |`); }
