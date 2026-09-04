#!/usr/bin/env node
// probe-roof — 마을 실화면 재현: 시딩 마을 1곳의 중심(광장 스폰)에서 스크린샷을 찍는다.
// 재민 라이브 관측: "집 한 채에 지붕 날아감" — 로컬에서 같은 화면이 나오는지 본다.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/roof-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/roof-central-${process.pid}.db`, ZDB = `/tmp/roof-zone-${process.pid}.db`;
for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file.startsWith('/') ? file : path.join(ROOT, 'server', file)], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/시딩|실물화|server up|Error/i.test(s)) process.stdout.write(`[${name}] ` + s); });
  p.stderr.on('data', (d) => process.stdout.write(`[${name}!] ` + d.toString().slice(0, 300)));
  procs.push(p);
  return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitHttp(url, tries = 240) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
(async () => {
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', '/tmp/zone-wrap.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', VILLAGE_MAX: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
  });
  if (!await waitHttp(`http://localhost:${ZPORT}/health`)) { console.log('zone 기동 실패'); process.exit(1); }
  let hz = {};
  for (let i = 0; i < 180; i++) {
    try { const z = await (await fetch(`http://localhost:${CPORT}/zones`)).json(); hz = (z.zones || {}).hanbando || {}; } catch (e) {}
    if (hz.population !== null && hz.population !== undefined && hz.cap) break;
    await sleep(1000);
  }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
  page.on('console', (m) => { const t = m.text(); if (/roof|지붕|hut|404/i.test(t)) console.log('[console]', t.slice(0, 200)); });
  await page.goto(`http://localhost:${CPORT}/`);
  await sleep(3000);
  // 게스트 입장 — e2e-guest-reconnect 와 같은 흐름(이름 입력 없이 시작 버튼)
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
  //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
  //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
  //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
  //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
  //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(12000);   // 접속 + 청크 로드 + 렌더 안정
  await page.screenshot({ path: `${SHOTS}/01-spawn.png` });
  // 화면을 넓게 보기 위해 줌아웃 시도(마이너스 키 또는 휠)
  try { await page.mouse.wheel(0, 600); } catch (e) {}
  await sleep(2000);
  await page.screenshot({ path: `${SHOTS}/02-zoomout.png` });
  // 큰집 방향으로 몇 걸음(스폰=광장이면 큰집이 바로 북쪽) — 위로 3초 걷기
  await page.keyboard.down('w'); await sleep(3000); await page.keyboard.up('w');
  await sleep(1500);
  await page.screenshot({ path: `${SHOTS}/03-north.png` });
  console.log('스크린샷 3장:', SHOTS);
  await browser.close();
  for (const p of procs) { try { p.kill(); } catch (e) {} }
  process.exit(0);
})();
