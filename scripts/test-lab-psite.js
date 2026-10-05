#!/usr/bin/env node
// === 10차 T3 — 랩 "플레이어 의뢰 집 건설(B안)" 헤드리스 검증 하네스 ===
//
// 검증 항목(전부 실측 — 주장하려면 여기서 돌아야 한다):
//   ① 지정: 실제 캔버스 클릭 경로(PSITE 토글 → mousedown/mouseup/click)로 집터가 생긴다.
//   ② 필터: addHouseSite와 **같은** 하드 필터(siteFilters)가 불가 자리를 실제로 거절한다.
//   ③ 착공~완공: 마을 크루가 걸어와 머문 시간(_crewD)만으로 4단계(본게임 HUT_STAGES 동형)를 밟고 완공.
//   ④ 진척의 전부가 크루 출석분 — 공동 노역 바닥이 없다(현장 누적 ≈ L_BUILDSEC).
//   ⑤ 회계 무접촉: econ._mapBeds·입주(lifeSync)가 플레이어 집을 세지 않는다.
//   ⑥ 마을 회귀(A/B): 같은 시드·같은 가상시계에서 A(플레이어 집 없음) vs B(있음)의 마을 자체 건설 산출을
//      **같은 날짜 기준**으로 비교한다. 여유 크루를 빌려주는 설계이므로 0이 아닐 수 있다 — 실측치를 보고한다.
//   ⑦ pageerror·console error 0.
//
// 결정론 장치(랩은 안 건드린다 — 하네스가 페이지에 주입):
//   · Math.random = mulberry32(고정 시드)  · performance.now = 가상시계(프레임당 16.667ms)
//   · ★[T649] rAF 는 **줄로 받고 프레임은 하네스가 민다**(T641 `--slow` 판의 꼴) — 한 프레임 = 줄에 선 콜백 전부를
//     **같은 now** 로 한 번씩(브라우저 rAF 규약 그대로 · 그 사이 새로 선 콜백은 다음 프레임).
//   → dt 고정 → dGM 고정 → A/B가 같은 시간축 위에서 돈다(실시간 프레임 편차 제거).
//   · ★[T649] **지정 시각 · 하루 표본 · 끝을 프레임 번호/랩 날로 고른다** — 하네스의 실시간(ms)은 어디에도 안 든다.
//     종전 판은 같은 파일도 판마다 갈렸다(T641 실측: B 16/16 · 15/15 · A 14/15 · 16/16). 자리가 셋이었다:
//       ⓐ 지정 시각 = 400ms 마다 들여다본 첫 표본 → 몇째 프레임에 지정이 들어가는지가 상자 부하를 따랐다.
//       ⓑ 시계 원점 = 래퍼가 실제 rAF 마다 vt 를 밀어 **토글 때의 vt** 가 적재 시간을 따랐다 → dt 의 끝자리(부동소수)가
//          달라져 며칠 뒤 세계가 갈린다(T649 실측: 원점만 0 ↔ 60프레임 다른 두 판 — 400 프레임 같음 · 2,900 프레임 갈림).
//          집터 없는 A 가 갈린 까닭이 이것이다. 이제 토글 전엔 한 프레임도 안 돈다(원점 = 0).
//       ⓒ 끝 표본 = 400ms 표본 → 날 안에서 움직이는 값(입주·현장 인원·식량)이 판마다 다른 순간에 찍혔다.
//     덤: 종전 래퍼는 rAF 콜백**마다** 16.667 을 더해, uiLoop 와 한 프레임에 같이 도는 lifeLoop 의 dt 가 33.334ms 였다
//     (아래 SPEED 줄의 dGM 1.983 이 아니라 3.967 — T649 실측 149/149회). 이제 머리말 그대로 프레임당 16.667.
const { chromium } = require('playwright');
const path = require('path');

const CHROME = process.env.CHROME_PATH || undefined;   // 미지정이면 playwright 기본 브라우저
// ★랩 파일 경로: LAB_FILE 환경변수(기본 `lab/전쟁실험실.html`).
//   ⚠[T123 2026-09-05] 종전 기본값은 레포 밖 `~/Mini/…` 였다 — 랩이 레포 안으로 들어온 뒤에도 남아 조용히 어긋났다.
const LAB = 'file://' + (process.env.LAB_FILE || path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'));
const SPEED = 119;          // 관찰(slow) 상한 — dGM=119×0.016667=1.983 < 6이라 slow 유지(실보행·현장 체류 적산)
const NVIL = 2, POP = 40, SEED = 7;
const WARMUP = 2;           // 지정 전 정착 일수(상대)
const RUN_DAYS = 18;        // 지정 후 관측 일수

const FRAME_MS = 16.667;    // 한 프레임의 가상 시간(종전 래퍼의 그 수)
const INIT = (prng) => `
(() => {
  let s = ${prng};
  Math.random = function(){ s|=0; s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  let vt = 0, n = 0;
  const Q = [];
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { Q.push(cb); return Q.length; };
  // ★[T649] 한 프레임 — 줄을 비우고 시계를 한 칸 민 뒤 전부 같은 now 로(콜백이 던지면 하네스까지 그대로 올라온다)
  window.__step = () => { const q = Q.splice(0); vt += ${FRAME_MS}; n++; for (const cb of q) cb(vt); };
  // ★[T649] 랩 날 d 에 닿는 **첫 프레임**까지 민다. 마감은 실시간이 아니라 "시계가 섰나" —
  //   생활 시계(lifeLoop)가 다음 프레임 줄에 없으면 선 것이다(종전: 180초 · 1,500초 벽시계 마감).
  window.__untilDay = (d) => {
    while (VILS[0].day < d) {
      window.__step();
      if (!lifeOn || Q.indexOf(lifeLoop) < 0) throw new Error('시계 정지 — 생활 시계가 다음 프레임 줄에 없다 · day ' + VILS[0].day + ' < ' + d + ' · 프레임 ' + n);
    }
    return n;
  };
  window.__frame = () => n;
  window.__vt = () => vt;
})();
`;
// ★[T649] 미끼 판 — ⑧ 이 지키는 것(마을 집터에 예비 크루 L_PCREW_RESERVE 가 먼저 · 의뢰 집은 그 위 잉여만)을 **일부러 깬다**.
//   랩 파일은 안 건드린다 — 이 판의 페이지에서만 `pickBuildSite` 를 감싸, 의뢰 집이 서 있는 동안
//   마을 집터에 **이미 누가 붙어 있으면** 다음 사람부터는 의뢰 집으로 보낸다(예비 크루를 빼앗는다 → 마을 집터는
//   크루가 붙은 채 상한을 못 채운다). 같은 자(⑧)가 이 판에서 빨개야 ⑧ 의 초록이 무언가를 지킨다.
//   ⚠둘에 하나만 돌리는 미끼(T649 첫 판)는 ⑧ 이 초록이었다 — 마을 집터가 크루 1/10 로도 상한(1,610 인·분)을 채웠다(잉여만 뺏겼다 = 깬 게 아니다).
const DECOY = `(() => {
  const orig = pickBuildSite;
  window.pickBuildSite = function (a) {
    const r = orig(a), s = life;
    if (!r || r.player || !s) return r;
    const p = s.houses.find((h) => h.player && (h.builtFloors || 0) < (h.floors || 1));
    if (!p) return r;
    return s.agents.some((b) => b !== a && b._site === r && b.state === 'build') ? p : r;
  };
})(); true`;

const SNAP = () => {
  const v = VILS[0];
  const ph = v.houses.filter((h) => h.player), vh = v.houses.filter((h) => !h.player);
  return {
    day: v.day, pop: Math.round(v.pop),
    pDone: ph.length ? (ph[0].builtFloors || 0) >= (ph[0].floors || 1) : false,
    pBuilt: ph.length ? +(ph[0].built || 0).toFixed(3) : -1,
    pCrew: ph.length ? Math.round(ph[0]._crewTot || 0) : 0,
    vFloors: vh.reduce((a, h) => a + (h.builtFloors || 0), 0),
    vBuiltSum: +vh.reduce((a, h) => a + (h.built || 0), 0).toFixed(3),
    vSites: vh.filter((h) => (h.builtFloors || 0) < (h.floors || 1)).length,
    vHouses: vh.length,
    mapBeds: (v.econ && v.econ._mapBeds) || 0,
    bedsExpect: vh.filter((h) => (h.builtFloors || 0) >= 1).length * L_FLOORCAP,
    floorCap: L_FLOORCAP,   // ★[T219] 층당 정원을 **랩이 쥔 그 값으로** 내보낸다(하네스가 6 을 적지 않게)
    plog: (v._psiteLog || []).slice(),
    homesInPlayer: v.agents.filter((a) => a.home && ph.some((h) => a.home.cx >= h.cx - 5 && a.home.cx <= h.cx && a.home.cy >= h.cy - 5 && a.home.cy <= h.cy - 2)).length,
    onPlayer: v.agents.filter((a) => a._site && a._site.player).length,
    food: Math.round((v.econ && v.econ.storage && v.econ.storage.food) || 0),
    bld: v._bldDay || null,     // ★그날 집터별 진척·현장 노동(상한 포화 판정용)
  };
};

async function runOnce(withPlayerSite, prng, decoy) {
  prng = prng || '0x9e3779b9';
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = [], cerrs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') cerrs.push(m.text()); });
  await page.addInitScript(INIT(prng));
  await page.goto(LAB);
  await page.waitForFunction(() => typeof window.lifeToggle === 'function' && typeof VILS !== 'undefined', null, { timeout: 60000 });
  await page.evaluate(`window.__SNAP = ${SNAP}; true`);   // ★[T649] 표본 자를 페이지 안에 둔다 — 프레임 사이에서 바로 잰다(같은 함수 하나)
  if (decoy) await page.evaluate(DECOY);
  await page.evaluate(({ nv, pop, seed, sp }) => {
    document.getElementById('nvil').value = String(nv);
    document.getElementById('pop').value = String(pop);
    document.getElementById('seed').value = String(seed);
    const sel = document.getElementById('simSpeed');
    if (![...sel.options].some((o) => o.value === String(sp))) sel.add(new Option(sp + '×(하네스)', String(sp)));
    sel.value = String(sp);
    lifeToggle();
  }, { nv: NVIL, pop: POP, seed: SEED, sp: SPEED });

  const take = () => page.evaluate(() => window.__SNAP());
  const day0 = (await take()).day;

  // ★[T649] 지정 시각 = 랩 날 day0+WARMUP 의 **첫 프레임**(종전: 400ms 마다 들여다본 첫 표본 — 몇째 프레임인지가 부하를 따랐다)
  const placeFrame = await page.evaluate((d) => window.__untilDay(d), day0 + WARMUP);

  let placed = null;
  if (withPlayerSite) {
    placed = await page.evaluate(() => {
      const v = VILS[0], c = v.center;
      const cand = (v.V.territory || []).map((t) => ({ x: t[0], y: t[1], d: Math.hypot(t[0] - c.cx, t[1] - c.cy) }))
        .filter((t) => !(t.x & 1) && !(t.y & 1)).sort((a, b) => a.d - b.d);
      const rejects = {}; let target = null;
      for (const t of cand) {                       // 실패는 상태를 안 바꾼다 → 그대로 후보 훑기(거절 사유 수집 = 필터 실증)
        const r = placePlayerSite(v, t.x, t.y);
        if (r.err) { rejects[r.err] = (rejects[r.err] || 0) + 1; continue; }
        v.houses.splice(v.houses.indexOf(r.site), 1); if (v.V) v.V.houses = v.houses;   // 되돌리고
        if (v._psiteLog) v._psiteLog.pop();
        target = { x: r.site.cx, y: r.site.cy }; break;                                  // 좌표만 기억 → 실클릭으로 다시 지정
      }
      if (!target) return { err: '유효 후보 없음', rejects };
      window.psiteToggle();
      // ★클릭 좌표는 **닫힌 루프**로 맞춘다: 상태줄(gstat) innerHTML이 바뀌면 캔버스 rect가 몇 px 움직여
      //   미리 계산한 clientY가 한 셀 어긋난다(원거리 지정에서 실측). 한 번 쏘고, 빗나가면 셀 단위로 보정해 다시 쏜다.
      const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true, cancelable: true, view: window });
      let site = null, tries = [];
      for (const [ddx, ddy] of [[0, 0], [0, 1], [0, -1], [0, 2], [0, -2], [1, 0], [-1, 0], [1, 1], [-1, -1]]) {
        const r = cv.getBoundingClientRect();
        const cx2 = r.left + ((target.x + ddx) * CELL * view.z + view.ox) * r.width / 760;
        const cy2 = r.top + ((target.y + ddy) * CELL * view.z + view.oy) * r.height / 760;
        cv.dispatchEvent(mk('mousedown', cx2, cy2)); cv.dispatchEvent(mk('mouseup', cx2, cy2)); cv.dispatchEvent(mk('click', cx2, cy2));
        site = v.houses.find((h) => h.player);
        tries.push([ddx, ddy, site ? 1 : 0]);
        if (site) break;
        if (!window.__psiteOn()) window.psiteToggle();   // 실패해도 모드는 유지(성공 시 자동 해제)
      }
      return site ? { ok: true, cx: site.cx, cy: site.cy, cost: site.cost, day: v.day, rejects, modeAfter: window.__psiteOn(), cand: cand.length, tries }
        : { err: '클릭 경로로 지정 실패', target, rejects, tries };
    });
    if (placed.err) { await browser.close(); throw new Error('지정 실패: ' + placed.err + ' / 거절=' + JSON.stringify(placed.rejects)); }
  }

  // ★[T649] 관측 = 날이 바뀌는 **첫 프레임마다** 표본 하나 · 끝 = 랩 날 startDay+RUN_DAYS 의 첫 프레임
  //   (종전: 400ms 마다 들여다본 그날 첫 표본 · 끝도 그 표본 — 날 안에서 움직이는 값이 판마다 다른 순간에 찍혔다 ·
  //    마감은 1,500초 벽시계였다 — 이제 마감은 `__untilDay` 의 "시계가 섰나" 하나)
  const startDay = (await take()).day;
  const series = new Map();
  let doneDay = null, last = null;
  for (;;) {
    const s = await take(); last = s;
    if (!series.has(s.day)) series.set(s.day, s);
    if (withPlayerSite && s.pDone && doneDay === null) doneDay = s.day;
    if (s.day - startDay >= RUN_DAYS) break;
    await page.evaluate((d) => window.__untilDay(d), s.day + 1);   // 다음 랩 날의 첫 프레임까지 민다(종전: 400ms 잠)
  }
  const endFrame = await page.evaluate(() => window.__frame());
  await page.evaluate(() => { if (window.lifeOn) lifeToggle(); });
  await browser.close();
  return { placed, placeFrame, endFrame, startDay, doneDay, last, series: [...series.entries()].map(([d, s]) => [d, s]), errs, cerrs };
}

(async () => {
  let fail = 0;
  const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
  console.log('=== 10차 T3 · 랩 플레이어 의뢰 집 건설(B안) 헤드리스 검증 ===');
  console.log(`설정: 마을 ${NVIL}개 · 초기인구 ${POP} · seed ${SEED} · 속도 ${SPEED}×(slow) · 결정론(Math.random+가상시계 고정 · 프레임은 하네스가 민다) · 관측 ${RUN_DAYS}일`);

  console.log('\n[B런 — 플레이어 집터 지정]');
  const B = await runOnce(true);
  console.log('  지정 결과: ' + JSON.stringify({ cx: B.placed.cx, cy: B.placed.cy, day: B.placed.day, 자재스텁: B.placed.cost, 모드해제: B.placed.modeAfter === false }));
  console.log(`  시계: 지정 = 프레임 ${B.placeFrame}(랩 날 ${B.placed.day} 의 첫 프레임) · 끝 = 프레임 ${B.endFrame}(랩 날 ${B.last.day} 의 첫 프레임) — 실시간 0`);
  console.log('  후보 ' + B.placed.cand + '칸 훑는 동안의 거절 사유 분포: ' + JSON.stringify(B.placed.rejects));
  console.log('  공정 로그(단계 전이만):');
  for (const e of (B.last.plog || [])) console.log(`    day ${e.day} · ${e.label} — built ${e.built} · 현장 누적 ${e.crewSec} 인·분`);

  chk(!!B.placed.ok, '① 실제 캔버스 클릭 경로로 집터 지정 성공 — (' + B.placed.cx + ',' + B.placed.cy + ')');
  chk(Object.keys(B.placed.rejects || {}).length > 0, '② 같은 하드 필터가 불가 자리를 거절 — 사유: ' + Object.keys(B.placed.rejects || {}).join(' / '));
  const stages = new Set((B.last.plog || []).filter((e) => e.stage >= 0).map((e) => e.stage));
  chk([1, 2, 3].every((s) => stages.has(s)) && stages.has(0), '③ 4단계 공정 실측 통과 — 관측 stage ' + [...stages].sort().join(','));
  chk(B.doneDay !== null, '④ 완공 도달 — 지정 day ' + B.placed.day + ' → 완공 day ' + B.doneDay + ' (' + (B.doneDay - B.placed.day) + '일)');
  chk(B.last.pCrew > 0 && B.last.pCrew >= 4600 * 0.9, `⑤ 진척 동력 = 크루 현장 체류분뿐 — 누적 ${B.last.pCrew} 인·분 (L_BUILDSEC=4600, 공동 노역 바닥 0)`);
  chk(B.last.homesInPlayer === 0, '⑥ 마을 주민 입주 0명(침대 명부 제외) — 실측 ' + B.last.homesInPlayer);
  // ★★[T212 회부 → T219 정정] ⑦ 은 **자명 통과가 될 수 있었다.**
  //   두 수를 같은 배열에서 뽑는데(`v.houses`), 완공 집이 0 채면 `0 === 0` 으로 초록이 된다 —
  //   그러면 "플레이어 집이 명부에서 빠졌다"를 **한 번도 안 재고** 통과한다.
  //   ⇒ 전제를 앞에 세운다: ⓐ 명부가 비어 있지 않다 · ⓑ 완공된 **의뢰 집이 실제로 있다**
  //     (그게 없으면 제외할 것이 없다) · ⓒ 그 의뢰 집을 세면 값이 **달라진다**(자가 반증).
  //   ⚠ `MAX_FLOORS=1` 이라 `Σ builtFloors ≡ |{builtFloors≥1}|` 다 — 층이 둘 서는 날이 오면
  //     두 식은 셈 방식으로 갈라진다. ⓓ 가 그날을 잡아 준다(가짜 실패를 미리 이름 붙인다).
  {
    const L7 = B.last;
    chk(L7.mapBeds > 0 && L7.bedsExpect > 0,
      `⑦ⓐ (전제) 침대 명부가 비어 있지 않다 — _mapBeds ${L7.mapBeds} · 기준 ${L7.bedsExpect} (양쪽 0 이면 자명 통과다)`);
    chk(L7.pDone === true, '⑦ⓑ (전제) 완공된 **의뢰 집이 실제로 있다** — 제외할 것이 있는 판이다');
    chk(L7.mapBeds === L7.bedsExpect,
      `⑦ econ 침대 명부에 플레이어 집 미포함 — _mapBeds ${L7.mapBeds} = 마을 완공집 기준 ${L7.bedsExpect}`);
    chk(L7.mapBeds !== L7.bedsExpect + L7.floorCap,
      `⑦ⓒ ★자가 반증 — 의뢰 집을 셌다면 ${L7.bedsExpect + L7.floorCap} 이 나왔을 자리다(실측 ${L7.mapBeds})`);
    chk(L7.vFloors === L7.vHouses - L7.vSites,
      `⑦ⓓ 마을 집은 전부 단층이다 — 층합 ${L7.vFloors} = 완공 ${L7.vHouses - L7.vSites}채 (층이 둘 서면 ⑦ 의 두 식이 갈라진다)`);
  }
  chk(B.errs.length === 0, 'pageerror ' + B.errs.length + '건' + (B.errs.length ? ': ' + B.errs.slice(0, 3).join(' | ') : ''));
  chk(B.cerrs.length === 0, 'console error ' + B.cerrs.length + '건' + (B.cerrs.length ? ': ' + B.cerrs.slice(0, 2).join(' | ') : ''));

  console.log('\n[A런 — 플레이어 집터 없음(회귀 대조)] / [A′런 — A와 같되 난수 씨앗만 다름(잡음 대조군)]');
  const A = await runOnce(false, '0x9e3779b9');
  const A2 = await runOnce(false, '0x51ed2701');     // ★잡음 대조군: 플레이어 집과 무관한 순수 카오스 편차의 크기를 잰다
  chk(A.errs.length === 0, 'A런 pageerror ' + A.errs.length + '건');
  chk(A2.errs.length === 0, 'A′런 pageerror ' + A2.errs.length + '건');

  // ── ⑧ 인과 판정: "마을 집터가 크루 붙은 날 하루 상한(L_BUILDCAP)을 채웠는가" ──
  //    층수 A/B 비교는 잡음에 묻힌다(집터 하나가 늘면 벌채·잠재농지·난수 스트림이 전부 갈라진다).
  //    빼앗겼는지 여부는 **상한 포화**로 직접 본다: 상한을 채운 날엔 크루를 더 붙여도 진척이 0이므로,
  //    그 잉여를 플레이어에게 돌린 것은 마을에서 아무것도 뺏지 않은 것이다.
  const capStat = (run) => {
    let crewed = 0, sat = 0, sumInc = 0;
    for (const [, s] of run.series) {
      if (!s.bld) continue;
      for (const r of (s.bld.v || [])) { if (r.crew > 0) { crewed++; sumInc += r.inc; if (r.inc >= r.cap - 1e-6) sat++; } }
    }
    return { crewed, sat, mean: crewed ? +(sumInc / crewed).toFixed(4) : 0 };
  };
  const sat8 = (c) => c.crewed > 0 && c.sat === c.crewed;   // ⑧ 의 자 — 아래 미끼도 **같은 자**로 잰다
  const ca = capStat(A), cb = capStat(B);
  console.log(`  마을 집터 '크루 붙은 날' 하루 상한 포화율 — A ${ca.sat}/${ca.crewed}(평균 진척 ${ca.mean}) · B ${cb.sat}/${cb.crewed}(평균 진척 ${cb.mean}) · 상한 0.35`);
  chk(sat8(cb),
    `⑧ 마을 집터는 크루가 붙은 날 **전부** 하루 상한을 채웠다 — B ${cb.sat}/${cb.crewed}일 (여유 크루만 빌려줬다는 인과 증거)`);
  // ★[T649] 자명 통과 금지 — 지키는 대상(마을 집터가 먼저)을 **일부러 깬** 판에서는 같은 자가 빨개야 한다.
  //   B 와 같은 판(같은 난수 · 같은 지정 프레임)에 미끼만 얹는다. 크루가 붙은 날이 남아 있어야(crewed>0) 빨강이 "포화를 못 채웠다"는 뜻이다.
  const D = await runOnce(true, undefined, true);
  const cd = capStat(D);
  console.log(`  [미끼 B′] 의뢰 집이 서 있는 동안 마을 집터엔 먼저 붙은 한 사람만 — 지정 (${D.placed.cx},${D.placed.cy}) 프레임 ${D.placeFrame} · 포화 ${cd.sat}/${cd.crewed}(평균 진척 ${cd.mean})`);
  chk(cd.crewed > 0 && !sat8(cd),
    `⑧ⓜ 자명 통과 금지 — 예비 크루를 일부러 빼앗은 미끼 판은 같은 자로 **빨강** — B′ ${cd.sat}/${cd.crewed}일 (크루 붙은 날 ${cd.crewed} 중 ${cd.crewed - cd.sat}일 상한 미달)`);

  const am = new Map(A.series), bm = new Map(B.series), a2m = new Map(A2.series);
  const days = [...am.keys()].filter((d) => bm.has(d) && a2m.has(d)).sort((a, b) => a - b);
  console.log('  day | A | B | A′ | B−A | A′−A(잡음)');
  let maxD = 0, lastD = 0, maxN = 0, lastN = 0;
  for (const d of days) {
    const a = am.get(d), b = bm.get(d), a2 = a2m.get(d), df = b.vFloors - a.vFloors, nz = a2.vFloors - a.vFloors;
    if (Math.abs(df) > Math.abs(maxD)) maxD = df; lastD = df;
    if (Math.abs(nz) > Math.abs(maxN)) maxN = nz; lastN = nz;
    if (d % 4 === 0 || d === days[days.length - 1]) console.log(`  ${d} | ${a.vFloors} | ${b.vFloors} | ${a2.vFloors} | ${df >= 0 ? '+' : ''}${df} | ${nz >= 0 ? '+' : ''}${nz}`);
  }
  console.log(`  마을 완공층 편차: B−A 최대 ${maxD}·최종 ${lastD} / A′−A(잡음) 최대 ${maxN}·최종 ${lastN} — 공통 ${days.length}일`);
  chk(Math.abs(lastD) <= Math.max(1, Math.abs(maxN)),
    `⑨ B−A 편차(${lastD})가 순수 잡음 편차(A′−A 최대 ${maxN}) 범위 안 — 층수 차이는 계통 손실이 아니라 카오스 갈라짐`);

  console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('하네스 오류:', e && e.stack || e); process.exit(2); });
