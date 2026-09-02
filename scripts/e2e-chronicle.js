#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-chronicle.js — 연대기(마을 연표) **실클라** E2E ================
//
// ★왜 [T18 2026-09-01]
//   `test-events` ㉖~㉛ 은 **장부 층**에서 연표 계약을 잰다(잘림·결정론·캐시·상한).
//   그런데 이 배치가 플레이어에게 약속하는 것은 그게 아니다:
//     *"마을에서 📜 를 열면 우리 마을이 겪은 일이 연·계절로 적혀 있고,
//       이웃 마을 일은 **며칠 뒤에** 거기 나타난다."*
//   그 문장은 **패널 등록(§8.2) + 서버 게이트 + 도달표 + 달력 정본**이 전부 맞물려야 참이 된다.
//   장부가 아무리 맞아도 탭이 안 열리면 플레이어에게는 없는 기능이다(배치 5 의 교훈).
//
// ★★문턱을 낮춰 돌린다 — 그리고 그 사실을 여기 적는다.
//   `EV_CHRON_SEV` 기본값 2.2 는 **밀도**의 문제이고 그건 `scripts/ev-density.js ⓔ` 가 재는 것이다.
//   이 검사가 재는 것은 **배선**이라, 픽스처가 만든 사건이 실제로 연표 코드를 밟아야 한다
//   (족보 (76) — 검사 품목이 그 코드를 밟는지 먼저 확인해라). 그래서 문턱을 내려 켠다.
//
// 실행: node scripts/e2e-chronicle.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-ch-central-${process.pid}.db`, ZDB = `/tmp/e2e-ch-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비|📜/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 130)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 연대기(마을 연표) 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '3', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
    E2E_GIVE: '1',
    // ★배선 검사용 문턱·상한(위 머리 주석). **밀도와 편집 방침은 여기서 재지 않는다** —
    //   문턱은 `ev-density ⓔ` 가, 계절 상한은 `test-events ㉚` 이 잰다.
    //   ⚠상한을 기본값(5/2)으로 두면 "그 사건이 도달했는가"가 **상한에 가려** 안 보인다 —
    //     1차 판이 정확히 그래서 ⑥이 150회 폴링 끝에 실패했고, ⑤는 같은 이유로 **자명 통과**였다.
    EV_CHRON_SEV: '0.05', EV_CHRON_FOREIGN_SEV: '0.05',
    EV_CHRON_PER_SEASON: '400', EV_CHRON_FOREIGN: '400',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  for (let i = 0; i < 90; i++) {
    const zmap = await (await fetch(`http://localhost:${CPORT}/zones`)).json();
    const z = zmap.zones && zmap.zones.hanbando;
    if (z && z.population != null && z.cap) break;
    await sleep(1000);
  }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let page = await ctx.newPage();
  const errs = [];
  const wire = (pg) => {
    pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  };
  wire(page);
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };

  async function enter() {
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const btn = await page.$('button:has-text("월드 입장")');
    if (btn) await btn.click();
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    // ★★[T50 2026-09-02 수리] 좌표를 받았다고 **마을을 아는 것은 아니다.**
    //   `warpTo` 는 `__evDbg`(근접 틱이 세운다)를 보는데, 그건 청크·마을 데이터가 앉은 뒤에 생긴다.
    //   단독 실행에선 2초면 앉지만 **러너 아래(앞 하네스 뒤 · 부하)에선 모자랐다** —
    //   ① 워프가 30초를 다 쓰고 실패했고, 그 뒤 ③ 넷이 줄줄이 빨개졌다(제품은 옳고 하네스가 성급했다).
    //   ⇒ 고정 sleep 대신 **근접 틱이 실제로 돌기 시작할 때까지 기다린다**(e2e-chronicle ⑦d 와 같은 교훈).
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!window.__evDbg)); i++) await sleep(500);
    await sleep(1500);
  }
  await enter();
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  const { DatabaseSync } = require('node:sqlite');
  const zdb = new DatabaseSync(ZDB);
  const rows = zdb.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length >= 2, `마을이 2곳 이상 시딩됐다 (${rows.length}곳)`, rows.map((r) => r.name).join(' '));
  if (rows.length < 2) { console.log('\n마을 부족 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  let A = rows[0], B = rows[1], bestD = Infinity;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const d = Math.hypot((rows[i].cx - rows[j].cx) * 32, (rows[i].cy - rows[j].cy) * 32);
    if (d < bestD) { bestD = d; A = rows[i]; B = rows[j]; }
  }
  console.log(`    A=${A.name} B=${B.name}`);

  const px = (v) => [v.cx * 32 + 16, v.cy * 32 + 16];
  async function warpTo(v, tries) {
    const [x, y] = px(v);
    for (let i = 0; i < (tries || 25); i++) {
      await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
      await sleep(1000);
      const d = await page.evaluate(() => window.__evDbg || null);
      const near = await page.evaluate(() => window.__evNearVid);
      if (d && d.seen > 0 && d.minD <= d.gate && near === v.id) return true;
    }
    return false;
  }
  const gameDay = async () => {
    for (let i = 0; i < 30; i++) { const d = await page.evaluate(() => window.__evGameDay | 0); if (d > 0) return d; await sleep(400); }
    return 0;
  };
  const freeze = async (on) => { await page.evaluate((o) => window.__sendPrimary({ type: '__e2e_day_freeze', on: o }), on); await sleep(700); };
  // 사이드바 아이콘을 **실제로 눌러서** 연다 — 메시지만 보내면 §8.2 등록 3단계를 안 재게 된다.
  const openChron = async () => {
    await page.evaluate(() => { window.__evLastChronicle = null; });   // ★위 주석 — 낡은 응답을 읽지 않는다
    await page.click('.sb-icon[data-side="chronicle"]');
    for (let i = 0; i < 30 && !(await page.evaluate(() => !!window.__evLastChronicle)); i++) await sleep(250);
    await sleep(300);
    return await page.evaluate(() => ({
      title: (document.getElementById('spTitle') || {}).textContent || '',
      open: !!(document.getElementById('sidePanel') || {}).classList?.contains('open'),
      body: (document.getElementById('spBody') || {}).textContent || '',
      data: window.__evLastChronicle || null,
    }));
  };
  // ★★**응답을 기다린다 — 고정 sleep 으로 읽지 않는다.**
  //   `__evLastChronicle` 은 "마지막으로 받은 것"이라, 600ms 안에 답이 안 오면 **직전 응답을 읽는다.**
  //   그러면 "지난 해 목록"을 낡은 값으로 들고 "다음 해엔 비었나"를 물어 **없는 결함**을 보고한다
  //   (이 하네스가 두 번 그렇게 빨개졌다 — 부하가 아니라 하네스가 기다리지 않은 것이다).
  //   ⇒ 보내기 전에 칸을 비우고, 새 응답이 올 때까지 폴링한다.
  const askChron = async (vid, year) => {
    await page.evaluate(() => { window.__evLastChronicle = null; });
    await page.evaluate(([v, y]) => window.__sendPrimary({ type: 'village_chronicle', vid: v, year: y }), [vid, year == null ? null : year]);
    for (let i = 0; i < 30; i++) {
      await sleep(250);
      const c = await page.evaluate(() => window.__evLastChronicle || null);
      if (c) return c;
    }
    return null;
  };

  ok(await warpTo(A, 30), `① A(${A.name}) 마을 중심 도착`);

  // ── ② 탭이 실제로 열린다 — §8.2 등록 3단계(아이콘·제목표·renderSide)가 다 됐는가
  const p1 = await openChron();
  ok(p1.open, '② 사이드바 📜 를 누르면 패널이 열린다(아이콘 등록 ①)');
  ok(/연대기/.test(p1.title), '②b 제목이 한글이다 — 표에 없으면 영문 키가 뜬다(제목표 등록 ②)', JSON.stringify(p1.title));
  ok(!/^chronicle$/.test(p1.title.trim()), '②c (자명 통과 방지) 제목이 영문 키 그대로가 아니다');
  ok(p1.body.length > 0 && !/undefined/.test(p1.body), '②d 본문이 실제로 그려졌다(renderSide 분기 ③)', JSON.stringify(p1.body.slice(0, 60)));
  await snap('ch-01-panel');

  // ── ③ 서버가 연·계절을 만들어 보낸다(클라가 달력을 다시 짜지 않는다)
  const c1 = p1.data;
  ok(!!(c1 && c1.ok && c1.cal), '③ 응답에 달력 정본이 실려 온다(연·계절·일)',
    c1 && c1.cal ? `${c1.cal.year}년 ${c1.cal.seasonKo} ${c1.cal.dayOfSeason}일` : 'X');
  ok(!!(c1 && Array.isArray(c1.seasons) && c1.seasons.length), '③b 계절 칸이 서버에서 온다', c1 ? `${(c1.seasons || []).length}칸` : 'X');
  ok(!!(c1 && c1.seasons.every((b) => b.seasonKo && b.seasonKo !== b.season)), '③c 계절 이름이 한글이다(표기도 서버 정본)',
    c1 ? c1.seasons.map((b) => b.seasonKo).join(' ') : '');
  ok(!!(c1 && c1.vid === A.id && c1.name === A.name), '③d 연표는 **그 마을 것**이다', c1 ? `${c1.name}(${c1.vid})` : 'X');

  // ── ④ A 에서 큰 사건을 만든다 → A 연표에 **그날 바로** 적힌다
  const before = (c) => (c ? c.seasons.reduce((a, b) => a + b.items.length, 0) : 0);
  const n0 = before(c1);
  let cA = null, addedA = 0;
  for (let i = 0; i < 30 && addedA <= 0; i++) {
    await page.evaluate((vid) => window.__sendPrimary({ type: '__e2e_village_short', vid }), A.id);
    await sleep(1200);
    cA = await askChron(A.id, null);
    addedA = before(cA) - n0;
  }
  ok(addedA > 0, '④ 사건이 나면 **그 마을 연표에 바로** 적힌다', `${n0} → ${before(cA)}줄`);
  const mineItems = [].concat(...((cA && cA.seasons) || []).map((b) => b.items)).filter((x) => x.from == null);
  ok(mineItems.length > 0, '④b 전제: 우리 마을 항목이 실제로 있다(자명 통과 방지)', `${mineItems.length}줄`);
  ok(mineItems.every((x) => x.heard === x.day), '④c 우리 마을 일은 도달 지연이 0이다(직접 목격)');
  // ★★[T50 2026-09-02] **넘어올 수 있는 줄을 고른다.**
  //   T50 부터 이웃 연표에는 아무거나 실리지 않는다 — 날씨·완공·첫 물건은 `EV_DEED_FOREIGN` 밖이라
  //   **설계상 절대 안 온다**(국지적이고 짧은 일은 남의 마을 연표에 적을 것이 못 된다).
  //   그걸 골라 놓고 "며칠 뒤 나타난다"를 기다리면 **제품이 옳은데 하네스가 150회 폴링 끝에 빨개진다**
  //   (실제로 그렇게 났다). ⇒ 여기서는 **값 유형**(넘어오는 줄)을 고른다.
  //   일 유형이 이웃 연표에서 걸러진다는 사실 자체는 `test-events ㉞e` 가 따로 검사한다.
  const crossable = mineItems.filter((x) => !x.deed);
  ok(crossable.length > 0, '④d 전제: 이웃까지 넘어갈 수 있는 줄(값 유형)이 있다', `${crossable.length}/${mineItems.length}줄`);
  const evA = crossable.slice().sort((a, b) => b.day - a.day)[0];
  console.log(`    A 최신 항목: day${evA.day} · ${evA.line}`);

  // ── ⑤ 날을 얼리고 B 로 — **아직 B 연표엔 없다**
  await freeze(true);
  const frozenDay = await gameDay();
  ok(await warpTo(B, 30), `⑤a B(${B.name}) 마을 중심 도착`);
  const cB0 = await askChron(B.id, null);
  const keyOf = (x, viewer) => `${x.line}|${x.day}|${x.from || viewer}`;
  const allB0 = [].concat(...((cB0 && cB0.seasons) || []).map((b) => b.items));
  ok(!!(cB0 && cB0.ok), '⑤b B 연표를 받았다', cB0 ? `${allB0.length}줄` : 'X');
  const yearAtFreeze = cB0 ? (cB0.year | 0) : 0;
  const seen0 = allB0.some((x) => keyOf(x, B.name) === keyOf(evA, A.name));
  // ★자명 통과 방지 — "B 연표가 비어서 없는 것"이 아니라 **다른 것은 있는데 이것만 없다**를 보인다.
  ok(allB0.length > 0, '⑤c 전제: B 연표에 이미 다른 줄이 있다(빈 목록으로 인한 자명 통과가 아니다)', `${allB0.length}줄`);
  ok(!seen0, '⑤ A 에서 난 일이 **B 연표에는 아직 없다**(도달 전 사건은 연표에도 없다)',
    `frozenDay=${frozenDay} · 사건일 ${evA.day} · 그 해 ${yearAtFreeze}년`);
  await snap('ch-02-before');

  // ── ⑥ 날을 녹이면 며칠 뒤 나타난다 — 그리고 "몇 일 걸려 닿았다"가 화면에 있다
  await freeze(false);
  let arrived = null, polls = 0;
  for (; polls < 150 && !arrived; polls++) {
    // ★**그 사건이 난 해**를 명시해 묻는다 — 기본값(올해)으로 물으면 폴링 중에 해가 넘어가는 순간
    //   찾던 줄이 화면에서 사라진다(그건 제품이 옳은 것이고 하네스가 틀린 것이다).
    const c = await askChron(B.id, yearAtFreeze);
    const all = [].concat(...((c && c.seasons) || []).map((b) => b.items));
    arrived = all.find((x) => keyOf(x, B.name) === keyOf(evA, A.name));
    if (!arrived) await sleep(400);
  }
  ok(!!arrived, '⑥ 며칠 뒤 그 일이 **B 연표에 나타난다**(연표도 도달표 위에 선다)',
    arrived ? `day${arrived.day} → ${arrived.heard}일에 들었다 (${arrived.heard - arrived.day}일)` : `(${polls}회 폴링 뒤에도 미도착)`);
  if (arrived) {
    ok(arrived.from === A.name, '⑥b 출처 마을이 붙어 온다', `from=${arrived.from}`);
    ok(arrived.heard > arrived.day, '⑥c 이웃 마을 일은 **같은 날에 못 적힌다**');
  }
  if (arrived) {
    ok(arrived.heard - arrived.day === (await (async () => {
      // 도달 지연은 **도달표 그대로**여야 한다 — 화면이 제 마음대로 날짜를 적지 않는다.
      const c = await askChron(B.id, yearAtFreeze);
      const all = [].concat(...((c && c.seasons) || []).map((b) => b.items)).filter((x) => x.from === A.name);
      const lags = [...new Set(all.map((x) => x.heard - x.day))];
      return lags.length === 1 ? lags[0] : -1;
    })()), '⑥f A→B 지연이 모든 줄에서 같다(도달표는 사건마다 다르지 않다)', `${arrived.heard - arrived.day}일`);
    ok(arrived.heard > frozenDay, '⑥g 그 줄은 **얼어 있던 날 이후에** 도달했다(관측 구간 안에서 벌어진 일이다)',
      `heard ${arrived.heard} > 얼린 날 ${frozenDay}`);
  }
  // 화면에도 실제로 그려졌는가 — 페이로드만 보면 §8.2 층을 안 재게 된다
  const p2 = await openChron();
  ok(/일에 들었다/.test(p2.body), '⑥d 화면에 "…일에 들었다"가 실제로 그려진다', JSON.stringify(p2.body.slice(0, 80)));
  ok(new RegExp(A.name).test(p2.body), '⑥e 화면에 출처 마을 이름이 보인다', A.name);
  await snap('ch-03-after');

  // ── ⑦ 연도 줄 · 지난 해 조회
  // ★★**여기서부터 날을 얼린다.** 하루가 0.5초라 "지금 몇 해인가"가 몇 초 만에 바뀐다 —
  //   앞 절에서 읽은 연도 목록을 그대로 들고 "다음 해엔 아무것도 없다"를 물으면,
  //   그 사이 해가 넘어가 **그 '다음 해'가 올해가 되어 107줄이 들어 있다.**
  //   1차 판이 정확히 그렇게 빨개졌다(제품은 옳고 하네스가 시계를 놓친 것 — 족보 ㊽).
  await freeze(true);
  const cNow = await askChron(B.id, null);
  ok(!!(cNow && Array.isArray(cNow.years) && cNow.years.length >= 1), '⑦ 연도 목록이 온다(연표 한 화면 = 한 해)',
    cNow ? JSON.stringify(cNow.years) : 'X');
  const yrs = (cNow && cNow.years) || [0];
  const oldest = yrs[yrs.length - 1], newest = yrs[0];
  const cOld = await askChron(B.id, oldest);
  ok(!!(cOld && cOld.ok && cOld.year === oldest), '⑦b 지난 해를 물으면 그 해로 답한다', cOld ? `year=${cOld.year}` : 'X');
  const nOld = (cOld.seasons || []).reduce((a, b) => a + b.items.length, 0);
  ok(yrs.length < 2 || nOld > 0, '⑦c 지난 해에도 실제로 기록이 있다(해를 넘겨 읽힌다)', `${oldest}년 ${nOld}줄`);
  const cFuture = await askChron(B.id, newest + 1);
  const nFut = (cFuture.seasons || []).reduce((a, b) => a + b.items.length, 0);
  ok(nFut === 0, '⑦d 아직 오지 않은 해에는 아무것도 없다(미래를 미리 적지 않는다)', `${newest + 1}년 ${nFut}줄`);

  // ── ⑧ 거리 게이트 — 멀어지면 연표도 못 읽는다(게시판과 같은 술어)
  {
    const [bx, by] = px(B);
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x: x + 5000, y: y + 5000 }), [bx, by]);
    await sleep(2500);
    await page.evaluate((vid) => window.__sendPrimary({ type: 'village_chronicle', vid }), B.id);
    await sleep(1200);
    const note = await page.evaluate(() => (window.__notices || []).slice(-2).join(' | '));
    ok(/너무 멀/.test(note), '⑧ 멀리서 연표를 청하면 서버가 거절한다(260px 게이트 — 게시판과 같은 술어)', JSON.stringify(note));
  }

  // ── ⑨ 재접속 뒤에도 같은 연표 — 화면을 새로 그려도 역사는 그대로다
  const pKeep = await askChron(B.id, yearAtFreeze);
  const beforeReload = [].concat(...((pKeep && pKeep.seasons) || []).map((b) => b.items)).map((x) => keyOf(x, B.name)).sort().join(';');
  await page.close();
  await sleep(1500);
  page = await ctx.newPage();
  wire(page);
  await enter();
  await freeze(true);   // 재접속으로 얼음이 풀렸을 수 있다 — 다시 얼린다(멱등)
  ok(await warpTo(B, 30), '⑨a 재접속 뒤 다시 그 마을로');
  const p3 = await openChron();
  ok(p3.open && /연대기/.test(p3.title), '⑨a2 재접속 뒤에도 탭이 그대로 열린다', JSON.stringify(p3.title));
  const pAfter = await askChron(B.id, yearAtFreeze);
  const afterReload = [].concat(...((pAfter && pAfter.seasons) || []).map((b) => b.items)).map((x) => keyOf(x, B.name)).sort().join(';');
  ok(afterReload.includes(keyOf(arrived || evA, B.name)), '⑨ 재접속 뒤에도 그 일이 연표에 그대로 있다',
    `${afterReload.split(';').filter(Boolean).length}줄`);
  ok(beforeReload.split(';').filter(Boolean).every((k) => afterReload.includes(k)),
    '⑨b 재접속 전에 있던 줄이 하나도 사라지지 않았다(역사는 접속과 무관하다)');
  await snap('ch-04-reload');

  // ── ⑩ 영속 표 — 잘리지 않는 별도 표에 실제로 쌓인다
  const chronRows = zdb.prepare('SELECT COUNT(*) AS n FROM village_chronicle WHERE zone = ?').get('hanbando');
  const evRows = zdb.prepare('SELECT COUNT(*) AS n FROM village_events WHERE zone = ?').get('hanbando');
  ok((chronRows.n | 0) > 0, '⑩ 연대기 표(`village_chronicle`)에 행이 실제로 쌓인다(prune 없음)',
    `연표 ${chronRows.n}행 · 사건 ${evRows.n}행`);
  ok((chronRows.n | 0) <= (evRows.n | 0) + 1000, '⑩b 연표 행은 사건보다 많지 않다(사건 하나당 한 행)');

  // ── ★[T50 2026-09-02] ⑪ 세계의 "일"이 **자동으로** 연표까지 흐른다 ────────────────────
  //   이 배치가 한 일은 유형을 더한 것뿐이다 — 연표도 소문도 브리핑도 **한 줄도 안 고쳤다**.
  //   그 주장이 참인지는 새 유형 하나를 세계에 세워 보면 안다(사건을 심는 게 아니라 **날씨**를 부른다).
  {
    await freeze(false);
    ok(await warpTo(B, 30), '⑪a B 마을로(일을 낼 자리)');
    const dayNow = await gameDay();
    await page.evaluate((vid) => window.__sendPrimary({ type: '__e2e_village_deed', vid, kind: '가뭄' }), B.id);
    await sleep(1500);
    let deedRow = null, tries = 0;
    for (; tries < 60 && !deedRow; tries++) {
      const c = await askChron(B.id, null);
      const all = [].concat(...((c && c.seasons) || []).map((b) => b.items));
      deedRow = all.find((x) => x.type === 'WEATHER' && x.from == null && x.day >= dayNow);
      if (!deedRow) await sleep(500);
    }
    ok(!!deedRow, '⑪ 세계에 가뭄이 들면 **연표에 저절로 적힌다**(유형만 늘렸지 연표는 안 고쳤다)',
      deedRow ? `day${deedRow.day} · ${deedRow.line}` : `(${tries}회 폴링 뒤에도 없음)`);
    if (deedRow) {
      ok(/비가 통 안 오는군/.test(deedRow.line), '⑪b 촌장 말투로 적힌다(수치를 읊지 않는다)', JSON.stringify(deedRow.line));
      ok(deedRow.deed === true, '⑪c 서버가 그 줄을 **"일"로 표시해** 보낸다(무게 축이 화면까지 온다)');
      ok(deedRow.heard === deedRow.day, '⑪d 우리 마을 일이라 도달 지연이 0이다');
      // ★이 줄은 **기본 문턱이었으면 안 실렸다** — 그래서 일 유형은 sev 문턱을 면제받는다.
      ok(deedRow.sev < 2.2, '⑪e ★이 줄의 sev 는 값 문턱(2.2)에 한참 못 미친다 — 문턱 면제가 없으면 연표에 못 온다',
        `sev=${deedRow.sev}`);
      const p4 = await openChron();
      ok(/비가 통 안 오는군/.test(p4.body), '⑪f 실화면에 그 문장이 실제로 그려진다', JSON.stringify(p4.body.slice(0, 60)));
      await snap('ch-05-deed');
    }
  }

  // ── ★[T55 2026-09-02] ⑫ 연표 아이콘이 **유형별로 갈린다** ────────────────────
  //   종전엔 전부 🕰️ 였다. T50 이 `type`·`deed` 를 실어 줬으니 화면이 그걸 쓴다.
  //   ★자명 통과 금지: "🕰️ 가 아니다" 로는 부족하다 — **두 유형이 서로 다른 그림**임을 잰다.
  {
    const p5 = await openChron();
    const shown = await page.evaluate(() => [...document.querySelectorAll('#spBody .craft-recipe')]
      .map((el) => ({
        icon: ((el.querySelector('.cr-icon') || {}).textContent || '').trim(),
        bold: /bold/.test(((el.querySelector('.cr-name') || {}).getAttribute('style') || '')),
        line: ((el.querySelector('.cr-name') || {}).textContent || '').trim().slice(0, 40),
      })));
    ok(shown.length >= 2, '⑫ (상황) 연표에 항목이 둘 이상 그려져 있다', `${shown.length}줄`);
    const icons = shown.map((x) => x.icon).filter(Boolean);
    ok(icons.length === shown.length, '⑫ 모든 줄에 아이콘이 있다', `${icons.length}/${shown.length}`);
    const uniq = [...new Set(icons)];
    ok(uniq.length >= 2, '★★⑫ **아이콘이 유형별로 다르다** — 두 종류 이상이 한 화면에 있다(전부 🕰️ 이던 자리)',
      uniq.join(' ') + `  (${shown.length}줄 중 ${uniq.length}종)`);
    ok(!(uniq.length === 1 && uniq[0] === '🕰️'), '★⑫ 폴백 하나로 덮이지 않았다', uniq.join(' '));
    // ★"일"은 굵게 — 값이 움직인 줄과 갈린다
    const deeds = shown.filter((x) => x.bold);
    ok(deeds.length > 0, '★⑫ "일"로 표시된 줄은 **굵게** 그려진다(구분은 한 가지만)',
      deeds.length ? `${deeds.length}줄 · 예: ${deeds[0].icon} ${deeds[0].line}` : '(굵은 줄 0 — 위 ⑪ 의 가뭄이 이 화면에 있어야 한다)');
    // ★자명 통과 금지의 뒷면 — 굵지 않은 줄도 있어야 "구분"이다
    ok(deeds.length < shown.length, '★⑫ 그리고 굵지 않은 줄도 있다(전부 굵으면 구분이 아니다)',
      `굵은 ${deeds.length} / 전체 ${shown.length}`);
    await snap('ch-06-icons');
  }

  const fatal = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(fatal.length === 0, `클라 JS 에러 0 ${fatal.length ? '— ' + fatal.slice(0, 3).join(' / ') : ''}`);

  await browser.close();
  shutdown();
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 실패:', e); shutdown(); process.exit(1); });
