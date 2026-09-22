#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 **세 밤** 분할(T238 · 소요로 균등) · `run-regress.sh --list "nightly A"`
// === scripts/e2e-conn.js — 접속 실패의 **가시성** 실클라 E2E ======================
//
// ★왜 [재민 확정 2026-08-30]
//   실기 실측(라이브 로그): 소켓은 열리는데 `welcome` 도 `pong` 도 안 와서 클라가
//   **15초마다 끊고 다시 붙기를 무한 반복**했다. 화면엔 아무 말도 없었다.
//   재민 원문: *"자꾸 언제는 기다리면 됐다가 언제는 안 됐다 그래.. 이게 기다리면 되는 건지,
//   진짜 에러인지 사용자한테 구분 가게 해야 하는 거 아냐? 물론 에러는 수정하고.."*
//
//   원인 구조: `wss.on('connection', async …)` 에 **try/catch 가 없었다.**
//   중간에 던지면 소켓은 열린 채 남고 `attachPlayerHandlers` 에 도달하지 못해
//   **메시지 핸들러가 아예 안 붙는다** → welcome 도 pong 도 영영 안 온다 = 완벽한 침묵.
//
//   이 하네스가 재는 것: 그 침묵이 **사라졌는가**, 그리고 화면이 **두 종류를 구분해 말하는가**.
//     ⓐ 정상 → 배너 없음  ⓑ 서버가 던짐 → 빨강 "확정 오류" + 사유·단계·ref + 새로고침 단추
//     ⓒ 서버가 조용함 → 노랑 "기다리는 중" → 오래되면 빨강  ⓓ 재시도 간격이 늘어난다(백오프)
//
// ★★자명 통과 금지: ⓑ는 **일부러 던지게** 해서(E2E_CONN_FAIL) 실패를 만들어 검사한다.
//   실패를 못 만들면 "잡는다"는 판정은 아무것도 증명하지 않는다.
//
// 실행: node scripts/e2e-conn.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-conn-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-conn-c-${process.pid}.db`, ZDB = `/tmp/e2e-conn-z-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const zoneLog = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  const cap = (b) => { const s = String(b); if (name === 'zone') zoneLog.push(s); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 90)}\n`); };
  p.stdout.on('data', cap); p.stderr.on('data', cap);
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', killAll);
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
const ZENV = (extra) => Object.assign({
  PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
  VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
}, extra || {});

(async () => {
  console.log('\n=== 접속 실패의 가시성 실클라 E2E (Chromium) ===');
  const _central = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  // ★★[T349 2026-09-21] 기동 증인은 **아이의 입**이다(정본 `fixture-boot.waitUp` · T344).
  //   포트 응답(`waitHttp(/zones)`)은 증인이 아니었다 — 앞 판 central 이 포트를 쥔 채면 새 central 은
  //   `EADDRINUSE` 로 즉시 죽는데 `waitHttp` 는 **앞 판의 central** 에게 200 을 받아 "떴다"고 답한다.
  //   ⚠**듣기는 여기서 시작한다**(`await` 는 아래 `ok` 자리에서) — 아이가 표식을 찍는 것은 ~120ms 뒤라
  //     그 사이 다른 `await` 를 지나면 줄을 놓친다. 띄운 **그 틱에** 귀를 붙인다.
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _up = await _upP;
  ok(_up.ok, 'central 기동', _up.ok ? `${_up.ms}ms · 아이가 제 입으로 말했다` : _up.why);
  let zone = boot('zone', 'zone.js', ZENV());
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const snapOf = async (page, n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const conn = (page) => page.evaluate(() => window.__connState());
  const enter = async (page) => {
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2200);
    // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
    const b = await page.$('#enter');
    if (b) await b.click();
  };
  // ★`__getMyAbs()` 를 입장 게이트로 쓰면 안 된다 — `{x:0,y:0}` 로 시작해 **언제나 truthy** 다
  //   (기존 하네스 다수가 이 자명 통과를 쓰고 있다 — 회부에 적었다).
  //   `__inWorld()` 는 welcome 을 받았는지를 그대로 답한다.
  const inWorld = (page) => page.evaluate(() => (window.__inWorld ? window.__inWorld() : false));
  // ★★[T322 2026-09-19] **조건 대기 하나**(사본 0) — 예산형(시도 횟수 × 잠)을 대신한다.
  //   예산형은 판정문에 상수가 없어 어떤 자에도 안 걸리는데, 예산이 다 되면 **그 다음 `ok` 가**
  //   빨개진다(09-18 야간 "24초 경과" 가 그 수다 · T314 ⓒ-3). 여기선 **세계가 말할 때까지** 기다리고,
  //   상한에 걸리면 **그 사실에 이름을 붙여** 돌려준다(조용한 빨강 0).
  const CAP = 120000;   // 표의 수 — 판정에 안 든다(걸리면 부르는 쪽이 사유를 말한다)
  const waitFor = async (fn) => {
    const t = Date.now(); let v = null;
    while (Date.now() - t < CAP) { v = await fn(); if (v) return { v, ms: Date.now() - t }; await sleep(200); }
    return { v: null, ms: Date.now() - t, timedOut: true };
  };

  // ── ① 정상 접속 — 배너가 안 뜬다, 그러나 hello 는 왔다 ────────────────────
  console.log('\n① 정상 — 조용해야 정상이다(다만 서버는 "받았다"를 말했다)');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await enter(page);
    // ★[T338] 예산형(60×500ms = 30초) → 조건 대기. 상한은 표에만.
    const r1 = await waitFor(async () => (await inWorld(page)) || null);
    ok(!!r1.v, '★① 정상 접속', r1.timedOut ? `${(CAP / 1000) | 0}초 동안 안 들어갔다` : `${r1.ms}ms 만에`);
    const c = await conn(page);
    ok(c.phase === 'ready', '★① 상태가 ready', c.phase);
    ok(c.everReady === true && c.hello === false, '★① welcome 뒤엔 대기 표식이 정리된다', JSON.stringify({ everReady: c.everReady }));
    const shown = await page.evaluate(() => !!document.getElementById('netLost').classList.contains('on'));
    ok(!shown, '★① 배너가 안 뜬다 — 정상은 조용해야 한다');
    ok(zoneLog.join('').includes('접속 처리 실패') === false, '★① 서버 로그에 접속 실패가 없다');
    await snapOf(page, 'conn-01-normal');
    await page.close();
  }

  // ── ② 서버가 던지면 — 침묵이 아니라 **사유**가 온다 ───────────────────────
  console.log('\n② 서버가 던진다(E2E_CONN_FAIL=welcome) — 옛 코드라면 여기서 화면이 영원히 침묵했다');
  {
    zone.kill('SIGKILL'); await sleep(2500); zoneLog.length = 0;
    zone = boot('zone', 'zone.js', ZENV({ E2E_CONN_FAIL: 'welcome' }));
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), '(상황) 던지는 zone 기동');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await enter(page);
    // ★★★[T322 2026-09-19] **예산형을 조건 대기로 바꾼다**(족보 ⑩ · T314 ⓒ-3 이 든 실례가 이 줄이다).
    //   종전: `for (i<60) { … sleep(400) }` = **24초 예산**. 판정문엔 상수가 없어 어떤 자에도 안 걸리는데,
    //   예산이 다 되면 그 다음 `ok` 가 빨개진다 — 09-18 야간 보고의 "24초 경과" 가 그 수다.
    //   ⇒ **세계가 말할 때까지** 기다린다. 순서가 둘이고, 어디서 멈췄는지가 곧 결함의 이름이다:
    //     ⓐ 서버가 실제로 던졌나(`접속 처리 실패` 가 서버 로그에 뜬다) ⓑ 그 뒤 클라가 확정 오류를 받았나.
    //   상한은 **판정이 아니라 그물**이다 — 걸리면 "못 봤다"고 이름을 대고 죽는다(조용한 빨강 0).
    const thrown = await waitFor(async () => zoneLog.join('').includes('접속 처리 실패') || null);
    ok(!thrown.timedOut, '★★② [순서 ⓐ] **서버가 실제로 던졌다**(서버 로그가 증인)',
       thrown.timedOut ? `${(CAP / 1000) | 0}초 동안 서버 로그에 "접속 처리 실패" 가 안 떴다 — 클라 문제가 아니다` : `${thrown.ms}ms 만에`);
    let c = null;
    const got = await waitFor(async () => { c = await conn(page); return c.phase === 'error' ? c : null; });
    console.log(`    [상황] 서버가 던지기까지 ${thrown.ms}ms · 그 뒤 클라가 알기까지 ${got.ms}ms (상한 ${(CAP / 1000) | 0}초 · 판정 아님)`);
    ok(c && c.phase === 'error', '★★② [순서 ⓑ] 클라가 **확정 오류**를 받았다(침묵이 아니다)',
       c && c.phase ? c.phase : (got.timedOut ? '상한까지 안 왔다' : ''));
    ok(!!(c && /일부러 던진다/.test(c.reason)), '★★② 사유가 그대로 전달된다', c && c.reason);
    ok(c && c.stage === 'welcome', '★② **어느 단계**에서 깨졌는지 화면이 안다', c && c.stage);
    ok(!!(c && c.ref), '★② 서버 로그와 맞출 ref 가 있다', c && c.ref);
    ok(c && c.hard === true && c.state === 'error', '★★② 배너가 **빨강(기다려도 안 된다)** 이다', c && `${c.state}/hard=${c.hard}`);
    const btn = await page.evaluate(() => { const b = document.querySelector('#netLost .nl-reload'); return b ? !b.hidden : false; });
    ok(btn, '★② 새로고침 단추가 떠 있다 — 사용자가 할 일이 있다');
    const txt = await page.evaluate(() => (document.getElementById('netLost') || {}).innerText || '');
    ok(/기다려도/.test(txt), '★★② 문구가 **기다림이 소용없음**을 명시한다', txt.replace(/\n/g, ' / ').slice(0, 110));
    ok(zoneLog.join('').includes('접속 처리 실패'), '★② 서버 로그에 스택이 남았다(종전엔 아무것도 안 남았다)');
    ok(!(await inWorld(page)), '(상황) 실제로 못 들어갔다 — 자명 통과가 아니다');
    await snapOf(page, 'conn-02-error');
    await page.close();
  }

  // ── ②-b 서버가 **안 끝내면**(던지지도 않는다) — 마감액이 이름을 붙여 끊는다 ──────
  console.log('\n②-b 서버가 멈춘다(E2E_CONN_HANG=welcome) — 던지는 실패와 **다른 결함**이다');
  {
    zone.kill('SIGKILL'); await sleep(2500); zoneLog.length = 0;
    zone = boot('zone', 'zone.js', ZENV({ E2E_CONN_HANG: 'welcome', CONN_DEADLINE_MS: '6000' }));
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), '(상황) 멈추는 zone 기동');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await enter(page);
    // 마감액 전: pong 은 오는데(=서버는 살아 있다) welcome 이 없다 → "입장 처리 중"
    // ★★[T338 2026-09-20] 맹목 **3초 잠**을 조건 대기로. 마감액이 6000ms 인데 3000ms 를 자고 읽었으니
    //   여유가 3초뿐이었다 — 2코어 야간에선 잠+왕복이 6초를 넘어 `phase` 가 이미 `error` 가 되고,
    //   그러면 아래 ★★②-b 가 **제품과 무관하게** 빨개진다(예산형이 그 다음 ok 를 물들이는 그 모양).
    //   재려는 것은 "3초 뒤의 모습"이 아니라 **"마감액 전엔 처리 중으로 보인다"** 다
    //   ⇒ 서버가 첫 pong 을 보낼 때까지만 기다리고(수백 ms) 그 자리에서 읽는다 — 여유가 넓어진다.
    const DL = 6000;   // ZENV 에 넣은 CONN_DEADLINE_MS 와 같은 수(표·상황줄용 · 판정에 안 든다)
    //   ⚠기다릴 것은 "첫 pong" 이 아니라 **재려는 그 상태**다 — pong 이 `stage` 를 싣고 오는데,
    //     첫 pong 은 아직 `accepted` 라 그 다음 ★②-b(막힌 단계)가 빨개진다(이 카드가 한 번 물었다).
    //     ⇒ 조건은 **`hello` 가 왔고 `stage` 가 막힌 단계(welcome)** 다. 그게 이 절이 재려는 상태다.
    const rh = await waitFor(async () => { const x = await conn(page); return (x.hello === true && x.stage === 'welcome') ? x : null; });
    let c = rh.v || await conn(page);
    console.log(`    [상황] pong 이 막힌 단계(welcome)를 싣고 오기까지 ${rh.ms}ms · 마감액 ${DL}ms — 여유 ${DL - rh.ms}ms`
      + ` (종전 맹목 3000ms 잠이었을 때의 여유 ${DL - 3000}ms · 상한 ${(CAP / 1000) | 0}초 · 판정 아님)`);
    ok(c.phase === 'entering' && c.hello === true,
      '★★②-b 마감액 전엔 **"받았고 처리 중"** 으로 보인다 — 죽은 것과 구분된다',
      `${c.phase}/hello=${c.hello}${rh.ms >= DL ? ` — ⚠hello 가 ${rh.ms}ms 로 마감액을 넘겼다(자가 늦은 것이다)` : ''}`);
    ok(c.stage === 'welcome', '★②-b pong 이 **막힌 단계**를 싣고 온다', c.stage);
    ok(c.hard === false, '★②-b 아직은 노랑(기다릴 만하다)', `${c.state}/hard=${c.hard}`);
    // 마감액 후: 서버가 스스로 끊고 이름을 붙인다
    // ★[T338] 예산형(40×400ms = 16초) → 조건 대기.
    const rErr = await waitFor(async () => { c = await conn(page); return c.phase === 'error' ? c : null; });
    ok(c.phase === 'error', '★★②-b 마감액이 **안 끝나는 실패**를 끊었다(try/catch 로는 못 잡는 갈래)',
      `${c.phase}${rErr.timedOut ? ` — ${(CAP / 1000) | 0}초 동안 안 끊었다` : ` (${rErr.ms}ms 만에 · 마감액 ${DL}ms)`}`);
    ok(/시간 초과/.test(c.reason || ''), '★★②-b 사유가 "시간 초과"라고 말한다', c.reason);
    ok(/welcome/.test(c.reason || '') || c.stage === 'welcome', '★②-b 멈춘 단계가 사유에 있다', c.reason);
    ok(zoneLog.join('').includes('시간 초과'), '★②-b 서버 로그에도 남았다');
    ok(!(await inWorld(page)), '(상황) 실제로 못 들어갔다');
    await snapOf(page, 'conn-02b-timeout');
    await page.close();
  }

  // ── ③ 서버가 조용하면 — 노랑 "기다리는 중" ────────────────────────────────
  console.log('\n③ 서버가 조용하다(hello·pong 차단) — 이건 기다릴 만한 종류다');
  {
    zone.kill('SIGKILL'); await sleep(2500); zoneLog.length = 0;
    zone = boot('zone', 'zone.js', ZENV());
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), '(상황) 정상 zone 기동');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // ★소켓은 열리되 **서버가 보내는 모든 것**을 삼킨다 = 라이브에서 본 그 침묵.
    await page.addInitScript(() => {
      const Real = window.WebSocket;
      const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
      window.__swallowed = 0;
      class Patched extends Real {
        set onmessage(fn) { desc.set.call(this, (ev) => { window.__swallowed++; }); }
        get onmessage() { return desc.get.call(this); }
      }
      window.__RealWS = Real; window.WebSocket = Patched;
    });
    await enter(page);
    // ★유예(2초)가 지나야 배너가 뜬다 — 정상 접속에서 번쩍이지 않게 한 장치다.
    //   그래서 "떴는가"는 폴링으로 본다(고정 대기는 유예 값이 바뀌면 깨진다).
    // ★[T338] 예산형(60×300ms = 18초) → 조건 대기.
    let c = null;
    const rW = await waitFor(async () => { c = await conn(page); return c.state === 'waiting' ? c : null; });
    console.log(`    [상황] 배너가 노랑이 되기까지 ${rW.ms}ms${rW.timedOut ? ' — ★상한까지 안 떴다' : ''} (상한 ${(CAP / 1000) | 0}초 · 판정 아님)`);
    const sw = await page.evaluate(() => window.__swallowed | 0);
    ok(sw > 0, '(상황) 서버 메시지가 실제로 삼켜지고 있다', `${sw}건`);
    ok(c.phase === 'connecting' && c.hello === false, '★③ hello 도 못 받은 상태로 잡힌다', `${c.phase}/hello=${c.hello}`);
    ok(c.state === 'waiting' && c.hard === false, '★★③ 배너가 **노랑(기다리는 중)** 이다', `${c.state}/hard=${c.hard}`);
    const txt3 = await page.evaluate(() => (document.getElementById('netLost') || {}).innerText || '');
    ok(/기다리면/.test(txt3), '★★③ 문구가 **기다리면 대개 된다**를 말한다', txt3.replace(/\n/g, ' / ').slice(0, 110));
    ok(/초 경과/.test(txt3) && /번째 시도/.test(txt3), '★③ 경과·시도 횟수가 보인다 — 멈춘 건지 도는 건지 안다', txt3.replace(/\n/g, ' / ').slice(0, 110));
    await snapOf(page, 'conn-03-waiting');

    // ── ④ 오래 기다려도 안 되면 노랑 → 빨강 ─────────────────────────────────
    console.log('\n④ 오래 기다려도 안 되면 — 말이 바뀐다(노랑 → 빨강)');
    const a0 = (await conn(page)).attempts;
    // ★[T338] 예산형(80×1000ms = 80초) → 조건 대기.
    const rH = await waitFor(async () => { c = await conn(page); return c.hard ? c : null; });
    ok(c.hard === true, '★★④ 오래되면 **빨강으로 바뀐다** — 기다림이 무한정 정당화되지 않는다',
      `${c.state}/hard=${c.hard}${rH.timedOut ? ` — ${(CAP / 1000) | 0}초 동안 안 굳었다` : ` (${rH.ms}ms 만에)`}`);
    const txt4 = await page.evaluate(() => (document.getElementById('netLost') || {}).innerText || '');
    ok(/오류일 수 있다|응답하지 않는다/.test(txt4), '★④ 문구가 오류 가능성을 말한다', txt4.replace(/\n/g, ' / ').slice(0, 110));
    await snapOf(page, 'conn-04-hardened');

    // ── ⑤ 백오프 — 재시도가 무한 폭주하지 않는다 ────────────────────────────
    console.log('\n⑤ 백오프 — 시도 간격이 늘어난다(옛 코드는 15초마다 영원히 두드렸다)');
    const t0 = Date.now(), a1 = (await conn(page)).attempts;
    // ⚠[T338] **이 30초는 예산이 아니라 재는 창 자체다** — 조건 대기로 바꾸면 안 된다.
    //   여기서 재는 것은 "얼마 만에 되나"가 아니라 **"정해진 창 안에 몇 번 두드리나"**(백오프)이고,
    //   창을 조건으로 바꾸면 세는 대상이 사라진다. 아래 판정도 시간이 아니라 **횟수**를 문다.
    await sleep(30000);
    const a2 = (await conn(page)).attempts, dt = (Date.now() - t0) / 1000;
    const added = a2 - a1;
    ok(a1 > a0, '(상황) 재시도는 실제로 돌고 있다 — 멈춘 게 아니다', `${a0} → ${a1}`);
    ok(added <= 4, `★★⑤ ${dt.toFixed(0)}초 동안 재시도 ${added}회 — 간격이 벌어진다(백오프)`, `누적 ${a2}회`);
    ok(added >= 1, '★⑤ 그래도 자동 회복은 살아 있다(0회가 아니다)', `${added}회`);
    await page.close();
  }

  // ── ⑥ 회복 — 서버가 돌아오면 스스로 들어간다 ──────────────────────────────
  console.log('\n⑥ 회복 — 오류였던 서버가 고쳐지면 스스로 들어가는가');
  {
    zone.kill('SIGKILL'); await sleep(2500);
    zone = boot('zone', 'zone.js', ZENV({ E2E_CONN_FAIL: 'welcome' }));
    await waitHttp(`http://localhost:${ZPORT}/health`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await enter(page);
    // ★[T338] 예산형(60×400ms = 24초) → 조건 대기.
    let c = null;
    const rE = await waitFor(async () => { c = await conn(page); return c.phase === 'error' ? c : null; });
    ok(c && c.phase === 'error', '(상황) 먼저 확정 오류에 빠뜨렸다',
      `${c && c.phase}${rE.timedOut ? ` — ${(CAP / 1000) | 0}초 동안 안 빠졌다` : ` (${rE.ms}ms 만에)`}`);
    zone.kill('SIGKILL'); await sleep(2500);
    zone = boot('zone', 'zone.js', ZENV());          // 고친 서버로 교체
    await waitHttp(`http://localhost:${ZPORT}/health`);
    // ★[T338] 예산형(70×1000ms = 70초) → 조건 대기.
    const rB = await waitFor(async () => (await inWorld(page)) || null);
    ok(!!rB.v, '★★⑥ 서버가 고쳐지자 **새로고침 없이** 스스로 들어갔다',
      rB.timedOut ? `${(CAP / 1000) | 0}초 동안 안 들어갔다` : `${rB.ms}ms 만에`);
    // ★[T322] **한 번 읽고 판정하지 않는다.** `inWorld` 와 `phase` 는 서로 다른 신호라 순서가 갈린다 —
    //   실측으로 `inWorld=true` 인데 `phase=connecting` 인 찰나를 물어 빨개졌다(이 카드가 봤다).
    //   재려는 것은 "언제 왔나"가 아니라 **"오기는 오나"** 다 ⇒ 올 때까지 기다린다(상한은 표에만).
    let c6 = await conn(page);
    const r6 = await waitFor(async () => { c6 = await conn(page); return c6.phase === 'ready' ? c6 : null; });
    ok(c6.phase === 'ready', '★⑥ 상태가 ready 로 돌아온다', `${c6.phase}${r6.timedOut ? ' — 상한까지 안 왔다' : ` (${r6.ms}ms 만에)`}`);
    const shown6 = await page.evaluate(() => !!document.getElementById('netLost').classList.contains('on'));
    ok(!shown6, '★⑥ 배너가 걷혔다');
    await snapOf(page, 'conn-06-recovered');
    await page.close();
  }

  console.log(`\n  스크린샷 ${shots.length}장 → ${SHOTS}`);
  console.log(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
  await browser.close();
  killAll();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('하네스 크래시:', e); killAll(); process.exit(1); });
