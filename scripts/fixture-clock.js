// === scripts/fixture-clock.js — 하네스 픽스처 **정본** [T140 2026-09-06] ==============
//
// ★★재민 판정(T140): **상황 설정은 얼린 시계 위에 선다.**
//   T131 이 회부한 증상: `e2e-thirst ①`("한여름 낮")·`e2e-cold ①`("혹한급")이 **같은 수 0.5634** 로
//   빨갛고, 순정 베이스도 같고, 부하가 있으면 0.8647 로 바뀌었다.
//
// ★§0 이 밝힌 진짜 원인 — **얼리는 손잡이는 멀쩡했다.** `__e2e_clock` 은 정확히 작동한다
//   (실측: 보내기 전 cold 0.5634 → 보낸 뒤 **0** · 서버 회신 `{"day":133,"night":false}`).
//   틀린 것은 **기다리는 방식**이었다: 두 하네스가 `sleep(2000)` 한 뒤 곧바로 읽는데,
//   클라의 `__wx` 는 **초당 하나 오는 `gauges`** 로만 갱신된다. 2코어 상자에서 존 틱이 밀리면
//   그 한 건이 2초 안에 안 오고, 하네스는 **픽스처 이전의 값**을 읽는다.
//   ⇒ 0.5634 = `outdoorCold(day 0, night false)` · 0.8647 = `outdoorCold(day 0, night true)` —
//     둘 다 **얼기 전의 세계**(econ day 0 + 벽시계 밤낮)다. 부하에 따라 밤낮이 갈렸을 뿐이다.
//
// ⇒ 그래서 고치는 것은 **시간이 아니라 판정**이다: 정해진 초를 자는 대신
//   **세계가 그 시계를 말할 때까지 기다린다**(`tempC` 가 증인 — 순수 함수라 부하와 무관하다).
//
// ★새 손잡이 0 — `__e2e_clock`(E2E_GIVE 게이트)은 이미 있던 문법이다. 서버 한 줄도 안 고쳤다.
// ★사본 금지 — 두 하네스가 각자 세우면 그게 사본이다. 여기 **한 자리**에 둔다.
//   (`scripts/client-src.js` 선례 — 하네스가 공유하는 헬퍼는 `test-*`·`e2e-*` 이름을 안 쓴다.
//    러너도 린트도 그 두 이름만 줍기 때문에 이 파일은 하네스로 세어지지 않는다.)
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Wx = require(path.join(ROOT, 'server', 'weather.js'));

/** 여름 골·겨울 봉우리 — **econ 기온 곡선 자신**이 정한다(하네스가 날짜를 고르지 않는다). */
function anchorDays() {
  const a = Wx.anchors();
  if (!a) throw new Error('fixture-clock: weather 앵커가 없다(econ 미적재)');
  return { summer: Math.round(a.summerMid), winter: Math.round(a.winterMid) };
}

/** 얼린 시계에서 **기대되는 수** — `outdoorCold`·`tempAt` 은 (day,night,elev) 의 순수 함수라
 *  부하·벽시계와 무관하다. 하네스는 이 값과 대조하면 되고, 문턱을 손으로 고르지 않아도 된다. */
function expectAt(day, night) {
  const d = day | 0, n = !!night;
  return { day: d, night: n, cold: Wx.outdoorCold(d, n, 0), tempC: +Wx.tempAt(d, n, 0).toFixed(1) };
}

/** 시계를 세우고 **세계가 그렇게 말할 때까지 기다린다.**
 *  @returns {ok, waited, want, got} — ok=false 면 하네스가 그 자리에서 빨갛게 멈추면 된다.
 *  ⚠`sleep(n)` 로 바꾸지 마라. 그게 T131 이 회부한 그 결함이다.
 *
 *  ★★증인이 둘인 이유(실측이 가르쳤다):
 *   ① `tempC` — (day,night) 하나에서만 나오는 수다(`cold` 는 여러 날이 같은 값을 낼 수 있다).
 *   ② `shelter` 가 **있다** — 이게 없으면 그 페이로드는 `welcome`(입장 배지 · `weatherNow`)이지
 *      내 몸이 보는 초당 `gauges`(`weatherFor`)가 아니다. 실측: 판 중간에 클라가 다시 붙으면
 *      **새 welcome 이 얼린 날씨를 실어 와** ①만으로는 통과해 버리고, 정작 그 뒤 절들은
 *      `shelter undefined` 로 줄줄이 죽었다(cold 1판 · 17건). 얼린 것과 **받고 있는 것**은 다른 물음이다.
 *  ★그리고 기다리는 동안 **다시 보낸다** — 붙는 중에 보낸 한 건은 아무 데도 안 닿는다. */
async function setClock(page, opts) {
  const day = (opts && opts.day) | 0, night = !!(opts && opts.night);
  if (!Number.isFinite(day)) throw new Error(`fixture-clock: day 가 유한하지 않다 (${opts && opts.day})`);
  const want = expectAt(day, night);
  const timeoutMs = (opts && opts.timeoutMs) || 60000;
  const stepMs = (opts && opts.stepMs) || 500;
  const resendMs = (opts && opts.resendMs) || 3000;
  const send = () => page.evaluate((a) => {
    if (typeof window.__sendPrimary === 'function') window.__sendPrimary({ type: '__e2e_clock', day: a[0], night: a[1] });
  }, [day, night]);
  const t0 = Date.now();
  await send();
  // ★되돌림 = 돌연변이 손잡이(env 한 줄). `T140_FIXTURE_WAIT=0` 이면 **옛 방식**(정해진 초를 자고 읽는다)
  //   으로 떨어진다 — 그러면 부하에 따라 판마다 다른 수가 나온다. 그게 T131 이 본 증상이고,
  //   이 손잡이가 "이 검사는 실패할 수 있다"를 실측으로 보인다(자명 통과 금지 · 자식 프로세스+env).
  if (process.env.T140_FIXTURE_WAIT === '0') {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await page.evaluate(() => (window.__wx ? window.__wx() : null));
    return { ok: hit(g, want, night), waited: Date.now() - t0, want, got: g, legacy: true };
  }
  let got = null, lastSend = t0;
  while (Date.now() - t0 < timeoutMs) {
    got = await page.evaluate(() => (window.__wx ? window.__wx() : null));
    if (hit(got, want, night)) return { ok: true, waited: Date.now() - t0, want, got };
    if (Date.now() - lastSend >= resendMs) { await send(); lastSend = Date.now(); }
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return { ok: false, waited: Date.now() - t0, want, got };
}

/** 증인 둘을 한자리에서 — 하네스가 각자 적으면 그게 사본이다. */
function hit(g, want, night) {
  return !!(g && g.shelter !== undefined && g.night === night && Math.abs(g.tempC - want.tempC) < 0.05);
}

/** ★[T140] 마을 시딩을 **기다린다** — 같은 병의 다른 얼굴이다.
 *  `e2e-cold` 는 존이 뜨자마자 `villages` 를 읽는데, 이 상자에서 50곳 시딩은 부팅보다 늦게 끝난다.
 *  실측: 같은 커밋·같은 하네스가 한 판은 50곳, 다음 판은 **0곳**으로 통째로 중단됐다(부하 의존).
 *  ⇒ 여기서도 정해진 초를 자지 않는다. **세계가 마을을 말할 때까지** 기다린다(T126 이 `e2e-verbs` 에
 *    같은 참을성을 심은 선례 그대로 · 판정은 그대로 "0곳이면 빨강"이다). */
async function waitVillages(dbPath, opts) {
  const { DatabaseSync } = require('node:sqlite');
  const timeoutMs = (opts && opts.timeoutMs) || 180000;
  const zone = (opts && opts.zone) || 'hanbando';
  const t0 = Date.now();
  let rows = [];
  while (Date.now() - t0 < timeoutMs) {
    try {
      const db = new DatabaseSync(dbPath);
      rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all(zone);
      db.close();
    } catch (e) { rows = []; }
    if (rows.length) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { rows, waited: Date.now() - t0 };
}

/** ★[T140] 입장을 **기다린다** — 같은 병의 세 번째 얼굴이다.
 *  두 하네스 모두 `for (i<60) sleep(500)` = **30초**로 잘라 놓았는데, 부하가 있으면 그 안에
 *  못 들어온다(실측: 부하 판에서 `존 입장` 빨강 · 그 뒤 절들은 멀쩡히 통과했다 — 즉 늦었을 뿐이다).
 *  ⇒ 늦는 것과 안 되는 것은 다른 일이다. 판정("끝내 못 들어오면 빨강")은 그대로 두고 **참을성만** 늘린다. */
async function waitInWorld(page, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || 180000;
  const stepMs = (opts && opts.stepMs) || 500;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const inw = await page.evaluate(() => !!(window.__inWorld && window.__inWorld()));
    if (inw) return { ok: true, waited: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return { ok: false, waited: Date.now() - t0 };
}

module.exports = { anchorDays, expectAt, setClock, waitVillages, waitInWorld };
