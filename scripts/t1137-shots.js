#!/usr/bin/env node
// === scripts/t1137-shots.js — 마을 화면 가입 판 사진 넷(가입 전 · 가입 · 인정 · 탈퇴 다시 들기) · 실클라 (T1137 보고용 · 판정 0) ===
//
// 마을 앞에서 Shift+G(손잡이 없음 = 켬 기본) → ① 가입 전 → 「가입」 → ② 마을 사람 → 기여 12(판 꾸밈 `__e2e_contrib` · E2E_GIVE 판에만 서는 갈래) → ③ 인정 구성원
//   → 「탈퇴」 → ④ 다시 들기 1시간. 서버가 보낸 `me` 칸(받은 프레임)을 같이 적는다.
// 사진: /tmp/e2e-shots/t1137-{1before,2joined,3recognized,4cool}.png (1440×1080 · `--browser webkit` 이면 앞에 `webkit-`)
// 실행: node scripts/t1137-shots.js [--browser chromium|webkit]
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const BR = (() => { const i = process.argv.indexOf('--browser'); return i >= 0 ? process.argv[i + 1] : 'chromium'; })();
const PFX = BR === 'chromium' ? '' : `${BR}-`;
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t1137-shots-c-${process.pid}.db`, ZDB = `/tmp/t1137-shots-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
FB.reapOnExit(procs);
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p); return p;
}

(async () => {
  FB.mustBeFree([CPORT, ZPORT], 't1137-shots');
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1', VILLAGE_VIEW_MS: '1000' });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  const { DatabaseSync } = require('node:sqlite');
  let rows = [];
  for (let i = 0; i < 60 && !rows.length; i++) { try { rows = new DatabaseSync(ZDB).prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); } catch (e) {} if (!rows.length) await sleep(1000); }
  const V = rows[0];
  const PW = process.env.PW_MODULE ? require(process.env.PW_MODULE) : require('playwright');   // WebKit 판 — 다른 playwright 모듈(`PW_MODULE` · 그 브라우저 경로 `PLAYWRIGHT_BROWSERS_PATH`)을 쓸 수 있다
  const browser = await PW[BR].launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const got = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { const d = typeof f.payload === 'string' ? f.payload : ''; if (d.indexOf('"village_view"') >= 0) { try { const m = JSON.parse(d); if (m.type === 'village_view') got.push(m); } catch (e) {} } }));
  const me = () => { let r = null; for (const m of got) { if (m.vid !== V.id) continue; if (m.full) r = m.view.me; else if (m.slots && m.slots.me) r = m.slots.me; } return r; };
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
  await (await page.$('#enter')).click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(1500);
  let near = null;
  for (let t = 0; t < 25 && near !== V.id; t++) { await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.cx * 32 + 16, V.cy * 32 + 16]); await sleep(1200); near = await page.evaluate(() => window.__evNearVid); }
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
  await page.keyboard.press('Shift+g');
  const wait = async (pred) => { for (let i = 0; i < 50; i++) { const m = me(); if (m && pred(m)) return m; await sleep(200); } return me(); };
  const txt = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? (e.getAttribute('aria-label') || e.textContent).trim() : null; }, sel);
  const log = [];
  const shot = async (k) => { await sleep(900); await page.screenshot({ path: path.join(SHOTS, `${PFX}t1137-${k}.png`) }); log.push({ k, me: me(), title: await txt('#vvJoinTitle'), line: await txt('#vvJoinLine'), head: await txt('#vvContrib') }); };
  await wait((m) => m.open === true);
  await shot('1before');
  await page.click('[data-vv="join"]');
  await wait((m) => m.member === true);
  await shot('2joined');
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_contrib', n: 12 }));
  await wait((m) => m.recognized === true);
  await shot('3recognized');
  await page.click('[data-vv="quit"]');
  await wait((m) => m.member === false && m.coolMin > 0);
  await shot('4cool');
  console.log(JSON.stringify({ browser: BR, village: V.name, near, log }, null, 1));
  await browser.close();
  for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
