#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 **세 밤** 분할(T238 · 소요로 균등) · `run-regress.sh --list "nightly C"`
// === scripts/e2e-winter.js — 겨울나기 공동 프로젝트를 걷었다 **실클라** E2E [T20 → ★T779 새 세계: 겨울 0] ========
//
// ★왜 [T779 2026-10-18 · 재민 10-15 "겨울 프로젝트 없어. 기부는 상시 되고 보상도 없음."]
//   `test-winter` 는 **장부 층**에서 걷음을 잰다(모듈 · 배선 0 · 800일 스윕 · 옛 꼴 호스트 몫 무시 · 옛 연표 읽기).
//   이 판이 플레이어 쪽에서 재는 것은 그 반대 문장이다:
//     *"가을이 와도 촌장이 올겨울 목표를 말하지 않고, 게시판 윗줄이 서지 않고, 의뢰 없는 곡식은 납품으로 안 받고,
//       겨울 첫날에 판정이 안 나고, 곳간 몫(한도)이라는 칸이 아예 없다."*
//   그 문장은 **게시판(서버 답 · 화면 판) + 납품 갈래 + 연표 + 거래소 소속 줄**을 실클라로 밟아야 참인지 안다.
//
// ★★시간 설계(옛 판 그대로): 걷음도 **달력이 지나가야** 잴 수 있다(가을 첫날 → 겨울 첫날 = 90 게임일).
//   그래서 하루를 짧게 켜고(`VILLAGE_DAY_MS`), 손으로 재는 동안에만 **얼린다**(`__e2e_day_freeze`) — 재고 나면 반드시 녹인다.
//   ⚠자명 통과 금지 — 게임일이 가을 첫날과 그 뒤 겨울 첫날을 **실제로 지났다**는 것을 먼저 잰다(달력 정본 `Events.calendarOf`).
//
// 실행: node scripts/e2e-winter.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-wt-central-${process.pid}.db`, ZDB = `/tmp/e2e-wt-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

const MEMBER_N = 1;    // 통로 검사용으로 낮춘 소속 문턱(값 자체는 `test-membership ①` 이 정본으로 잰다)
const DAY_MS = 120;    // 한 해 365일 ⇒ 겨울 첫날까지 실시간 약 32초
// ★[T779] 가을 첫날 · 겨울 첫날 = 달력 정본(`Events.calendarOf` — 옛 겨울 모듈의 공표일 · 판정일 유도자가 부르던 그 함수 · 계산 사본 0)
const Events = require(path.join(ROOT, 'server', 'events.js'));
const isAutumn1 = (d) => { const c = Events.calendarOf(d); return c.season === 'autumn' && c.dayOfSeason === 1; };
const isWinter1 = (d) => { const c = Events.calendarOf(d); return c.season === 'winter' && c.dayOfSeason === 1; };

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
const srvWinter = [];   // ★[T779] 서버 콘솔에 겨울 공표 · 판정 줄이 한 번이라도 서면 여기 남는다(옛 겨울 모듈이 찍던 그 말)
function boot(name, file, env) {
  const e = Object.assign({}, process.env, env);
  delete e.T769_DONATE;   // ★[T779] 이 판이 재는 것은 **기본 세계**다(기부 켬 · 꺼내기 촌장만 · 겨울 0)
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // ★[T84] 서버 콘솔 줄은 **말**로 거른다(로그의 이모지가 빠지면 필터가 조용히 죽는다).
  p.stdout.on('data', (b) => { const s = String(b); if (/올겨울/.test(s)) srvWinter.push(s.trim().slice(0, 130)); if (/up on|시딩|마을 시뮬 준비|올겨울/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 130)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 겨울나기 걷음(겨울 0) 실클라 E2E (Chromium) ===');
  const _central = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  // ★★[T349 2026-09-21] 기동 증인은 **아이의 입**이다(정본 `fixture-boot.waitUp` · T344).
  //   포트 응답(`waitHttp(/zones)`)은 증인이 아니었다 — 앞 판 central 이 포트를 쥔 채면 새 central 은
  //   `EADDRINUSE` 로 즉시 죽는데 `waitHttp` 는 **앞 판의 central** 에게 200 을 받아 "떴다"고 답한다.
  //   ⚠**듣기는 여기서 시작한다**(`await` 는 아래 `ok` 자리에서) — 아이가 표식을 찍는 것은 ~120ms 뒤라
  //     그 사이 다른 `await` 를 지나면 줄을 놓친다. 띄운 **그 틱에** 귀를 붙인다.
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: String(DAY_MS),
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1', ONB_ENABLE: '1',
    MEMBER_N: String(MEMBER_N),
  });
  // ★★[T355 2026-09-22] 존 기동도 **아이의 입**으로 듣는다(정본 `fixture-boot.waitUp` · T344·T349).
  //   포트 응답은 증인이 아니다 — 앞 판 존이 포트를 쥔 채면 새 존은 `EADDRINUSE` 로 죽고 폴링은
  //   **앞 판의 존**에게 200 을 받는다. 존은 하네스마다 **세계가 다르므로**(다른 DB·다른 래퍼)
  //   남의 존에 붙으면 세계가 통째로 바뀐 채로 재게 된다 — central 보다 더 나쁘다.
  //   ⚠실측(이 카드 · 3판): 존 기동은 **78.8~83.1초**가 걸리고 아이의 입과 1초 폴링의 차는
  //     **177~306ms** 뿐이다 — central 때처럼 "우연히 벌어 주던 1초"가 **여기엔 없다**(재는 값 무변).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다(T349 ⑧ 함정) — `await` 만 아래로 내린다.
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const _up = await _upP;
  ok(_up.ok, 'central 기동', _up.ok ? `${_up.ms}ms · 아이가 제 입으로 말했다` : _up.why);
  ok(await (await _zp).ok, 'zone 기동');
  for (let i = 0; i < 90; i++) {
    const zmap = await (await fetch(`http://localhost:${CPORT}/zones`)).json();
    const z = zmap.zones && zmap.zones.hanbando;
    if (z && z.population != null && z.cap) break;
    await sleep(1000);
  }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  const btn = await page.$('#enter');
  if (btn) await btn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  // ★좌표를 받았다고 마을을 아는 건 아니다 — 근접 틱이 실제로 돌 때까지 기다린다(T50 e2e-chronicle 수리와 같은 처방)
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!window.__evDbg)); i++) await sleep(500);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  const { DatabaseSync } = require('node:sqlite');
  const zdb = new DatabaseSync(ZDB);
  const rows = zdb.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length >= 1, `마을이 시딩됐다 (${rows.length}곳)`, rows.map((r) => r.name).join(' '));
  if (!rows.length) { console.log('\n마을 없음 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  const V = rows[0];

  const px = (v) => [v.cx * 32 + 16, v.cy * 32 + 16];
  async function warpTo(v, tries) {
    const [x, y] = px(v);
    for (let i = 0; i < (tries || 30); i++) {
      await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
      await sleep(900);
      const d = await page.evaluate(() => window.__evDbg || null);
      const near = await page.evaluate(() => window.__evNearVid);
      if (d && d.seen > 0 && d.minD <= d.gate && near === v.id) return true;
      if (i === (tries || 30) - 1) console.log(`    warp 진단: dbg=${JSON.stringify(d)} near=${near} 목표=${v.id} px=(${x},${y})`);
    }
    return false;
  }
  const gameDay = async () => { for (let i = 0; i < 30; i++) { const d = await page.evaluate(() => window.__evGameDay | 0); if (d > 0) return d; await sleep(300); } return 0; };
  const freeze = async (on) => { await page.evaluate((o) => window.__sendPrimary({ type: '__e2e_day_freeze', on: o }), on); await sleep(600); };
  const clearNotices = () => page.evaluate(() => { window.__notices = []; });
  const notices = () => page.evaluate(() => (window.__notices || []).slice());
  const invFood = () => page.evaluate(() => (window.__getInv ? (window.__getInv().food || 0) : 0));
  // ★★고정 sleep 금지 — **효과가 올 때까지** 기다린다.
  //   러너 안(70종 순차·CPU 2코어)에서는 900ms 가 모자라고, 그러면 손에 곡식이 없는 채로 납품이 나간다.
  //   1차 판이 정확히 그래서 러너에서 ⑤~⑥ 일곱 개가 빨갰다(단독 실행은 24/0 이었다 — 전형적인 타이밍 오진).
  //   ★★그리고 **신선한 로트로** 준다(`lots:[[나이 0, n]]`) — T17 뒤 마을은 **상한 것을 안 받는다**
  //     (`_spoiledGuardRes`: 가장 오래된 로트가 상했으면 그 납품 전체가 거절된다).
  //     시작 인벤의 곡식이 200일을 묵어 있어서 1차 판이 여기서 빨갰다 — 먼저 **비우고** 새로 받는다.
  async function giveFood(n) {
    const have = await invFood();
    if (have > 0) {
      await page.evaluate((q) => window.__sendPrimary({ type: 'drop_item', item: 'food', amount: q }), have);
      for (let i = 0; i < 40; i++) { if ((await invFood()) <= 0) break; await sleep(200); }
    }
    await page.evaluate((q) => window.__sendPrimary({ type: '__e2e_give', lots: { food: [[0, q]] } }), n);
    for (let i = 0; i < 60; i++) { if ((await invFood()) >= n) return true; await sleep(250); }
    return false;
  }
  async function deliverFood(n) {
    await clearNotices();
    await page.evaluate(([vid, q]) => window.__sendPrimary({ type: 'village_deliver', vid, item: 'food', want: q }), [V.id, n]);
    for (let i = 0; i < 60; i++) { const t = await notices(); if (t.length) return t; await sleep(250); }
    return [];
  }
  // ★★게시판은 **새 응답을 기다린다**(고정 sleep 으로 "마지막으로 받은 것"을 읽지 않는다 — T50 수리).
  const askBoard = async (vid) => {
    await page.evaluate(() => { window.__evLastBoard = null; });
    await page.evaluate((v) => window.__sendPrimary({ type: 'village_board', vid: v }), vid);
    for (let i = 0; i < 30; i++) { await sleep(200); const b = await page.evaluate(() => window.__evLastBoard || null); if (b) return b; }
    return null;
  };
  const askChron = async (vid, year) => {
    await page.evaluate(() => { window.__evLastChronicle = null; });
    await page.evaluate(([v, y]) => window.__sendPrimary({ type: 'village_chronicle', vid: v, year: y }), [vid, year == null ? null : year]);
    for (let i = 0; i < 30; i++) { await sleep(200); const c = await page.evaluate(() => window.__evLastChronicle || null); if (c) return c; }
    return null;
  };
  const say = async (t) => { await page.evaluate((s) => window.__sendPrimary({ type: 'chat', text: s }), t); await sleep(900); };
  //   ★[T769 곁 · 하네스만 · 판정 무변] 거래소 답을 **올 때까지** 기다린다(고정 900ms 한 번 읽기 → 부하에서 답 전에 읽어 ② 가 'X' 로 빨갰다 — 위 "고정 sleep 금지" 규약).
  const openTrade = async () => {
    await page.evaluate(() => { window.__tradeBoard = null; });
    await page.evaluate((vid) => window.__sendPrimary({ type: 'village_trade', vid }), V.id);
    for (let i = 0; i < 30; i++) { await sleep(300); const m = await page.evaluate(() => (window.__tradeBoard && window.__tradeBoard.member) || null); if (m) return m; }
    return null;
  };

  ok(await warpTo(V, 30), `① ${V.name} 마을 중심 도착`);

  // ── ② 소속을 먼저 얻는다 — 옛 한도 · 겨울 보상은 **마을 사람의 것**이었다(⑦ 이 마을 사람의 줄에서 "칸 없음"을 잰다) ─────
  async function deliverBoardOnce() {
    //   ★[T704 추신] 부족을 **한 품목에 매달지 않는다** — 픽스처가 고른 품목이 하루 생산으로 문턱 위에 돌아가 의뢰가 안 걸리면(T661 켠 세계의 나무),
    //     같은 품목에 두 번 주입한 뒤 그 품목을 `skip` 에 넣고 다음 품목으로 간다(`skip` 은 T80 의 종전 인자 · 제품 코드 0). 품목은 알림 줄에서 읽는다.
    const stuck = []; let lastIt = null, sameIt = 0;
    for (let i = 0; i < 12; i++) {
      await page.evaluate(([vid, sk]) => window.__sendPrimary({ type: '__e2e_village_short', vid, skip: sk }), [V.id, stuck.slice()]);
      await sleep(700);
      { const nl = await page.evaluate(() => (window.__notices || []).filter((t) => /\(문턱 /.test(t)).slice(-1)[0] || '');
        const m = /\s(\S+) [-\d.]+→[-\d.]+ \(문턱/.exec(nl), it = m ? m[1] : null;
        if (it && it === lastIt) sameIt++; else { lastIt = it; sameIt = 1; }
        if (it && sameIt >= 2 && !stuck.includes(it)) { stuck.push(it); lastIt = null; sameIt = 0; } }
      const b = await askBoard(V.id);
      const row = b && b.rows && b.rows[0];
      const give = row && (row.give || [])[0];
      if (!give) continue;
      await page.evaluate(([it, n]) => window.__sendPrimary({ type: '__e2e_give', items: { [it]: n } }), [give, Math.max(2, Math.ceil(row.remain) + 5)]);
      await sleep(700);
      await page.evaluate((vid) => window.__sendPrimary({ type: 'village_deliver', vid }), V.id);
      await sleep(1100);
      return true;
    }
    return false;
  }
  //   ★[T769 곁 · 하네스만] 소속 문턱(`MEMBER_N`)에 닿을 때까지 의뢰를 채운다 — 한 번에 안 걸리는 판이 있었다
  //     (픽스처 부족이 안 선 판 · "지금 낼 수 있는 의뢰가 없다" → ② · ⑦ 빨강). 계량기는 대본 상태(`__onbState.contrib`)로 읽는다(`e2e-membership` 과 같은 자리).
  const contribNow = () => page.evaluate(() => ((window.__onbState || {}).contrib | 0));
  for (let i = 0; i < 6 && (await contribNow()) < MEMBER_N; i++) await deliverBoardOnce();
  await clearNotices();
  await say('/소속');
  const m0 = await openTrade();
  ok(!!m0 && m0.vid === V.id, '② 마을 사람이 됐다(⑦ 의 전제 — 옛 한도 · 보상은 마을 사람의 칸이었다)', m0 ? `마을 ${m0.vid} · 칸 ${Object.keys(m0).sort().join(',')}` : 'X');

  {
    const d0 = await gameDay();
    let dA = d0 + 1; while (!isAutumn1(dA)) dA++;
    let dJ = dA + 1; while (!isWinter1(dJ)) dJ++;
    let heads = 0, annLines = 0, maxDay = d0, autumnSeen = false, tried = null, polls = 0, paneHead = null;
    //   가을에 곡식을 내 본다 — 의뢰 없는 곡식(옛 겨울 몫 갈래가 받던 자리 · 옛 ⑤).
    //   ★지금이 가을이면 **지금** 낸다(손에 든 오래된 곡식이 아직 안 상했다). 아니면 다음 가을에.
    //   ⚠자명 통과 금지: 거절 까닭이 "상했다"(상한 것 거절 · T17)면 겨울 갈래를 잰 것이 아니다 — 아래 ⑤b 가 그 말을 막는다.
    //   ★손의 곡식은 **멎을 때까지** 읽는다 — 버리기는 한 번에 99 까지라(`tryDropItem`) 손이 크면 지급이 늦게 닿는다(같은 판 두 번 읽어 같으면 멎은 것).
    const settled = async () => { let a = await invFood(); for (let i = 0; i < 20; i++) { await sleep(400); const b2 = await invFood(); if (b2 === a) return a; a = b2; } return a; };
    //   ★손의 곡식을 **다 버린다** — 소속을 얻는 의뢰가 곡식이었던 판은 손이 수천이고(픽스처 지급) 그중 일부는 상했다(상한 것 거절이 먼저 막는다).
    //     버리기는 한 번에 99 까지다(`tryDropItem`) — 끝 몫은 남은 만큼(99 를 달라 하면 "부족"으로 안 버린다).
    const dropAllFood = async () => {
      for (let k = 0; k < 4; k++) {
        let have = await invFood();
        if (have <= 0) return true;
        while (have > 0) { const q = Math.min(99, have); await page.evaluate((n) => window.__sendPrimary({ type: 'drop_item', item: 'food', amount: n }), q); have -= q; }
        for (let i = 0; i < 40; i++) { await sleep(250); if ((await invFood()) <= 0) return true; }
      }
      return (await invFood()) <= 0;
    };
    const tryFood = async (b) => {
      await freeze(true);
      const foodReqs = ((b && b.rows) || []).filter((r) => r.item === 'food').length;
      const before = await invFood();
      await dropAllFood();
      await clearNotices();
      const gave = await giveFood(10);
      //   지급이 **닿은 뒤에** 잰다(서버 답 "[E2E] 재료 지급" — 손이 크면 `giveFood` 가 지급 전에 돌아온다 · 부하에서 납품보다 늦게 닿은 판이 있었다)
      for (let i = 0; i < 40; i++) { if ((await notices()).some((t) => /재료 지급/.test(t))) break; await sleep(250); }
      const f0 = await settled();
      const nt = await deliverFood(5);
      const f1 = await settled();
      await freeze(false);
      return { foodReqs, before, gave, f0, f1, nt: nt.slice(-2), day: await gameDay() };
    };
    { let a0 = d0; while (a0 > 0 && !isAutumn1(a0)) a0--;
      let j0 = a0 + 1; while (!isWinter1(j0)) j0++;
      if (a0 > 0 && d0 < j0 - 3) tried = await tryFood(await askBoard(V.id)); }
    const t0 = Date.now();
    while (maxDay < dJ + 2 && Date.now() - t0 < 240000) {
      const b = await askBoard(V.id);
      polls++;
      const d = await gameDay(); if (d > maxDay) maxDay = d;
      if (b && b.head) heads++;
      if (b && (b.news || []).some((r) => /올겨울/.test(r.line))) annLines++;
      if (d >= dA && d < dJ) {
        autumnSeen = true;
        if (!tried && d >= dA + 2) tried = await tryFood(b);
        //   ④ 화면 판 — 가을 한복판에 게시판 판이 **실제로 열린 채** 머리 자리가 비어 있는가(서버 답만이 아니라 그린 것)
        if (paneHead == null && d >= dA + 4) {
          await freeze(true);
          await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
          let pn = null;
          for (let i = 0; i < 20 && !(pn && pn.open && pn.filled); i++) {
            await sleep(250);
            pn = await page.evaluate(() => {
              const p = document.getElementById('boardPane'), body = document.getElementById('boardPaneBody');
              return { open: !!(p && !p.classList.contains('hidden')), filled: !!(body && (body.textContent || '').trim().length),
                head: !!document.querySelector('#boardPaneBody .bp-head'), txt: body ? (body.textContent || '').slice(0, 80) : '' };
            });
          }
          paneHead = pn || { open: false };
          await snap('wt-01-board');
          await freeze(false);
        }
      }
      await sleep(250);
    }
    ok(maxDay >= dJ + 1 && autumnSeen, '③ 전제: 게임일이 가을 첫날(옛 공표일)과 겨울 첫날(옛 판정일)을 실제로 지났다(달력 정본)',
      `day ${d0} → ${maxDay} · 가을 첫날 ${dA} · 겨울 첫날 ${dJ} · 게시판 ${polls}회`);
    ok(heads === 0, '③b ★가을이 와도 게시판 답에 올겨울 머리줄 칸이 안 선다', `${heads}회 / ${polls}`);
    ok(annLines === 0, '③c ★촌장의 공표 말 · 판정 말 0(게시판 소식에 "올겨울" 줄 없음)', `${annLines}회`);
    ok(!!paneHead && paneHead.open && paneHead.filled && paneHead.head === false, '④ ★가을 한복판에 연 게시판 **판**의 머리 자리가 비어 있다(`.bp-head` 0 — 그린 화면)',
      JSON.stringify(paneHead));
    ok(srvWinter.length === 0, '④b 서버 콘솔에도 겨울 공표 · 판정 줄 0', srvWinter.slice(0, 2).join(' | '));
    ok(!!tried && tried.gave && tried.f0 > 0 && tried.nt.length > 0 && !tried.nt.some((t) => /상했습니다/.test(t)),
      '⑤ 전제: 가을에 성한 곡식을 손에 쥐고 냈다(거절 까닭이 "상했다"가 아니다 — 겨울 갈래를 잰다)',
      JSON.stringify(tried && { day: tried.day, before: tried.before, f0: tried.f0, reqs: tried.foodReqs, nt: tried.nt }));
    ok(!!tried && tried.foodReqs === 0 && tried.nt.some((t) => /그런 부탁이 없습니다/.test(t)) && !tried.nt.some((t) => /올겨울 몫/.test(t)) && tried.f1 === tried.f0,
      '⑤b ★곡식 의뢰가 없으면 납품으로 안 받는다("그런 의뢰가 없다" — 장부 정본) — 겨울 몫 갈래 0(손의 곡식 그대로)', JSON.stringify(tried && { f0: tried.f0, f1: tried.f1, nt: tried.nt }));
    await freeze(true);
    const ch = await askChron(V.id, null);
    const items = [].concat(...(((ch && ch.seasons) || []).map((x) => x.items)));
    ok(!!ch && Array.isArray(ch.seasons) && ch.seasons.length > 0, '⑥ 전제: 연표 답이 실제로 왔다(계절 칸이 섰다)', ch ? `계절 ${ch.seasons.length} · 줄 ${items.length}` : 'X');
    ok(!!ch && !items.some((x) => /^WINTER_/.test(String(x.type || ''))), '⑥b ★판정 0 — 연표에 겨울 줄(`WINTER_KEPT` · `WINTER_SHORT`) 없음', `연표 ${items.length}줄`);
    const m1 = await openTrade();
    ok(!!m1 && m1.vid === V.id && !('limit' in m1) && !('remain' in m1) && m1.chief === false,
      '⑦ ★보상 0 — 마을 사람의 줄에 곳간 몫(한도) 칸 자체가 없다(꺼내기는 촌장만 · 이 사람은 촌장이 아니다)', m1 ? `칸 ${Object.keys(m1).sort().join(',')} · 촌장 ${m1.chief}` : 'X');
    await snap('wt-02-t779');
    const fatal = errs.filter((e) => !/Failed to load resource/.test(e));
    ok(fatal.length === 0, `클라 JS 에러 0 ${fatal.length ? '— ' + fatal.slice(0, 3).join(' / ') : ''}`);
    await browser.close();
    shutdown();
    console.log(`\n  스크린샷: ${shots.join(' ')}`);
    console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
    for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    process.exit(fail ? 1 : 0);
  }

})().catch((e) => { console.error('E2E 실패:', e); shutdown(); process.exit(1); });
