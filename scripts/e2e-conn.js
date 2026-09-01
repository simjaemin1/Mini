#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
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
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
const ZENV = (extra) => Object.assign({
  PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
  VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
}, extra || {});

(async () => {
  console.log('\n=== 접속 실패의 가시성 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  let zone = boot('zone', 'zone.js', ZENV());
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const snapOf = async (page, n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const conn = (page) => page.evaluate(() => window.__connState());
  const enter = async (page) => {
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2200);
    const b = await page.$('button:has-text("월드 입장")');
    if (b) await b.click();
  };
  // ★`__getMyAbs()` 를 입장 게이트로 쓰면 안 된다 — `{x:0,y:0}` 로 시작해 **언제나 truthy** 다
  //   (기존 하네스 다수가 이 자명 통과를 쓰고 있다 — 회부에 적었다).
  //   `__inWorld()` 는 welcome 을 받았는지를 그대로 답한다.
  const inWorld = (page) => page.evaluate(() => (window.__inWorld ? window.__inWorld() : false));

  // ── ① 정상 접속 — 배너가 안 뜬다, 그러나 hello 는 왔다 ────────────────────
  console.log('\n① 정상 — 조용해야 정상이다(다만 서버는 "받았다"를 말했다)');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await enter(page);
    let entered = false;
    for (let i = 0; i < 60; i++) { if (await inWorld(page)) { entered = true; break; } await sleep(500); }
    ok(entered, '★① 정상 접속');
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
    let c = null;
    for (let i = 0; i < 60; i++) { c = await conn(page); if (c.phase === 'error') break; await sleep(400); }
    ok(c && c.phase === 'error', '★★② 클라가 **확정 오류**를 받았다(침묵이 아니다)', c && c.phase);
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
    await sleep(3000);
    let c = await conn(page);
    ok(c.phase === 'entering' && c.hello === true,
      '★★②-b 마감액 전엔 **"받았고 처리 중"** 으로 보인다 — 죽은 것과 구분된다', `${c.phase}/hello=${c.hello}`);
    ok(c.stage === 'welcome', '★②-b pong 이 **막힌 단계**를 싣고 온다', c.stage);
    ok(c.hard === false, '★②-b 아직은 노랑(기다릴 만하다)', `${c.state}/hard=${c.hard}`);
    // 마감액 후: 서버가 스스로 끊고 이름을 붙인다
    for (let i = 0; i < 40; i++) { c = await conn(page); if (c.phase === 'error') break; await sleep(400); }
    ok(c.phase === 'error', '★★②-b 마감액이 **안 끝나는 실패**를 끊었다(try/catch 로는 못 잡는 갈래)', c.phase);
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
    let c = null;
    for (let i = 0; i < 60; i++) { c = await conn(page); if (c.state === 'waiting') break; await sleep(300); }
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
    for (let i = 0; i < 80; i++) { c = await conn(page); if (c.hard) break; await sleep(1000); }
    ok(c.hard === true, '★★④ 오래되면 **빨강으로 바뀐다** — 기다림이 무한정 정당화되지 않는다', `${c.state}/hard=${c.hard}`);
    const txt4 = await page.evaluate(() => (document.getElementById('netLost') || {}).innerText || '');
    ok(/오류일 수 있다|응답하지 않는다/.test(txt4), '★④ 문구가 오류 가능성을 말한다', txt4.replace(/\n/g, ' / ').slice(0, 110));
    await snapOf(page, 'conn-04-hardened');

    // ── ⑤ 백오프 — 재시도가 무한 폭주하지 않는다 ────────────────────────────
    console.log('\n⑤ 백오프 — 시도 간격이 늘어난다(옛 코드는 15초마다 영원히 두드렸다)');
    const t0 = Date.now(), a1 = (await conn(page)).attempts;
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
    let c = null;
    for (let i = 0; i < 60; i++) { c = await conn(page); if (c.phase === 'error') break; await sleep(400); }
    ok(c && c.phase === 'error', '(상황) 먼저 확정 오류에 빠뜨렸다', c && c.phase);
    zone.kill('SIGKILL'); await sleep(2500);
    zone = boot('zone', 'zone.js', ZENV());          // 고친 서버로 교체
    await waitHttp(`http://localhost:${ZPORT}/health`);
    let back = false;
    for (let i = 0; i < 70; i++) { if (await inWorld(page)) { back = true; break; } await sleep(1000); }
    ok(back, '★★⑥ 서버가 고쳐지자 **새로고침 없이** 스스로 들어갔다');
    const c6 = await conn(page);
    ok(c6.phase === 'ready', '★⑥ 상태가 ready 로 돌아온다', c6.phase);
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
