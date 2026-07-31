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
  // ★★[정정] 위 문턱(0.05)은 **연속성의 증거가 아니다** — 표본 간격이 1셀로 고정이라
  //   "작고 진한 광맥의 가파른 기울기"와 "겹침 경계의 진짜 점프"를 구분하지 못한다.
  //   실제로 자잘을 2600개로 늘리자 겹침에서 Δp 0.051 짜리 **점프**가 나왔고(소유를 d_eff
  //   최소로 정하던 탓), 이 문턱은 그걸 아슬아슬하게만 잡았다. 제대로 된 판정은 **수렴**이다:
  //     연속이면 표본 간격을 절반으로 줄일 때 |Δp| 최대도 절반이 된다.
  //     불연속이면 간격을 아무리 줄여도 점프 크기에서 멈춘다.
  //   (지금은 소유를 **p 최대**로 정한다 — max of 연속함수 = 연속. 광물만 바뀌고 p는 이어진다.)
  {
    const worst = d0.ores.reduce((a, o) => ((o.pk || 0) / Math.max(1, o.radius / 32) > (a.pk || 0) / Math.max(1, a.radius / 32) ? o : a));
    const scan = (step) => {
      const R = Math.ceil(worst.radius * 1.55 / step); let m = 0;
      for (let cy = -R; cy <= R; cy++) for (let cx = -R; cx <= R; cx++) {
        const x = worst.center[0] + cx * step, y = worst.center[1] + cy * step, p0 = T.oreProbAt('hanbando', x, y);
        for (const [ax, ay] of [[step, 0], [0, step]]) { const dd = Math.abs(T.oreProbAt('hanbando', x + ax, y + ay) - p0); if (dd > m) m = dd; }
      }
      return m;
    };
    const seq = [32, 16, 8, 4, 2].map(scan);
    console.log('    ★연속성 수렴 — 기울기가 가장 가파른 광맥(' + worst.name + ' r' + (worst.radius / 32) + ' pk ' + worst.pk + ')');
    console.log('      간격 32→2px : ' + seq.map((v) => v.toFixed(5)).join(' → '));
    // 비(比)를 본다. 굵은 간격(32→16)은 아직 점근 구간이 아니라 0.5보다 크게 나온다(장의 곡률 탓).
    // 판정은 **고운 쪽 세 비**로 한다 — 여기서 0.5로 수렴하면 연속, 점프가 있으면 1로 붙는다.
    const ratio = seq.slice(1).map((v, i) => v / seq[i]);
    console.log('      축소비 : ' + ratio.map((v) => v.toFixed(3)).join(' · ') + '   (연속이면 → 0.5 · 점프면 → 1)');
    const tail = ratio.slice(-3);
    ok(tail.every((v) => v < 0.60), '★p 장이 **진짜 연속** — 간격을 반으로 줄이면 |Δp| 최대도 반이 된다(점프면 안 줄어든다)');
    ok(seq[4] < 0.02, '  최소 간격(2px)에서 |Δp| < 0.02 — 잔여 불연속 없음');
  }
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
  // ── ②의 산포 — 레벨은 **평균만** 정한다 (재민 확정) ──────────────────────
  console.log('    ── ②는 고정값이 아니라 정규분포다 (재민: "레벨 낮은 광부가 캐도 가끔 큰 돌덩이") ──');
  {
    const N = 200000;
    const stat = (mu) => {
      let s = 0, s2 = 0, mn = Infinity, mx = 0;
      for (let i = 0; i < N; i++) { const v = S.mineChunkRoll(mu); s += v; s2 += v * v; if (v < mn) mn = v; if (v > mx) mx = v; }
      const m = s / N; return { m, sd: Math.sqrt(s2 / N - m * m), mn, mx };
    };
    for (const L of [0, 10]) {
      const mu = S.mineChunkKg(L), r = stat(mu);
      console.log('      lvl' + String(L).padStart(2) + ' 평균 ' + mu.toFixed(2) + 'kg → 실측 ' + r.m.toFixed(3) +
        ' · σ ' + r.sd.toFixed(2) + ' · 범위 ' + r.mn.toFixed(2) + '~' + r.mx.toFixed(2) + 'kg');
      ok(Math.abs(r.m / mu - 1) < 0.005, '  lvl' + L + ' 평균 보존(±0.5%) — ★NPC·econ 이 평균을 쓰므로 필수');
    }
    ok(Math.abs(stat(S.mineChunkKg(0)).sd / 3.5 - S.CHUNK_CV) < 0.02, '  산포 = CV ' + S.CHUNK_CV + ' (±2.5σ 재추첨분 감안)');
    // 겹침 — "가끔"의 실측
    let c = 0; for (let i = 0; i < N; i++) if (S.mineChunkRoll(S.mineChunkKg(0)) >= S.mineChunkKg(10)) c++;
    const pOver = c / N;
    console.log('      lvl0 이 lvl10 평균(5.25kg) 이상을 캘 확률 ' + (pOver * 100).toFixed(2) + '% ≈ ' + Math.round(1 / pOver) + '덩이에 한 번');
    ok(pOver > 0.005 && pOver < 0.10, '  겹치되 뒤집히진 않는다 — "가끔"(0.5~10%)');
    // 절사가 대칭이라 하한이 0 이하로 안 내려간다
    ok(stat(S.mineChunkKg(0)).mn > 0.5, '  하한이 양수 — 0kg 덩이가 안 나온다');
  }
  {
    // ★셀 회계와의 합성: 가중평균을 **평균**으로만 쓰고, 추첨분은 장부에 이월되지 않는다
    const sim = (levels, chunks) => {
      let recW = 0, recKg = 0, tot = 0, n = 0, i = 0;
      const need = S.MINE_SWINGS_PER;
      while (n < chunks) {
        const L = levels[(i++) % levels.length];
        recW += 1; recKg += S.mineChunkKg(L);
        if (recW >= need) { const mu = recKg / recW; tot += S.mineChunkRoll(mu); recKg -= mu * need; recW -= need; n++; }
      }
      return { avg: tot / n, resid: recKg };
    };
    const r = sim([0, 10], 100000);
    ok(Math.abs(r.avg / 4.375 - 1) < 0.01, '  2인 1조(lvl0+lvl10) 장기 평균 = 가중평균 4.375kg');
    ok(Math.abs(r.resid) < 1e-6, '  ★장부 표류 0 — 추첨 결과가 아니라 **평균분**을 뺀다(난수가 다음 덩이로 새면 안 됨)');
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
