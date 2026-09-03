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
// ★★[T80 2026-09-03] 게시판은 **판**이다(`#boardPane` · `public/client/47-s-board.js`).
//   종전의 `BOARD_RE`(토스트 첫 줄 정규식)는 지웠다 — 잴 자리가 `#notice` 가 아니라 판이기 때문이다.
//   뜻은 그대로다: "게시판이 화면에 실제로 그려졌다". 자리만 옮겼다(족보 (116)).
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
  // ── ★★[T80 2026-09-03 재민 확정] **게시판은 판이다** ─────────────────────────
  //   종전엔 `#notice` 토스트를 정규식으로 읽었다(`^<마을> 게시판\n` + `Shift+N` 꼬리).
  //   그 토스트 경로는 삭제됐다 — 이제 `#boardPane`(`public/client/47-s-board.js`)이 정본이다.
  //   ★뜻은 그대로 옮긴다: "게시판이 화면에 **실제로 그려졌다**". 다만 판이라 더 세게 잴 수 있다:
  //     행 수 = `rows.length` · 각 행에 물건 그림 · 진척 · 납품 버튼.
  //   ⚠자명 통과 금지: `#boardPane` 이 그냥 있는 것으로는 안 된다(숨은 판도 DOM 에는 있다).
  //     보이는지(`hidden` 없음) + 행이 실제로 그려졌는지를 함께 본다.
  //   ⚠모양은 **늘 같게** 낸다 — 판이 아직 없을 때 `{exists:false}` 만 돌려주면,
  //     뒤따르는 검사들이 `undefined === undefined` 로 **자명 통과**하거나 예외로 죽는다
  //     (첫 판이 정확히 그렇게 죽었다 — 워프가 흔들린 회차에서 `progs.length` 가 터졌다).
  const paneOf = () => page.evaluate(() => {
    const p = document.getElementById('boardPane');
    const body = document.getElementById('boardPaneBody');
    const rows = [...(body ? body.querySelectorAll('.bp-row') : [])];
    return {
      exists: !!p,
      open: !!(p && !p.classList.contains('hidden')),
      title: (document.getElementById('boardPaneTitle') || {}).textContent || '',
      rows: rows.length,
      pics: rows.filter((r) => r.querySelector('.item-pic, .item-pic-none')).length,
      progs: rows.map((r) => (r.querySelector('.bp-prog') || {}).textContent || ''),
      gives: rows.filter((r) => r.querySelector('[data-bp-give]')).length,
      news: (body ? body.querySelectorAll('.bp-news') : []).length,
      head: ((body && body.querySelector('.bp-head')) || {}).textContent || '',
      text: body ? body.textContent : '',
    };
  });
  let pane = { rows: 0 };
  for (let i = 0; i < 10; i++) {
    if (i > 0) await ensureBoard(4);
    for (let k = 0; k < 6; k++) {
      await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
      await sleep(250);
      pane = await paneOf();
      if (pane.open && pane.rows > 0) break;
    }
    if (pane.open && pane.rows > 0) break;
  }
  const boardNow = await page.evaluate(() => window.__evLastBoard || null);
  ok(pane.exists && pane.open, '★★게시판이 **판으로 열린다**(`#boardPane` 이 보인다 · 9초 토스트 아님)',
    JSON.stringify({ exists: pane.exists, open: pane.open }));
  ok(pane.rows > 0 && pane.rows === ((boardNow && boardNow.rows) || []).length,
    '★★판의 **행 수 = `rows.length`**(서버가 준 만큼 그린다 · 클라가 자르지 않는다)',
    `판 ${pane.rows} · 응답 ${((boardNow && boardNow.rows) || []).length}`);
  ok(pane.rows > 0 && pane.pics === pane.rows && pane.gives === pane.rows,
    '★★행마다 **물건 그림(`itemPic`)과 납품 버튼**이 하나씩 있다',
    `그림 ${pane.pics} · 버튼 ${pane.gives} / 행 ${pane.rows}`);
  ok(pane.progs.length > 0 && pane.progs.every((t) => /^\d+(\.\d+)?\/\d+(\.\d+)?$/.test(t.trim())),
    '★★행마다 **진척(`filled`/`qty`)이 서버 필드로 그려진다**(클라가 빼기로 만들지 않는다)',
    JSON.stringify(pane.progs.slice(0, 3)));
  ok(/게시판/.test(pane.title), '판 머리가 `<마을> 게시판` 이다', JSON.stringify(pane.title));
  // ★★[T80] **모달이 아니다** — §8.2 논모달(e2e-ui ③ "패널을 연 채 이동할 수 있다")과 같은 규약.
  //   ⚠1차 판은 `class="modal"`(=`inset:0` 전면 덮개)로 만들었다가 여기서 걸렸어야 했는데
  //     이 검사가 없어서 **`e2e-membership` 이 먼저 잡았다**(사이드바 클릭이 판에 먹혔다).
  //     ⇒ 화면 네 귀퉁이가 판에 안 먹히는지 **직접** 본다(클래스 이름이 아니라 히트 테스트로).
  const blocked = await page.evaluate(() => {
    const p = document.getElementById('boardPane');
    if (!p) return ['판 없음'];
    const W = innerWidth, H = innerHeight;
    const pts = [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8]];
    return pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return e && p.contains(e); })
      .map(([x, y]) => `${x},${y}`);
  });
  ok(blocked.length === 0, '★★판은 **모달이 아니다** — 열려 있어도 화면 네 귀퉁이가 판에 안 먹힌다(§8.2 논모달)',
    blocked.length ? `막힌 지점 ${JSON.stringify(blocked)}` : '네 귀퉁이 전부 통과');
  // ★★[T80] 그리고 **다른 판을 덮지 않는다**. 1차 판은 가운데였고 `#sidePanel.open`(x 60~520)을
  //   덮어 그 판의 버튼이 안 눌렸다(`e2e-membership` 의 `#mbWd` 클릭이 그렇게 죽었다).
  //   ⇒ 사이드 패널을 **열린 자리로 재어** 두 상자가 겹치지 않는지 본다(클래스 이름이 아니라 좌표로).
  const overlap = await page.evaluate(() => {
    const bp = document.getElementById('boardPane'), sp = document.getElementById('sidePanel');
    if (!bp || !sp) return null;
    const had = sp.classList.contains('open');
    sp.classList.add('open');
    const a = bp.getBoundingClientRect(), b = sp.getBoundingClientRect();
    if (!had) sp.classList.remove('open');
    const hit = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    return { hit, bp: [a.left | 0, a.right | 0], sp: [b.left | 0, b.right | 0] };
  });
  ok(overlap && overlap.hit === false, '★★판이 **사이드 패널을 덮지 않는다**(열린 자리로 재었다)',
    overlap ? `판 ${JSON.stringify(overlap.bp)} · 사이드 ${JSON.stringify(overlap.sp)}` : '(요소 없음)');
  // ★토스트 경로가 **실제로 없어졌다** — 게시판 문자열이 `#notice` 에 더는 안 남는다.
  //   ⚠`/게시판/` 만 보면 **촌장 대사**("…(게시판 1건 · Shift+G)")에도 걸린다 —
  //     옛 토스트에만 있던 것(여러 줄 + `Shift+N` 꼬리)이 없는지를 본다.
  const noticeNow = await page.evaluate(() => (window.__notices || []).join('\u0000'));
  ok(!/게시판\n/.test(noticeNow) && !/Shift\+N 으로/.test(noticeNow),
    '★★게시판 문자열이 `#notice` 로는 **더는 안 간다**(토스트 경로 삭제)',
    JSON.stringify(noticeNow.slice(-90)));

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

  // ── ★★[T80 2026-09-03 재민 확정] ④-c **행의 납품 버튼은 그 행에 낸다** ──────
  //   ★왜 이게 이 카드의 심장인가: 종전엔 낼 길이 `Shift+N` 하나였고, 그건
  //     "서버가 고른 첫 의뢰"에만 낸다(권위는 서버에 있다 — 그 규약은 그대로 둔다).
  //     판이 생기면서 처음으로 **어느 의뢰에 낼지 플레이어가 고를 수 있다**.
  //   ★★자명 통과 금지 — 여기가 이 절의 전부다:
  //     행이 하나뿐이면 "그 행에 냈다"와 "서버가 골랐다"가 **구별되지 않는다**.
  //     ⇒ 낼 수 있는 행을 **둘 이상** 세우고, `Shift+N` 이 고를 행(잔여비율 최대)이 **아닌**
  //       행의 버튼을 누른다. 그리고 **그 행의 잔여만** 줄었는지 본다(서버가 판정한 결과).
  console.log('\n④-c [T80] 행 납품 — 버튼이 그 줄의 품목을 싣는가');
  {
    // ★★두 가지를 같이 풀어야 둘째 행이 선다(둘 다 실측으로 알아냈다):
    //   ⓐ 픽스처는 늘 소비EMA **최댓값** 하나를 고른다 ⇒ 그냥 다시 부르면 **같은 의뢰**만 다시 선다
    //      (실측: 24회를 불러도 `wood 0/2` 한 줄뿐이었다) ⇒ 이미 걸린 품목을 `skip` 으로 뺀다.
    //   ⓑ 의뢰는 **하루 경계에서** 걸린다. 이 구간은 날이 얼어 있어(위 ①) 재고를 깎아도 게시가 안 된다
    //      (실측: 얼린 채로는 0건, ⑤-b 가 날을 푼 순간 "게시판 2건"이 로그에 떴다).
    //      ⇒ **세우는 동안만 푼다.** 다 세우면 다시 얼리고 상호작용을 잰다(시간 모드 규약 그대로).
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: false }));
    await sleep(600);
    let bd = await ensureBoard(20);
    const canGive = (b) => ((b && b.rows) || []).filter((r) => (r.give || []).length > 0 && r.remain > 0);
    for (let i = 0; i < 20 && canGive(bd).length < 2; i++) {
      const skip = ((bd && bd.rows) || []).map((r) => r.item);
      await page.evaluate(([vid, sk]) => window.__sendPrimary({ type: '__e2e_village_short', vid, skip: sk }), [V.id, skip]);
      await sleep(700);
      bd = await ensureBoard(4);
    }
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
    await sleep(700);
    bd = await ensureBoard(6);
    const rows = canGive(bd);
    ok(rows.length >= 2, '★④-c (상황) 낼 수 있는 의뢰가 **둘 이상** 걸렸다 — 하나면 이 절은 자명 통과다',
      JSON.stringify(((bd && bd.rows) || []).map((r) => `${r.item} ${r.remain}/${r.qty}`)));
    if (rows.length >= 2) {
      // `Shift+N`(품목 미지정)이 고를 행 = 잔여비율 최대. 그 **반대쪽**을 누른다.
      const byUrg = rows.slice().sort((a, b) => (b.remain / Math.max(1, b.qty)) - (a.remain / Math.max(1, a.qty)));
      const serverPick = byUrg[0], target = byUrg[byUrg.length - 1];
      ok(target.item !== serverPick.item, '★④-c (상황) 고른 행이 서버가 고를 행과 **다르다**',
        `서버 ${serverPick.item} · 내가 고른 ${target.item}`);
      // 두 행 다 낼 수 있게 손에 쥔다 — 한쪽만 쥐면 "고른 것"이 아니라 "그것밖에 없던 것"이다.
      for (const r of [serverPick, target]) {
        await page.evaluate(([it, n]) => window.__sendPrimary({ type: '__e2e_give', items: { [it]: n } }),
          [(r.give || [])[0], Math.max(2, Math.ceil(r.remain) + 5)]);
        await sleep(500);
      }
      const before = new Map(((bd.rows) || []).map((r) => [r.item, r.remain]));
      // ★진짜 버튼을 누른다(메시지를 손으로 보내지 않는다 — 그러면 판을 안 재는 것이다).
      const clicked = await page.evaluate((it) => {
        const body = document.getElementById('boardPaneBody');
        if (!body) return null;
        const row = body.querySelector(`.bp-row[data-bp-item="${it}"]`);
        if (!row) return null;
        const btn = row.querySelector('[data-bp-give]');
        if (!btn) return null;
        btn.click();
        return it;
      }, target.item);
      ok(clicked === target.item, '★④-c 판에서 **그 행의 납품 버튼**을 실제로 눌렀다', String(clicked));
      await sleep(1800);
      const bd2 = await page.evaluate(() => window.__evLastBoard || null);
      const after = new Map((((bd2 && bd2.rows) || [])).map((r) => [r.item, r.remain]));
      const moved = [...before.keys()].filter((k) => !after.has(k) || after.get(k) < before.get(k));
      ok(moved.length === 1 && moved[0] === target.item,
        '★★④-c **내가 고른 그 행의 잔여만** 줄었다 — 버튼이 그 행의 품목을 실었다(서버 판정)',
        `움직인 행 ${JSON.stringify(moved)} · 고른 행 ${target.item} · 서버 기본 ${serverPick.item}`);
      await snap('ev-05c-rowdeliver');
    }
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
    //   ★★[T80 2026-09-03] 잴 자리가 토스트에서 **판**으로 옮겼다(`#boardPane`). 뜻은 그대로다:
    //     "`Shift+G` 가 게시판을 열고, **내가 심은 그 문장**이 화면에 보인다".
    await page.evaluate(() => { window.__notices && (window.__notices.length = 0); });
    await page.evaluate(() => { const p = document.getElementById('boardPane'); if (p) p.classList.add('hidden'); });
    await page.keyboard.press('Shift+g');
    await sleep(1500);
    const pn = await page.evaluate(() => {
      const p = document.getElementById('boardPane');
      const body = document.getElementById('boardPaneBody');
      const secs = [...(body ? body.querySelectorAll('.bd-sec') : [])].map((e) => e.textContent);
      const newsEls = [...(body ? body.querySelectorAll('.bp-news') : [])];
      return {
        open: !!(p && !p.classList.contains('hidden')),
        title: (document.getElementById('boardPaneTitle') || {}).textContent || '',
        secs, news: newsEls.map((e) => e.textContent),
        html: body ? body.innerHTML : '',
      };
    });
    ok(pn.open && /게시판/.test(pn.title), '★★⑤-b **`Shift+G` 가 게시판 판을 연다** — T55 ④ 전엔 이 키가 화살을 쐈다',
      JSON.stringify(pn.title));
    ok(pn.secs.includes('들은 소식'), '★★⑤-b 판에 **「들은 소식」 절**이 있다', JSON.stringify(pn.secs));
    ok(pn.news.some((l) => /비가 통 안 오는군/.test(l)), '★★⑤-b **내가 심은 그 문장이 화면에 보인다**(회부 0-소문 1 종결)',
      JSON.stringify((pn.news.find((l) => /비가 통 안 오는군/.test(l)) || '').slice(0, 60)));
    ok(pn.news.length === news.length, '★⑤-b 판이 그린 소식 줄 수 = 서버가 보낸 `news` 수(클라가 또 자르지 않는다)',
      `판 ${pn.news.length} · 응답 ${news.length}`);
    // ★순서 — 소식 절은 **의뢰 절 아래**다(맨 위는 서버가 만든 겨울 머리줄 자리 — T20).
    //   ⚠판에서는 절이 `.bd-sec` 로 이름을 갖는다 ⇒ 옛 토스트처럼 ` · ` 접두사로 줄을 세지 않아도 된다
    //     (족보: T63 이 그 접두사 때문에 뜻이 뒤집혔던 자리다 — 구조로 자르니 그 함정이 사라졌다 · (115)).
    ok(pn.secs.indexOf('걸린 의뢰') >= 0 && pn.secs.indexOf('걸린 의뢰') < pn.secs.indexOf('들은 소식'),
      '★⑤-b 소식 절은 **의뢰 절 아래**에 붙는다(맨 위는 서버 몫 — T20)', JSON.stringify(pn.secs));
    await snap('ev-05b-news');

    // ── ★★[T80] ⑤-c 판 소스 — **이모지 0 · 인라인 색 0**(T66 화면 규칙 B) ──────
    //   ★소스로 잰다: 화면 픽셀로는 "이모지가 하나 섞였다"를 절대 못 잡는다.
    //   ★⓪의 빚 두 줄(`51-s-side.js` 쉼터 버튼)도 여기서 같이 잡힌다 — 같은 규칙, 같은 자리.
    {
      const fsx = require('fs');
      const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => {
        let q = null, out = '';
        for (let i = 0; i < l.length; i++) {
          const c = l[i], n = l[i + 1];
          if (q) { out += c; if (c === '\\') { out += n || ''; i++; continue; } if (c === q) q = null; continue; }
          if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
          if (c === '/' && n === '/') break;
          out += c;
        }
        return out;
      }).join('\n');
      const EMO = /\p{Extended_Pictographic}/u;
      const COL = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;
      for (const f of ['public/client/47-s-board.js', 'public/client/51-s-side.js']) {
        const src = strip(fsx.readFileSync(path.join(ROOT, f), 'utf8'));
        ok(!EMO.test(src), `★★⑤-c ${f.split('/').pop()} — 이모지 0(T66)`);
        ok(!COL.test(src), `★★⑤-c ${f.split('/').pop()} — 인라인 색 0(값은 style.css 토큰 하나)`);
      }
      ok(EMO.test("h += '\u{1F6D6} 쉼터';"), '★⑤-c 자명 통과 금지 — 이모지 한 줄을 되살린 소스는 잡힌다');
      ok(COL.test("background:#2b3a4a"), '★⑤-c 자명 통과 금지 — 인라인 hex 한 줄을 되살리면 잡힌다');
    }
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
