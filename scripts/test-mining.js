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
  // ★문턱을 0.05 → 0.20 으로 올렸다. 얼룩 이득을 2.84배로 키운 뒤(재민: "광맥 내에서도 표준편차가
  //   컸으면") 한 셀 걸음의 변화가 커진 건 **의도한 것**이다. 여기서 막을 건 "이 셀 0.05인데 옆 셀 0.8"
  //   같은 **뒤집힘**이지 가파름이 아니다. 진짜 연속성 판정은 바로 아래 수렴 검사가 한다.
  ok(mx < 0.20, '인접 셀에서 품위가 뒤집히진 않는다 (|Δp| < 0.20)');
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
    ok(seq[4] < 0.08, '  최소 간격(2px)에서 |Δp| < 0.08 — 잔여 불연속 없음(0.5로 수렴하므로 간격을 더 줄이면 계속 준다)');
  }
  // ★★[재민 확정 (다)] 겹친 광맥의 p 는 **합성**이다: 1 − ∏(1−p_i)
  {
    // 겹치는 자리를 찾아 max 규칙 대비 얼마나 진해지는지 + 상한을 안 넘는지
    let n = 0, sMax = 0, sCmp = 0, mx = 0, over = 0, bad = 0;
    for (const o of d0.ores) {
      for (let i = 0; i < 24; i++) {
        const a = i * 0.618 * 6.2832, r = (i % 7) / 7 * o.radius * 0.7;
        const x = o.center[0] + r * Math.cos(a), y = o.center[1] + r * Math.sin(a);
        const c = T.oreCandidatesAt("hanbando", x, y); if (!c.length) continue;
        let miss = 1, best = 0; for (const e of c) { miss *= (1 - e.p); if (e.p > best) best = e.p; }
        const cmp = 1 - miss, real = T.oreProbAt("hanbando", x, y);
        if (Math.abs(real - cmp) > 1e-9) bad++;
        n++; sMax += best; sCmp += cmp; if (cmp > mx) mx = cmp; if (c.length > 1) over++;
      }
    }
    console.log("    ★p 합성 — 표본 " + n.toLocaleString() + " (겹친 자리 " + (over / n * 100).toFixed(1) + "%)");
    console.log("      평균 p  max 규칙 " + (sMax / n).toFixed(4) + " → 합성 " + (sCmp / n).toFixed(4) +
      " (+" + ((sCmp / sMax - 1) * 100).toFixed(1) + "%) · 최대 " + mx.toFixed(4));
    ok(bad === 0, "★oreProbAt 이 1−∏(1−p_i) 와 정확히 일치 (합성이 실제로 배선됨)");
    ok(mx < 1, "  합성 p 가 1을 안 넘는다 — 곱 형태라 클램프 없이 구조적으로 보장");
    ok(sCmp >= sMax, "  합성은 max 이상 (겹침이 손해가 아니라 이득)");
  }
  {
    // 겹쳐서 **소유 셀 0** 이던 광맥이 광물 추첨에 참여하는가(유령 부활)
    const ghosts = ["광맥92", "광맥101", "광맥127", "광맥190"];
    let allok = true;
    for (const nm of ghosts) {
      const o = d0.ores.find((x) => x.name === nm); if (!o) continue;
      let hit = 0, n = 0;
      for (let i = 0; i < 1500; i++) {
        const a = i * 0.618 * 6.2832, r = (i % 17) / 17 * o.radius * 0.8;
        const x = o.center[0] + r * Math.cos(a), y = o.center[1] + r * Math.sin(a);
        const c = T.oreCandidatesAt("hanbando", x, y); if (!c.some((e) => e.o.name === nm)) continue;
        n++; if (T.oreMineralAt("hanbando", x, y) === o.mineral) hit++;
      }
      if (!(n > 0 && hit / n > 0.02)) allok = false;
      console.log("      " + nm + "(" + o.mineral + ") 자기 영역에서 자기 광물 " + (n ? (hit / n * 100).toFixed(0) : "-") + "%");
    }
    ok(allok, "★큰 광맥에 먹혀 소유 셀 0 이던 광맥도 제 광물을 낸다(유령 33개 부활)");
    ok(T.oreMineralAt("hanbando", d0.ores[0].center[0] + 9e5, d0.ores[0].center[1]) === null, "  광맥 밖에선 광물 없음(null)");
  }
  let s2 = 0, c2 = 0; for (let cy = -22; cy <= 22; cy++) for (let cx = -22; cx <= 22; cx++) { const p = T.oreProbAt('hanbando', cl.center[0] + cx * 32, cl.center[1] + cy * 32); if (p > 0) { s2 += p; c2++; } }
  console.log('    광맥1: p>0 ' + c2 + '셀 · 평균 p ' + (s2 / c2).toFixed(4));
  ok(c2 > 1000, '광맥 하나가 1000셀 이상 (반경 21.9셀 원판)');
}

{
  // ★★[치명 결함 회귀 방지] 배치기(plan-ore-clusters)의 "기존 p_peak 부여" 블록이 조건 없이
  //   pk 를 **덮어썼다**. 광맥이 9개이던 시절 코드가 2661개를 돌면서, 게다가 등급 기준을
  //   r22 고정(0.30)으로 써서 --apply 할 때마다 대형(0.45)·중형(0.38)이 **강등**됐다.
  //   실측: 주석 2개를 심었을 뿐인데 기존 2598개의 pk 가 바뀌고 철 산출이 +9.7% 튀었다.
  //   ⇒ 등급이 반경과 어긋나지 않는지 여기서 지킨다(같은 광물끼리 대형이 자잘보다 진해야 한다).
  // ★★[재민 확정] "크기 무관 모든 광맥이 평균이 비슷하게 · 광맥의 평균의 표준편차가 크게"
  //   구 설계(대형 0.45 → 자잘 0.22)를 폐기했다. 기각 이유 둘:
  //     · 고증 반대 — 거대 광체는 오히려 저품위다(반암동광). 좁은 열수맥이 작고 진하다.
  //     · 이중 보상 — 광부 정원(villages.oreD)은 **면적만** 본다. 대형은 이미 넓이·수명·정원으로
  //       보상받는데 품위까지 높으면 자잘 2600개를 뿌려 놓고 "찾아봐야 제일 묽은 자리"가 된다.
  //   이제 등급기준은 하나(ORE_TIER_BASE)이고, 광맥마다의 차이는 **로그정규 지터**가 만든다.
  const byTier = { r130: [], r70: [], r22: [], minor: [] };
  for (const o of d0.ores) {
    // ★광물 가치 배율을 아예 배제한다(한 광종만 본다). 철은 이제 주요 광맥에 없으므로(플레이어 전용)
    //   주요·자잘 양쪽에 다 있는 **납**으로 본다 — 검사의 뜻(크기≠등급)은 동일하다.
    if (o.mineral !== 'lead') continue;
    const rc = Math.round(o.radius / 32);
    byTier[rc >= 100 ? 'r130' : rc >= 50 ? 'r70' : rc >= 14 ? 'r22' : 'minor'].push(o.pk);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const mBig = mean(byTier.r130.concat(byTier.r70, byTier.r22)), mMin = mean(byTier.minor);
  console.log('    납 광맥 p_peak 평균 — 대·중·소 ' + mBig.toFixed(3) + '(' +
    (byTier.r130.length + byTier.r70.length + byTier.r22.length) + '개) vs 자잘 ' + mMin.toFixed(3) + '(' + byTier.minor.length + '개)');
  ok(Math.abs(mBig / mMin - 1) < 0.5, '★크기가 등급을 정하지 않는다 — 대·중·소와 자잘의 평균 품위가 비슷');
  const maxMin = Math.max(...byTier.minor), maxBig = Math.max(...byTier.r130.concat(byTier.r70, byTier.r22));
  console.log('      최대 p_peak — 대·중·소 ' + maxBig.toFixed(3) + ' vs 자잘 ' + maxMin.toFixed(3));
  ok(maxMin >= maxBig * 0.9, '  자잘도 최상급 품위에 닿는다 — r7 짜리가 r130 보다 진할 수 있다(탐험의 보상)');
  // 산포 — 로그정규가 실제로 걸렸는지
  const iron = d0.ores.filter((o) => o.mineral === 'iron').map((o) => o.pk);
  const mI = mean(iron), sdI = Math.sqrt(mean(iron.map((v) => (v - mI) * (v - mI))));
  console.log('      철 광맥 사이 산포: 평균 ' + mI.toFixed(3) + ' · 표준편차 ' + sdI.toFixed(3) + ' · CV ' + (sdI / mI).toFixed(3) + '  (구 균등지터 0.35)');
  ok(sdI / mI > 0.6, '★광맥 사이 산포가 크다 — 로그정규(대부분 그저 그렇고 드물게 노다지)');
  ok(Math.max(...iron) <= S.ORE_PK_MAX + 1e-9, '  노다지에도 천장이 있다(p_peak ≤ ' + S.ORE_PK_MAX + ') — p=1 이면 무조건 광석이라 긴장이 사라진다');
  // 저장값 ≡ 공식 (ORE_P_SCALE·σ 를 바꾸고 terrain.json 을 안 다시 매기면 여기서 잡힌다)
  {
    const h2 = (ix, iy, sd) => { let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (sd | 0) * 1274126177; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    let bad = 0;
    for (const o of d0.ores) {
      const u = h2(Math.floor(o.center[0] / 32), Math.floor(o.center[1] / 32), 500);
      if (Math.abs(o.pk - S.orePeakFor(o.mineral, 0.30, u)) > 1e-9) bad++;
    }
    ok(bad === 0, '★저장된 pk ≡ 공식 (' + bad + '개 불일치) — 상수를 바꾸면 terrain.json 도 다시 매겨야 한다');
  }
}

{
  // ★★[재민 확정] "지역은 무관해야 해 … 자원도 골고루 섞이게 해줘"
  //   한때 실제 한반도 산지 지도(함북 철·평북 금·춘천 옥 …)를 입혔다가 **기각**됐다.
  //   지형이 실존 지명을 안 쓰는 가상 세계인데 광물만 실제 지리를 따르면 어긋나고,
  //   지역 전문화가 강하면 어느 마을은 특정 광종을 영영 못 만진다.
  //   ⇒ 여기서 지키는 것: ①저장 광물 ≡ 전역 풀  ②구역별 광종 비율이 **순수 무작위와 구분 안 됨**
  const HM = require(path.join(__dirname, '..', 'server', 'hanbando-minerals'));
  const h2 = (ix, iy, sd) => { let h = (ix|0)*374761393 + (iy|0)*668265263 + (sd|0)*1274126177; h = Math.imul(h ^ (h>>>13), 1274126177); return ((h ^ (h>>>16))>>>0)/4294967295; };
  {
    // ①저장 광물 ≡ 풀 (대·중·소는 최소보장 보정이 걸리므로 자잘만 엄격히 본다)
    let bad = 0, n = 0;
    // ★[재민 확정 2026-08-01 다광종 마이그레이션] 은 단독 광맥은 연은 광맥으로 흡수됐다
    //   (자연에 은 단독 광상은 거의 없다 — 고대 은은 방연석에서 회취법으로 나왔다).
    //   그래서 기대값에도 같은 변환을 적용한다: 풀 추첨이 silver 면 저장본은 lead 여야 한다.
    const MIGRATE = (m) => (m === 'silver' ? 'lead' : m);
    for (const o of d0.ores) { if (!o.minor) continue; n++;
      if (o.mineral !== MIGRATE(HM.mineralAt(0, 0, h2(Math.floor(o.center[0]/32), Math.floor(o.center[1]/32), 731)))) bad++; }
    ok(bad === 0, '★자잘 광맥의 광종 ≡ 전역 풀 + 마이그레이션 규칙 (' + bad + '/' + n + ' 불일치)');
  }
  {
    // ②지역 무관 — 구역별 광종 비율의 산포가 **이항분포 기대치와 같아야** 한다.
    //   지역 편중이 있으면 관측 CV 가 기대 CV 보다 크게 나온다(구 산지 지도에서 실제로 그랬다).
    // ★격자를 **광맥 수에 맞춰** 고른다. 8×15 로 고정했더니 광맥이 3324 → 787 로 줄면서
    //   구역당 6.6개가 돼 광종별 칸이 0~2개가 됐고, CV 비 추정이 표본잡음으로 1.61 까지 튀었다.
    //   (광종 추첨은 좌표를 **안 받는다** — 구조적으로 지역 편중이 불가능하다. 순수 잡음이었다.)
    //   구역당 평균 40개쯤 되게 격자를 잡는다.
    const W = 2188, H = 4063;
    const nB = Math.max(4, Math.min(120, Math.round(d0.ores.length / 40)));
    const GY = Math.max(2, Math.round(Math.sqrt(nB * (H / W)))), GX = Math.max(2, Math.round(nB / GY));
    const grid = {}, cnt = {};
    for (const o of d0.ores) {
      cnt[o.mineral] = (cnt[o.mineral] || 0) + 1;
      const gx = Math.min(GX-1, Math.floor(o.center[0]/32/W*GX)), gy = Math.min(GY-1, Math.floor(o.center[1]/32/H*GY));
      const b = gy*GX + gx; (grid[b] = grid[b] || {})[o.mineral] = ((grid[b]||{})[o.mineral] || 0) + 1;
    }
    const bs = Object.values(grid).filter((g) => Object.values(g).reduce((a,b)=>a+b,0) >= 20);
    console.log('    구역별 광종 비율 (' + GX + '×' + GY + ' 격자 · 유효 ' + bs.length + '개 구역) — 관측 CV / 무작위 기대 CV');
    let worst = 0, wm = '';
    for (const m of Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])) {
      const fr = [], ns = [];
      for (const g of bs) { const n = Object.values(g).reduce((a,b)=>a+b,0); fr.push((g[m]||0)/n); ns.push(n); }
      const mu = fr.reduce((a,b)=>a+b,0)/fr.length;
      const sd = Math.sqrt(fr.reduce((a,b)=>a+(b-mu)*(b-mu),0)/fr.length);
      const nbar = ns.reduce((a,b)=>a+b,0)/ns.length;
      const exp = mu > 0 ? Math.sqrt(mu*(1-mu)/nbar)/mu : 1;
      const r = exp > 0 ? (sd/mu)/exp : 1;
      if (r > worst) { worst = r; wm = m; }
      console.log('      ' + m.padEnd(10) + '비중 ' + (mu*100).toFixed(1).padStart(5) + '%  비 ' + r.toFixed(2));
    }
    ok(worst < 1.35, '★광종에 **지역 편중이 없다** — 어느 구역을 떼도 비율이 같다(최대 비 ' + worst.toFixed(2) + ', 1.0 = 순수 무작위)');
  }
  {
    // ③NPC 시야(대·중·소)의 광종 커버리지 — [재민 확정 2026-08-01 시대 설계로 기준이 바뀌었다]
    //   · 철: 주요 광맥에서 **의도적으로 0** — "철은 기본 마을에서는 안 생기도록. 플레이어가 탐험해서 찾는 거야"
    //     자잘 광맥(플레이어 전용)에만 있다. 여기 철이 다시 나타나면 그게 회귀다.
    //   · 은: 지배 광종으로는 0 이지만 **다광종 비중**(연은 .15 · 구리 부산 .05 · 일렉트럼 .20)으로 존재한다.
    //   · 나머지 여섯(구리·주석·납·금·옥·흑요석)은 지배 광종으로 MIN_MAJOR 이상.
    const mc = {}, sh = {};
    for (const o of d0.ores) { if (o.minor) continue; mc[o.mineral] = (mc[o.mineral] || 0) + 1;
      const dist = o.minerals || { [o.mineral]: 1 };
      for (const m in dist) sh[m] = (sh[m] || 0) + dist[m] * (o.pk || 0); }
    console.log('      대·중·소 지배광종: ' + Object.keys(HM.POOL).map((m) => m + ' ' + (mc[m]||0)).join(' · '));
    const NEED = ['copper', 'tin', 'lead', 'gold', 'jade_raw', 'obsidian'];
    const miss = NEED.filter((m) => (mc[m] || 0) < HM.MIN_MAJOR);
    ok(miss.length === 0, '★청동기 광종 여섯이 주요 광맥에 다 있다 (최소 ' + HM.MIN_MAJOR + '개씩)' + (miss.length ? ' — 빠짐: ' + miss.join(',') : ''));
    ok((mc.iron || 0) === 0, '★주요 광맥에 철이 없다 — 철은 플레이어 탐험 전용(자잘)이다 [재민 확정]');
    ok((sh.silver || 0) > 0, '★은이 다광종 비중으로 존재한다 (연은·부산·일렉트럼 — 은 단독 광맥은 폐지)');
  }
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

  console.log('    ── 깊이 — 타수는 선형으로 늘고 품위는 **그보다 느리게** 오른다 [재민 확정] ──');
  console.log('      재고    필요타수   품위배수   효율(타당)');
  for (const st of [1000, 750, 500, 250, 0]) { const f = st / S.ORE_K;
    console.log('      ' + String(st).padStart(4) + String(S.mineSwingsNeeded(f).toFixed(0)).padStart(9) + '타' +
      S.mineDepthP(f).toFixed(3).padStart(10) + S.mineDepthEff(f).toFixed(4).padStart(11)); }
  ok(S.mineSwingsNeeded.length === 1, '★mineSwingsNeeded 가 레벨 인자를 안 받는다 — 셀 공용 문턱(무임승차 불가)');
  ok(Math.abs(S.mineSwingsNeeded(1) - 60) < 1e-9 && Math.abs(S.mineSwingsNeeded(0) - 160) < 1e-9,
    '★재고 ' + S.ORE_DEPTH_PER + ' 마다 필요 타수 +1 — 만땅 60타 → 완전고갈 160타');
  {
    let mono = true, prev = Infinity, minE = 1;
    for (let st = S.ORE_K; st >= 0; st -= 5) { const e = S.mineDepthEff(st / S.ORE_K);
      if (e > prev + 1e-12) mono = false; prev = e; if (e < minE) minE = e; }
    ok(mono, '★★효율이 깊이에 대해 **단조 감소** — 겉핥기로 골고루 파는 게 항상 이득(재민 확정)');
    ok(Math.abs(S.mineDepthEff(1) - 1) < 1e-9, '  표층 효율 = 1.0 (기준점)');
    ok(minE > 0.80 && minE < 1, '  다만 차이는 **미세**하다 — 최심부 효율 ' + minE.toFixed(3) + ' (10%만 손해라 깊이 파도 못 할 짓은 아니다)');
    ok(S.mineDepthP(0) > 1 && S.mineDepthP(0) < S.mineDepthCost(0),
      '★품위 상승(×' + S.mineDepthP(0).toFixed(2) + ')이 타수 상승(×' + S.mineDepthCost(0).toFixed(2) + ')보다 **작다** — 이게 뒤집히면 깊이 파는 게 이득이 된다');
  }

  ok(S.mineTNR(4) > S.mineTPR(4) + 0.1, '③ 감정 — ★비대칭: 초보는 좋은 광석을 몰라보고 버린다(FN≫FP)');
  // ★NPC 광부의 감정 = 정광률 + 헛짐 운반비 [재민 확정]
  {
    console.log('    ── NPC 광부 감정 배수(레벨 5 = 1.0 정규화) ──');
    const P = 0.117, TR = S.mineTripMinutes(150);   // 존 평균 농도 · 노동권 끝 왕복
    const row = [0, 2, 5, 8, 10].map((l) => S.mineAssayMult(l, P, TR));
    console.log('      lvl 0/2/5/8/10 → ' + row.map((x) => x.toFixed(2)).join(' · ')
      + '   (폭 ' + (row[4] / row[0]).toFixed(2) + '배)');
    ok(Math.abs(S.mineAssayMult(S.ASSAY_REF_LVL, P, TR) - 1) < 1e-9, '  레벨 ' + S.ASSAY_REF_LVL + ' = 1.00 (총량 중립 기준점)');
    ok(row[0] < 1 && row[4] > 1, '  초보는 손해 · 만렙은 이득');
    for (let i = 1; i < row.length; i++) ok(row[i] > row[i - 1], '  레벨에 대해 단조 증가 (lvl' + [0,2,5,8,10][i] + ')');
    ok(row[4] / row[0] < 3, '  ★폭이 3배 미만 — 감정은 스킬의 본체가 아니라 곁가지다');
    // 두 채널이 서로 다른 자리에 들어간다: TNR 이득은 **왕복이 길 때만** 커진다
    const near = S.mineAssayMult(10, P, S.mineTripMinutes(0));
    const far = S.mineAssayMult(10, P, S.mineTripMinutes(20000));
    console.log('      만렙 배수 — 광맥 위(왕복 0분) ' + near.toFixed(2) + ' vs 원정(왕복 600분) ' + far.toFixed(2));
    ok(far > near, '  ★헛짐 회피(TNR)는 **먼 광산일수록** 값이 커진다 — 짐칸을 아끼는 방식으로만 이득이라');
  }
  ok(Math.abs(S.mineTPR(10) - S.mineTNR(10)) < 1e-9 && S.mineIdAcc(0) === 0.5, '  만렙 0.95로 수렴 · lvl0 = 정보 0');
  ok(S.itemWeight('ore_chunk') === 1, '★원석은 kg 단위로 인벤에 든다(덩이 크기가 사람마다 달라 개수로는 못 셈)');
}

// ═══ ⑨ 다광종 선광 E2E — 실서버 mineOreCell → trySortOre 왕복 몬테카를로 ═══════
//   ★[재민 배치 A6] "연은 광맥에서 캐→선광하면 납+은이 실제 비율(85:15±)로 나오는지"
//   위 ①~⑧ 은 순수 모듈 검증이다. 다광종은 **광맥 데이터 → oreMineralAt 2단 추첨 → 장부 →
//   선광 → 인벤**이 전부 이어져야 성립하므로, 그 사슬 하나가 끊겨도 모듈 검증은 통과한다.
//   ⇒ 여기서만 실서버를 띄우고(임시 DB·임시 포트) 진짜 함수를 부른다. `__testBind` 훅.
console.log('\n⑨ 다광종 선광 E2E (실서버 mineOreCell → trySortOre)');
{
  const fsx = require('fs');
  const TMP = `/tmp/test-mining-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fsx.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(38000 + (process.pid % 900));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(__dirname, '..', 'server', 'zone.js'));
  console.log = _l; console.warn = _w; console.error = _e;
  const H = Zone.__testBind();
  // ★하네스 가속 — 채굴은 **한 타마다 셀 레코드를 SQLite 에 쓴다**(_oreSave → upsertMinedCell).
  //   사람 손으로는 1초에 한 타라 문제가 없지만, 몬테카를로는 수십만 타를 친다. 디스크가 병목이라
  //   이 구간에서만 쓰기를 no-op 으로 만든다(같은 require 캐시라 zone.js 를 안 고쳐도 된다).
  //   ★검증 대상(광종 추첨·장부·선광)은 전부 in-memory 라 이 우회에 영향받지 않는다.
  const zdb = require(path.join(__dirname, '..', 'server', 'zone-local-db.js'));
  const _upsert = zdb.upsertMinedCell; zdb.upsertMinedCell = () => {};

  // ── 겹치지 않는(단일 광맥) 연은 광맥을 데이터에서 고른다 — 겹치면 이웃 광종이 섞여 비율이 흐려진다
  //   ★"중심이 깨끗한 광맥"만 봐서는 안 된다: 산맥 위 광맥은 중심이 바위라 팔 수 있는 셀이 0이다.
  //     실제로 **팔 수 있는 셀 수**로 고른다(첫 시도에서 이 함정에 빠졌다).
  const raw = require(path.join(__dirname, '..', 'server', 'hanbando-terrain.json')).hanbando;
  // ★단위 함정 — 광맥 center·radius 와 terrain 의 ore 함수는 전부 **픽셀**이다(셀이 아니다).
  //   플레이어 격자는 셀이라 여기서 한 번만 환산한다(셀 → 픽셀 중심 = c*32+16).
  //   첫 시도에서 셀/픽셀을 뒤섞어 "광맥 안"이라 믿은 자리가 실은 32배 밖이었고, 장부에 맥석만
  //   980kg 쌓였다. 단위가 틀리면 하네스는 조용히 통과하는 게 아니라 **엉뚱한 걸 잰다**.
  const cleanCellsAround = (vxPx, vyPx, rCells) => {
    const ccx = Math.floor(vxPx / 32), ccy = Math.floor(vyPx / 32), out = [];
    for (let dx = -rCells; dx <= rCells; dx++) for (let dy = -rCells; dy <= rCells; dy++) {
      const x = ccx + dx, y = ccy + dy, px = x * 32 + 16, py = y * 32 + 16;
      if (T.isWaterCellLocal('hanbando', px, py)) continue;
      if (T.isRockCellLocal && T.isRockCellLocal('hanbando', px, py)) continue;
      if (T.oreCandidatesAt('hanbando', px, py).length !== 1) continue;   // 겹침 없는 단일 광맥 셀만
      if (!(T.oreProbAt('hanbando', px, py) > 0.05)) continue;            // 가장자리(p≈0)는 표본이 안 모인다
      out.push([x, y]);
    }
    return out;
  };
  let vein = null, cells = [];
  for (const o of (raw.ores || []).filter((o) => o.minerals && o.minerals.silver > 0 && o.minerals.lead > 0)
                                  .sort((a, b) => (b.pk || 0) - (a.pk || 0))) {
    const c = cleanCellsAround(o.center[0], o.center[1], Math.max(4, Math.ceil(o.radius / 32)));
    if (c.length >= 20) { vein = o; cells = c; break; }
  }
  if (!vein) { ok(false, '연은(방연석) 광맥을 못 찾음 — 다광종 마이그레이션 확인'); }
  else {
    const want = vein.minerals;   // { lead .85, silver .15 }
    console.log(`    광맥 "${vein.name}" @(${vein.center}) r${vein.radius} pk=${vein.pk} · 표기 배합 ` +
      Object.entries(want).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' / '));
    ok(cells.length >= 20, `  단일 광맥·굴착 가능 셀 ${cells.length}개 확보`);

    // ★anon_ 접두 = savePlayer 가 central 호출을 건너뛴다(하네스가 네트워크를 안 탄다)
    const p = { playerId: 'anon_mc', name: '표본', ws: null, x: 0, y: 0, floor: 0,
                inventory: {}, toolItems: [{ id: 'mc0', type: 'pickaxe', d: 1e9, max: 1e9 }],
                equipped: 'mc0', craftSkill: { mining: 0 }, oreLedger: {}, oreCarry: {}, hunger: 100, thirst: 100 };
    const TARGET_KG = 2200 * S.CHUNK_KG;      // 광석 표본 ≈2,200덩이 — 15%±2%(95%) 에 충분
    const ledgerKg = {}, sorted = {};
    let chunks = 0, swings = 0, oreKgTot = 0;
    const t0 = Date.now();
    const drain = () => {                      // 한 셀 분량을 장부에 적립하고 선광 → 인벤 비우기
      for (const k in p.oreLedger) ledgerKg[k] = +((ledgerKg[k] || 0) + p.oreLedger[k]).toFixed(3);
      const invBefore = Object.assign({}, p.inventory);
      H.trySortOre(p);
      for (const k of Object.keys(p.inventory)) {
        if (k === 'ore_chunk') continue;
        const d = (p.inventory[k] || 0) - (invBefore[k] || 0);
        if (d > 0) sorted[k] = (sorted[k] || 0) + d;
      }
      for (const k of Object.keys(p.inventory)) if (k !== 'ore_chunk') delete p.inventory[k];
      oreKgTot = Object.entries(ledgerKg).reduce((a, [k, v]) => a + (k === 'stone' ? 0 : v), 0);
    };
    outer:
    for (let round = 0; round < 2000; round++) {
      for (const [cx, cy] of cells) {
        p.x = cx * 32 + 16; p.y = cy * 32 + 16;
        for (let s = 0; s < 900; s++) {
          p._mineT = 0;                        // 1초/타 쿨다운 우회(하네스 전용 — 규칙 자체는 안 건드린다)
          const before = p.inventory.ore_chunk || 0;
          if (!H.mineOreCell(p)) break;        // 못 파는 자리 / 곡괭이 없음
          swings++;
          if ((p.inventory.ore_chunk || 0) > before) chunks++;
          if (S.inventoryWeight(p.inventory || {}) > 20) break;   // 짐 가득 — 부리러 간다
        }
        drain();
        if (oreKgTot >= TARGET_KG) break outer;
      }
    }
    const gangue = ledgerKg.stone || 0;
    const oreKg = Object.entries(ledgerKg).filter(([k]) => k !== 'stone');
    const totOre = oreKg.reduce((a, [, v]) => a + v, 0);
    console.log(`    ${(Date.now() - t0)}ms · 타 ${swings} · 덩이 ${chunks} · 광석 ${totOre.toFixed(0)}kg · 맥석 ${gangue.toFixed(0)}kg`);
    console.log('    장부 질량비: ' + oreKg.sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${(v / totOre * 100).toFixed(1)}%`).join(' · '));
    console.log('    선광 산출(덩이): ' + Object.entries(sorted).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`).join(' · '));

    // ★① 광종이 표기 배합대로 갈리는가 — 오차 한계는 표본수에서 나온다(±3σ)
    const n = totOre / S.CHUNK_KG;
    for (const [m, w] of Object.entries(want)) {
      const obs = (ledgerKg[m] || 0) / totOre;
      const sd = Math.sqrt(w * (1 - w) / Math.max(1, n));
      ok(Math.abs(obs - w) < Math.max(0.02, 3 * sd),
        `  ${m}: 실측 ${(obs * 100).toFixed(1)}% vs 표기 ${(w * 100).toFixed(0)}% (허용 ±${(Math.max(0.02, 3 * sd) * 100).toFixed(1)}%p)`);
    }
    // ★② 표기에 없는 광종이 새어 들어오지 않는가(단일 광맥 셀만 팠으므로 0이어야 한다)
    const stray = oreKg.filter(([k]) => !(k in want));
    ok(stray.length === 0, `  표기 밖 광종 누설 0 ${stray.length ? '(' + stray.map(([k, v]) => k + ' ' + v.toFixed(1)).join(',') + ')' : ''}`);
    // ★③ 선광이 질량을 보존하는가 — 은은 소수 덩이라 이월(oreCarry)로 남는다
    const backKg = Object.entries(sorted).reduce((a, [k, v]) => a + v * S.CHUNK_KG, 0)
      + Object.entries(p.oreCarry || {}).reduce((a, [k, v]) => a + (k === 'stone' ? 0 : v), 0);
    ok(Math.abs(backKg - totOre) / totOre < 0.01, `  선광 질량 보존 — 장부 ${totOre.toFixed(1)}kg → 산출+이월 ${backKg.toFixed(1)}kg`);
    // ★④ 은이 실제로 손에 잡히는가(고대 은의 출처는 방연석이다 — 은 단독 광맥은 폐지됐다)
    ok((sorted.silver || 0) > 0, `  ★은이 방연석에서 나온다 — ${sorted.silver || 0}덩이 (은 단독 광맥 폐지의 대체 경로)`);
  }

  // ★⑩ 운철(隕鐵) 스폰 밀도 — 결정론 해시라 지도 전체를 세 볼 수 있다
  {
    const chunkMod = require(path.join(__dirname, '..', 'server', 'chunk.js'));
    const Z = ZONES.hanbando, CS = 1024;
    const colsX = Math.ceil(Z.zoneWidth / CS), colsY = Math.ceil(Z.zoneHeight / CS);
    let hit = 0, land = 0;
    for (let cx = 0; cx < colsX; cx++) for (let cy = 0; cy < colsY; cy++) {
      const list = chunkMod.generateChunkResources('hanbando', Z.biome, cx, cy, CS, null);
      const m = list.filter((r) => r.type === 'meteorite');
      if (m.length) { land += m.length; }
    }
    // (기각분 포함 기대치는 청크수×확률 — 물·바위에서 떨어진 건 안 남는다)
    const expect = colsX * colsY * 0.006;
    console.log(`    운철: 청크 ${colsX}×${colsY}=${colsX * colsY} · 기대 시도 ${expect.toFixed(0)} → 지표 잔존 ${land}개`);
    ok(land >= 10 && land <= 80, `  ★대륙에 수십 개 (${land}개) — 광맥이 아니라 발견물 밀도`);
    // 결정론 — 같은 좌표를 두 번 부르면 같은 답
    const a = chunkMod.generateChunkResources('hanbando', Z.biome, 30, 40, CS, null).filter((r) => r.type === 'meteorite');
    const b = chunkMod.generateChunkResources('hanbando', Z.biome, 30, 40, CS, null).filter((r) => r.type === 'meteorite');
    ok(JSON.stringify(a) === JSON.stringify(b), '  스폰이 결정론(재부팅해도 같은 자리)');
    // 운철 등급 = 합금 모델이 낸 니켈 프리미엄 (손으로 적은 값이 아니다)
    const PI = require(path.join(__dirname, '..', 'server', 'player-items'));
    const gFe = S.alloyGrade({ iron: 1 }, 'weapon'), gMet = S.alloyGrade({ iron: 0.93, nickel: 0.07 }, 'weapon');
    console.log(`    운철 등급 ${PI.MAT_GRADE.meteoric_iron} (철 ${PI.MAT_GRADE.iron} × 니켈 프리미엄 ${(gMet / gFe).toFixed(3)}) · 청동 ${PI.MAT_GRADE.bronze}`);
    ok(PI.MAT_GRADE.meteoric_iron > PI.MAT_GRADE.iron, '  ★운철 > 순철 (니켈은 난이도가 아니라 성능이다)');
    ok(PI.MAT_GRADE.meteoric_iron < PI.MAT_GRADE.bronze, '  ★운철 < 청동 — 초기 철기가 청동을 못 이긴 고증 그대로');
  }

  // ── ⑩ 플레이어에게 실제로 **뭐라고 찍히는가** (2026-08-02d 라벨 정합) ──────
  //   ★grep 으로는 못 잡는 결함이다: 선광 산출 키가 `iron_ore` 인데 그 항목이 RESOURCES 에 없어서
  //     `RESOURCES[k].ko || k` 가 **영문 키를 그대로** 흘렸다 — 플레이어 화면에 "iron_ore 3".
  //     그래서 표를 읽지 말고 **실서버가 만든 notice 문자열**을 본다.
  console.log('\n⑩ 선광·감정 문구 — 플레이어 화면에 영문 키가 새지 않는가');
  {
    const notices = [];
    const mkWs = () => ({ readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notices.push(o.text); } catch (e) {} } });
    const p2 = { playerId: 'anon_lbl', name: '라벨', ws: mkWs(), x: 0, y: 0, floor: 0,
                 inventory: {}, toolItems: [], equipped: null, craftSkill: { mining: 10 },
                 oreLedger: { iron: S.CHUNK_KG * 3, copper: S.CHUNK_KG * 2 }, oreCarry: {}, hunger: 100, thirst: 100 };
    p2.inventory.ore_chunk = S.CHUNK_KG * 5;
    H.trySortOre(p2);
    const txt = notices.join(' | ');
    console.log(`    선광 문구: "${txt}"`);
    ok(!/[a-z]+_[a-z]+ \d/.test(txt), '  선광 결과에 영문 키(iron_ore 등)가 안 샌다');
    ok(/철 정광/.test(txt), '  철 광맥 선광 산출이 "철 정광" 으로 찍힌다');
    ok((p2.inventory.iron_ore || 0) === 3 && !p2.inventory.iron, '  철은 정광으로만 나온다(금속 아님 — 노가 있어야 한다)');
    // 감정 문구: iron 의 ko 가 '철' 이라 "철로 보인다"/"철이다" 로 읽혀야 한다(형제 금속과 동형)
    const koOf = (m) => (S.RESOURCES[m] || {}).ko || m;
    const ph8 = S.mineIdPhrase(8, true, 'iron', koOf), ph10 = S.mineIdPhrase(10, true, 'iron', koOf);
    const phCu = S.mineIdPhrase(10, true, 'copper', koOf);
    console.log(`    감정 문구: lvl8 "${ph8}" · lvl10 "${ph10}" (비교: 구리 "${phCu}")`);
    ok(!/철광석/.test(String(ph8) + String(ph10)), '  감정 문구가 금속을 "철광석"이라 부르지 않는다');
    ok(/철$/.test(String(ph10)) && /구리$/.test(String(phCu)), '  단정 문구가 전 광종에 자연스럽다(구리 → "구리다"[냄새] 회피)');
  }

  zdb.upsertMinedCell = _upsert;   // 가속 원복
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fsx.unlinkSync(f); } catch (e) {} }
}

console.log('\n' + (fail.length ? '결과: FAIL — ' + fail.length + '건\n  · ' + fail.join('\n  · ') : '결과: PASS'));
process.exit(fail.length ? 1 : 0);
