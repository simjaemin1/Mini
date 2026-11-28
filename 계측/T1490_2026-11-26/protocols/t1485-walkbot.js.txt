#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · 판 도구 · T1485 · 제품 코드 · 있던 스크립트 손 0)
// === scripts/t1485-walkbot.js — 걸어서 곳간 앞에 가 `/인출` 을 쳐 보는 봇 한 판 [T1485 · S14] ===================
// ★왜: ⑦ 은 순간 이동(`teleport_debug`) 직후 `/인출` 을 친다. 실제 플레이어는 **걸어서** 가 친다. 같은 거절("마을에서 너무 멉니다. 곳간 앞으로 가십시오.")이 걸어간 손에도 나나.
// ★어떻게: 기동 · 입장 · 채팅은 `e2e-membership` 과 같은 길(앞 절반은 그 파일을 그대로 옮겼다 · 사본). 몸은 **진짜 키**(WASD · 첫 30분 하네스 `e2e-first30` 의 `KEYSET` 같은 문서 칸)로
//   마을 중심(곳간 앞자리 = 서버 `villageAnchorPx` · ⑦ 이 서는 그 자리)에서 `START_PX` 떨어진 곳(순간 이동으로 한 번만 둔다 — 근접 문턱 260 밖)에서 곧게 걷는다.
//   닿으면(24px 안) 곧바로 `/인출` · 알림을 읽고 · 2초 뒤 한 번 더 누른다(다시 누르면 되나). 막혀 못 가면 다른 방향에서 다시(최대 4).
//   끝: `/tmp/t1485-walk.json` 한 개(판 하나 요약). 서버 쪽 `_memberNearVid` 쓰기는 읽기 귀(`t1485-observer.js`)가 적는다.
// 실행: node scripts/t1485-walkbot.js
'use strict';
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-mb-central-${process.pid}.db`, ZDB = `/tmp/e2e-mb-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const MEMBER_N = 3;
const START_PX = +(process.env.T1485_START_PX || 640);
const HEADED = false;
const NPC_NO = /이 마을 곳간은 사람이 열지 않습니다/, FAR = /마을에서 너무 멉니다/;
let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const e = Object.assign({}, process.env, env);
  delete e.T769_DONATE;   // ★[T779] 기본 세계(위)
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 120)}\n`); });
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
    VILLAGE_MAX: '3', VILLAGE_DAY_MS: String(process.env.T1485_DAY_MS || '600'),
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
    E2E_GIVE: '1', ONB_ENABLE: '1',
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
  let page = await ctx.newPage();
  const errs = [];
  // ★스크립트 오류만 빨간불로 센다. `Failed to load resource`(파비콘 등)는 이 카드가 만든 것이 아니라
  //   클라의 기존 상태라, 그걸 세면 **없는 회귀**를 보고하게 된다. 그래도 눈에는 보이게 따로 찍는다.
  const noise = [];
  const wire = (pg) => {
    pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    pg.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text().slice(0, 160);
      (/Failed to load resource/.test(t) ? noise : errs).push('console: ' + t);
    });
  };
  wire(page);
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };

  async function enter() {
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
    const btn = await page.$('#enter');
    if (btn) await btn.click();
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    await sleep(2000);
  }
  await enter();
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  const { DatabaseSync } = require('node:sqlite');
  const zdb = new DatabaseSync(ZDB);
  const rows = zdb.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length >= 1, `마을이 시딩됐다 (${rows.length}곳)`, rows.map((r) => r.name).join(' '));
  if (!rows.length) { console.log('\n마을 없음 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  const V = rows[0];

  // ── 걷기 ────────────────────────────────────────────────────────────────────
  const R = { start_px: START_PX, tries: [], v: { id: V.id, name: V.name } };
  const KEYSET = { E: ['KeyS', 'KeyD'], W: ['KeyW', 'KeyA'], N: ['KeyW', 'KeyD'], S: ['KeyS', 'KeyA'], NE: ['KeyD'], SE: ['KeyS'], SW: ['KeyA'], NW: ['KeyW'] };   // e2e-first30 의 같은 표(화면 키 → 세계 방향)
  const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const dirOf = (dx, dy) => DIRS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  const held = new Set();
  async function setKeys(want) {
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  }
  const absNow = () => page.evaluate(() => { const m = window.__getMyAbs(); return { x: m.x, y: m.y }; });
  const notices = () => page.evaluate(() => (window.__notices || []).slice());
  const clearNotices = () => page.evaluate(() => { window.__notices = []; });
  async function say(text) {
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Enter');
      await sleep(250);
      const on = await page.evaluate(() => !!(document.getElementById('chatInput') || {}).classList?.contains('active'));
      if (on) break;
    }
    await page.fill('#chatInput', text);
    await page.keyboard.press('Enter');
    await sleep(1100);
  }
  const AX = V.cx * 32 + 16, AY = V.cy * 32 + 16;   // 곳간 앞자리(서버 villageAnchorPx · zone 안 좌표)
  const K = new Date().getSeconds() & 7;   // 시작 방향 돌리기(판마다 달라도 되고 같아도 된다)
  let arrived = false, OX = 0, OY = 0;
  for (let t = 0; t < 4 && !arrived; t++) {
    const di = (K + t * 3) % 8, ang = di * Math.PI / 4;
    const sx = Math.round(AX + Math.cos(ang) * START_PX), sy = Math.round(AY + Math.sin(ang) * START_PX);
    const T = { dir: DIRS[di], sx, sy };
    R.tries.push(T);
    await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [sx, sy]);
    await sleep(2500);
    const a0 = await absNow();
    if (t === 0 || OX === 0 && OY === 0) { OX = Math.round(a0.x - sx); OY = Math.round(a0.y - sy); }
    const dbg = await page.evaluate(() => window.__evDbg || null);
    T.minD0 = dbg ? dbg.minD : null; T.nearAtStart = await page.evaluate(() => window.__evNearVid);
    if (T.nearAtStart != null) { T.note = 'start inside range'; continue; }
    const t0 = Date.now(); let last = { x: a0.x, y: a0.y, t: t0 }, lastD = Infinity, dd = Infinity;
    while (Date.now() - t0 < 90000) {
      const a = await absNow();
      const dx = AX + OX - a.x, dy = AY + OY - a.y; dd = Math.hypot(dx, dy);
      if (dd <= 24) { arrived = true; break; }
      await setKeys(new Set(KEYSET[dirOf(dx, dy)]));
      await sleep(120);
      if (Date.now() - last.t > 3000) {
        if (Math.hypot(a.x - last.x, a.y - last.y) < 12) { T.note = 'stuck'; break; }
        last = { x: a.x, y: a.y, t: Date.now() };
      }
    }
    await setKeys(new Set());
    T.walkMs = Date.now() - t0; T.endD = Math.round(dd);
    await sleep(500);
  }
  R.arrived = arrived;
  const ev = await page.evaluate(() => ({ near: window.__evNearVid == null ? null : window.__evNearVid, dbg: window.__evDbg || null }));
  R.at_press = { evNearVid: ev.near, minD: ev.dbg ? ev.dbg.minD : null };
  if (arrived) {
    for (const [n, wait] of [[1, 0], [2, 2000]]) {
      if (wait) await sleep(wait);
      await clearNotices();
      await say('/인출');
      const ns = await notices();
      const hit = ns.filter((s) => NPC_NO.test(s) || FAR.test(s) || /곳간/.test(s)).slice(-2);
      R['press' + n] = { far: ns.some((s) => FAR.test(s)), passed: ns.some((s) => NPC_NO.test(s)), notices: hit.map((s) => String(s).slice(0, 60)) };
    }
  }
  if (arrived && process.env.T1485_RECONN) {   // 다시 접속한 손님 — 곳간 앞에서 쪽을 새로 열고(같은 손님 · 새 몸) 곧바로 `/인출`
    await enter();
    const ev3 = await page.evaluate(() => ({ near: window.__evNearVid == null ? null : window.__evNearVid, dbg: window.__evDbg || null }));
    R.at_press3 = { evNearVid: ev3.near, minD: ev3.dbg ? ev3.dbg.minD : null };
    await clearNotices();
    await say('/인출');
    const ns3 = await notices();
    R.press3 = { far: ns3.some((s) => FAR.test(s)), passed: ns3.some((s) => NPC_NO.test(s)), notices: ns3.filter((s) => NPC_NO.test(s) || FAR.test(s)).slice(-2).map((s) => String(s).slice(0, 60)) };
    if (process.env.T1485_RECONN === '2') {   // 다시 접속 뒤 첫 눌림이 거절이었다면 — 2초 뒤 한 번 더
      await sleep(2000);
      await clearNotices();
      await say('/인출');
      const ns4 = await notices();
      R.press4 = { far: ns4.some((s) => FAR.test(s)), passed: ns4.some((s) => NPC_NO.test(s)), notices: ns4.filter((s) => NPC_NO.test(s) || FAR.test(s)).slice(-2).map((s) => String(s).slice(0, 60)) };
    }
  }
  fs.writeFileSync('/tmp/t1485-walk.json', JSON.stringify(R));
  console.log('  ' + (arrived ? '✓' : '✗') + ' walkbot ' + JSON.stringify({ arrived, p1: R.press1 && (R.press1.far ? 'FAR' : R.press1.passed ? 'PASS' : '?'), p2: R.press2 && (R.press2.far ? 'FAR' : R.press2.passed ? 'PASS' : '?') }));
  await browser.close();
  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
