#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1305 화면 판 · 실클라 · 판정 0)
// === scripts/t1305-screen.js — 사유지 돌봄 켬 판의 화면(★T1332 청크 · 쓰면 저절로): 숫자 상한 문구 0 · 흐린 경계 · 머묾 돌봄 ===========================
//   central + 존(`T1305_DEEDS=1` · 하루를 4초로 줄인 시험 손잡이 `T1305_DAY_MS` — 값 무변 · 마을 끔 = 빈 들)을 띄우고 실클라로:
//   ① C 로 첫 칸(재료는 `__e2e_give` · 변 맞댐은 서버 하네스 `test-claim-v2` ⑨ 몫) ② 사유지 패널(Y) 문구 — "개인 n칸 · 땅덩이 n" · "/9" 없음 · 손보기 단추 0 · 머묾 안내
//   ③ 청크 밖으로 걸어 나가 날이 지나면 칸이 흐려진다(클라가 받은 `care` = fade — 그 청크의 단계)
//   ④ 걸어 돌아와 머물면(머묾 2초 — 시험 값) 새것 · 짐 그대로(재료 0) · 단추 0
//   node scripts/t1305-screen.js
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/t1305-screen-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t1305s-central-${process.pid}.db`, ZDB = `/tmp/t1305s-zone-${process.pid}.db`;
FB.mustBeFree([CPORT, ZPORT], 't1305-screen');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
FB.reapOnExit(procs);
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p); return p;
}
(async () => {
  console.log('\n=== T1305 · T1343 화면 판 — 사유지 계량기 켬(청크 · 실클라) ===');
  const c0 = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cUp = FB.waitUp(c0, /central server up on/, { name: 'central' });
  const z0 = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1',
    T1305_DEEDS: '1', T1305_DAY_MS: '4000', T1305_TICK_MS: '10000', T1305_CARE_S: '2', T1343_D0: '0.02', T1343_Q_IDLE: '20' });   // ★[T1343] 시험 값 — 하루 4초 · D0 0.02(1칸 = 32날 = 128초) · 머묾 2초 · 서 있기 초당 20점
  const zUp = FB.waitUp(z0, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok((await cUp).ok && (await zUp).ok, '[상황] central · 존(켬) 기동');
  for (let i = 0; i < 120; i++) { try { const z = await (await fetch(`http://localhost:${CPORT}/zones`)).json(); const h = (z.zones || {}).hanbando || {}; if (h.population != null && h.cap) break; } catch (e) {} await sleep(1000); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const perrs = [];
  page.on('pageerror', (e) => perrs.push(String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await page.fill('#name', 'deeds' + Date.now().toString(36).slice(-5)); await page.fill('#password', 'pw1234'); await page.click('#enter');
  for (let i = 0; i < 80 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2000);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '[상황] 실클라 입장');
  const cfg = await page.evaluate(() => (window.__uiCfg ? window.__uiCfg().deeds : null));
  ok(!!cfg && cfg.chunk === 4 && cfg.n0 === 40 && cfg.pt === 100, '[상황] 서버가 돌봄 설정을 실었다(welcome `uiCfg.deeds` — 청크 4 · N0 40 · 칸 100점)', JSON.stringify(cfg));
  const send = (m) => page.evaluate((mm) => { window.__sendPrimary(mm); return true; }, m);
  for (let i = 0; i < 5; i++) { await send({ type: '__e2e_give', items: { wood: 60, stone: 60 } }); await sleep(1000); const inv = await page.evaluate(() => window.__getInv && window.__getInv()); if (inv && inv.wood >= 30) break; }
  const mine = () => page.evaluate(() => (window.__getClaims ? window.__getClaims() : []).filter((c) => c.kind === 'personal'));
  // ① 첫 칸(서 있는 칸에서 C)
  await page.keyboard.press('c'); await sleep(1200);
  let m0 = await mine();
  ok(m0.length >= 1, '① 실클라 C 로 개인 칸이 선다(마을 끔 = 빈 들 · 미가입자 — 여러 칸 · 변 맞댐은 `test-claim-v2` ⑨ 가 잰다)', `${m0.length}칸 · 알림 ${(await page.evaluate(() => (window.__notices || []).slice(-3).join(' / ')))}`);
  // ② 패널 문구
  await page.keyboard.press('y'); await sleep(1200);
  const txt = await page.evaluate(() => (document.getElementById('spBody') || {}).innerText || '');
  ok(/개인 \d+칸/.test(txt) && !/\/\s*9/.test(txt) && /내 땅 합 1칸/.test(txt) && /버티는 날 [\d.]+일/.test(txt), '② ★[T1343] 사유지 패널 — 내 칸 합 N · 버티는 날(숫자 상한 문구 0)', txt.split('\n').slice(0, 3).join(' / '));
  ok(/한 칸 더 잡으면 [\d.]+일 → [\d.]+일로 줄어듭니다/.test(txt) && /땅덩이 \(-?\d+,-?\d+\) 1칸/.test(txt), '② ★[T1343] 패널 — 한 칸 더 잡으면 n일 → m일 · 땅덩이마다 관리도 띠', (txt.match(/한 칸 더[^\n]*/) || [''])[0]);
  ok(!(await page.$('[data-care]')) && /머물면/.test(txt) && /실제 날짜로 줄어듭니다/.test(txt) && /넓을수록 빨리/.test(txt), '② 패널 — 손보기 단추 0 · 쓰기 · 머묾 · 실제 날짜 · 넓을수록 빨리 안내', '');
  await page.keyboard.press('y'); await sleep(400);
  await page.screenshot({ path: `${SHOTS}/1-new.png` });
  // ③ 청크 밖으로 걸어 나가(머묾이 안 걸리게) 날이 지나면 흐려진다(하루 4초 · 틱 10초 — 흐림 날 수만큼 틱)
  const hold = async (k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(300); };
  const p0 = await page.evaluate(() => window.__getMyAbs());
  let p1 = p0, held = 0;   // 청크 둘 너비(4칸 × 2)를 넘을 때까지 걷는다(걷는 빠르기는 땅에 따라 다르다 — 시간 대신 자리로)
  while (held < 30000 && Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)) <= 2 * 4 * 32) { await hold('d', 1000); held += 1000; p1 = await page.evaluate(() => window.__getMyAbs()); }
  ok(Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)) > 2 * 4 * 32, '[상황] 걸어서 청크 밖으로 나갔다', `${Math.round(Math.hypot(p1.x - p0.x, p1.y - p0.y))}px · ${held / 1000}초`);
  const t0 = Date.now(); let fadeSeen = null;
  while (Date.now() - t0 < 120000) { const mm = await mine(); const f = mm.find((c) => c.care === 'fade'); if (f) { fadeSeen = f; break; } await sleep(2000); }
  ok(!!fadeSeen, '③ 안 돌본 칸이 흐려진다(클라가 받은 `care = fade`)', fadeSeen ? `${Math.round((Date.now() - t0) / 1000)}초` : '120초 안에 없음');
  await page.screenshot({ path: `${SHOTS}/2-fade.png` });
  // ④ 걸어 돌아와 머문다(머묾 2초 · 재는 간격 1초) — 손보기 단추 없이 그 청크가 새것 · 짐 그대로
  const inv1 = await page.evaluate(() => JSON.stringify(window.__getInv && window.__getInv()));
  await hold('a', held);   // 같은 시간만큼 되돌아 걷는다(땅이 같으니 같은 자리 — 아래 ④ 가 그 청크의 단계로 잰다)
  let after = null; const t1 = Date.now();
  while (Date.now() - t1 < 20000) { const mm = await mine(); after = mm.find((c) => fadeSeen && c.id === fadeSeen.id); if (after && after.care === 'new') break; await sleep(1000); }
  const inv2 = await page.evaluate(() => JSON.stringify(window.__getInv && window.__getInv()));
  ok(!!after && after.care === 'new', '④ 돌아와 머물면 그 청크가 새것(손보기 단추 0)', (after ? `${after.id} care=${after.care} · ${Math.round((Date.now() - t1) / 1000)}초` : '칸 없음'));
  await page.screenshot({ path: `${SHOTS}/3-dwell.png` });
  ok(inv1 === inv2, '④ 머묾 재료 0(짐 그대로)', '');
  ok(perrs.length === 0, '페이지 오류 0', perrs.slice(0, 2).join(' | '));
  console.log(`\n=== T1305 · T1343 화면 판: ${pass} 통과 / ${fail} 실패 === (그림 ${SHOTS})`);
  try { await browser.close(); } catch (e) {}
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})();
