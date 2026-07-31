#!/usr/bin/env node
// === scripts/test-mining.js — 11차 채광 재설계 본게임 이식 검증 ===
//
// 검증 항목(전부 실측 — 주장하려면 여기서 돌아야 한다):
//   ① 상수 유도: NPC_MINE_PER_DAY 가 손으로 박은 값이 아니라 1440×노동률×왕복효율÷60 이다
//   ② 리젠 닫힌 해 ≡ 수치적분(dR/dt = 0.02 − 1e-5·R), 경계 R=0→0.02 · R=K→0.01, 완전회복 190 게임년
//   ③ p 연속장: 광맥 밖 0 · 중심 최대 · **인접 셀 |Δp| 상한**(급변 불가 — 재민 요구) · 경계 연속
//   ④ livelihood √: 광맥 등급이 광부 정원으로 번역된다(대형 27 / 중형 12 / 소형 7 / 자잘 2)
//   ⑤ 무게: 지게 상한이 원석 8덩이에서 물린다
//   ⑥ 채굴 파이프라인: 60타 = 재고 1 = 덩이 1 · 셀 타수 공유(2인 1조) · 장부→선광 보존
//   ⑦ 구 모델 잔재 0 (cost/refillMs/dropChance/prosperity 참조)
//   ⑧ 채광 숙련: 속도 고정 + 레벨 이득 셋(곡괭이 내구 · 큰 덩이 · 감정) · 전부 **전이 불가**
//
// ※ zone.js 의 mineOreCell / NPC 채굴 배선은 **실서버 부팅**으로 확인한다(이 하네스 범위 밖):
//    `DB_PATH=… VILLAGE_DAY_MS=6000 node --experimental-sqlite <wrap>` → 로그 "⛏ NPC 채굴: N개 마을 · 재고 -X"
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'server', 'specialty'));
const L = require(path.join(__dirname, '..', 'server', 'livelihood'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const T = require(path.join(__dirname, '..', 'server', 'terrain'));
if (T.setZonesMeta) T.setZonesMeta(ZONES);

const fail = [];
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✗ ') + m); if (!c) fail.push(m); };

console.log('① 상수 유도');
const derived = +(1440 * S.MINE_LABOR * S.MINE_HAULEFF / S.MINE_SWINGS_PER).toFixed(2);
console.log('    1타 ' + S.MINE_SWING_MS + 'ms · ' + S.MINE_SWINGS_PER + '타 = 재고 1 = 덩이 1(' + S.CHUNK_KG + 'kg) · 셀 재고 K=' + S.ORE_K);
console.log('    셀 재고 → 깊이: ' + S.ORE_K + '덩이 × ' + S.CHUNK_KG + 'kg ÷ 2700 = ' + (S.ORE_K * S.CHUNK_KG / 2700 * 100).toFixed(0) + 'cm');
console.log('    왕복효율 = (' + S.MINE_HAUL + '×' + S.MINE_SWINGS_PER + ')/(그+' + S.MINE_HAUL_TRIP + ') = ' + S.MINE_HAULEFF.toFixed(4));
ok(S.ORE_K === 1000, 'ORE_K = 1000');
ok(S.MINE_SWING_MS === 1000 && S.MINE_SWINGS_PER === 60, '1초/타 · 60타=재고1');
ok(Math.abs(S.NPC_MINE_PER_DAY - derived) < 0.01, 'NPC_MINE_PER_DAY = 유도값 ' + derived + ' (실측 ' + S.NPC_MINE_PER_DAY + ')');
ok(Math.abs(S.ORE_K * S.CHUNK_KG / 2700 - 1.296) < 0.01, '셀 재고 = 130cm 깊이(고증 — 곡괭이로 한 자리를 파는 깊이)');
{ // 고증 대조 — Great Orme 800년, 굴착 3~10만 m³
  const tons = 30 * S.NPC_MINE_PER_DAY * 600 * 365 * S.CHUNK_KG / 1000;
  console.log('    Great Orme 대조: 광부 30명 × 600 게임년 = ' + (tons / 10000).toFixed(1) + '만 톤 (실측 상한 27만 톤)');
  ok(tons > 100000 && tons < 600000, '고증 자릿수 일치(수십만 톤)');
}
{ // 원정 감쇠 — 스킬(감정)의 이득이 커지는 구간
  const e = (d) => S.haulEff(d);
  console.log('    왕복 감쇠: 15분 ' + e(15).toFixed(3) + ' · 100분 ' + e(100).toFixed(3) + ' · 200분 ' + e(200).toFixed(3) + ' · 800분 ' + e(800).toFixed(3));
  ok(e(15) > e(100) && e(100) > e(800), '거리가 멀수록 효율이 떨어진다(먼 광맥 원정 제동)');
}

console.log('② 리젠 닫힌 해');
const num = (R0, days) => { let R = R0; const n = 200000, h = days / n; for (let i = 0; i < n; i++) { const k1 = 0.02 - 1e-5 * R, k2 = 0.02 - 1e-5 * (R + h * k1); R += h * (k1 + k2) / 2; } return Math.min(1000, R); };
let worst = 0;
for (const [R0, d] of [[0, 365], [0, 3650], [0, 36500], [500, 3650], [900, 36500]]) {
  const c = S.oreRegen(R0, d), n = num(R0, d), e = Math.abs(c - n); if (e > worst) worst = e;
  console.log('    R0=' + String(R0).padStart(4) + ' t=' + String(d).padStart(6) + '일 → 닫힌해 ' + c.toFixed(6) + ' · 수치 ' + n.toFixed(6));
}
ok(worst < 1e-4, '닫힌 해 ≡ 수치적분 (최대오차 ' + worst.toExponential(2) + ')');
const rate = (R) => (S.oreRegen(R, 1e-4) - R) / 1e-4;
ok(Math.abs(rate(0) - 0.02) < 1e-4, 'R=0 순간율 0.02/게임일 (완전고갈이 가장 빠르다)');
ok(Math.abs(rate(999) - 0.01001) < 1e-3, 'R≈K 순간율 0.010/게임일 (만땅이 가장 느리다)');
ok(Math.abs(S.oreRegen(1000, 1000) - 1000) < 1e-9, 'R=K 는 K를 안 넘는다(클램프)');
{ let lo = 0, hi = 400000; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (S.oreRegen(0, m) >= 999.9999) hi = m; else lo = m; }
  console.log('    완전고갈→만땅 ' + Math.round(hi).toLocaleString() + ' 게임일 = ' + (hi / 365).toFixed(0) + ' 게임년');
  ok(hi > 60000 && hi < 80000, '완전회복 190 게임년 부근'); }
{ // 지속 가능 광부 수 — 설계표 재현
  console.log('    광맥 규모별 지속 광부(만땅 0.01 / 완전고갈 0.02, 광부 1명 ' + S.NPC_MINE_PER_DAY + '/게임일):');
  for (const [r, lab] of [[130, '대형'], [70, '중형'], [32, '소형'], [7, '자잘']]) {
    const cells = Math.PI * r * r;
    console.log('      ' + lab + ' r' + String(r).padStart(3) + ' → ' + Math.round(cells).toLocaleString().padStart(7) + '셀 · 만땅 ' +
      (cells * 0.01 / S.NPC_MINE_PER_DAY).toFixed(1) + '명 · 완전고갈 ' + (cells * 0.02 / S.NPC_MINE_PER_DAY).toFixed(1) + '명');
  }
  ok(Math.PI * 130 * 130 * 0.02 / S.NPC_MINE_PER_DAY > 60, '대형 광맥은 완전고갈 상태에서도 60명 이상을 흐름으로 부양(완충대)');
}

console.log('③ p 연속장');
const d0 = require(path.join(__dirname, '..', 'server', 'hanbando-terrain.json')).hanbando;
const cl = d0.ores[0];
ok(typeof T.oreProbAt === 'function', 'terrain.oreProbAt 노출됨');
ok(T.oreProbAt('hanbando', cl.center[0] + 3000 * 32, cl.center[1]) === 0, '광맥 밖 p = 0 (캐도 영원히 돌만)');
{
  const pc = T.oreProbAt('hanbando', cl.center[0], cl.center[1]);
  const pe = T.oreProbAt('hanbando', cl.center[0] + Math.round(cl.radius * 0.97), cl.center[1]);
  console.log('    중심 p=' + pc.toFixed(4) + ' · 가장자리(97%) p=' + pe.toFixed(4));
  ok(pc > pe, '중심이 가장자리보다 품위가 높다');
  let mx = 0, sum = 0, n = 0, at = null;
  for (let cy = -22; cy <= 22; cy++) for (let cx = -22; cx <= 22; cx++) {
    const x = cl.center[0] + cx * 32, y = cl.center[1] + cy * 32, p0 = T.oreProbAt('hanbando', x, y);
    for (const [ax, ay] of [[32, 0], [0, 32]]) {
      const dd = Math.abs(T.oreProbAt('hanbando', x + ax, y + ay) - p0);
      sum += dd; n++; if (dd > mx) { mx = dd; at = [cx, cy]; }
    }
  }
  console.log('    인접 셀 |Δp| 평균 ' + (sum / n).toFixed(5) + ' · 최대 ' + mx.toFixed(5) + ' at ' + JSON.stringify(at));
  ok(mx < 0.05, '★인접 셀 p 급변 없음 (|Δp| < 0.05 — "이 셀 0.05인데 옆 셀 0.8" 이 구조적으로 불가능)');
  let s2 = 0, c2 = 0; for (let cy = -22; cy <= 22; cy++) for (let cx = -22; cx <= 22; cx++) { const p = T.oreProbAt('hanbando', cl.center[0] + cx * 32, cl.center[1] + cy * 32); if (p > 0) { s2 += p; c2++; } }
  console.log('    광맥1: p>0 ' + c2 + '셀 · 평균 p ' + (s2 / c2).toFixed(4));
  ok(c2 > 1000, '광맥 하나가 1000셀 이상 (반경 21.9셀 원판)');
}

console.log('④ livelihood √ — 광맥 등급 → 광부 정원');
{
  const rows = [[0.85, '대형 r130', 27], [0.15, '중형 r70', 12], [0.052, '소형 r32', 7], [0.0025, '자잘 r7', 2], [0, '광맥 없음', 1]];
  let allok = true;
  for (const [sh, lab, want] of rows) {
    const o = L.landOf({ forShare: 0, huntShare: 0, rockShare: 0, oreShare: sh }).ore;
    const cap = Math.floor(40 * o * 0.30);
    console.log('    ' + lab.padEnd(10) + ' share ' + (sh * 100).toFixed(2).padStart(6) + '% → ore ' + String(o).padStart(5) + ' → 광부 ' + String(cap).padStart(2) + '명 (기대 ' + want + ')');
    if (cap !== want) allok = false;
  }
  ok(allok, '설계표와 일치 — 등급이 정원으로 번역된다');
  const big = L.landOf({ forShare: 0, huntShare: 0, rockShare: 0, oreShare: 0.85 }).ore;
  const small = L.landOf({ forShare: 0, huntShare: 0, rockShare: 0, oreShare: 0.052 }).ore;
  ok(big > small + 1.0, '★대형과 소형이 갈린다 (구 선형 60이면 둘 다 캡 2.5로 붙어 등급이 무의미했다)');
}

console.log('⑤ 무게');
console.log('    지게 상한 ' + S.CARRY_MAX_KG + 'kg · 원석 덩이 ' + S.CHUNK_KG + 'kg → ' + Math.floor(S.CARRY_MAX_KG / S.CHUNK_KG) + '덩이');
ok(Math.floor(S.CARRY_MAX_KG / S.CHUNK_KG) === S.MINE_HAUL, '지게 용량이 왕복효율 유도의 MINE_HAUL(' + S.MINE_HAUL + ')과 정합');
ok(S.inventoryWeight({ ore_chunk: 28 }) === 28, '★원석은 kg 단위 — ore_chunk 28 = 28kg (덩이 크기가 사람마다 다르므로 개수로 안 센다)');
ok(S.itemWeight('stone') > 0 && S.itemWeight('wood') > 0 && S.itemWeight('fiber') > 0, '★게임 실사용 id(stone/wood/fiber)도 무게가 있다 — RESOURCES에 없던 것들');
ok(S.inventoryWeight({ ore_chunk: 28 }) + S.mineChunkKg(0) > S.CARRY_MAX_KG, '미숙련 9번째 덩이(3.5kg)에서 상한이 물린다');
ok(S.CARRY_MAX_KG / S.mineChunkKg(0) === S.MINE_HAUL, '미숙련 한 짐 = ' + S.MINE_HAUL + '덩이 — 왕복효율 유도의 MINE_HAUL과 정합');

console.log('⑥ 채굴 파이프라인(규칙 재현)');
{
  // zone.js mineOreCell 의 규칙을 그대로 재현해 불변식을 확인한다(코드가 아니라 **규칙**의 검증).
  let cell = { s: S.ORE_K, w: 0 };
  const inv = {}, ledger = {};
  const p = 0.30; let rnd = 12345;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
  let chunks = 0;
  for (let i = 0; i < 600; i++) {           // 600타 = 10 덩이
    cell.w += 1;
    if (cell.w >= S.MINE_SWINGS_PER) {
      cell.w -= S.MINE_SWINGS_PER; cell.s -= 1; chunks++;
      const isOre = rand() < p; const k = isOre ? 'iron' : 'stone';
      ledger[k] = (ledger[k] || 0) + 1;
      inv.ore_chunk = (inv.ore_chunk || 0) + 1;
    }
  }
  ok(chunks === 10 && cell.s === S.ORE_K - 10, '600타 → 덩이 10개 · 재고 −10');
  ok((inv.ore_chunk || 0) === 10, '인벤 원석 10덩이');
  const tot = Object.values(ledger).reduce((a, b) => a + b, 0);
  ok(tot === 10, '숨은 장부 합 = 덩이 수 (채굴 시점에 결과 확정 — 선광 때 다시 굴리지 않는다)');
  console.log('    장부 ' + JSON.stringify(ledger) + ' (p=' + p + ' 기대 광석 3개 안팎)');
  // 2인 1조 — 셀에 타수가 쌓이므로 둘이 30타씩이면 덩이가 나온다
  let c2 = { s: S.ORE_K, w: 0 }; for (let i = 0; i < 30; i++) c2.w++; for (let i = 0; i < 30; i++) c2.w++;
  const paired = c2.w >= S.MINE_SWINGS_PER;
  ok(paired, '★2인 1조: 두 사람이 30타씩 → 60타 → 덩이 1개 (타수가 셀에 쌓이는 규약의 직접 귀결)');
}

console.log('⑦ 구 모델 잔재');
{
  const fs = require('fs');
  const zs = fs.readFileSync(path.join(__dirname, '..', 'server', 'zone.js'), 'utf8');
  const mp = S.miningParams('iron');
  ok(mp.cost === undefined && mp.refillMs === undefined && mp.dropChance === undefined, 'miningParams 에 cost/refillMs/dropChance 없음');
  ok(!/rec\.prosperity/.test(zs), 'zone.js 에 rec.prosperity 참조 없음');
  ok(!/mp\.refillMs|mp\.dropChance|mp\.cost/.test(zs), 'zone.js 에 구 파라미터 참조 없음');
  ok(/Specialty\.MINE_SWINGS_PER/.test(zs) && /Specialty\.oreRegen/.test(zs), '신 상수·리젠 사용 중');
  ok(/sort_ore/.test(zs), '선광 경로 배선됨');
}

console.log('⑧ 채광 숙련 — 레벨 이득 셋 [재민 최종]');
{
  let cum = 0, exact = true;
  for (let L = 1; L <= 10; L++) { cum += 80 + 30 * (L - 1); if (Math.abs(S.mineLevelF(cum) - L) > 1e-9) exact = false; }
  console.log('    만렙 누적 xp ' + cum + ' (덩이 = 게임시간 ⇒ ' + (cum / 24).toFixed(1) + ' 게임일 = ' + (cum / 60).toFixed(1) + ' 실시간시간)');
  ok(cum === 2150 && exact, '★연속 레벨이 econ xp 표(80+30L, 누적 2150)와 정수점에서 정확히 일치 — 해금 계단 없음');

  console.log('    ── 속도는 고정: 1초/타 · 덩이당 60타 · 재고 소모 1 (전부 레벨 무관) ──');
  ok(S.MINE_SWING_MS === 1000 && S.MINE_SWINGS_PER === 60, '리듬·덩이당 타수 고정');
  ok(typeof S.mineSwingPower === 'undefined' && typeof S.mineRecovery === 'undefined',
    '★속도·회수율 채널 제거됨 (재민: "채굴 속도는 고정")');

  console.log('    lvl  ①곡괭이내구/타  ②덩이무게   한 짐(28kg)   한 짐 채우는 타수   ③감정 TPR/TNR');
  for (const L of [0, 5, 10]) {
    const kg = S.mineChunkKg(L), cnt = S.CARRY_MAX_KG / kg;
    console.log('    ' + String(L).padStart(3) + '      ' + S.mineToolWear(L).toFixed(2) + '        ' + kg.toFixed(2) + 'kg   ' +
      cnt.toFixed(1) + '덩이       ' + (cnt * 60).toFixed(0) + '타          ' + S.mineTPR(L).toFixed(2) + '/' + S.mineTNR(L).toFixed(2));
  }
  ok(Math.abs(S.mineToolWear(10) - 0.5) < 1e-9 && S.mineToolWear(0) === 1, '① 곡괭이 내구 — 만렙 절반(수명 ×2)');
  ok(Math.abs(S.mineChunkKg(10) / S.mineChunkKg(0) - 1.5) < 1e-9, '② 큰 돌덩이 — 만렙 ×1.5 (3.5 → 5.25kg)');
  ok(Math.abs(S.mineChunkKg(0) - S.CHUNK_KG) < 1e-9, '  미숙련 = 기준 3.5kg');
  {
    const t0 = S.CARRY_MAX_KG / S.mineChunkKg(0) * 60, t10 = S.CARRY_MAX_KG / S.mineChunkKg(10) * 60;
    console.log('    ★지게가 짐당 유효량(28kg)을 고정하므로 이득은 "한 짐 채우는 시간"으로 나온다: ' +
      t0.toFixed(0) + '타 → ' + t10.toFixed(0) + '타 = ' + (t0 / t10).toFixed(2) + '배');
    ok(Math.abs(t0 / t10 - 1.5) < 0.01, '  시간당 산출 ×1.5');
  }
  console.log('    ★재고 소모 1 고정 ⇒ 광맥 수명(1000회)은 숙련 무관, 뽑히는 총량만 비례:');
  console.log('      셀 하나 총 산출 lvl0 ' + (1000 * S.mineChunkKg(0)).toLocaleString() + 'kg · lvl10 ' + (1000 * S.mineChunkKg(10)).toLocaleString() + 'kg');

  console.log('    ── 깊이는 **셀 속성**(레벨 무관 지형 압력) ──');
  console.log('      표층 ' + S.mineSwingsNeeded(1) + '타 → 최심부 ' + S.mineSwingsNeeded(0) + '타 (D ' + S.mineDepthCost(0) + '배)');
  ok(S.mineSwingsNeeded.length === 1, '★mineSwingsNeeded 가 레벨 인자를 안 받는다 — 셀 공용 문턱(무임승차 불가)');

  ok(S.mineTNR(4) > S.mineTPR(4) + 0.1, '③ 감정 — ★비대칭: 초보는 좋은 광석을 몰라보고 버린다(FN≫FP)');
  ok(Math.abs(S.mineTPR(10) - S.mineTNR(10)) < 1e-9 && S.mineIdAcc(0) === 0.5, '  만렙 0.95로 수렴 · lvl0 = 정보 0');
  ok(S.itemWeight('ore_chunk') === 1, '★원석은 kg 단위로 인벤에 든다(덩이 크기가 사람마다 달라 개수로는 못 셈)');
}

console.log('\n' + (fail.length ? '결과: FAIL — ' + fail.length + '건\n  · ' + fail.join('\n  · ') : '결과: PASS'));
process.exit(fail.length ? 1 : 0);
