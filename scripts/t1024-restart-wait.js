#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1024 ③ 계측 도구 · 제품 0 · 판정 0 · 표만)
// === scripts/t1024-restart-wait.js — 서버 내림 · 재기동 때 사람이 몇 초 기다리나 =====================================
//
// ★왜 — T1024 는 첫 재시도에도 백오프 간격을 건다(`T1024_FIRST_WAIT` · 켬 = 끊김을 본 순간부터 1초 · 확정 오류면 15초).
//   재민이 서버를 갱신할 때(존이 내려갔다 다시 뜬다) 클라는 확정 오류가 아니라 **그냥 끊긴다** → 지수 간격(1·2·4·8·15초)으로 두드린다.
//   사람이 기다리는 몫은 둘이다: ⓐ 서버가 다시 뜨기까지(서버 몫) ⓑ 뜬 뒤 클라의 다음 두드림까지(백오프 몫 · 이 카드가 건드리는 쪽).
//   켬 · 끔(central env `T1024_FIRST_WAIT=0`)을 같은 대본으로 돌려 둘을 가른다.
//
// ★대본 — central + 존(한반도 · `e2e-conn` 의 ZENV 꼴 · 포트만 다름) · 크로미움 한 장 · 들어간 뒤 존을 SIGTERM(갱신 꼴) →
//   D초 쉬고 → 같은 env 로 다시 띄운다(아이의 입 `zone server up on` = 서버가 뜬 순간) → 클라가 `ready` 가 될 때까지.
//   D 는 인자(기본 0,10,30,60). 판마다 같은 페이지 한 장(갱신 뒤 사람은 새로고침 안 한다).
//
// ★재는 것(전부 노드 벽시계 · ms):
//   down → up    서버가 없던 시간(D + 존 기동)
//   up → ready   서버가 뜬 뒤 클라가 들어가기까지(= 백오프가 남긴 기다림 + 입장)
//   down → ready 사람이 본 전체
//   시도 수       내림 뒤 `connecting` 이 된 수(클라 귀 · connMark 감싸기 — e2e-conn T1002 귀와 같은 꼴)
//
// 쓰는 법:
//   node scripts/t1024-restart-wait.js [D초 목록 · 기본 0,10,30,60] [out.json]
//   T1024_FIRST_WAIT=0 node scripts/t1024-restart-wait.js …   (끔 판 — central 이 같은 env 를 받는다)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
// ★포트 — 한반도의 공개 wsUrl 포트는 `zone-config.js` 에 3020 으로 박혀 있다(central `/zones` 가 그대로 낸다 · 존 PORT env 와 무관).
//   존을 다른 포트에 띄우면 클라는 3020 에 있는 **남의 존**에 붙는다(첫 판들이 옆 `e2e-conn` 의 던지는 존에 붙었다 — 버림).
//   ⇒ 존은 3020 · central 은 3010(e2e-conn 과 같다) — **다른 e2e 하네스와 같이 돌리지 마라**.
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t1024-c-${process.pid}.db`, ZDB = `/tmp/t1024-z-${process.pid}.db`;
const DS = (process.argv[2] || '0,10,30,60').split(',').map(Number);
const OUT = process.argv[3] || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', killAll);
const ZENV = () => ({
  PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
  VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
});

(async () => {
  for (const f of [CDB, ZDB]) for (const x of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + x); } catch (e) {} }
  const knob = process.env.T1024_FIRST_WAIT !== '0';
  console.log(`=== T1024 ③ 서버 내림 · 재기동 기다림 — 손잡이 ${knob ? '켬' : '끔(=0)'} · D = ${DS.join(', ')}초 ===`);
  const central = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(central, /central server up on/, { name: 'central' });
  if (!cu.ok) throw new Error('central 기동 실패 ' + cu.why);
  let zone = boot('zone', 'zone.js', ZENV());
  let zu = await FB.waitUp(zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!zu.ok) throw new Error('zone 기동 실패 ' + zu.why);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const cons = [];   // 클라 콘솔의 `[ws] close` · `[recover]` 줄 — 끊김을 언제 봤나(노드 벽시계)
  page.on('console', (m) => { const t = m.text(); if (/\[ws\] close|\[recover\]/.test(t)) cons.push([Date.now(), t.slice(0, 120)]); });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2200);
  const fw = await page.evaluate(() => (typeof _firstWait !== 'undefined' ? _firstWait : null));
  await page.evaluate(() => {
    const log = window.__t1024Log = [];
    const orig = window.connMark;
    window.connMark = function (phase) { const r = orig.apply(this, arguments); const st = window.__connState(); log.push([Math.round(performance.now()), phase, phase === 'error' ? `${st.reason || ''} · ${st.stage || ''}`.slice(0, 120) : '']); return r; };
  });
  await (await page.$('#enter')).click();
  const phase = () => page.evaluate(() => window.__connState().phase);
  const until = async (fn, cap) => { const t = Date.now(); while (Date.now() - t < cap) { if (await fn()) return Date.now() - t; await sleep(100); } return null; };
  const first = await until(async () => (await phase()) === 'ready', 300000);
  console.log(`  첫 입장 ${first}ms · 클라 firstWait=${fw}`);
  const rows = [];
  for (const D of DS) {
    const n0 = await page.evaluate(() => window.__t1024Log.length);
    const c0 = cons.length;
    const tDown = Date.now();
    const ex = new Promise((r) => zone.once('exit', r));
    zone.kill('SIGTERM');
    await Promise.race([ex, sleep(60000)]);
    const tExit = Date.now();
    const lost = await until(async () => (await phase()) !== 'ready', 120000);   // 클라가 끊김을 본 순간(켬이면 1초 뒤 첫 connecting)
    const rest = D * 1000 - (Date.now() - tExit);
    if (rest > 0) await sleep(rest);
    zone = boot('zone', 'zone.js', ZENV());
    zu = await FB.waitUp(zone, /zone server up on/, { name: 'zone', capMs: 300000 });
    const tUp = Date.now();
    const toReady = await until(async () => (await phase()) === 'ready', 600000);
    const tReady = Date.now();
    const L = await page.evaluate((n) => window.__t1024Log.slice(n), n0);
    const tries = L.filter((x) => x[1] === 'connecting').length;
    const row = { D, exitMs: tExit - tDown, lostMs: lost == null ? null : tExit - tDown + lost, zoneBootMs: zu.ms, downToUpMs: tUp - tDown,
      upToReadyMs: toReady == null ? null : tReady - tUp, downToReadyMs: toReady == null ? null : tReady - tDown, tries, marks: L,
      console: cons.slice(c0).map(([t, x]) => [t - tDown, x]) };
    rows.push(row);
    console.log(`  D ${D}초 — 내림→뜸 ${(row.downToUpMs / 1000).toFixed(1)}초(존 기동 ${(zu.ms / 1000).toFixed(1)}) · 뜸→들어감 ${row.upToReadyMs == null ? '—' : (row.upToReadyMs / 1000).toFixed(2) + '초'} · 전체 ${row.downToReadyMs == null ? '—' : (row.downToReadyMs / 1000).toFixed(1) + '초'} · 시도 ${tries}번`);
  }
  await browser.close();
  killAll();
  for (const f of [CDB, ZDB]) for (const x of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + x); } catch (e) {} }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ knob, clientFirstWait: fw, firstEnterMs: first, rows }, null, 1));
  process.exit(0);
})().catch((e) => { console.error('도구 오류:', e && e.stack || e); killAll(); process.exit(2); });
