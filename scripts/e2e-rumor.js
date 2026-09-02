#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-rumor.js — 소문 물리 전파 · 복귀 브리핑 **실클라** E2E ========
//
// ★왜 [T7 2026-09-01]
//   `test-events` ⑲~㉕ 는 **장부 층**에서 도달표·가시성 술어를 잰다(합성 배치·합성 거리).
//   그런데 이 배치가 진짜로 주장하는 것은 그게 아니다:
//     *"이웃 마을에서 벌어진 일을 내 마을 게시판에서 **며칠 뒤에** 보게 된다."*
//   그 문장은 **실지도의 거리행렬 + 실서버 하루 경계 + 실클라 왕복**이 전부 맞물려야 참이 된다.
//   장부만 맞고 배선이 어긋나면 플레이어에게는 "아무 일도 안 일어나는" 기능이다(배치 5 의 교훈).
//
// ★★시간 모드: **퍼질 땐 흐르고, 관측할 땐 얼린다.**
//   소문이 오려면 날이 흘러야 하는데(0.5초/일), 워프 수렴에만 수십 초가 걸린다 —
//   얼리지 않으면 "B 로 가는 사이에 이미 도착"해서 ②(도달 전 불가시)를 잴 수가 없다.
//   ⇒ A 에서 사건을 세운 직후 **날을 얼리고** B 로 건너가 "아직 안 보인다"를 재고,
//     그 다음 **녹여서** "며칠 뒤 보인다"를 잰다.
//
// 실행: node scripts/e2e-rumor.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const Rumor = require(path.join(ROOT, 'server', 'rumor'));
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-ru-central-${process.pid}.db`, ZDB = `/tmp/e2e-ru-zone-${process.pid}.db`;
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
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비|📜|거리행렬/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 130)}\n`); });
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
  console.log('\n=== 소문 물리 전파 · 복귀 브리핑 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    // ★마을 3곳 — 소문은 **마을 사이**의 일이라 2곳으론 "먼 마을이 아닌 쪽"을 못 가른다.
    VILLAGE_MAX: '3', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
    E2E_GIVE: '1',
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
    await sleep(2000);
  }
  await enter();
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  // ── 마을 두 곳 고르기 — **가장 가까운 쌍**(소문이 며칠 안에 닿는 쌍이어야 잴 수 있다) ──
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  const rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length >= 2, `마을이 2곳 이상 시딩됐다 (${rows.length}곳)`, rows.map((r) => r.name).join(' '));
  if (rows.length < 2) { console.log('\n마을 부족 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  let A = rows[0], B = rows[1], bestD = Infinity;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const d = Math.hypot((rows[i].cx - rows[j].cx) * 32, (rows[i].cy - rows[j].cy) * 32);
    if (d < bestD) { bestD = d; A = rows[i]; B = rows[j]; }
  }
  // ★★**단위를 섞지 마라**(족보 (54)·(74)). `travelDaysOf` 는 **econ 좌표 단위**를 받는다 —
  //   econ 마을 좌표는 `셀 × 2.5` 이고(`computeAndInjectDistMatrix` 의 `/ 2.5 / DIST_STEP` 이 그 증거),
  //   화면 px 는 `셀 × 32` 다. px 를 그대로 넣으면 12.8배 부풀어 "64일" 같은 헛 하한이 나온다
  //   (이 하네스 1차가 정확히 그렇게 틀렸다 — 제품이 아니라 하네스가 틀린 쪽이었다).
  const ECON_PER_CELL = 2.5, PX_PER_CELL = 32;
  const bestEcon = bestD / PX_PER_CELL * ECON_PER_CELL;
  // ★유클리드는 **하한**이다(지형 BFS 거리는 강·산 우회로 그보다 크거나 같다).
  //   그래서 "며칠 이상 걸려야 한다"는 검사에 그대로 쓸 수 있다 — 부등호 방향이 안전한 쪽이다.
  const minDays = Rumor.travelDaysOf(bestEcon);
  console.log(`    A=${A.name} B=${B.name} · 직선 ${bestD.toFixed(0)}px = ${bestEcon.toFixed(0)}econ ⇒ 소문 최소 ${minDays}일`);
  ok(minDays >= 2, '① 전제: 고른 두 마을은 **소문이 하루 만에 못 가는** 거리다(검사가 성립하는 배치)',
    `직선 ${bestD.toFixed(0)}px = ${bestEcon.toFixed(0)}econ ⇒ ≥${minDays}일`);

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
  // ★★[T50 2026-09-02 수리] **응답을 기다린다 — 고정 sleep 으로 읽지 않는다.**
  //   `__evLastBoard` 는 "마지막으로 받은 것"이라, 500ms 안에 답이 안 오면 **직전 응답을 읽는다.**
  //   그러면 오늘 난 사건이 빠진 낡은 게시판을 오늘 브리핑과 견주게 되고, ⑥이
  //   "촌장과 게시판이 다른 말을 한다"고 **없는 사본을 보고**한다(러너 아래에서 실제로 그랬다:
  //    촌장은 `새 움집이 하나 섰네`를 말하는데 게시판엔 그 줄이 아예 없었다 — 제품은 옳았다).
  //   ⇒ 칸을 비우고 새 응답을 폴링한다. `e2e-chronicle askChron` 과 같은 처방(족보 ㊽).
  // ★[T50 2026-09-02 수리] 브리핑도 **응답을 기다린다** — 아래 `askBoard` 와 같은 이유·같은 처방.
  //   종전엔 고정 900ms 뒤 `__evLastBrief` 를 읽었는데, 러너 아래에서 답이 늦으면 `null` 이라
  //   ⑥a 가 빨개지고 ⑥은 **빈 배열이라 자명 통과**한다(⑥b 가 그 자명 통과를 잡아 준다).
  const askBrief = async (vid) => {
    await page.evaluate(() => { window.__evLastBrief = null; });
    await page.evaluate((v) => window.__sendPrimary({ type: 'village_brief', vid: v }), vid);
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      const b = await page.evaluate(() => window.__evLastBrief || null);
      if (b) return b;
    }
    return null;
  };
  const askBoard = async (vid) => {
    await page.evaluate(() => { window.__evLastBoard = null; });
    await page.evaluate((v) => window.__sendPrimary({ type: 'village_board', vid: v }), vid);
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      const b = await page.evaluate(() => window.__evLastBoard || null);
      if (b) return b;
    }
    return null;
  };
  // ★게임일은 **틱을 한 번 받아야** 선다. 0 을 그대로 읽으면 "하루도 안 흘렀다"는 헛 판정이 난다
  //   (이 하네스 3차가 그렇게 틀렸다: `day 68 → 0 (-68일)`).
  const gameDay = async () => {
    for (let i = 0; i < 30; i++) {
      const d = await page.evaluate(() => window.__evGameDay | 0);
      if (d > 0) return d;
      await sleep(400);
    }
    return 0;
  };
  const freeze = async (on) => { await page.evaluate((o) => window.__sendPrimary({ type: '__e2e_day_freeze', on: o }), on); await sleep(700); };
  // ★★키에 **출처 마을**을 넣는다. 안 넣으면 `CARAVAN_LATE|null|57` 같은 키가 두 마을에서
  //   같은 날 나서 "B 가 A 의 사건을 이미 안다"는 **가짜 실패**가 난다(1차 실패의 진범).
  //   자기 마을 사건은 `from` 이 null 이므로 보는 쪽 마을 이름으로 채운다.
  const keyOf = (r, viewerName) => `${r.type}|${r.item}|${r.day}|${r.from || viewerName}`;

  ok(await warpTo(A, 30), `② A(${A.name}) 마을 중심 도착`, `__evNearVid=${await page.evaluate(() => window.__evNearVid)}`);
  await snap('ru-01-at-A');

  // ── ③ A 에서 사건을 세운다 — 그리고 A 는 **그날 바로** 안다 ────────────────
  let evA = null, boardA = null;
  for (let i = 0; i < 30 && !evA; i++) {
    await page.evaluate((vid) => window.__sendPrimary({ type: '__e2e_village_short', vid }), A.id);
    await sleep(1100);                                   // 하루 경계가 지나가게
    boardA = await askBoard(A.id);
    const own = ((boardA && boardA.news) || []).filter((r) => r.from == null);
    if (own.length) evA = own.slice().sort((a, b) => b.day - a.day)[0];
  }
  ok(!!(boardA && Array.isArray(boardA.news)), '③a 게시판 응답에 소식(news)이 실려 온다(T7 추가 필드)',
    boardA ? `news ${((boardA.news) || []).length}건 · 의뢰 ${((boardA.rows) || []).length}건` : 'X');
  ok(!!evA, '③ A 마을은 **자기 사건을 그날 바로** 안다(직접 목격 = 지연 0)',
    evA ? `${evA.type} ${evA.item} day${evA.day} heard${evA.heard}` : '(사건 없음)');
  ok(!!evA && evA.heard === evA.day, '③b 자기 마을 사건의 도달일 = 사건일(하루도 안 걸린다)',
    evA ? `${evA.day} → ${evA.heard}` : '');
  ok(!!evA && evA.from == null, '③c 자기 마을 사건엔 출처 마을 이름이 안 붙는다');

  // ── ④ 날을 얼리고 B 로 건너가 — **아직 안 보인다** ─────────────────────────
  await freeze(true);
  const frozenDay = await gameDay();
  // ★★[T50 2026-09-02 수리] 종전 판은 **알림 마지막 넉 줄**에서 "게임일 정지"를 찾았다.
  //   그건 얼음이 얼었는지가 아니라 **알림이 몇 줄 밀렸는지**를 재는 검사였다 —
  //   촌장이 할 말이 늘자(사건 유형 2차) 알림이 더 빨리 밀려 그 줄이 창 밖으로 나갔고,
  //   ④ 는 멀쩡히 통과하는데 ④a 만 빨개졌다(제품은 옳고 하네스가 틀린, 가장 헷갈리는 실패).
  //   ⇒ **효과를 잰다**: 얼린 뒤 실시간이 흘러도 게임일이 안 움직여야 한다. 알림은 전 구간에서 찾는다.
  await sleep(2000);                                   // 하루 500ms — 안 얼었으면 네 날은 흘렀을 시간
  const stillDay = await gameDay();
  ok(stillDay === frozenDay, '④a 게임일 정지(관측 구간) — 실시간이 흘러도 날이 안 간다',
    `${frozenDay} → ${stillDay}`);
  ok((await page.evaluate(() => (window.__notices || []).join(' | '))).includes('게임일 정지'),
    '④a2 정지 알림도 남아 있다(디버그 메시지가 실제로 닿았다)');
  ok(await warpTo(B, 30), `④b B(${B.name}) 마을 중심 도착`, `__evNearVid=${await page.evaluate(() => window.__evNearVid)}`);
  const boardB0 = await askBoard(B.id);
  const news0 = (boardB0 && boardB0.news) || [];
  ok(news0.length > 0, '④c 전제: B 게시판에도 소식이 실린다(빈 목록으로 인한 자명 통과가 아니다)',
    `news ${news0.length}건 — ${JSON.stringify(news0.slice(0, 2).map((r) => r.line))}`);
  const seen0 = evA ? news0.some((r) => keyOf(r, B.name) === keyOf(evA, A.name)) : true;
  ok(evA && !seen0, '④ A 에서 난 사건이 **B 에는 아직 없다**(도달 전 사건은 없는 것과 같다)',
    `frozenDay=${frozenDay} · 사건일 ${evA && evA.day} · 최소 ${minDays}일 필요`);
  await snap('ru-02-at-B-before');

  // ── ⑤ 날을 녹이고 기다리면 — **며칠 뒤에** 나타난다 ────────────────────────
  await freeze(false);
  let arrived = null, polls = 0;
  for (; polls < 120 && !arrived; polls++) {
    const b = await askBoard(B.id);
    const hit = ((b && b.news) || []).find((r) => evA && keyOf(r, B.name) === keyOf(evA, A.name));
    if (hit) arrived = hit;
    else await sleep(400);
  }
  ok(!!arrived, '⑤ 며칠 뒤 그 사건이 **B 게시판에 나타난다**(캐러밴이 걸어온 뒤에 들린다)',
    arrived ? `day${arrived.day} → heard${arrived.heard} (${arrived.heard - arrived.day}일) · 출처 ${arrived.from}` : `(${polls}회 폴링 뒤에도 미도착)`);
  if (arrived) {
    ok(arrived.from === A.name, '⑤b 출처 마을이 붙어 온다(어디서 온 소식인지 안다)', `from=${arrived.from}`);
    ok(arrived.heard - arrived.day >= minDays, '⑤c 도달 지연이 **캐러밴 시계 하한 이상**이다(지형 우회는 더 걸린다)',
      `${arrived.heard - arrived.day}일 ≥ ${minDays}일`);
    ok(arrived.heard > arrived.day, '⑤d 남의 마을 소식은 **절대 같은 날에 못 온다**');
    const nowDay = await gameDay();
    ok(nowDay >= arrived.heard, '⑤e 오늘이 도달일 이후다(가시성 술어와 화면이 같은 날을 본다)', `today=${nowDay} heard=${arrived.heard}`);
  }
  await snap('ru-03-at-B-after');

  // ── ⑥ 브리핑과 게시판이 **같은 술어**를 본다 ───────────────────────────────
  //   촌장이 아는 것과 게시판에 적힌 것이 갈리면 그게 사본이다.
  // ★★**날을 얼리고 견준다.** 클라의 근접 틱은 **게임일이 바뀔 때마다** 브리핑을 다시 청하는데
  //   여기선 하루가 0.5초다 — 얼리지 않으면 브리핑과 게시판이 **서로 다른 날**의 답이 되어
  //   "사본이 있다"는 가짜 실패가 난다(이 하네스 1차가 그렇게 틀렸다. 제품은 멀쩡했다).
  await freeze(true);
  let briefB = await askBrief(B.id);
  const bNow = await askBoard(B.id);
  const newsLines = new Set(((bNow && bNow.news) || []).map((r) => r.line));
  const briefLines = ((briefB && briefB.lines) || []).filter((l) => !/만이군|별일 없네|게시판에 적어/.test(l));
  ok(!!briefB && briefB.vid === B.id, '⑥a 전제: B 촌장 브리핑을 받았다', briefB ? `vid=${briefB.vid}` : 'X');
  ok(briefLines.length > 0, '⑥b 전제: 브리핑에 사건 문장이 실제로 있다(자명 통과 방지)', JSON.stringify(briefLines));
  ok(briefLines.every((l) => newsLines.has(l)), '⑥ 촌장이 하는 말은 전부 게시판 소식 안에 있다(문 하나 · 사본 0)',
    JSON.stringify(briefLines.filter((l) => !newsLines.has(l))));

  // ── ⑦ 복귀 브리핑 — 로그아웃 → 며칠 → 재접속 ───────────────────────────────
  // ★★나가기 전에 **마을에서 멀리 물러난다.** 마지막 좌표가 저장되므로, 그래야 재접속 스폰이
  //   게이트 밖이고 **첫 브리핑이 내가 다가간 그 순간**에 난다. 마을 한복판에서 끊으면
  //   재접속하자마자 근접 틱이 복귀 브리핑을 써 버리고, 하루가 0.5초라 다음 날 브리핑이
  //   그걸 덮는다 — 잰 적도 없는 것을 "안 난다"고 보고하게 된다(1차 실패의 진범 둘째).
  await freeze(false);
  {
    const [bx, by] = px(B);
    // ★한 자리를 고르지 않고 **여러 자리를 재 본다**(족보 (73)) — 4000px 떨어진 그 한 점이
    //   하필 다른 마을 옆일 수도, 지형에 막혀 워프가 안 먹을 수도 있다.
    let away = false;
    const offs = [[4000, 4000], [-4000, -4000], [4000, -4000], [-4000, 4000], [8000, 0], [0, 8000]];
    for (const [ox, oy] of offs) {
      await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [bx + ox, by + oy]);
      for (let k = 0; k < 4 && !away; k++) { await sleep(900); away = (await page.evaluate(() => window.__evNearVid)) == null; }
      if (away) break;
    }
    ok(away, '⑦0 나가기 전에 마을 밖으로 물러났다(재접속 스폰이 게이트 밖)',
      `__evNearVid=${await page.evaluate(() => window.__evNearVid)}`);
  }
  const beforeDay = await gameDay();
  await page.close();
  await sleep(1200);
  // ★게임일이 흐르는 동안 사람이 없다. 이게 "자리를 비웠다" 의 정의다.
  await sleep(6000);                                   // 0.5초/일 ⇒ 약 12게임일
  page = await ctx.newPage();
  wire(page);
  await enter();
  const afterDay = await gameDay();
  // ★재접속 직후 **날을 얼린다** — 이제부터 브리핑은 하루에 한 번이고, 첫 브리핑이 덮이지 않는다.
  await freeze(true);
  ok(afterDay - beforeDay >= 2, '⑦a 전제: 자리를 비운 사이 게임일이 실제로 흘렀다',
    `day ${beforeDay} → ${afterDay} (${afterDay - beforeDay}일)`);
  const warped = await warpTo(B, 30);
  ok(warped, '⑦b 재접속 뒤 다시 마을에 다가갔다');
  let brief2 = null;
  for (let i = 0; i < 25 && !brief2; i++) { await sleep(700); brief2 = await page.evaluate(() => window.__evLastBrief || null); }
  ok(!!brief2, '⑦c 재접속 뒤에도 접근만으로 촌장이 말을 건다');
  // ★★**`__evLastBrief` 는 덮인다.** 클라는 브리핑을 받을 때마다 그 한 칸을 갈아치우고,
  //   부하가 높으면 워프 도중 소켓이 한 번 더 갈리면서 **평소 브리핑이 복귀 브리핑을 덮는다**
  //   (복귀 요약은 접속당 한 번이라 두 번째부터는 평소 브리핑이다 — 제품이 옳다).
  //   ⇒ 판정은 **덮이지 않는 기록**인 HUD 알림 목록(`window.__notices`)으로 한다.
  //   1차 판이 마지막 한 칸만 보고 "복귀 브리핑이 안 났다"고 **없는 결함을 보고**했다(족보 ㊽·(70)).
  const notes = await page.evaluate(() => (window.__notices || []).slice());
  const retNote = notes.find((t) => /만이군/.test(String(t)));
  const m = retNote ? String(retNote).match(/(\d+)일 만이군/) : null;
  const absent = m ? +m[1] : ((brief2 && brief2.absentDays) || 0);
  ok(!!retNote || !!(brief2 && brief2.returned === true), '⑦ 촌장이 **부재 기간 요약**을 먼저 한다(복귀 브리핑)',
    retNote ? JSON.stringify(String(retNote).slice(0, 70)) : `(알림에 없음 · 마지막 브리핑 returned=${brief2 && brief2.returned})`);
  ok(absent >= 1, '⑦d 부재 일수가 1게임일 이상이다', `${absent}일`);
  // ★★부재 일수가 **실제로 비운 만큼**이어야 한다. 이 줄이 없으면 "입장 직후 재접속이 기준일을
  //   오늘로 덮는" 결함(승계 누락)이 `returned:true` 뒤에 숨는다 — 실제로 한 번 숨었다.
  ok(absent >= (afterDay - beforeDay) * 0.6,
    '⑦d2 부재 일수가 **실제로 비운 기간**에 맞는다(입장 직후 재접속이 기준일을 지우지 않는다)',
    `보고 ${absent}일 vs 실제 ${afterDay - beforeDay}일`);
  ok(!!retNote && /촌장/.test(String(retNote)), '⑦e 그 말은 **촌장이 한 말**이다(HUD 한 줄로도 남는다)',
    retNote ? JSON.stringify(String(retNote).slice(0, 50)) : '');
  ok(!retNote || !/\d+\.\d/.test(String(retNote)), '⑦f 복귀 브리핑에도 소수점 수치가 안 찍힌다');
  // 문장 수 상한은 **서버 계약**이라 `test-events ㉓c` 가 잰다. 여기선 페이로드가 남아 있을 때만 곁들인다.
  const rl = (brief2 && brief2.returned) ? (brief2.lines || []) : null;
  ok(!rl || rl.length <= 1 + 3 + 1, '⑦g (페이로드가 남았으면) 문장 수 상한 — 머리말 + 사건 3줄 + 꼬리',
    rl ? `${rl.length}줄` : '(마지막 브리핑이 평소 브리핑이라 생략 — 상한은 test-events ㉓c)');
  await snap('ru-04-return-brief');

  // 두 번째 브리핑 — 같은 부재를 다시 읊지 않는다
  const brief3 = await askBrief(B.id);
  ok(!!brief3, '⑧a 전제: 두 번째 브리핑을 받았다');
  ok(!!(brief3 && brief3.returned === false), '⑧ 같은 접속에서 두 번째부터는 부재 요약을 반복하지 않는다',
    brief3 ? `returned=${brief3.returned}` : 'X');

  // ── ★[T50 2026-09-02] ⑨ 세계의 "일"도 **같은 길로** 걸어온다 ────────────────────────
  //   유형만 더했지 소문 층은 한 줄도 안 고쳤다 — 그 주장을 새 유형 하나로 확인한다.
  //   ⚠사건을 심지 않는다. A 마을에 **가뭄을 부르고**(econ `_weather`), 사건은 장부가 스스로 낸다.
  {
    await freeze(true);
    ok(await warpTo(A, 30), '⑨a A 로 돌아간다(일을 낼 자리)');
    await freeze(false);
    const dayNow = await gameDay();
    await page.evaluate((vid) => window.__sendPrimary({ type: '__e2e_village_deed', vid, kind: '가뭄' }), A.id);
    await sleep(1500);
    let deedA = null;
    for (let i = 0; i < 40 && !deedA; i++) {
      const b = await askBoard(A.id);
      deedA = ((b && b.news) || []).find((r) => r.type === 'WEATHER' && r.from == null && r.day >= dayNow);
      if (!deedA) await sleep(400);
    }
    ok(!!deedA, '⑨b A 는 가뭄을 그날 바로 안다(자기 마을 일 · 지연 0)',
      deedA ? `day${deedA.day} · ${deedA.line}` : '(안 남)');
    if (deedA) {
      ok(deedA.heard === deedA.day, '⑨c 자기 마을 일의 도달일 = 사건일');
      ok(await warpTo(B, 30), '⑨d B 로 건너간다');
      let deedB = null, polls2 = 0;
      for (; polls2 < 150 && !deedB; polls2++) {
        const b = await askBoard(B.id);
        deedB = ((b && b.news) || []).find((r) => r.type === 'WEATHER' && r.from === A.name && r.day === deedA.day);
        if (!deedB) await sleep(400);
      }
      ok(!!deedB, '⑨ ★새 유형도 **소문을 타고 걸어온다**(도달표를 유형별로 나누지 않았다)',
        deedB ? `day${deedB.day} → heard${deedB.heard} (${deedB.heard - deedB.day}일) · 출처 ${deedB.from}` : `(${polls2}회 폴링 뒤에도 미도착)`);
      if (deedB) {
        ok(deedB.heard - deedB.day >= minDays, '⑨e 지연이 캐러밴 시계 하한 이상이다(값 유형과 같은 표)',
          `${deedB.heard - deedB.day}일 ≥ ${minDays}일`);
        ok(deedB.line === deedA.line, '⑨f B 가 듣는 말이 A 에서 난 그 말과 같다(문장 사본 0)', JSON.stringify(deedB.line));
      }
    }
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
