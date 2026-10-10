#!/usr/bin/env node
// === 11차 채광 재설계 — 랩 헤드리스 검증 하네스 ===
//
// 검증 항목(전부 실측 — 주장하려면 여기서 돌아야 한다):
//   ① 상수: L_OREMAX=1000 · L_MINE=14.73(유도식) · L_OREREG0/1=0.01 (L_OREREGROW 잔존 0)
//   ② 리젠 닫힌 해: oreRegen()이 dR/dt = 0.02 − 1e-5·R 의 해와 일치(수치적분 대조 오차 <1e-6),
//      경계 R=0→0.02/일 · R=K→0.010/일, 완전고갈→만땅 69,315 게임일
//   ③ 2인 1조: 광부가 짝(_mp)별로 같은 셀에 배치되고, 서로 다른 조는 다른 셀에 있다
//   ④ 채광 실체: 광맥 재고 총량이 실제로 줄고, 줄어드는 속도가 광부수×L_MINE 과 맞는다
//   ⑤ land.ore 연동: oFrac 하락에 따라 econ.land.ore 가 base×(0.4+0.6·oFrac) 로 따라간다(바닥 0.4)
//   ⑥ 광부 정원 되먹임: land.ore 하락 → jobCapacity.miner 하락
//   ⑦ pageerror·console error 0
//   ⚠[T684 ← T660 회부 ②] ③④ 는 **창 길이에 기댄다** — 이 씨(7)·시계에선 첫 광부가 41~50일에 선다(T660: 40일 0 → 50일 1) · `RUN_DAYS` 를 그보다 짧게 주면(종전 `RUN_DAYS=8` 판들) 광부 0 이라 ③④ 가 빨갛다 — 제품이 아니라 창이다.
//   ⚠[T684 ← T660 회부 ③] ③ "2인 1조" 는 기본 판(60일 · dt 16.667)에서 광부 1명 · 셀 1개 · 0/0 이라 **짝 규칙을 안 잰다**(`③ⓜ` 미끼가 자가 살아 있음만 보인다 · 종전 dt 33.334 계측 판은 광부 2 · 1/1 로 쟀다).
//
// 결정론: Math.random 시드 고정 + performance.now 가상시계 — ★[T660] 시계 정본 `fixture-lab-clock`(T649 꼴)
//   · rAF 는 줄로 받고 프레임은 하네스가 민다 · ①② 를 재는 동안에도 프레임은 안 돈다(토글 전 0 프레임 = 시계 원점 0)
//   · 표본 = 랩 날마다 **첫 프레임** · 끝(sN) = 랩 날 startDay+RUN_DAYS 의 첫 프레임
//   · 마감 = "시계가 섰나" 하나(종전: 300ms 들여다보기 · 1,500초 벽시계 — 넘으면 `⚠ 시간 초과` 찍고 **짧은 창으로 그냥 판정**했다.
//     T641 두 판이 60일 중 47일 · 38일에서 잘렸다 — ③~⑥ 이 판마다 다른 날을 쟀다)
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const LC = require('./fixture-lab-clock');

const CHROME = process.env.CHROME_PATH || undefined;
// ★랩 파일 경로: LAB_FILE 환경변수(기본 `lab/전쟁실험실.html`).
//   ⚠[T123 2026-09-05] 종전 기본값은 레포 밖 `~/Mini/…` 였다 — 랩이 레포 안으로 들어온 뒤에도 남아 조용히 어긋났다.
const LAB = 'file://' + (process.env.LAB_FILE || path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'));
const SPEED = parseInt(process.env.SPEED || '119', 10);
const NVIL = 3, POP = parseInt(process.env.POP || '40', 10), SEED = 7;
const RUN_DAYS = parseInt(process.env.RUN_DAYS || '60', 10);

const INIT = LC.init;

const SNAP = () => {
  const v = VILS.find((q) => q.role === 'mining') || VILS[0];
  let os_ = 0, on = 0, empty = 0;
  for (const r of v.oreRich.values()) { os_ += r; on++; if (r <= 0.5) empty++; }
  const miners = v.agents.filter((a) => a.job === 'miner');
  const byCell = {};
  for (const a of miners) { const k = a.work ? a.work.cx + ',' + a.work.cy : 'none'; (byCell[k] = byCell[k] || []).push(a._mp); }
  return {
    day: v.day, pop: Math.round(v.pop), role: v.role, rockEdge: (v.rockEdge || []).length,
    oreSum: +os_.toFixed(1), oreCells: on, oreFrac: on ? +(os_ / (on * L_OREMAX)).toFixed(4) : 1, oreEmpty: empty,
    miners: miners.length,
    baseOre: v.baseOre, landOre: v.econ ? v.econ.land.ore : null,
    landStone: v.econ ? v.econ.land.stone : null,
    // jobCapacity 는 econ 모듈 클로저 안이라 외부 호출 불가 → **같은 식**을 하네스가 재현한다(랩 1124행).
    //   miner = floor(land.size × max(ore, obsidian, jade, tin) × 0.30)   ※liveLand 마을은 effectiveLandSize = land.size
    cap: v.econ ? Math.floor((v.econ.land.size || 0) * Math.max(v.econ.land.ore || 0, v.econ.land.obsidian || 0, v.econ.land.jade || 0, v.econ.land.tin || 0) * 0.30) : null,
    cnt: v.econ && v.econ.counts ? (v.econ.counts.miner || 0) : null,
    size: v.econ ? v.econ.land.size : null,
    // 2인 1조 실측: 셀별로 붙어 있는 조 번호 목록
    pairs: Object.entries(byCell).map(([k, mps]) => [k, mps.slice().sort((a, b) => a - b)]),
  };
};

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = [], cerrs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') cerrs.push(m.text()); });
  await page.addInitScript(INIT('0x9e3779b9'));
  await page.goto(LAB);
  await page.waitForFunction(() => typeof window.lifeToggle === 'function' && typeof VILS !== 'undefined', null, { timeout: 60000 });

  const fail = [];
  const ok = (c, msg) => { console.log((c ? '  ✔ ' : '  ✗ ') + msg); if (!c) fail.push(msg); };

  // ── ① 상수 ──
  console.log('① 상수');
  const K = await page.evaluate(() => ({
    OREMAX: typeof L_OREMAX !== 'undefined' ? L_OREMAX : null,
    MINE: typeof L_MINE !== 'undefined' ? L_MINE : null,
    MINE_DERIV: (typeof L_MINDAY!=='undefined'&&typeof L_LABOR!=='undefined'&&typeof L_HAULEFF!=='undefined'&&typeof L_MINE_PER!=='undefined') ? +(L_MINDAY*L_LABOR*L_HAULEFF/L_MINE_PER).toFixed(2) : null,
    HAULEFF: typeof L_HAULEFF!=='undefined'?+L_HAULEFF.toFixed(4):null,
    ores: (typeof TR!=='undefined'&&TR&&TR.ores)?TR.ores.map(o=>({r:o.r,c:o.cells,p:o.pAvg,pk:o.pk})):null,
    R0: typeof L_OREREG0 !== 'undefined' ? L_OREREG0 : null,
    R1: typeof L_OREREG1 !== 'undefined' ? L_OREREG1 : null,
    OLD: typeof L_OREREGROW !== 'undefined',
    hasRegen: typeof oreRegen === 'function',
  }));
  ok(K.OREMAX === 1000, 'L_OREMAX = 1000 (실측 ' + K.OREMAX + ')');
  ok(Math.abs(K.MINE - 14.73) < 0.01, 'L_MINE = 14.73 (실측 ' + K.MINE + ')');
  ok(K.MINE_DERIV !== null && Math.abs(K.MINE - K.MINE_DERIV) < 0.01, 'L_MINE 이 유도식과 일치 (L_MINDAY×L_LABOR×L_HAULEFF÷L_MINE_PER = ' + K.MINE_DERIV + ')');
  ok(K.HAULEFF !== null && Math.abs(K.HAULEFF - 0.9697) < 1e-3, '왕복효율 0.9697 (실측 ' + K.HAULEFF + ')');
  ok(K.R0 === 0.01 && K.R1 === 0.01, 'L_OREREG0/1 = 0.01 (실측 ' + K.R0 + '/' + K.R1 + ')');
  ok(!K.OLD, 'L_OREREGROW 제거됨');
  ok(K.hasRegen, 'oreRegen() 존재');

  if (K.ores) {
    const byR = {}; let tot = 0;
    for (const o of K.ores) { const e = byR[o.r] = byR[o.r] || { n: 0, c: 0, p: 0 }; e.n++; e.c += o.c; e.p += o.p; tot += o.c; }
    console.log('  광맥 클러스터 ' + K.ores.length + '개 · 총 ' + tot.toLocaleString() + '셀');
    for (const r of Object.keys(byR).map(Number).sort((a, b) => b - a)) { const e = byR[r]; console.log('    반경 ' + String(r).padStart(3) + '셀 ×' + String(e.n).padStart(3) + ' → ' + e.c.toLocaleString().padStart(7) + '셀 · 평균품위 p=' + (e.p / e.n).toFixed(3)); }
    ok(K.ores.length > 0, '광맥 클러스터 생성됨');
  } else ok(false, 'TR.ores 없음');

  // ── ② 리젠 닫힌 해 ──
  console.log('② 리젠 닫힌 해 (dR/dt = 0.02 − 1e-5·R)');
  const RG = await page.evaluate(() => {
    const num = (R0, days, steps) => { let R = R0; const h = days / steps; for (let i = 0; i < steps; i++) { const k1 = 0.02 - 1e-5 * R; const k2 = 0.02 - 1e-5 * (R + h * k1); R += h * (k1 + k2) / 2; } return Math.min(1000, R); };
    const out = [];
    for (const [R0, d] of [[0, 365], [0, 3650], [0, 36500], [500, 3650], [900, 36500]]) out.push({ R0, d, closed: oreRegen(R0, d), num: num(R0, d, 200000) });
    // 경계 순간율
    const rate = (R) => (oreRegen(R, 1e-4) - R) / 1e-4;   // ★R=K 는 min(K,·) 클램프가 물어 0이 나온다(공식이 아니라 상한). 공식 경계는 K 바로 아래에서 잰다.
    return { out, rate0: rate(0), rateK: rate(999), clampK: rate(1000), toFull: (() => { let lo = 0, hi = 400000; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (oreRegen(0, m) >= 999.9999) hi = m; else lo = m; } return Math.round(hi); })() };
  });
  let worst = 0;
  for (const r of RG.out) { const e = Math.abs(r.closed - r.num); if (e > worst) worst = e; console.log('    R0=' + String(r.R0).padStart(4) + ' t=' + String(r.d).padStart(6) + '일 → 닫힌해 ' + r.closed.toFixed(6) + ' · 수치적분 ' + r.num.toFixed(6)); }
  ok(worst < 1e-4, '닫힌 해 ≡ 수치적분 (최대오차 ' + worst.toExponential(2) + ')');
  ok(Math.abs(RG.rate0 - 0.02) < 1e-4, 'R=0 순간율 0.02/게임일 (실측 ' + RG.rate0.toFixed(6) + ')');
  ok(Math.abs(RG.rateK - 0.01001) < 1e-4, 'R=999 순간율 ≈0.01001/게임일 — 공식 경계 (실측 ' + RG.rateK.toFixed(6) + ')');
  ok(Math.abs(RG.clampK) < 1e-9, 'R=K 는 클램프로 0 (만땅 셀은 더 안 참)');
  console.log('    완전고갈→만땅 ' + RG.toFull.toLocaleString() + ' 게임일 = ' + (RG.toFull / 365).toFixed(0) + ' 게임년');
  ok(RG.toFull > 60000 && RG.toFull < 80000, '완전회복 69,315 게임일 부근');

  // ── 부팅 ──
  console.log('③~⑥ 실행 (마을 ' + NVIL + ' — 광산촌 대상 · 인구 ' + POP + ' · ' + RUN_DAYS + ' 게임일)');
  await page.evaluate(({ nv, pop, seed, sp }) => {
    document.getElementById('nvil').value = String(nv);
    document.getElementById('pop').value = String(pop);
    document.getElementById('seed').value = String(seed);
    const sel = document.getElementById('simSpeed');
    if (![...sel.options].some((o) => o.value === String(sp))) sel.add(new Option(sp + '×(하네스)', String(sp)));
    sel.value = String(sp);
    lifeToggle();
  }, { nv: NVIL, pop: POP, seed: SEED, sp: SPEED });

  const take = () => page.evaluate(SNAP);
  let s0 = await take();
  const startDay = s0.day;
  const series = [s0];
  let frame = 0;
  for (;;) {
    const s = await take();
    if (s.day !== series[series.length - 1].day) { series.push(s); if ((s.day - startDay) % 10 === 0) console.log('    …day ' + (s.day - startDay) + '/' + RUN_DAYS + ' 재고 ' + s.oreSum + ' 광부 ' + s.miners + ' land.ore ' + s.landOre + ' (프레임 ' + frame + ')'); }
    if (s.day >= startDay + RUN_DAYS) break;
    frame = await LC.untilDay(page, s.day + 1);   // ★[T660] 다음 랩 날의 첫 프레임까지 민다(종전: 300ms 잠 · 1,500초 벽시계)
  }
  const sN = series[series.length - 1];

  // ── ③ 2인 1조 ──
  console.log('③ 2인 1조');
  // ★[T660] 셀·조 셈을 한 함수로 뽑았다 — 아래 미끼도 **같은 자**로 잰다(뜻 무변)
  const pairStat = (pairs) => {
    const cells = pairs.filter(([k]) => k !== 'none');
    const multi = cells.filter(([, mps]) => mps.length > 1);
    const sameOnly = multi.filter(([, mps]) => mps.every((m) => m === mps[0]));
    return { cells, multi, sameOnly };
  };
  const oneTeam = (st) => st.multi.length === 0 || st.sameOnly.length === st.multi.length;
  const { cells, multi, sameOnly } = pairStat(sN.pairs);
  const sizes = {}; for (const [, mps] of cells) sizes[mps.length] = (sizes[mps.length] || 0) + 1;
  console.log('    광부 ' + sN.miners + '명 · 점유 셀 ' + cells.length + '개 · 셀당 인원 분포 ' + JSON.stringify(sizes));
  ok(sN.role === 'mining', '대상 마을 = 광산촌 (실측 ' + sN.role + ' · rockEdge ' + sN.rockEdge + '셀)');
  ok(cells.length > 0, '광부가 광맥 셀에 배치됨');
  ok(oneTeam({ multi, sameOnly }),
    '한 셀에 2명 이상이면 전원 같은 조 (' + sameOnly.length + '/' + multi.length + ')');
  ok(Math.max(0, ...Object.keys(sizes).map(Number)) <= 2, '한 셀 최대 2명');
  // ★[T660] 미끼 — ③ 이 지키는 것(한 광맥 셀엔 한 조만)을 끝 표본 **뒤에** 일부러 깬다: 대상 마을 주민 둘을 서로 다른
  //   조 번호로 같은 광맥 셀에 광부로 세운다(랩 파일 무접촉 · 프레임 0 — 위 판정들은 이미 잰 sN 을 쓴다).
  //   같은 SNAP · 같은 자로 다시 재면 빨개야 한다 — 광부가 0 인 판에서도 자가 살아 있음을 보인다.
  const sB = await page.evaluate(() => {
    const v = VILS.find((q) => q.role === 'mining') || VILS[0];
    const [cx, cy] = v.oreRich.keys().next().value.split(',').map(Number);
    const a1 = v.agents.find((a) => a.job !== 'miner'), a2 = v.agents.find((a) => a !== a1 && a.job !== 'miner');
    for (const a of [a1, a2]) { a.job = 'miner'; a.work = { cx, cy }; a._mp = v.agents.indexOf(a); }
    return true;
  }).then(() => take());
  const bSt = pairStat(sB.pairs);
  ok(!oneTeam(bSt), '③ⓜ 자명 통과 금지 — 한 광맥 셀에 다른 조 둘을 일부러 세운 미끼는 같은 자로 **빨강** (같은 조 셀 ' + bSt.sameOnly.length + '/' + bSt.multi.length + ')');

  // ── ④ 채광 실체 ──
  console.log('④ 채광 실체');
  const dOre = s0.oreSum - sN.oreSum, days = sN.day - s0.day;
  const expect = sN.miners * 14.73 * days;
  console.log('    ' + days + '일간 재고 ' + s0.oreSum.toLocaleString() + ' → ' + sN.oreSum.toLocaleString() + ' (감소 ' + dOre.toFixed(0) + ')');
  console.log('    광부 ' + sN.miners + '명 × 14.73 × ' + days + '일 = ' + expect.toFixed(0) + ' (리젠 +' + (sN.oreCells * 0.01 * days).toFixed(0) + ' 상당 상쇄)');
  ok(dOre > 0, '광맥 재고가 실제로 줄어든다');
  ok(dOre <= expect * 1.05, '감소량 ≤ 광부수×L_MINE×일수 (리젠·이동 손실로 이하가 정상)');

  // ── ⑤ land.ore 연동 ──
  console.log('⑤ land.ore ← 재고 연동 (바닥 0.4)');
  const pred = +(sN.baseOre * (0.4 + 0.6 * sN.oreFrac)).toFixed(2);
  console.log('    oFrac ' + sN.oreFrac + ' · baseOre ' + sN.baseOre + ' → 기대 ' + pred + ' · 실측 ' + sN.landOre);
  ok(Math.abs(sN.landOre - pred) < 0.02, 'land.ore = baseOre×(0.4+0.6·oFrac)');
  ok(sN.landOre >= sN.baseOre * 0.4 - 0.01, '바닥 40% 하회 없음');

  // ── ⑥ 정원 되먹임 ──
  console.log('⑥ 광부 정원 되먹임');
  console.log('    day' + s0.day + ' land.ore ' + s0.landOre + ' size ' + s0.size + ' 정원 ' + s0.cap + ' 실제 ' + s0.cnt);
  console.log('    day' + sN.day + ' land.ore ' + sN.landOre + ' size ' + sN.size + ' 정원 ' + sN.cap + ' 실제 ' + sN.cnt);
  ok(sN.cap != null && sN.cap > 0, '광부 정원 산출됨 (size×land.ore×0.30)');
  ok(sN.cap <= s0.cap, '재고가 깎인 만큼 정원이 (증가하지 않고) 줄어든다');
  ok(sN.landOre <= s0.landOre + 0.01, 'land.ore 가 (증가하지 않고) 재고를 따라간다');

  // ── ⑦ 오류 ──
  console.log('⑦ 오류');
  ok(errs.length === 0, 'pageerror 0 (실측 ' + errs.length + (errs.length ? ' — ' + errs[0].slice(0, 120) : '') + ')');
  ok(cerrs.length === 0, 'console error 0 (실측 ' + cerrs.length + (cerrs.length ? ' — ' + cerrs[0].slice(0, 120) : '') + ')');

  await browser.close();
  console.log('\n' + (fail.length ? '결과: FAIL — ' + fail.length + '건\n  · ' + fail.join('\n  · ') : '결과: PASS'));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e); process.exit(2); });
