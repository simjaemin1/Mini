#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-events.js — 촌장 브리핑 · 게시판 납품 **실클라** E2E ===========
//
// ★왜 [2026-08-25 사건 레이어 배치]
//   `test-events.js` 55/0 은 "장부 계약이 지켜지는가"를 잰다. 그런데 이 프로젝트가 배치 5 에서
//   배운 것은 **계약도 실행도 멀쩡한데 화면에서 도달 못 하는 층이 하나 더 있다**는 것이다 —
//   서버 E2E 56/0 이 통과하는 동안 플레이어는 노를 **한 번도 지을 수 없었다**(진입 버튼이
//   `display:none` 컨테이너 안에만 있었다). 사건 레이어도 같다: 장부가 아무리 정확해도
//   촌장이 말을 안 걸고 게시판이 안 뜨면 **플레이어에게는 없는 기능**이다.
//   여기서는 진짜 Chromium 을 띄우고 사람이 하듯 마을에 다가가 → 촌장 말을 듣고 →
//   게시판을 열고 → 납품하고 → 보상을 받는다.
//
// ★★시간 모드 [2026-08-26]: **데울 땐 흐르고, 상호작용 땐 얼린다.**
//   소비EMA 를 데우려면 날이 빨라야 하는데(0.5초/일), 그 속도면 게시판을 열고 재료를 받고 납품하는
//   몇십 초 사이에 게임 수십 일이 흘러 **의뢰가 철회되고 품목이 바뀐다** — 상호작용을 재려던 검사가
//   경제 속도를 재게 된다. 그래서 부족을 세운 뒤 `__e2e_day_freeze` 로 날을 멈추고 상호작용을 잰다.
//   (사건 하루 경계·의뢰 철회처럼 **시간이 주제인** 검사는 `test-events` 가 맡는다 — 거긴 안 얼린다.)
//
// 실행: node scripts/e2e-events.js [--headed]
//   ★이 검사만 `ENABLE_VILLAGES` 를 켠다(다른 실클라 하네스는 부팅 시간 때문에 끈다).
//     대신 `VILLAGE_MAX=2` 로 마을 2곳만 시딩해 부팅을 짧게 한다 —
//     검사 대상은 마을 **수**가 아니라 브리핑·게시판·정산의 **경로**다.
'use strict';
const BOARD_RE = /^[^\n]{1,24}게시판\n/;   // ★[T66] 게시판 알림의 첫 줄 — 이모지 없이
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-ev-central-${process.pid}.db`, ZDB = `/tmp/e2e-ev-zone-${process.pid}.db`;
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
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비|📜/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 110)}\n`); });
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
  console.log('\n=== 촌장 브리핑 · 게시판 납품 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    // ★마을이 필요한 유일한 실클라 하네스 — 대신 2곳만, 하루는 0.5초.
    // 하루 0.5초 — **데우기용**이다. 상호작용은 아래에서 날을 얼리고 잰다(머리 주석 참조).
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
    E2E_GIVE: '1',   // 재료 지급 + 부족 픽스처(둘 다 이 플래그로만 분기가 산다)
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  let zmap = null;
  for (let i = 0; i < 90; i++) {
    zmap = await (await fetch(`http://localhost:${CPORT}/zones`)).json();
    const z = zmap.zones && zmap.zones.hanbando;
    if (z && z.population !== null && z.population !== undefined && z.cap) break;
    await sleep(1000);
  }
  ok(!!(zmap.zones || {}).hanbando, '로비에 존이 살아 보인다');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  // ★★[T78] **서버가 보낸 알림 프레임을 통째로 받아 둔다** — 클라를 한 글자도 안 건드리고
  //   경계(`zone.js send()` → `notice.normalize`)가 실제로 무엇을 내보내는지 보는 유일한 창이다.
  //   ⚠`window.__notices` 로는 못 잰다: 거기엔 **클라가 스스로 만든 토스트**(게시판 `📋 …`)도 섞이고,
  //     그건 T66 몫이라 이 카드가 지울 것이 아니다. 프레임을 보면 **서버 것만** 갈린다.
  const wsNotices = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => {
      const d = typeof f.payload === 'string' ? f.payload : String(f.payload || '');
      if (d.indexOf('"notice"') < 0) return;
      try { const m = JSON.parse(d); if (m && m.type === 'notice') wsNotices.push(m); } catch (e) {}
    });
  });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enterBtn = await page.$('button:has-text("월드 입장")');
  ok(!!enterBtn, '로비에 "월드 입장" 버튼');
  if (enterBtn) await enterBtn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2000);
  await snap('ev-01-in-game');
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  // ── ① 마을 앵커 — **서버가 쓰는 좌표 그대로** 잡는다 ──────────────────────
  //   클라의 `simVillages` 는 conns 안에 있어 공개 훅이 없다. 좌표를 클라에서 되짚어 만들면
  //   존 오프셋 혼선(이 프로젝트의 단골 함정)을 새로 만드는 셈이라, 하네스는 **DB 원본**을 읽는다.
  //   (게임 경로가 아니라 검사 도구의 경로다 — 텔레포트 목표를 정하는 데만 쓴다.)
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  const rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length > 0, `마을이 시딩됐다 (${rows.length}곳)`, rows.map((r) => `${r.name}(${r.cx},${r.cy})`).join(' '));
  if (!rows.length) { console.log('\n마을 0 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  const V = rows[0];
  const ax = V.cx * 32 + 16, ay = V.cy * 32 + 16;

  // ★워프 — **수렴할 때까지 되풀이 요청**한다. 서버 쪽은 멀쩡하다(원시 WS 프로브 실측:
  //   teleport_debug 직후 8초 내내 목표 좌표 유지). 문제는 **게스트 세션이 입장 직후 한 번 재접속**하고
  //   그때 서버가 새 플레이어를 스폰 지점에 만든다는 것 — 한 번만 보낸 워프는 그 재접속에 씻긴다.
  //   (진단으로 확정: `me`(예측)와 `srv`(권위)가 **정확히 같은** 스폰 좌표였다. 클라 리컨실리에이션은 정상이고
  //    서버 플레이어가 실제로 스폰에 있었다. pid 도 바뀌었다.) ⇒ 회부 문서 B-6.
  let tpTries = 0, tpOk = false;
  for (; tpTries < 25 && !tpOk; tpTries++) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [ax, ay]);
    await sleep(1200);
    const d = await page.evaluate(() => window.__evDbg || null);
    if (d && d.seen > 0 && d.minD <= d.gate) tpOk = true;
  }
  console.log(`    워프 ${tpTries}회 시도 · 수렴 ${tpOk}`);
  await snap('ev-02-at-village');
  // ★`simVillages` 는 **welcome 1회 페이로드**다 — 마을 시딩이 끝나기 전에 접속하면 빈 목록으로 온다.
  //   (이 검사가 처음 실패한 원인이 그거였다. 서버·클라 결함이 아니라 하네스가 준비를 안 기다린 것.)
  //   ⚠이건 라이브에도 있는 성질이다 — 시딩 중 접속한 플레이어는 재접속 전까지 마을 목록이 빈다. 회부.
  let dbg = null;
  for (let i = 0; i < 45; i++) {
    dbg = await page.evaluate(() => ({ near: window.__evNearVid, dbg: window.__evDbg || null, err: window.__evTickErr || null, abs: window.__getMyAbs && window.__getMyAbs(), notes: (window.__notices || []).slice(-4) }));
    if (dbg.dbg && dbg.dbg.seen > 0 && dbg.near != null) break;
    await sleep(1000);
  }
  console.log(`    근접 진단: ${JSON.stringify(dbg)}`);
  ok(!dbg.err, '근접 틱이 예외 없이 돈다', dbg.err || '');
  ok(dbg.dbg && dbg.dbg.seen > 0, '클라가 마을 목록(simVillages)을 받았다', dbg.dbg ? `${dbg.dbg.seen}곳 · 최단 ${dbg.dbg.minD}px (게이트 ${dbg.dbg.gate})` : 'X');
  const nearVid = dbg.near;
  ok(nearVid === V.id, '마을 중심 도착 — 클라가 그 마을을 근접 인식', `__evNearVid=${nearVid} (기대 ${V.id})`);

  // 촌장 브리핑은 근접 틱(0.7초)이 자동으로 요청한다 — 사람이 다가가면 말을 건다.
  let brief = null;
  for (let i = 0; i < 20 && !brief; i++) { await sleep(700); brief = await page.evaluate(() => window.__evLastBrief || null); }
  ok(!!brief, '접근만으로 촌장 브리핑이 왔다(별도 조작 없음)');
  ok(!!(brief && brief.lines && brief.lines.length), '브리핑에 문장이 있다', brief ? JSON.stringify(brief.lines) : '');
  ok(!!(brief && brief.vid === V.id), '브리핑은 **그 마을 것**이다(타 마을 미포함)', brief ? `vid=${brief.vid}` : '');
  // ★대시보드 톤 금지 — 소수점 수치가 문장에 찍히면 실패(설계 §3.2)
  const dashy = (brief && brief.lines || []).some((l) => /\d+\.\d/.test(l));
  ok(!dashy, '촌장 대사에 수치가 안 찍힌다(사람 말투)');
  const bub = await page.evaluate(() => (window.__evBubbles ? window.__evBubbles() : []));
  ok(bub.some((b) => b.vid === V.id && b.lines.length), '마을 중심에 말풍선이 떠 있다(HUD 아니라 세계 안)', JSON.stringify(bub.slice(0, 1)));
  const noticed = await page.evaluate(() => (window.__notices || []).some((t) => /촌장/.test(t)));
  ok(noticed, 'HUD 알림에도 촌장 한 줄이 남는다(말풍선을 놓쳐도 보인다)');
  await snap('ev-03-brief-bubble');

  // ── ③ 부족을 만들고 게시판이 서는지 ───────────────────────────────────────
  //   재고만 낮춘다(픽스처). 소비EMA 가 아직 안 자랐으면 정직하게 실패를 돌려준다 —
  //   그때는 게임일이 더 흐를 때까지 기다린다.
  //   ★그리고 **의뢰는 사라질 수 있다** — 마을 경제가 계속 돌아 부족이 풀리면 촌장이 거둔다.
  //     그건 정상 동작이므로, 검사하려는 순간에 **다시 세우는** 헬퍼를 둔다(상황을 고정할 뿐
  //     판정을 무르게 하지 않는다 — 아래 assert 는 그대로다).
  let sh = null;
  async function ensureBoard(tries) {
    for (let i = 0; i < (tries || 30); i++) {
      // ★★[2026-08-26] **픽스처를 부르기 전에 먼저 본다.**
      //   픽스처는 재고를 깎는 행위다 — 부를 때마다 세계를 흔든다. 이미 의뢰가 걸려 있는데도
      //   매 회 깎았더니, 열린 의뢰가 **보상으로 약속한 품목**을 깎아 마을이 못 갚게 만들었다
      //   (`돌 2 → 나무 9` 인데 wood 를 55.6→1.83 으로). 서버 픽스처 쪽도 같이 막았지만,
      //   하네스도 **필요할 때만** 흔드는 게 옳다.
      //   단, `sh` 가 아직 없으면(=픽스처가 한 번도 성립 안 함) 반드시 부른다 —
      //   아래 `부족 픽스처 성립` assert 가 **자명 통과**하면 안 되기 때문이다.
      if (sh) {
        // ★[T66] 머리의 📋 는 화면 규칙 B 로 삭제됐다 — **첫 줄이 `<마을> 게시판`** 인지로 잰다.
      //   (이모지가 아니라 '이게 게시판이다'가 화면에 뜨는지가 이 줄의 뜻이다.)
      await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
        await sleep(400);
        const b0 = await page.evaluate(() => window.__evLastBoard || null);
        if (b0 && b0.rows && b0.rows.length) return b0;
      }
      await page.evaluate((vid) => window.__sendPrimary({ type: '__e2e_village_short', vid }), V.id);
      await sleep(900);
      const last = await page.evaluate(() => (window.__notices || []).slice(-3).join(' | '));
      // ★[T78] 이모지(`🧪`)로 찾지 않는다 — 알림 경계가 접두 이모지를 `kind` 로 옮기고 글자를 뺐다.
      //   픽스처 알림은 본문이 `… 품목 before→after (문턱 … · 갚을거 …)` 라 **그 모양**으로 찾는다(뜻 그대로).
      if (/문턱 .*갚을거/.test(last) && !/없다|미지원|없음/.test(last)) sh = sh || last;
      await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
      await sleep(500);
      const b = await page.evaluate(() => window.__evLastBoard || null);
      if (b && b.rows && b.rows.length) return b;
    }
    return await page.evaluate(() => window.__evLastBoard || null);
  }
  let board = await ensureBoard(30);
  // ★여기서부터 상호작용 — **날을 얼린다.** 이 아래로는 의뢰가 제 발로 철회되거나 품목이 바뀌지 않는다.
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
  await sleep(800);
  ok((await page.evaluate(() => (window.__notices || []).slice(-4).join(' | '))).includes('게임일 정지'),
    '★게임일 정지(상호작용 구간) — 여기부터 경제가 검사를 앞지르지 않는다');
  ok(!!sh, '부족 픽스처 성립(소비EMA 가 자란 품목의 재고를 문턱 아래로 · 갚을 잉여도 갖춤)', sh || '(성립 실패 — 소비EMA 미성숙)');
  ok(!!(board && board.rows && board.rows.length), '게시판에 납품 의뢰가 걸렸다', board ? JSON.stringify(board.rows.map((r) => r.line)) : 'X');
  await snap('ev-04-board');
  // ★자명 통과 금지 — `/게시판/` 만 보면 **촌장 대사**("…(게시판 1건 · Shift+G)")에도 걸린다.
  //   게시판 알림에만 있는 것(📋 머리 + `Shift+N` 꼬리 + 줄바꿈)을 전부 요구한다.
  //   ⚠근접 브리핑이 0.7초마다 돌면서 **같은 `#notice` 를 덮는다** — 게시판을 띄우고 700ms 를
  //     기다리면 촌장 대사가 이미 덮은 뒤일 수 있다(그렇게 두 번 실패했다). 짧게 여러 번 본다.
  //     그리고 의뢰 자체가 그 사이 철회될 수도 있어("걸린 의뢰가 없다"), 비었으면 다시 세운다.
  // ★[T78] 이 자리의 `^📋` 판별은 **상류 T66 이 이미 `BOARD_RE` 로** 이모지 없이 고쳤다 —
  //   내 판(`isBoardToast`)을 버리고 상류 것을 쓴다(같은 일을 하는 술어 둘은 그 자체가 사본이다).
  let boardShown = '';
  for (let i = 0; i < 10; i++) {
    if (i > 0) await ensureBoard(4);
    for (let k = 0; k < 6; k++) {
      await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
      await sleep(200);
      boardShown = await page.evaluate(() => (document.getElementById('notice') || {}).textContent || '');
      if (BOARD_RE.test(boardShown) && /Shift\+N/.test(boardShown)) break;
    }
    if (BOARD_RE.test(boardShown) && /Shift\+N/.test(boardShown)) break;
  }
  ok(BOARD_RE.test(boardShown) && /Shift\+N/.test(boardShown) && boardShown.includes('\n'),
    '게시판 목록이 화면(HUD)에 여러 줄로 실제로 그려졌다', JSON.stringify(boardShown.slice(0, 110)));
  ok(!/촌장/.test(boardShown), '(자명 통과 방지) 그 알림은 촌장 대사가 아니라 게시판이다');

  if (board && board.rows && board.rows.length) {
    // ★납품 **직전에** 게시판을 다시 세우고, **그때의 행**으로 재료를 받는다.
    //   (게임일이 계속 흘러 의뢰 품목 자체가 바뀔 수 있다 — 첫 목록의 품목을 쥐고 있으면 헛낸다.
    //    실제로 그렇게 한 번 실패했다: `약초` 의뢰가 서 있는데 `나무` 를 내고 있었다.)
    const board1 = await ensureBoard(20);
    ok(!!(board1 && board1.rows && board1.rows.length), '④a 전제: 납품 직전에도 의뢰가 걸려 있다',
      board1 ? JSON.stringify(board1.rows.map((r) => r.line)) : 'X');
    const row = (board1 && board1.rows && board1.rows[0]) || board.rows[0];
    const giveItem = (row.give || [])[0];
    const rewItem = row.take;
    ok(!!giveItem, '의뢰 품목을 낼 수 있는 플레이어 아이템이 있다', `${row.item} ← ${JSON.stringify(row.give)}`);

    const need = Math.max(1, Math.ceil(row.remain));
    await page.evaluate(([it, n]) => window.__sendPrimary({ type: '__e2e_give', items: { [it]: n + 5 } }), [giveItem, need]);
    await sleep(1200);
    const invBefore = await page.evaluate(() => (window.__getInv && window.__getInv()) || {});
    ok((invBefore[giveItem] || 0) >= need, '납품할 물건을 손에 넣었다', `${giveItem} ${invBefore[giveItem] || 0}`);

    // 품목을 **안 보낸다** — 서버가 낼 수 있는 의뢰를 고른다(권위는 서버에 있다).
    await page.evaluate((vid) => window.__sendPrimary({ type: 'village_deliver', vid }), V.id);
    await sleep(1500);
    await snap('ev-05-delivered');
    const invAfter = await page.evaluate(() => (window.__getInv && window.__getInv()) || {});
    const notes = await page.evaluate(() => (window.__notices || []).slice(-6));
    console.log(`    납품 후 알림: ${JSON.stringify(notes)}`);
    // ★이 한 줄이 2026-08-26 의 회귀를 이름으로 잡는다 —
    //   아래 세 개(인벤 차감·보상 수령·잔여 감소)는 **이것 하나가 무너지면 같이** 무너져서,
    //   원인이 "납품이 안 됐다" 로만 보이고 **왜** 안 됐는지는 말해 주지 않았다.
    ok(!notes.some((t) => /갚을 것이 없다/.test(t)),
      '★마을이 약속한 보상을 갚을 수 있다(픽스처가 게시판의 보상 품목을 깎지 않았다)',
      notes.filter((t) => /갚을 것이 없다/.test(t)).join(' | ') || '(거절 없음)');
    ok((invAfter[giveItem] || 0) < (invBefore[giveItem] || 0), '납품한 만큼 인벤에서 빠졌다',
      `${giveItem} ${invBefore[giveItem] || 0} → ${invAfter[giveItem] || 0}`);
    ok(notes.some((t) => /납품/.test(t)), '납품 결과가 화면 알림으로 돌아왔다');
    ok(!!rewItem && (invAfter[rewItem] || 0) > (invBefore[rewItem] || 0), '보상(물물)이 인벤에 들어왔다',
      `${rewItem} ${invBefore[rewItem] || 0} → ${invAfter[rewItem] || 0}`);
    const board2 = await page.evaluate(() => window.__evLastBoard || null);
    const r2 = board2 && (board2.rows || []).find((r) => r.item === row.item);
    ok(!r2 || r2.remain < row.remain, '납품 즉시 게시판 잔여가 줄었다(또는 목록에서 빠졌다)',
      r2 ? `remain ${row.remain} → ${r2.remain}` : '목록에서 빠짐');
    ok(true, `(곳간 증가는 test-events ④e 가 정본 필드로 검사 — 여기서는 인벤·알림·게시판 왕복이 대상)`);
  }

  // ── ★[T55 2026-09-02] ⑤-b 게시판이 **들은 소식**을 그린다 ────────────────────
  //   ★왜: `news` 는 T7 부터 이미 실려 왔는데 **클라가 안 그렸다**(회부 0-소문 1).
  //     촌장이 "그 밖에 n건은 게시판에" 라고 안내해도 볼 데가 없었다.
  //   ★자명 통과 금지: 아무 문장이나 세지 않는다 — **내가 심은 그 일**이 화면에 있는지 본다.
  //   ★그리고 **진짜 `Shift+G` 로** 연다(T55 ④ 가 그 키를 되살렸다 — 종전엔 화살이 나갔다).
  console.log('\n⑤-b [T55] 게시판 — 들은 소식이 화면에 그려지나');
  {
    // ⚠날이 멈춰 있으면(위 ① 이 얼렸다) 사건이 **날 수가 없다** — 날씨는 하루 경계에서 장부에 적힌다.
    //   그래서 여기서만 푼다(뒤따르는 ⑥ 거리 게이트는 시간과 무관하다).
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: false }));
    await sleep(800);
    await page.evaluate((vid) => window.__sendPrimary({ type: '__e2e_village_deed', vid, kind: '가뭄' }), V.id);
    await sleep(1500);
    // 게시판 응답에 그 일이 실릴 때까지 기다린다(서버가 장부에 적고 가시성 술어를 통과해야 한다)
    let bd = null;
    for (let i = 0; i < 70; i++) {
      await page.evaluate(() => { window.__evLastBoard = null; });
      await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
      for (let j = 0; j < 12 && !(await page.evaluate(() => !!window.__evLastBoard)); j++) await sleep(200);
      bd = await page.evaluate(() => window.__evLastBoard || null);
      if (bd && (bd.news || []).some((n) => /비가 통 안 오는군/.test(n.line || ''))) break;
      await sleep(500);
    }
    const news = (bd && bd.news) || [];
    ok(news.length > 0, '★⑤-b (상황) 게시판 응답에 `news` 가 실려 있다(데이터는 T7 부터 왔다)', `${news.length}줄`);
    const drought = news.find((n) => /비가 통 안 오는군/.test(n.line || ''));
    ok(!!drought, '★⑤-b (상황) 내가 심은 가뭄이 그 목록에 있다', drought ? drought.line : news.map((n) => n.line).slice(0, 3).join(' | '));

    // ★화면 — 진짜 키로 연다
    await page.evaluate(() => { window.__notices && (window.__notices.length = 0); });
    await page.keyboard.press('Shift+g');
    await sleep(1200);
    const toast = await page.evaluate(() => (window.__notices || []).join('\n'));
    ok(/게시판/.test(toast), '★★⑤-b **`Shift+G` 가 게시판을 연다** — T55 ④ 전엔 이 키가 화살을 쐈다', JSON.stringify(toast.slice(0, 40)));
    ok(/들은 소식/.test(toast), '★★⑤-b 토스트에 **「들은 소식」 절**이 있다', JSON.stringify((toast.match(/— 들은 소식 —[\s\S]{0,60}/) || [''])[0]));
    ok(/비가 통 안 오는군/.test(toast), '★★⑤-b **내가 심은 그 문장이 화면에 보인다**(회부 0-소문 1 종결)',
      JSON.stringify((toast.split('\n').find((l) => /비가 통 안 오는군/.test(l)) || '').slice(0, 60)));
    // ★순서 — 소식은 **의뢰 줄 아래**다(T20 이 맨 윗줄에 겨울 머리줄을 넣는다)
    //   ★★[T63 2026-09-03 수리] **소식 줄도 ` · ` 로 시작한다.** 그래서 의뢰가 0건인 판에서는
    //     `findIndex(/^ · /)` 가 **소식 줄**을 "첫 의뢰 줄"로 집고, 그때 이 검사는 뜻이 뒤집힌다
    //     (의뢰 0건은 흔하다 — 이 하네스가 그때그때 게시판 상태를 타서 빨개졌다. 제품은 정상이었다).
    //   ⇒ 소식 절 **앞쪽만** 보고, 의뢰가 0건이면 견줄 것이 없으므로 **소식 절의 존재만** 확인한다.
    const iNews = toast.indexOf('— 들은 소식 —');
    const head = iNews > 0 ? toast.slice(0, iNews) : toast;
    const iRow = head.split('\n').findIndex((l) => /^ · /.test(l));
    ok(iNews > 0 && (iRow >= 0 || /걸린 의뢰가 없다/.test(head)),
      '★⑤-b 소식은 **의뢰 줄 아래**에 붙는다(맨 윗줄은 서버 몫 — T20)',
      `소식 절 앞의 의뢰 줄 ${iRow} · 소식 절 ${iNews}${iRow < 0 ? ' (의뢰 0건 — 앞머리가 "걸린 의뢰가 없다")' : ''}`);
    await snap('ev-05b-news');
  }

  // ── ⑥ 거리 게이트 — 멀어지면 촌장 목소리가 안 닿는다 ──────────────────────
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [ax + 1500, ay + 1500]);
  await sleep(2000);
  const farVid = await page.evaluate(() => window.__evNearVid);
  ok(farVid == null, '마을에서 멀어지면 근접 인식이 풀린다', `__evNearVid=${farVid}`);
  await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
  await sleep(1200);
  const farNote = await page.evaluate(() => (window.__notices || []).slice(-2).join(' | '));
  ok(/너무 멀/.test(farNote), '멀리서 게시판을 요청하면 서버가 거절한다(거리 게이트는 서버가 판정)', JSON.stringify(farNote));
  await snap('ev-06-far');

  const fatal = errs.filter((e) => !/Failed to load resource/.test(e));
  // ── [T78] 알림 경계 — **서버가 보낸 것**에 이모지 0 · `kind` 가 실려 온다 ─────────
  {
    const EMO = /\p{Extended_Pictographic}/u;
    // ⚠문턱을 20 으로 잡았다가 한 판이 18건으로 빨갰다 — **워프가 헤맨 판**에서 371건이 잡힌 것을 보고
    //   정한 수였다(그건 정상 판이 아니다). 정상 흐름의 실측은 18건이라 문턱은 10 으로 둔다:
    //   이 전제가 재려는 것은 "많다"가 아니라 **"비어 있지 않다"** 이므로.
    ok(wsNotices.length >= 10, '★[T78] 전제: 서버 알림 프레임을 실제로 여럿 받았다(적으면 아래가 자명 통과다)',
      `${wsNotices.length}건`);
    const dirty = wsNotices.filter((m) => EMO.test(String(m.text || '')));
    ok(dirty.length === 0, '★★[T78] 서버가 보낸 알림 **전부** 이모지 0(경계가 실화면 경로에서 듣는다)',
      dirty.length ? `${dirty.length}건 — ${JSON.stringify(dirty[0].text).slice(0, 60)}` : `${wsNotices.length}건 검사`);
    const noKind = wsNotices.filter((m) => !m.kind);
    ok(noKind.length === 0, '★[T78] 전부 `kind` 를 달고 온다(종류는 이제 필드가 나른다)',
      noKind.length ? `${noKind.length}건 무필드` : '');
    const kinds = [...new Set(wsNotices.map((m) => m.kind))];
    ok(kinds.length >= 2, '[T78] 자명 통과 금지 — `kind` 가 한 종류로 뭉개지지 않았다', kinds.join(' '));
    // 그리고 **원문엔 이모지가 있었다**는 것 — 아니면 위 검사는 아무것도 안 잰 것이다
    const zsrc = require('fs').readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    ok(/\p{Extended_Pictographic}/u.test(zsrc), '[T78] 대조: `zone.js` 원문엔 이모지가 그대로 있다(경계가 지운 것이지 원문이 빈 게 아니다)');
  }

  ok(fatal.length === 0, `클라 JS 에러 0 ${fatal.length ? '— ' + fatal.slice(0, 3).join(' / ') : ''}`);

  await browser.close();
  shutdown();
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 실패:', e); shutdown(); process.exit(1); });
