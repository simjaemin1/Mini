#!/usr/bin/env node
// === scripts/test-assay.js — 감정(鑑定) 몬테카를로 하네스 ====================
//
// ★[재민 확정] 감정은 **연속**이고 **확률적**이다. 그래서 "코드가 있다"로는 아무것도 보장 못 한다 —
//   분포를 재야 한다. 이 하네스가 재는 것:
//     ① 표 ≡ 실측: MINE_TYPE_ACC 표의 종류 적중률이 실제 뽑기에서 그대로 나오는가
//     ② 비대칭 채널: 초보는 좋은 광석을 몰라보고 버린다(FN ≫ FP) — 레벨별 TPR/TNR 실측
//     ③ ★★FP 누설 0: **맥석 오판 문구에 광맥의 진짜 광종이 등장하지 않는가**
//        (2026-08-01 에 고친 결함의 재발 방지 — 맥석이 광맥 정체를 누설하면 감정 축이 통째로 무너진다)
//     ④ 문구 단조성: 레벨이 오를수록 단정적이 되고, 오인 문구가 줄어드는가
//     ⑤ 오인 분포 = ORE_CONFUSE 혼동 행렬(바보의 금: 황철석↔금)
//
// ★서버 경로까지 함께 잰다 — `_mineIdentify` 는 zone.js 안에 있어 순수 모듈 검증이 못 닿는다.
//   ③(누설)은 **서버 문구 생성기**를 실제로 돌려야 의미가 있으므로 zone.js 를 임시로 띄운다.
//
// 실행: node scripts/test-assay.js
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'server', 'specialty'));

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const say = (...a) => console.log(...a);
const N = 20000;   // 레벨·광종당 표본

say('=== 감정 몬테카를로 (레벨 0~10 × 광종) ===');

const MINERALS = ['iron', 'copper', 'tin', 'lead', 'silver', 'gold', 'jade_raw', 'obsidian'];
const LVLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ══ ① 표 ≡ 실측 — 종류 적중률 ═══════════════════════════════════════════════
say('\n[① MINE_TYPE_ACC 표 ≡ 실측 종류 적중률]');
{
  say('   레벨   표     실측(광종 평균)   차');
  for (const L of LVLS) {
    const want = S.mineTypeAcc(L);
    let hit = 0, tot = 0;
    for (const m of MINERALS) {
      for (let i = 0; i < N / MINERALS.length; i++) {
        const g = S.mineTypeGuess(m, true, L, Math.random);
        tot++; if (g === m) hit++;
      }
    }
    const obs = hit / tot;
    // 혼동 행렬이 진짜 광종을 다시 뽑을 수 있으므로 실측 ≥ 표 이다(등호가 아니라 하한).
    const sd = Math.sqrt(Math.max(1e-9, want * (1 - want) / tot));
    say(`   ${String(L).padStart(3)}  ${want.toFixed(3)}      ${obs.toFixed(3)}       ${(obs - want >= 0 ? '+' : '')}${(obs - want).toFixed(3)}`);
    ok(obs >= want - 4 * sd - 0.005, `  lvl${L}: 실측 ${obs.toFixed(3)} ≥ 표 ${want.toFixed(3)} (혼동 행렬이 정답을 다시 뽑는 몫만큼만 높다)`);
    ok(obs <= want + 0.25, `  lvl${L}: 실측이 표보다 과도하게 높지 않다(혼동 행렬이 사실상 정답표가 아니다)`);
  }
  ok(S.mineTypeAcc(0) === 0, 'lvl0 = 종류 정보 0');
  for (let i = 1; i <= 10; i++) ok(S.mineTypeAcc(i) > S.mineTypeAcc(i - 1), `  단조 증가 lvl${i}`);
}

// ══ ② 비대칭 채널 — FN ≫ FP ════════════════════════════════════════════════
say('\n[② 비대칭 — 초보는 좋은 광석을 몰라보고 버린다(FN ≫ FP)]');
{
  say('   레벨   TPR(광석을 광석이라)  TNR(맥석을 맥석이라)   FN율   FP율');
  for (const L of [0, 2, 5, 8, 10]) {
    const tpr = S.mineTPR(L), tnr = S.mineTNR(L);
    say(`   ${String(L).padStart(3)}        ${tpr.toFixed(3)}              ${tnr.toFixed(3)}        ${(1 - tpr).toFixed(3)}  ${(1 - tnr).toFixed(3)}`);
  }
  for (const L of [1, 2, 3, 4, 5, 6, 7, 8]) ok(S.mineTNR(L) > S.mineTPR(L), `  lvl${L}: TNR > TPR (놓치는 쪽이 많다)`);
  ok(Math.abs(S.mineTPR(10) - S.mineTNR(10)) < 1e-9, 'lvl10 에서 두 채널이 만난다(0.95)');
  ok(Math.abs(S.mineTPR(0) - 0.5) < 1e-9 && Math.abs(S.mineTNR(0) - 0.5) < 1e-9, 'lvl0 = 동전던지기 = 정보 0');
}

// ══ ③ ★★FP 누설 0 — 맥석 문구가 광맥 정체를 말하지 않는다 ══════════════════
say('\n[③ ★FP 누설 — 맥석 오판 문구에 광맥의 진짜 광종이 나오는가]');
{
  // (a) 순수 모듈 층: mineTypeGuess(_, isOre=false, …) 는 진짜 광종과 **무관**해야 한다.
  //     같은 레벨에서 광종만 바꿔 가며 분포가 같은지 본다(누설이 있으면 분포가 광종을 따라간다).
  const dist = {};
  for (const m of MINERALS) {
    const d = {};
    for (let i = 0; i < N; i++) { const g = S.mineTypeGuess(m, false, 10, Math.random); d[g] = (d[g] || 0) + 1; }
    dist[m] = d;
  }
  // 각 광종의 FP 분포가 서로 통계적으로 같은가 — 진짜 광종의 몫이 다른 것들과 다르지 않아야 한다
  let worst = 0, worstMsg = '';
  const keys = new Set(); for (const m of MINERALS) for (const k in dist[m]) keys.add(k);
  for (const k of keys) {
    const shares = MINERALS.map((m) => (dist[m][k] || 0) / N);
    const mu = shares.reduce((a, b) => a + b, 0) / shares.length;
    const sd = Math.sqrt(Math.max(1e-12, mu * (1 - mu) / N));
    for (let i = 0; i < MINERALS.length; i++) {
      const z = Math.abs(shares[i] - mu) / sd;
      if (z > worst) { worst = z; worstMsg = `${k} @ 진짜=${MINERALS[i]} (${(shares[i] * 100).toFixed(2)}% vs 평균 ${(mu * 100).toFixed(2)}%)`; }
    }
  }
  ok(worst < 5, `FP 분포가 진짜 광종과 무관 — 최대 z=${worst.toFixed(2)} (${worstMsg})`);
  // (b) ★자기 자신 누설: 진짜 광종이 FP 문구에 **더 자주** 나오지 않는가
  for (const m of MINERALS) {
    const self = (dist[m][m] || 0) / N;
    const others = MINERALS.filter((x) => x !== m).reduce((a, x) => a + (dist[x][m] || 0) / N, 0) / (MINERALS.length - 1);
    const sd = Math.sqrt(Math.max(1e-12, Math.max(self, others, 1 / N) * (1 - others) / N));
    ok(self - others < 5 * sd, `  ${m}: 자기 광맥에서 자기 이름이 더 안 나온다 (${(self * 100).toFixed(2)}% vs 남의 광맥 ${(others * 100).toFixed(2)}%)`);
  }
  // (c) 서버 층: 실제 **문구 문자열**에 진짜 광종명이 남보다 더 자주 나오는가.
  //   ⚠"한 번이라도 나오면 누설"은 틀린 기준이다 — lvl6 문구는 "A 아니면 B"라 추측의 혼동
  //     상대까지 말하고, 그게 우연히 진짜와 같을 수 있다. 그건 추측에서 파생된 것이지 진실에서
  //     온 게 아니다. 옳은 기준은 **자기 이름 등장률 ≈ 남의 이름 등장률**이다.
  //     (첫 판에서 이 기준을 틀리게 잡아 1,569건을 '누설'이라 셌다. 하네스가 틀리면 조용히
  //      통과하는 게 아니라 **없는 결함을 보고한다** — 기준을 먼저 검증해야 한다.)
  //   ⚠비교는 **같은 낱말끼리** 해야 한다. 광종 이름끼리 견주면 낱말마다 기저 등장률이 달라
  //     엉뚱한 결론이 난다 — 은(銀)의 '은'은 한 글자라 조사('돌은')에도 걸려 기저가 40%다.
  //     (두 번째 판에서 이 함정에 빠져 은만 z=29.9 로 '누설' 판정이 났다. 낱말 기저를 통제한다.)
  //     옳은 통계: 낱말 w 의 등장률을 **진짜=w 일 때 vs 진짜≠w 일 때**로 나눠 비교한다.
  const koOf = (m) => (S.RESOURCES[m] || {}).ko || m;
  const M = 5000;
  const rate = {};   // rate[진짜][낱말] = 등장률
  for (const m of MINERALS) {
    const cnt = Object.fromEntries(MINERALS.map((x) => [x, 0]));
    let phrases = 0;
    for (const L of LVLS) {
      for (let i = 0; i < M / LVLS.length; i++) {
        const g = S.mineTypeGuess(m, false, L, Math.random);   // isOre=false → FP 채널
        const p = S.mineIdPhrase(L, true, g, koOf);
        if (!p) continue;
        phrases++;
        for (const x of MINERALS) if (p.includes(koOf(x))) cnt[x]++;
      }
    }
    rate[m] = Object.fromEntries(MINERALS.map((x) => [x, cnt[x] / phrases]));
    rate[m]._n = phrases;
  }
  for (const w of MINERALS) {
    const self = rate[w][w];
    const others = MINERALS.filter((m) => m !== w).map((m) => rate[m][w]);
    const mu = others.reduce((a, b) => a + b, 0) / others.length;
    const n = rate[w]._n;
    const sd = Math.sqrt(Math.max(1e-12, Math.max(mu, 1 / n) * (1 - mu) / n));
    ok(self - mu < 5 * sd,
      `  문구 낱말 "${koOf(w)}": 진짜=${w} 일 때 ${(self * 100).toFixed(1)}% vs 아닐 때 ${(mu * 100).toFixed(1)}% (z=${((self - mu) / sd).toFixed(2)})`);
  }
}

// ══ ④ 문구 단조성 ══════════════════════════════════════════════════════════
say('\n[④ 문구 — 레벨이 오를수록 단정적이 된다]');
{
  const koOf = (m) => (S.RESOURCES[m] || {}).ko || m;
  for (const L of LVLS) {
    const p = S.mineIdPhrase(L, true, 'gold', koOf);
    const q = S.mineIdPhrase(L, false, null, koOf);
    say(`   lvl${String(L).padStart(2)}  광석: ${String(p || '(문구 없음)').padEnd(22)}  맥석: ${q || '(문구 없음)'}`);
  }
  ok(S.mineIdPhrase(0, true, 'gold', koOf) === null && S.mineIdPhrase(1, true, 'gold', koOf) === null,
    'lvl0~1 은 아무 말도 안 한다(아직 못 본다)');
  ok(/같기도/.test(S.mineIdPhrase(2, true, 'gold', koOf) || ''), 'lvl2 는 유보적("~같기도")');
  // ★[2026-08-02d] 기준을 어미('~이다')에서 **단정성**으로 바꿨다. `_ida` 직결이 '구리'에서
  //   "구리다"(냄새가 고약하다)를 만들어 문구를 '틀림없는 X' 로 교체했기 때문이다 — 어미를 못박으면
  //   하네스가 **표현을 고정**하지 유보/단정의 구분을 지키지 못한다. 검사할 것은 "유보어가 없는가"다.
  {
    const p10 = S.mineIdPhrase(10, true, 'gold', koOf) || '';
    ok(/틀림없|이다$|다$/.test(p10) && !/같|듯|성싶|보인다|…/.test(p10), `lvl10 은 단정 — "${p10}"`);
    // 전 광종 전수: 단정 문구가 어색하거나 뜻이 겹치는 낱말을 만들지 않는가(구리 → "구리다" 회귀 가드)
    const weird = ['iron', 'copper', 'gold', 'silver', 'tin', 'lead', 'jade_raw', 'obsidian']
      .map((m) => S.mineIdPhrase(10, true, m, koOf)).filter((s) => /^구리다$|^쓰다$|^질기다$/.test(String(s)));
    ok(weird.length === 0, `단정 문구가 다른 뜻의 낱말이 되지 않는다 ${weird.length ? '— ' + weird.join(',') : ''}`);
  }
  ok(!/금/.test(S.mineIdPhrase(4, true, 'gold', koOf) || ''), 'lvl4 이하는 종 이름을 말하지 않는다(가족·인상만)');
}

// ══ ⑤ 오인 분포 = 혼동 행렬 (바보의 금) ════════════════════════════════════
say('\n[⑤ 오인 분포 — 겉모습 혼동(바보의 금 등)]');
{
  for (const m of ['gold', 'iron', 'lead', 'copper']) {
    const c = S.ORE_CONFUSE[m];
    if (!c) continue;
    const d = {};
    for (let i = 0; i < N; i++) { const g = S.mineTypeGuess(m, true, 3, Math.random); if (g !== m) d[g] = (d[g] || 0) + 1; }
    const tot = Object.values(d).reduce((a, b) => a + b, 0) || 1;
    const obs = Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / tot * 100).toFixed(0)}%`).join(' · ');
    const wantTot = Object.values(c).reduce((a, b) => a + b, 0);
    const want = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / wantTot * 100).toFixed(0)}%`).join(' · ');
    say(`   ${m.padEnd(9)} 실측 ${obs}`);
    say(`   ${''.padEnd(9)} 표기 ${want}`);
    // 표에 없는 광종이 튀어나오지 않는가
    const stray = Object.keys(d).filter((k) => !(k in c));
    ok(stray.length === 0, `  ${m}: 혼동 행렬 밖 오인 0 ${stray.length ? '(' + stray.join(',') + ')' : ''}`);
    // 최빈 오인이 표의 최빈과 같은가 — ★표에 동률이 있으면(iron: gold 2 · tin 2) 어느 쪽이 나와도 맞다
    const top = Object.entries(d).sort((a, b) => b[1] - a[1])[0];
    const maxW = Math.max(...Object.values(c));
    const wantTops = Object.keys(c).filter((k) => c[k] === maxW);
    ok(top && wantTops.includes(top[0]), `  ${m}: 최빈 오인 ∈ {${wantTops.join(',')}} (실측 ${top ? top[0] : '—'})`);
  }
  ok(S.ORE_CONFUSE.gold && S.ORE_CONFUSE.gold.iron > 0, '★바보의 금 — 금을 철(황철석)로 오인하는 길이 실재');
}

say(`\n=== 감정 하네스: ${fail ? '실패 ' + fail + '건 ❌' : 'PASS ✅'} ===`);
process.exit(fail ? 1 : 0);
