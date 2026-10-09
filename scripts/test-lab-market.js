#!/usr/bin/env node
// === 10차 T4 — 랩 장마당(계절 장) 헤드리스 검증 하네스 ===
//
// 검증 항목(전부 실측):
//   ① 개장: 교역 NPC가 상대 마을 마당에 닿으면 그 마을 _mktUntil이 서고 주민 일부가 모인다.
//   ② 새 상태 없음: 모인 주민의 state는 **기존 'trading'** 그대로다(발명 0).
//   ③ 자리: 모인 주민은 큰집 마당(문 앞 MKT_SPOTS) 반경 안에 있다 — 아무 데나 서지 않는다.
//   ④ 인원 상한: 인구 × L_MKT_FRAC 이하(마을이 통째로 장에 나가 생산이 서지 않는다).
//   ⑤ 일하는 사람 미차출: 개장 순간 build/gran/toGran 상태였던 인원은 한 명도 끌려가지 않는다.
//   ⑥ 파장: _mktUntil이 지나면 전원 흩어지고(_mkt 해제) 좌판도 사라진다.
//   ⑦ pageerror·console error 0.
//
// 결정론(랩은 안 건드린다 — 하네스가 페이지에 심는다): ★[T660] 시계 정본 `fixture-lab-clock`(T649 꼴)
//   · Math.random = mulberry32(고정 씨) · rAF 는 줄로 받고 프레임은 하네스가 민다 · 토글 전 0 프레임(시계 원점 0)
//   · **개장을 본 첫 프레임 · 도착 최대 프레임 · 파장을 본 첫 프레임**을 프레임마다 잰다(종전: 300ms 마다 들여다본 표본 —
//     몇째 프레임을 보는지가 상자 부하를 따랐고, 원점(토글 때 vt)도 적재 시간을 따랐다)
//   · 기다림 한도 WAIT_MS 는 **가상시계**로 잰다(종전: 벽시계 900초 — 상자가 느리면 덜 기다렸다)
const { chromium } = require('playwright');
const path = require('path');
const LC = require('./fixture-lab-clock');

const CHROME = process.env.CHROME_PATH || undefined;   // 미지정이면 playwright 기본 브라우저
// ★랩 파일 경로: LAB_FILE 환경변수(기본 `lab/전쟁실험실.html`).
//   ⚠[T123 2026-09-05] 종전 기본값은 `~/Mini/전쟁실험실.html`(레포 밖)이었다 — 랩이 레포 안으로
//     들어온 뒤(PM c7778a49)에도 남아 있어서, 컨테이너·CI 에선 *파일을 못 찾고* 맥에선 *레포가 아닌 사본*을 쟀다.
//     같은 사고를 sim/inline-engine.js·inline-path.js·scripts/lab-wiring-check.js 에서도 고쳤다.
const LAB = 'file://' + (process.env.LAB_FILE || path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'));
const SPEED = 119, NVIL = 4, POP = 40, SEED = 7;
const WAIT_MS = 900000;     // ★[T660] 개장을 기다리는 한도 — 가상시계(ms · 원점 0)로 잰다

const INIT = LC.init('0x9e3779b9');

const PROBE = () => {
  const out = { gm: lifeGM, day: VILS[0] ? VILS[0].day : -1, open: [], traders: 0 };
  for (const v of VILS) {
    out.traders += v.agents.filter((a) => a.state === 'trading' && !a._mkt).length;
    if (!v._mktUntil || v._mktUntil <= lifeGM) continue;
    const att = v.agents.filter((a) => a._mkt);
    const spots = MKT_SPOTS.map((s) => ({ x: v.center.cx + s[0], y: v.center.cy + s[1] }));
    let inYard = 0, arrived = 0, states = {};
    for (const a of att) {
      states[a.state] = (states[a.state] || 0) + 1;
      const d = Math.min(...spots.map((s) => Math.hypot(s.x - a.px, s.y - a.py)));
      if (d <= 3) inYard++;
      if (!a.path || a.pi >= a.path.length) arrived++;
    }
    out.open.push({
      name: v.name, pop: v.agents.length, att: att.length, inYard, arrived, states,
      until: Math.round(v._mktUntil - lifeGM), frac: +(att.length / Math.max(1, v.agents.length)).toFixed(3),
      busyPulled: att.filter((a) => a._site || a._gran).length,
    });
  }
  return out;
};

// ★[T660] 미끼 판 — ③ 이 지키는 것(모인 주민은 큰집 마당 좌판 반경 안 — 아무 데나 서지 않는다)을 **일부러 깬다**.
//   랩 파일은 안 건드린다 — 이 판의 페이지에서만 `openMarket` 을 감싸, 장이 설 때마다 **장에 안 간 한가한 주민 중
//   마당에서 가장 먼 하나**를 그 자리에서 참여자로 세운다(좌판으로 걷지 않는다). 일하는 사람은 안 건드린다(⑤ 와 섞지 않는다).
//   같은 자(③)가 이 판에서 빨개야 ③ 의 초록이 무언가를 지킨다.
const DECOY = `(() => {
  const orig = openMarket;
  const wrap = function (vil) {
    const r = orig(vil);
    const sp = MKT_SPOTS.map((q) => ({ x: vil.center.cx + q[0], y: vil.center.cy + q[1] }));
    const dist = (a) => Math.min(...sp.map((q) => Math.hypot(q.x - a.px, q.y - a.py)));
    let far = null;
    for (const a of vil.agents) {
      if (a._mkt || a._muster || a.rest || a.state === 'trading' || a.state === 'build' || a.state === 'gran' || a.state === 'toGran') continue;
      if (!far || dist(a) > dist(far)) far = a;
    }
    if (far) { far.state = 'trading'; far._mkt = 1; far.action = '장마당'; far.path = null; }
    return r;
  };
  window.openMarket = wrap;
  try { eval('openMarket = wrap'); } catch (e) { }
})(); true`;

const yard3 = (pk) => pk.arrived > 0 && pk.inYard === pk.att;   // ③ 의 자 — 미끼도 **같은 자**로 잰다

async function runOnce(decoy) {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = [], cerrs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') cerrs.push(m.text()); });
  await page.addInitScript(INIT);
  await page.goto(LAB);
  await page.waitForFunction(() => typeof window.lifeToggle === 'function' && typeof VILS !== 'undefined', null, { timeout: 60000 });
  await page.evaluate(({ nv, pop, seed, sp }) => {
    document.getElementById('nvil').value = String(nv);
    document.getElementById('pop').value = String(pop);
    document.getElementById('seed').value = String(seed);
    const sel = document.getElementById('simSpeed');
    if (![...sel.options].some((o) => o.value === String(sp))) sel.add(new Option(sp + '×(하네스)', String(sp)));
    sel.value = String(sp);
    lifeToggle();
  }, { nv: NVIL, pop: POP, seed: SEED, sp: SPEED });
  if (decoy) await page.evaluate(DECOY);   // 미끼는 아래 기록 감싸기 **안쪽**에 둔다 — 기록(⑤)이 미끼까지 본다

  // ★개장 순간 스냅샷을 랩 안에서 직접 잡는다(폴링 사이에 놓치지 않게): openMarket을 감싼다.
  await page.evaluate(() => {
    window.__mktLog = [];
    const orig = window.openMarket || openMarket;
    const wrap = function (vil) {
      const busyBefore = vil.agents.filter((a) => a.state === 'build' || a.state === 'gran' || a.state === 'toGran').map((a) => a);
      const r = orig(vil);
      const pulled = busyBefore.filter((a) => a._mkt).length;
      window.__mktLog.push({ day: vil.day, name: vil.name, got: r, pop: vil.agents.length, busyBefore: busyBefore.length, pulled });
      return r;
    };
    window.openMarket = wrap;
    try { eval('openMarket = wrap'); } catch (e) { }
  });
  await page.evaluate(`window.__PROBE = ${PROBE}; true`);   // 표본 자를 페이지 안에 둔다 — 프레임마다 바로 잰다(같은 함수 하나)

  // ★[T660] 프레임마다 민다·잰다: 개장을 본 첫 프레임 · 도착 최대(처음 닿은) 프레임 · 파장을 본 첫 프레임.
  //   (종전: 300ms 마다 PROBE 한 번 · 벽시계 900초 — 어느 프레임을 보는지가 부하를 따랐다)
  const R = await page.evaluate((waitMs) => {
    let sawOpen = null, peak = null, close = null;
    while (window.__vt() < waitMs) {
      const f = window.__tick();
      const p = window.__PROBE();
      if (p.open.length) {
        const o = p.open[0];
        if (!peak || o.arrived > peak.arrived) peak = Object.assign({ frame: f, day: p.day }, o);
        if (!sawOpen) sawOpen = Object.assign({ frame: f, day: p.day }, o);
      } else if (sawOpen) {
        let mkt = 0, trading = 0;
        for (const v of VILS) { mkt += v.agents.filter((a) => a._mkt).length; trading += v.agents.filter((a) => a.state === 'trading').length; }
        close = { mkt, trading, day: VILS[0].day, frame: f };
        break;
      }
    }
    return { sawOpen, peak, close, frame: window.__frame() };
  }, WAIT_MS);

  const log = await page.evaluate(() => window.__mktLog || []);
  await page.evaluate(() => { if (window.lifeOn) lifeToggle(); });
  await browser.close();
  return Object.assign(R, { log, errs, cerrs });
}

(async () => {
  let fail = 0;
  const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
  console.log('=== 10차 T4 · 랩 장마당(계절 장) 헤드리스 검증 ===');
  console.log(`설정: 마을 ${NVIL}개 · 인구 ${POP} · seed ${SEED} · 속도 ${SPEED}×(slow) · 결정론(Math.random+가상시계 · 프레임은 하네스가 민다)`);

  const M = await runOnce(false);
  const { sawOpen, peak, close, log, errs, cerrs } = M;
  if (sawOpen) console.log(`  [개장] day ${sawOpen.day} · ${sawOpen.name} · 참여 ${sawOpen.att}명/인구 ${sawOpen.pop}(${(sawOpen.frac * 100).toFixed(0)}%) · 잔여 ${sawOpen.until} 게임분`);
  if (close) {
    console.log(`  [파장] day ${close.day} · _mkt 잔존 ${close.mkt}명 · trading 상태 ${close.trading}명(원래 교역 NPC 포함)`);
    chk(close.mkt === 0, '⑥ 파장 후 장마당 참여 상태 전원 해제 — 잔존 ' + close.mkt + '명');
  }
  console.log(`  시계: 개장 = 프레임 ${sawOpen ? sawOpen.frame : '-'} · 도착 최대 = 프레임 ${peak ? peak.frame : '-'} · 파장 = 프레임 ${close ? close.frame : '-'} · 끝 = 프레임 ${M.frame} — 실시간 0`);

  console.log('  개장 기록: ' + JSON.stringify(log.slice(0, 6)));
  chk(!!sawOpen, '① 개장 실측 — 캐러밴 도착이 마당에 장을 세웠다' + (sawOpen ? ` (${sawOpen.name})` : ''));
  if (sawOpen) {
    const st = Object.keys(peak.states || {});
    chk(st.length === 1 && st[0] === 'trading', '② 참여자 상태 = 기존 trading 하나뿐(새 상태 발명 0) — 관측 ' + JSON.stringify(peak.states));
    chk(yard3(peak), `③ 참여자 전원이 마당 좌판 반경(≤3셀) 안 — ${peak.inYard}/${peak.att}명 (도착 ${peak.arrived}명)`);
    chk(peak.frac <= 0.19, `④ 참여 비율 ${(peak.frac * 100).toFixed(1)}% ≤ L_MKT_FRAC 18%(+반올림) — 마을이 통째로 장에 나가지 않는다`);
    const pulled = log.reduce((a, l) => a + l.pulled, 0), busy = log.reduce((a, l) => a + l.busyBefore, 0);
    chk(pulled === 0, `⑤ 일하던 인원(건축·곳간) 차출 0명 — 개장 시점 작업 중 누계 ${busy}명 중 ${pulled}명 차출`);
  }
  chk(errs.length === 0, 'pageerror ' + errs.length + '건' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  chk(cerrs.length === 0, 'console error ' + cerrs.length + '건' + (cerrs.length ? ': ' + cerrs.slice(0, 2).join(' | ') : ''));

  // ★[T660] 자명 통과 금지 — 지키는 대상(③)을 일부러 깬 판에서는 같은 자가 빨개야 한다.
  //   같은 씨 · 같은 시계(개장 전까지 세계가 같다)에 미끼만 얹는다. 개장을 봤어야(sawOpen) 빨강이 "좌판 밖 참여자를 잡았다"는 뜻이다.
  const D = await runOnce(true);
  const dp = D.peak;
  console.log(`  [미끼 B′] 장이 설 때마다 한가한 주민 중 마당에서 가장 먼 하나를 제자리 참여자로 — 개장 프레임 ${D.sawOpen ? D.sawOpen.frame : '-'} · 도착 최대 ${dp ? dp.inYard + '/' + dp.att + '명 마당 안 (도착 ' + dp.arrived + '명)' : '-'}`);
  chk(!!D.sawOpen && !!dp && !yard3(dp),
    `③ⓜ 자명 통과 금지 — 좌판 밖 참여자를 일부러 심은 미끼 판은 같은 자로 **빨강** — B′ ${dp ? dp.inYard + '/' + dp.att : '-'}명`);

  console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('하네스 오류:', (e && e.stack) || e); process.exit(2); });
