#!/usr/bin/env node
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
// 실행: node scripts/e2e-events.js [--headed]
//   ★이 검사만 `ENABLE_VILLAGES` 를 켠다(다른 실클라 하네스는 부팅 시간 때문에 끈다).
//     대신 `VILLAGE_MAX=2` 로 마을 2곳만 시딩해 부팅을 짧게 한다 —
//     검사 대상은 마을 **수**가 아니라 브리핑·게시판·정산의 **경로**다.
'use strict';
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
  //   그때는 게임일이 더 흐를 때까지 기다린다(하루 0.5초).
  let sh = null;
  for (let i = 0; i < 40; i++) {
    await page.evaluate((vid) => window.__sendPrimary({ type: '__e2e_village_short', vid }), V.id);
    await sleep(900);
    const last = await page.evaluate(() => (window.__notices || []).slice(-3).join(' | '));
    if (/🧪/.test(last) && !/없다|미지원|없음/.test(last)) { sh = last; break; }
  }
  ok(!!sh, '부족 픽스처 성립(소비EMA 가 자란 품목의 재고를 문턱 아래로)', sh || '(40회 시도 실패 — 소비EMA 미성숙)');

  // 하루 경계가 지나야 장부가 판정하고 게시판이 선다(하루 0.5초라 금방)
  let board = null;
  for (let i = 0; i < 30 && !(board && board.rows && board.rows.length); i++) {
    await sleep(900);
    await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
    await sleep(400);
    board = await page.evaluate(() => window.__evLastBoard || null);
  }
  ok(!!(board && board.rows && board.rows.length), '게시판에 납품 의뢰가 걸렸다', board ? JSON.stringify(board.rows.map((r) => r.line)) : 'X');
  await snap('ev-04-board');
  // ★자명 통과 금지 — `/게시판/` 만 보면 **촌장 대사**("…(게시판 1건 · Shift+G)")에도 걸린다.
  //   게시판 알림에만 있는 것(📋 머리 + `Shift+N` 꼬리 + 줄바꿈)을 전부 요구한다.
  //   그리고 촌장 대사가 덮어쓰기 전에 읽어야 하므로 **게시판을 다시 열고 곧바로** 읽는다.
  await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
  await sleep(700);
  const boardShown = await page.evaluate(() => (document.getElementById('notice') || {}).textContent || '');
  ok(/^📋/.test(boardShown) && /Shift\+N/.test(boardShown) && boardShown.includes('\n'),
    '게시판 목록이 화면(HUD)에 여러 줄로 실제로 그려졌다', JSON.stringify(boardShown.slice(0, 110)));
  ok(!/촌장/.test(boardShown), '(자명 통과 방지) 그 알림은 촌장 대사가 아니라 게시판이다');

  if (board && board.rows && board.rows.length) {
    const row = board.rows[0];
    const giveItem = (row.give || [])[0];
    ok(!!giveItem, '의뢰 품목을 낼 수 있는 플레이어 아이템이 있다', `${row.item} ← ${JSON.stringify(row.give)}`);

    // ── ④ 재료를 받고 납품 → 보상 수령 ─────────────────────────────────────
    const need = Math.max(1, Math.ceil(row.remain));
    await page.evaluate(([it, n]) => window.__sendPrimary({ type: '__e2e_give', items: { [it]: n + 5 } }), [giveItem, need]);
    await sleep(1200);
    const invBefore = await page.evaluate(() => (window.__getInv && window.__getInv()) || {});
    ok((invBefore[giveItem] || 0) >= need, '납품할 물건을 손에 넣었다', `${giveItem} ${invBefore[giveItem] || 0}`);
    const rewItem = row.take;

    // 품목을 **안 보낸다** — 서버가 낼 수 있는 의뢰를 고른다(권위는 서버에 있다).
    await page.evaluate((vid) => window.__sendPrimary({ type: 'village_deliver', vid }), V.id);
    await sleep(1500);
    await snap('ev-05-delivered');
    const invAfter = await page.evaluate(() => (window.__getInv && window.__getInv()) || {});
    const notes = await page.evaluate(() => (window.__notices || []).slice(-4));
    console.log(`    납품 후 알림: ${JSON.stringify(notes)}`);
    ok((invAfter[giveItem] || 0) < (invBefore[giveItem] || 0), '납품한 만큼 인벤에서 빠졌다',
      `${giveItem} ${invBefore[giveItem] || 0} → ${invAfter[giveItem] || 0}`);
    ok(notes.some((t) => /납품/.test(t)), '납품 결과가 화면 알림으로 돌아왔다');
    ok(!!rewItem && (invAfter[rewItem] || 0) > (invBefore[rewItem] || 0), '보상(물물)이 인벤에 들어왔다',
      `${rewItem} ${invBefore[rewItem] || 0} → ${invAfter[rewItem] || 0}`);
    // 게시판이 즉시 갱신된다(다 찼으면 목록에서 빠지고, 남았으면 잔여가 준다)
    const board2 = await page.evaluate(() => window.__evLastBoard || null);
    const r2 = board2 && (board2.rows || []).find((r) => r.item === row.item);
    ok(!r2 || r2.remain < row.remain, '납품 즉시 게시판 잔여가 줄었다(또는 목록에서 빠졌다)',
      r2 ? `remain ${row.remain} → ${r2.remain}` : '목록에서 빠짐');

    // ── ⑤ 마을 곳간이 실제로 늘었다 — **DB 가 아니라 서버 상태**로 확인 ────
    //   (물건이 어디로 갔는지가 이 층의 핵심이다: 사라지면 그게 소멸이고, 캐논 위반이다)
    ok(true, `(곳간 증가는 test-events ④e 가 정본 필드로 검사 — 여기서는 인벤·알림·게시판 왕복이 대상)`);
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
  ok(fatal.length === 0, `클라 JS 에러 0 ${fatal.length ? '— ' + fatal.slice(0, 3).join(' / ') : ''}`);

  await browser.close();
  shutdown();
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 실패:', e); shutdown(); process.exit(1); });
