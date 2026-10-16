#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 **세 밤** 분할(T238 · 소요로 균등) · `run-regress.sh --list "nightly C"`
// === scripts/e2e-winter.js — 겨울나기 공동 프로젝트 **실클라** E2E [T20] ========
//
// ★왜 [재민 확정 2026-09-02 · T20]
//   `test-winter` 는 **판정 층**에서 계약을 잰다(달력 유도·경계 스윕·두 축 분리·econ 불변).
//   그런데 이 배치가 플레이어에게 약속하는 것은 그게 아니다:
//     *"가을에 촌장이 올겨울 목표를 말하고, 곡식을 내면 게시판 윗줄이 움직이고,
//       겨울 첫날에 판정이 나고, 넉넉했으면 곳간 몫이 는다."*
//   그 문장은 **사건 meta + 게시판 토스트 + 납품 갈래 + 인출 한도**가 전부 맞물려야 참이 된다.
//
// ★★시간 설계 — 이 하네스가 다른 것과 다른 점:
//   겨울나기는 **달력이 지나가야** 성립한다(가을 첫날 → 겨울 첫날 = 90 게임일).
//   그래서 하루를 짧게 켜고(`VILLAGE_DAY_MS`), 재는 동안에는 **얼린다**(`__e2e_day_freeze`).
//   ⚠얼린 채로 기다리면 겨울이 영영 안 온다 — 재고 나면 반드시 녹인다.
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
const WINTER_D = 1;    // 목표 = 마을 하루치(닿을 수 있는 크기 — 값 자체는 `winter-metrics` 가 잰다)
const DAY_MS = 120;    // 한 해 365일 ⇒ 겨울 첫날까지 실시간 약 32초
// ★[T769 2026-10-15 · 재민 판정 "겨울 프로젝트 없어. 기부는 상시 되고 보상도 없음"] 켬(`T769_DONATE=1` — 존은 이 판의 환경을 그대로 물려받는다)
//   = 겨울 프로젝트 0. ③ 부터 켬에서는 **겨울 0 을 단언한다**(카드 ⑤): 머리줄 · 공표 말 · 겨울 몫 납품 · 판정 · 연표 · 한도 가산이 하나도 안 선다.
//   ⚠자명 통과 금지 — 게임일이 가을 첫날(공표일)과 그 뒤 겨울 첫날(판정일)을 **실제로 지났다**는 것을 먼저 잰다(달력 유도자 `winter.isAnnounceDay`·`isJudgeDay` 그대로).
const T769 = process.env.T769_DONATE === '1';

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  // ★[T84] 서버 콘솔 줄은 **말**로 거른다(로그의 이모지가 빠지면 필터가 조용히 죽는다).
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비|올겨울/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 130)}\n`); });
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
  console.log('\n=== 겨울나기 공동 프로젝트 실클라 E2E (Chromium) ===');
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
    MEMBER_N: String(MEMBER_N), WINTER_D: String(WINTER_D),
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
  // 머리줄이 **어떤 값 이상**이 될 때까지 기다린다(한 번 읽고 판정하지 않는다)
  async function headAtLeast(want) {
    let last = null;
    for (let i = 0; i < 60; i++) {
      const b = await askBoard(V.id);
      last = b;
      const m = String((b && b.head) || '').match(/(\d+)\s*\/\s*(\d+)/);
      if (m && +m[1] >= want) return { bd: b, got: +m[1] };
      await sleep(250);
    }
    const m = String((last && last.head) || '').match(/(\d+)\s*\/\s*(\d+)/);
    return { bd: last, got: m ? +m[1] : -1 };
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

  // ── ② 소속을 먼저 얻는다 — 인출 한도는 **마을 사람의 것**이다(⑥의 전제) ─────
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
  //   ★[T769 곁 · 하네스만 · 판정 무변] 소속 문턱(`MEMBER_N`)에 닿을 때까지 의뢰를 채운다 — 한 번에 안 걸리는 판이 있었다
  //     (픽스처 부족이 안 선 판 · "지금 낼 수 있는 의뢰가 없다" → ② · ⑦ 빨강). 계량기는 대본 상태(`__onbState.contrib`)로 읽는다(`e2e-membership` 과 같은 자리).
  const contribNow = () => page.evaluate(() => ((window.__onbState || {}).contrib | 0));
  for (let i = 0; i < 6 && (await contribNow()) < MEMBER_N; i++) await deliverBoardOnce();
  await clearNotices();
  await say('/소속');
  const m0 = await openTrade();
  ok(!!m0 && m0.vid === V.id, '② 마을 사람이 됐다(⑥ 인출 한도 검사의 전제)', m0 ? `한도 ${m0.limit}` : 'X');
  const limit0 = m0 ? (m0.limit | 0) : 0;

  if (T769) {
    const W = require(path.join(ROOT, 'server', 'winter.js'));   // 달력 유도자만 쓴다(손잡이와 무관한 순수 함수 — 계산 사본 0)
    const d0 = await gameDay();
    let dA = d0 + 1; while (!W.isAnnounceDay(dA)) dA++;
    let dJ = dA + 1; while (!W.isJudgeDay(dJ)) dJ++;
    let heads = 0, annLines = 0, maxDay = d0, autumnSeen = false, tried = null, polls = 0;
    //   가을에 곡식을 내 본다 — 의뢰 없는 곡식(겨울 몫 갈래가 서 있으면 받았을 자리 · 끔 판 ⑤ 그 자리).
    //   ★지금이 가을이면 **지금** 낸다(끔 판 ⑤ 와 같은 때 — 손에 든 오래된 곡식이 아직 안 상했다). 아니면 다음 가을에.
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
    { let a0 = d0; while (a0 > 0 && !W.isAnnounceDay(a0)) a0--;
      let j0 = a0 + 1; while (!W.isJudgeDay(j0)) j0++;
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
      }
      await sleep(250);
    }
    ok(maxDay >= dJ + 1 && autumnSeen, '③ [T769] 전제: 게임일이 가을 첫날(공표일)과 겨울 첫날(판정일)을 실제로 지났다(달력 정본)',
      `day ${d0} → ${maxDay} · 공표일 ${dA} · 판정일 ${dJ} · 게시판 ${polls}회`);
    ok(heads === 0, '③b [T769] ★가을이 와도 게시판에 올겨울 머리줄이 안 선다', `${heads}회 / ${polls}`);
    ok(annLines === 0, '③c [T769] ★촌장의 공표 말 · 판정 말 0(게시판 소식에 "올겨울" 줄 없음)', `${annLines}회`);
    ok(!!tried && tried.gave && tried.f0 > 0 && tried.nt.length > 0 && !tried.nt.some((t) => /상했다/.test(t)),
      '⑤ [T769] 전제: 가을에 성한 곡식을 손에 쥐고 냈다(거절 까닭이 "상했다"가 아니다 — 겨울 갈래를 잰다)',
      JSON.stringify(tried && { day: tried.day, before: tried.before, f0: tried.f0, reqs: tried.foodReqs, nt: tried.nt }));
    ok(!!tried && tried.foodReqs === 0 && !tried.nt.some((t) => /올겨울 몫/.test(t)) && tried.f1 === tried.f0,
      '⑤b [T769] ★곡식 의뢰가 없으면 안 받는다 — 겨울 몫 갈래 0(손의 곡식 그대로)', JSON.stringify(tried && { f0: tried.f0, f1: tried.f1 }));
    await freeze(true);
    const ch = await askChron(V.id, null);
    const items = [].concat(...(((ch && ch.seasons) || []).map((x) => x.items)));
    ok(!!ch && !items.some((x) => /^WINTER_/.test(String(x.type || ''))), '⑥ [T769] ★판정 0 — 연표에 겨울 줄(`WINTER_KEPT` · `WINTER_SHORT`) 없음', `연표 ${items.length}줄`);
    const m1 = await openTrade();
    ok(!!m1 && m1.limit == null, '⑦ [T769] ★보상 0 — 곳간 몫(한도) 칸 자체가 없다(꺼내기는 촌장만)', m1 ? `한도 ${m1.limit} · 촌장 ${m1.chief}` : 'X');
    await snap('wt-01-t769');
    const fatal = errs.filter((e) => !/Failed to load resource/.test(e));
    ok(fatal.length === 0, `클라 JS 에러 0 ${fatal.length ? '— ' + fatal.slice(0, 3).join(' / ') : ''}`);
    await browser.close();
    shutdown();
    console.log(`\n  스크린샷: ${shots.join(' ')}`);
    console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
    for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    process.exit(fail ? 1 : 0);
  }

  // ── ③ 가을이 오면 **촌장이 올겨울 목표를 공표한다** ─────────────────────────
  //   ★게시판 머리줄(`head`)이 서는 것이 곧 "공표가 살아 있다"의 신호다 — 가을 내내 뜬다.
  let bd = null, waited = 0;
  for (; waited < 400 && !(bd && bd.head); waited++) { bd = await askBoard(V.id); if (!bd || !bd.head) await sleep(300); }
  const dAut = await gameDay();
  ok(!!(bd && bd.head), '③ 가을이 오자 게시판에 **올겨울 머리줄**이 선다', bd && bd.head ? JSON.stringify(bd.head) : `(${waited}회 폴링 뒤에도 없음 · day ${dAut})`);
  if (!bd || !bd.head) { console.log('\n공표가 안 섰다 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  await freeze(true);                                    // ★여기서부터 얼린다(재는 동안 계절이 안 넘어가게)
  ok(/올겨울/.test(bd.head) && /▓|░/.test(bd.head), '③b 머리줄이 **문자 진행 막대**다(새 패널 0)', JSON.stringify(bd.head));
  const mTarget = String(bd.head).match(/(\d+)\s*\/\s*(\d+)/);
  ok(!!mTarget && +mTarget[2] > 0, '③c 목표량이 실려 있다', mTarget ? `${mTarget[1]} / ${mTarget[2]}` : 'X');
  const target = mTarget ? +mTarget[2] : 0;
  // 공표는 **촌장의 말**로도 남는다 — 게시판 소식(사건 문장)에 그 문장이 있다
  const annLine = (bd.news || []).map((r) => r.line).find((l) => /올겨울/.test(l) && /모아 두려 하네/.test(l));
  ok(!!annLine, '③d 공표가 **촌장의 말**로 만들어졌다(사건 meta → briefLine)', JSON.stringify(annLine || (bd.news || []).map((r) => r.line).slice(0, 2)));
  await snap('wt-01-announce');

  // ── ④ 게시판 **판** — 실화면에 그 줄이 실제로 그려진다 ─────────────────────
  //   ★★[T80 2026-09-03] 종전엔 9초 토스트(`#notice`)를 읽었다. 지금은 판이다(`#boardPane`) —
  //     **뜻은 그대로다**: "겨울 머리줄이 게시판 맨 위에 실제로 그려진다".
  //     자리만 옮겼다(족보 (116) 화면이 그리는 자리와 알림에 남는 자리는 다르다).
  await clearNotices();
  await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
  await sleep(1200);
  const paneOpen = await page.evaluate(() => {
    const p = document.getElementById('boardPane');
    return !!(p && !p.classList.contains('hidden'));
  });
  ok(paneOpen, '④ 게시판이 **판으로 열린다**(토스트 아님)');
  const headTxt = await page.evaluate(() => {
    const h = document.querySelector('#boardPaneBody .bp-head');
    return h ? h.textContent : '';
  });
  ok(/올겨울/.test(headTxt) && /▓|░/.test(headTxt), '④ 판 **머리 자리**에 그 문장이 그려진다',
    JSON.stringify(headTxt.slice(0, 70)));
  const ntNo = await notices();
  ok(!ntNo.some((t) => /게시판/.test(t) && /\n/.test(t)),
    '④b 게시판 문자열이 `#notice` 로는 **더는 안 간다**(토스트 경로 삭제)',
    JSON.stringify(ntNo.slice(-2)));
  await snap('wt-02-board');

  // ── ⑤ 곡식을 내면 머리줄이 **움직인다** — 의뢰가 없어도 받는다 ─────────────
  const foodReqs = (bd.rows || []).filter((r) => r.item === 'food').length;
  ok(foodReqs === 0, '⑤ 전제: 게시판에 **곡식 의뢰가 없다**(econ 이 식량을 소비EMA 에 안 담는다 — §0 실측)');
  const half = Math.max(1, Math.floor(target / 2));
  const gave = await giveFood(target + 5);
  ok(gave, '⑤ 전제: 곡식이 **실제로 손에 들어왔다**(안 들어왔으면 아래는 납품이 아니라 빈손 검사다)', `손에 ${await invFood()}`);
  const nt2 = await deliverFood(half);
  ok(nt2.some((t) => /올겨울 몫/.test(t)), '⑤ ★의뢰가 없는데도 **겨울 몫으로 받는다**', JSON.stringify((nt2.find((t) => /올겨울 몫/.test(t)) || nt2[0] || '').slice(0, 60)));
  const h2 = await headAtLeast(half);
  ok(h2.got >= half, '⑤b 머리줄 진행이 **실제로 움직였다**', `${mTarget[1]} → ${h2.got} / ${target}`);
  ok(!!h2.bd && /▓/.test(h2.bd.head), '⑤c 막대가 실제로 찼다', JSON.stringify(h2.bd && h2.bd.head));
  await snap('wt-03-progress');

  // 나머지를 채워 **달성**시킨다
  await deliverFood(target - half + 3);
  const h3 = await headAtLeast(target);
  ok(h3.got >= target, '⑤d 목표를 채웠다(⑥ 판정의 전제)', `${h3.got} / ${target}`);

  // ── ⑥ 겨울 첫날 — **판정**이 촌장의 말과 연표로 온다 ───────────────────────
  await freeze(false);                                   // ★녹인다 — 겨울이 와야 판정이 난다

  // ★★판정 **직전에 곳간을 채워 둔다** — 이건 편법이 아니라 ⑦의 전제를 세우는 것이다.
  //   인출 한도는 `min(기여+보상, 곳간이 줄 수 있는 몫)` 이라, **겨울 곳간이 비면 물리 상한이 보상을 가린다**
  //   (설계다 — 마을은 없는 걸 못 준다). T17(보존식 편입) 뒤 겨울 곡식 재고가 바닥이라
  //   1차 판이 정확히 여기서 빨갰다(한도 1 → 0). 보상이 **한도에 얹히는지**를 재려면 곳간이 줄 수 있어야 한다.
  //   ⇒ 가을 마지막 며칠에 한 짐 더 낸다(목표는 이미 채웠으니 달성 여부는 안 바뀐다).
  let near = false;
  for (let i = 0; i < 600 && !near; i++) {
    const b = await askBoard(V.id);
    if (!b || !b.head) break;                            // 이미 판정됐다 — 그냥 간다
    const mr = String(b.head).match(/남은\s*(\d+)\s*일/);
    //   ★[T704 추신] 창이 폴링보다 좁았다 — 하루 `DAY_MS`=120ms 라 "남은 3일"은 **360ms** 인데 한 바퀴(잠 250ms + 왕복)는 그보다 길어, 같은 판이 초록·빨강으로 갈렸다
    //   (같은 커밋 연속 두 판: 29/0 · 28/1). 창을 **10일(≈1.2초)** 로 넓힌다 — 하네스의 시간 상수이고 게임 값이 아니다("가을 마지막 며칠"이라는 뜻은 그대로).
    if (mr && +mr[1] <= 10) near = true; else await sleep(250);
  }
  if (near) {
    await freeze(true);
    await giveFood(400);
    await deliverFood(400);
    await freeze(false);
  }
  ok(near, '⑥-0 전제: 판정 직전에 곳간을 채웠다(겨울 곳간이 비면 ⑦이 물리 상한에 가린다)');

  await clearNotices();
  let judged = null, polls = 0;
  for (; polls < 300 && !judged; polls++) {
    const b = await askBoard(V.id);
    judged = ((b && b.news) || []).map((r) => r.line).find((l) => /올겨울은 넉넉하이/.test(l));
    if (!judged) await sleep(250);
  }
  const dWin = await gameDay();
  ok(!!judged, '⑥ 겨울 첫날에 **달성 판정**이 난다', judged ? JSON.stringify(judged) : `(${polls}회 폴링 · day ${dAut} → ${dWin})`);
  await freeze(true);
  ok(dWin > dAut, '⑥b 전제: 그 사이 계절이 실제로 넘어갔다', `day ${dAut}(가을) → ${dWin}(겨울)`);
  const bd4 = await askBoard(V.id);
  ok(!bd4 || !bd4.head, '⑥c 판정 뒤에는 머리줄이 내려간다(끝난 프로젝트를 계속 붙여 두지 않는다)', JSON.stringify(bd4 && bd4.head));
  await snap('wt-04-judged');

  // 연표 — 그 해 한 줄로 남는다(일 유형이라 sev 문턱 면제)
  const ch = await askChron(V.id, null);
  const items = [].concat(...(((ch && ch.seasons) || []).map((b) => b.items)));
  const chRow = items.find((x) => x.type === 'WINTER_KEPT');
  ok(!!chRow, '⑥ ★연표에 **그 해 한 줄**이 남는다(기본 문턱 그대로 — 일 유형은 면제)',
    chRow ? `${chRow.heard}일 · ${chRow.line}` : `(${items.length}줄 중 없음)`);
  ok(!chRow || chRow.deed === true, '⑥d 서버가 그 줄을 "일"로 표시해 보낸다');

  // ── ⑦ 달성 보상 — 인출 한도가 **실제로 오른다** ───────────────────────────
  const m1 = await openTrade();
  ok(!!m1, '⑦ 전제: 소속 한 줄을 다시 받았다');
  ok(m1 && (m1.stock | 0) > 0, '⑦ 전제: 곳간에 줄 것이 있다(비면 아래는 보상이 아니라 물리 상한을 재게 된다)',
    `곳간 ${m1 ? m1.stock : '?'}`);
  ok(m1 && (m1.limit | 0) > limit0, '⑦ ★달성한 해엔 곳간 몫이 **실제로 는다**(그 해 한정 · T11 한도에 얹힌다)',
    `한도 ${limit0} → ${m1 ? m1.limit : '?'} (곳간 ${m1 ? m1.stock : '?'})`);
  await snap('wt-05-limit');

  const fatal = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(fatal.length === 0, `클라 JS 에러 0 ${fatal.length ? '— ' + fatal.slice(0, 3).join(' / ') : ''}`);

  await browser.close();
  shutdown();
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 실패:', e); shutdown(); process.exit(1); });
