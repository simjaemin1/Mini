#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 세 밤 분할(T238) · 지금 A 21 · B 22 · C 23 — 적은 쪽
// === scripts/e2e-assign-job.js — T1085: 촌장이 게시판(Shift+G)에서 구성원에게 일을 맡긴다 **실클라** E2E =====================
//
// ★왜: `test-t1085-assign-job` 은 진짜 서버 문을 가짜 소켓으로 잰다. 플레이어에게 약속하는 것은 화면이다:
//   *"촌장이면 게시판에 구성원 칸이 서고, 줄에서 일을 골라 '일 맡기기'를 누르면 그 사람이 그 일을 한다. 안 되면 이유가 뜬다."*
//   T1070 구성원 탭이 main 에 아직 없어 게시판 판(Shift+G 자리)에 시험 칸을 붙였다 — 이 판이 그 칸을 실제 키 · 실제 클릭으로 밟는다.
//
// ★재는 것
//   ① NPC 마을(촌장 = NPC)에서 Shift+G — 게시판은 열리고 **구성원 칸이 없다**(손대지 않는다 · ④).
//   ② 판 꾸밈 `__e2e_chief`(E2E_GIVE 판에만 서는 갈래 — 이 사람을 창설자로) 뒤 Shift+G — 구성원 칸 · 줄 수 = 서버가 실은 명부 수.
//   ③ 한 줄에서 빈자리 일을 고르고 **"일 맡기기"를 클릭** — 알림 "… 일을 맡겼습니다." · 판이 새로 와서 그 줄 = 새 일 · "n일 뒤 · 촌장이 맡김" ·
//      화면 줄의 글자 = 서버가 보낸 명부 값(화면 ↔ 서버 대조).
//   ④ 같은 줄은 막혀 있다(쿨다운 — 고르기 · 버튼이 꺼져 있다).
//   ⑤ 판 꾸밈을 걷으면(다른 사람이 촌장) 버튼을 눌러도 "촌장만 일을 맡길 수 있습니다." — 직접 보내 거절을 잰다(자명 통과 금지).
//   ⑥ 스크립트 오류 0 · 사진 한 장.
//
// 실행: node scripts/e2e-assign-job.js [--headed]
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;   // 존 설정의 고정 포트(central 이 인구를 이 포트로 묻는다 — 다르면 로비가 "점검 중")
const CDB = `/tmp/e2e-aj-central-${process.pid}.db`, ZDB = `/tmp/e2e-aj-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|마을 시뮬 준비/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 120)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

(async () => {
  console.log('\n=== T1085 촌장 일 맡기기 실클라 E2E (Chromium) ===');
  const _central = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '3', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1',
  });
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok((await _upP).ok, 'central 기동');
  ok((await _zp).ok, 'zone 기동');
  for (let i = 0; i < 90; i++) {
    try { const z = ((await (await fetch(`http://localhost:${CPORT}/zones`, { signal: AbortSignal.timeout(5000) })).json()).zones || {}).hanbando; if (z && z.population != null && z.cap) break; } catch (e) {}
    await sleep(1000);
  }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  // 입장 — 로비 버튼이 켜질 때(존 목록이 살아 있을 때)까지 기다렸다 누른다(꺼진 버튼을 누르면 조용히 멈춘다)
  async function enter(pg) {
    for (let t = 0; t < 4; t++) {
      await pg.goto(`http://localhost:${CPORT}/?T1070_VILLAGE_VIEW=0`, { waitUntil: 'domcontentloaded' });   // ★[T1137] 마을 화면이 켬 기본이 됐다 — 이 하네스는 Shift+G 의 **게시판 판**(끔 갈래 · `47-s-board.js`)을 잰다
      try { await pg.waitForSelector('#enter:not([disabled])', { timeout: 20000 }); break; } catch (e) {}
    }
    await pg.click('#enter');
    for (let i = 0; i < 60 && !(await pg.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  }
  await enter(page);
  await sleep(1500);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장');
  const { DatabaseSync } = require('node:sqlite');
  const rows = new DatabaseSync(ZDB).prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length >= 1, `마을 시딩 ${rows.length}곳`);
  if (!rows.length) { await browser.close(); shutdown(); process.exit(1); }
  const V = rows[0];
  let near = false;
  for (let i = 0; i < 40 && !near; i++) {
    await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [V.cx * 32 + 16, V.cy * 32 + 16]);
    await sleep(1000);
    near = (await page.evaluate(() => window.__evNearVid)) === V.id;
  }
  ok(near, `${V.name} 마을 중심 도착`);
  const notices = () => page.evaluate(() => (window.__notices || []).slice());
  const clearNotices = () => page.evaluate(() => { window.__notices = []; });
  // 실제 키 Shift+G — 게시판 응답을 기다린다(고정 sleep 으로 읽지 않는다)
  async function shiftG() {
    await page.evaluate(() => { window.__evLastBoard = null; });
    await page.keyboard.down('Shift'); await page.keyboard.press('KeyG'); await page.keyboard.up('Shift');
    for (let i = 0; i < 40; i++) { await sleep(250); if (await page.evaluate(() => !!window.__evLastBoard)) break; }
    await sleep(300);
    return page.evaluate(() => ({
      open: !!document.getElementById('boardPane') && !document.getElementById('boardPane').classList.contains('hidden'),
      sec: [...document.querySelectorAll('#boardPaneBody .bd-sec')].map((e) => e.textContent),
      rows: [...document.querySelectorAll('#boardPaneBody [data-bm-npc]')].map((r) => ({ id: r.getAttribute('data-bm-npc'),
        cells: [...r.querySelectorAll('span')].map((s) => s.textContent), shut: !!r.querySelector('button[data-bm-assign]').disabled })),
      srv: window.__evLastBoard && window.__evLastBoard.members ? window.__evLastBoard.members : null,
    }));
  }
  // ① NPC 마을
  const b1 = await shiftG();
  ok(b1.open && !b1.sec.includes('구성원') && !b1.rows.length && !b1.srv, '① NPC 마을 — 게시판은 열리고 구성원 칸이 없다', JSON.stringify(b1.sec));
  // ② 판 꾸밈 → 촌장
  await clearNotices();
  await page.evaluate((vid) => window.__sendPrimary({ type: '__e2e_chief', vid }), V.id);
  await sleep(800);
  const b2 = await shiftG();
  ok(b2.open && b2.sec.includes('구성원') && b2.srv && b2.rows.length === b2.srv.rows.length && b2.rows.length > 0,
    '② 촌장 — 구성원 칸 · 줄 수 = 서버 명부 수', `${b2.rows.length} / ${b2.srv ? b2.srv.rows.length : '-'}`);
  ok(b2.srv && b2.rows.every((r, i) => r.cells[0] === b2.srv.rows[i].jobKo && r.cells[1] === String(b2.srv.rows[i].age)),
    '② 화면 줄의 지금 일 · 나이 = 서버 값');
  // ③ 맡기기 — 열린 줄 · 빈자리 일
  const pick = await page.evaluate(() => {
    for (const r of document.querySelectorAll('#boardPaneBody [data-bm-npc]')) {
      const b = r.querySelector('button[data-bm-assign]'), s = r.querySelector('select[data-bm-job]');
      if (b.disabled || s.disabled) continue;
      const o = [...s.options].find((x) => !x.disabled && x.value !== 'warrior' && x.value !== 'hunter');
      if (!o) continue;
      s.value = o.value;
      return { id: r.getAttribute('data-bm-npc'), job: o.value, ko: o.textContent };
    }
    return null;
  });
  ok(!!pick, '③ 맡길 줄 · 일을 골랐다', JSON.stringify(pick));
  if (pick) {
    await clearNotices();
    await page.click(`#boardPaneBody [data-bm-npc="${pick.id}"] button[data-bm-assign]`);
    let n = [];
    for (let i = 0; i < 30; i++) { await sleep(250); n = await notices(); if (n.some((t) => /일을 맡겼습니다\./.test(t))) break; }
    ok(n.some((t) => /일을 맡겼습니다\./.test(t) && t.includes(pick.ko)), '③ 클릭 → 알림 "… 일을 맡겼습니다."', JSON.stringify(n.slice(-2)));
    await sleep(500);
    const b3 = await page.evaluate((id) => {
      const r = document.querySelector(`#boardPaneBody [data-bm-npc="${id}"]`);
      const srv = window.__evLastBoard && window.__evLastBoard.members && window.__evLastBoard.members.rows.find((x) => x.id === id);
      return r ? { cells: [...r.querySelectorAll('span')].map((s) => s.textContent), shut: r.querySelector('button[data-bm-assign]').disabled, srv } : null;
    }, pick.id);
    ok(!!(b3 && b3.srv && b3.srv.job === pick.job && b3.cells[0] === pick.ko && /촌장이 맡김/.test(b3.cells[2]) && /일 뒤/.test(b3.cells[2])),
      '③ 판이 새로 와서 그 줄 = 새 일 · n일 뒤 · 촌장이 맡김(서버 값 그대로)', JSON.stringify(b3));
    ok(!!(b3 && b3.shut), '④ 같은 줄은 막혀 있다(쿨다운 — 버튼 꺼짐)');
    const f = path.join(SHOTS, 't1085-assign.png'); await page.screenshot({ path: f }); console.log('  사진 ' + f);
    // ⑤ 다른 사람이 촌장 — 같은 문을 직접 밟는다(버튼은 서버 판정만 믿는다)
    const other = await page.evaluate(() => (window.__evLastBoard && window.__evLastBoard.members && window.__evLastBoard.members.rows) || []);
    const R2 = other.find((x) => !x.left && !x.away);
    if (R2) {
      // 촌장을 남에게 — 두 번째 사람(새 페이지)이 판 꾸밈을 가져간다
      const page2 = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
      await enter(page2);
      await page2.evaluate((vid) => window.__sendPrimary({ type: '__e2e_chief', vid }), V.id);
      await sleep(800);
      await clearNotices();
      await page.evaluate(([vid, id, job]) => window.__sendPrimary({ type: 'assign_job', vid, npc: id, job }), [V.id, R2.id, pick.job]);
      let n2 = [];
      for (let i = 0; i < 20; i++) { await sleep(250); n2 = await notices(); if (n2.length) break; }
      ok(n2.includes('촌장만 일을 맡길 수 있습니다.'), '⑤ 촌장이 바뀐 뒤 보내면 거절 · 이유 한 줄', JSON.stringify(n2));
    } else ok(false, '⑤ 열린 줄이 없다');
  }
  ok(errs.length === 0, `⑥ 스크립트 오류 0`, errs.slice(0, 3).join(' | '));
  console.log(`\n=== e2e-assign-job: 통과 ${pass} · 실패 ${fail} ===`);
  await browser.close(); shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('예외', e && e.stack); shutdown(); process.exit(1); });
