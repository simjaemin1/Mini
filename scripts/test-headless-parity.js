#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 헤드리스 결산 ↔ 실걸음 정합 검증 하네스 ===
// "안 보는 마을이 보는 마을보다 빨리 살면 안 된다"(fast 모드 = 물리의 가속 shadow)를 식 수준에서 고정한다.
//   ①작물: 헤드리스 예산 = 농부수 × (낮 실초 ÷ 건당 실초) — **날 길이 파생**이어야 한다(구 고정 30의 결함)
//   ②개간: 헤드리스 = min(크루, 농부) × LIFE_CLEAR_PDAY = 실걸음 상한과 동일해야 한다
//   ③건설: 헤드리스 = min(크루, 인구) × LIFE_STAGE_PDAY = 실걸음 상한과 동일해야 한다
//   ④실걸음 상한의 물리 근거: 셀 체류 _jobT = 9~18초 → 건당 실초가 그 범위 밖이면 상수가 물리와 어긋난 것
//
// 실행: node scripts/test-headless-parity.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');

function cut(name) {
  const st = src.indexOf('function ' + name + '(');
  if (st < 0) throw new Error('함수 없음: ' + name);
  let d = 0;
  for (let j = src.indexOf('{', st); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(st, j + 1); }
  }
}
const consts = src.match(/const LIFE_TASK_SEC = [\d.]+;/)[0];
const CLEAR_PDAY = +src.match(/const LIFE_CLEAR_PDAY = (\d+)/)[1];
const STAGE_PDAY = +src.match(/const LIFE_STAGE_PDAY = (\d+)/)[1];
const CREW = +src.match(/const LIFE_CREW = (\d+)/)[1];
const state = { dayMs: 0, deps: { dayPhaseRatio: 0.7 } };
const ctx = vm.createContext({ state, Math, console });
vm.runInContext([consts, cut('_lifeTasksPerFarmerDay'),
  'globalThis.__api = { _lifeTasksPerFarmerDay, LIFE_TASK_SEC };'].join('\n'), ctx);
const A = ctx.__api;

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('=== 헤드리스 결산 ↔ 실걸음 정합 ===');
console.log(`LIFE_TASK_SEC=${A.LIFE_TASK_SEC}s · LIFE_CLEAR_PDAY=${CLEAR_PDAY} · LIFE_STAGE_PDAY=${STAGE_PDAY} · LIFE_CREW=${CREW}`);

console.log('\n[① 작물 예산이 날 길이에서 파생된다 — 구 고정 30의 결함 재발 방지]');
{
  const at = (min) => { state.dayMs = min * 60000; return A._lifeTasksPerFarmerDay(); };
  const p24 = at(24), p12 = at(12), p2 = at(2);
  chk(p24 !== 30 && p12 !== 30, `고정값 아님: 24분/일 ${p24} · 12분/일 ${p12} · 2분/일 ${p2}`);
  chk(Math.abs(p24 / p12 - 2) < 0.06, `날 길이 2배 = 처리량 2배(${p24}/${p12} = ${(p24 / p12).toFixed(2)})`);
  chk(p2 >= 1, `압축 구동에서도 하한 1 이상(${p2})`);
  state.dayMs = 24 * 60000;
  // ★기대치는 '느낌'이 아니라 실측에서 파생한다: 낮 실초 ÷ 실측 건당 실초.
  //   로컬 A/B 실측(하루 2분·작물 완전 포화·농부 8): 관측 135셀/일 = 인당 16.9 → 84초/16.9 = 5.0초/건.
  const want = Math.round((24 * 60 * 0.7) / A.LIFE_TASK_SEC);
  chk(p24 === want, `운영(24분/일) 예산 ${p24} = 낮 1008초 ÷ ${A.LIFE_TASK_SEC}초 (기대 ${want})`);
  const per2 = at(2);
  chk(Math.abs(per2 * 8 / 135 - 1) <= 0.3, `2분/일 실측 정합: 헤드리스 ${per2 * 8}셀/일 vs 실걸음 실측 135셀/일 (비율 ${(per2 * 8 / 135).toFixed(2)}, 허용 1±0.3)`);
}

console.log('\n[② 건당 실초의 물리 근거 — 체류식 + 곳간 훅의 대기 건너뛰기]');
{
  // npcLifeTick 농부 분기: npc._jobT = now + 9000 + (hash%7)*1500 → 9~18초 체류.
  // ★그런데 실측 건당 실초는 5.0초로 **체류 하한보다 짧다**. 처음엔 "상수가 물리와 어긋난다"고 봤지만,
  //   원인은 곳간 운반 훅(`npc._jobT = 0`)이 짐 상한마다 대기를 풀어 버리기 때문이었다 — 즉 이 훅이
  //   사라지면 건당 실초가 늘어 재보정이 필요하다. 그래서 '대역'이 아니라 **그 훅의 존재**를 고정한다.
  const m = src.match(/_jobT = now \+ (\d+) \+ \(_pidHash\(npc\.pid\) % (\d+)\) \* (\d+)/);
  chk(!!m, '실걸음 체류식 발견: ' + (m ? `${m[1]}ms + (h%${m[2]})×${m[3]}ms` : '없음'));
  chk(/_granGo\(vil, npc, false\)\) \{ npc\._jobT = 0;/.test(src),
    '곳간 운반 훅이 체류를 해제한다(_jobT = 0) — 건당 실초가 체류 하한보다 짧은 이유');
  if (m) {
    const hi = (+m[1] + (+m[2] - 1) * +m[3]) / 1000;
    chk(A.LIFE_TASK_SEC > 0.5 && A.LIFE_TASK_SEC <= hi,
      `LIFE_TASK_SEC ${A.LIFE_TASK_SEC}s ≤ 체류 상한 ${hi}s (실측 보정값 — 대기 해제 구간 때문에 하한보다 짧을 수 있음)`);
  }
}

console.log('\n[③ 개간·건설 결산은 실걸음 상한과 같은 식이어야 한다]');
{
  const hl = cut('_lifeHeadlessDay');
  chk(/Math\.min\(LIFE_CREW, farmerN\) \* LIFE_CLEAR_PDAY/.test(hl), '개간 결산 = min(크루, 농부) × LIFE_CLEAR_PDAY');
  chk(/Math\.min\(LIFE_CREW, popN\) \* LIFE_STAGE_PDAY/.test(hl), '건설 결산 = min(크루, 인구) × LIFE_STAGE_PDAY');
  // ★[T117] 작물 절이 `lifeFarmDay` 로 **순수 추출**됐다(밭 계측기가 그 루프를 다시 안 쓰게).
  //   그래서 검사도 따라간다 — 그리고 **계약을 강화한다**: 결산이 그 함수를 부르는지, 그리고
  //   그 함수가 날 길이 파생을 쓰는지 **둘 다** 본다. (세션1 T100 이 개간 추출에서 한 것과 같은 문법.)
  const fd = cut('lifeFarmDay');
  chk(/lifeFarmDay\(vil, day, farmerN\)/.test(hl), '작물 결산이 `lifeFarmDay` 정본을 부른다(추출 뒤)');
  chk(/_lifeTasksPerFarmerDay\(\)/.test(fd), '작물 결산이 날 길이 파생 함수를 쓴다(고정 상수 아님)');
  chk(!/_lifeTasksPerFarmerDay\s*=\s*\d|budget\s*=\s*\w+\s*\*\s*\d+/.test(fd), '작물 예산에 **고정 숫자가 없다**(T58b 계측기가 100 이라 적었던 자리)');
  // 실걸음 쪽: 개간 1셀 = dayMs / LIFE_CLEAR_PDAY 노동, 크루 상한 LIFE_CREW → 하루 상한 동일
  chk(/t\.prog >= dayMs \/ LIFE_CLEAR_PDAY/.test(src), '실걸음 개간 1셀 = dayMs / LIFE_CLEAR_PDAY 노동(동일 근거)');
  chk(/t\.prog >= dayMs \/ LIFE_STAGE_PDAY/.test(src), '실걸음 건설 1단계 = dayMs / LIFE_STAGE_PDAY 노동(동일 근거)');
}

console.log('\n[④ 개간 게이트는 유지 — 사용자 확정(식량 > 인구×120이면 개간 없음)]');
{
  chk(/storage && e\.storage\.food\) \|\| 0\) > e\.npcs\.length \* 120/.test(src), '_lifeNeedClear 식량 게이트 원문 보존');
}

console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
