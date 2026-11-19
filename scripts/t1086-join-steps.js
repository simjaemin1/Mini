#!/usr/bin/env node
// === scripts/t1086-join-steps.js — T1086 재는 자: 마을 가입 · 사유지 터 잡기까지 누른 곳 몇 번 + 사진 ====================
//   (@regress 아님 — 보고 ② 의 전후 표와 사진을 만드는 자. 판정은 `e2e-next-step` · `test-t1086-first-join` 이 한다.)
//
// ★무엇을 재나: 새 게스트 한 명이 시작 마을에 도착해 **실제로** 의뢰를 채우고(게시판 줄 「납품」 단추) · 마을에 들고 · 빈터에 터를 잡을 때까지
//   누른 곳을 하나하나 적는다. 손잡이는 부르는 쪽 env 그대로다:
//     `T1086_FIRST_JOIN=0` = 고치기 전(T1064 칸 · 종전 K-2 — 빈터 3건 · 소속 12건 · 채팅 `/소속`)
//     (없음)               = 고친 뒤(첫 의뢰 뒤 바로 · 칸의 단추)
//   걷기(WASD)와 캐기는 세지 않는다 — 의뢰 물건은 픽스처가 주고(`E2E_GIVE` · 캐는 사슬은 이 자가 재는 것이 아니다), 자리는 순간이동한다.
//   센 것 = 게시판 줄 「납품」 단추 · 채팅(Enter · 적기 · Enter) · 칸 단추 · C 키.
//
// 실행: node scripts/t1086-join-steps.js --out <dir> --tag before|after [--vw 1440 --vh 900]   (E2E_BROWSER=webkit 이면 WebKit)
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', '/tmp/t1086-steps'), TAG = arg('tag', process.env.T1086_FIRST_JOIN === '0' ? 'before' : 'after');
const VW = +arg('vw', 1440), VH = +arg('vh', 900);
const BR = process.env.E2E_BROWSER || 'chromium';
fs.mkdirSync(OUT, { recursive: true });
const CPORT = 3010, ZPORT = 3020;   // ★다른 하네스와 같은 자리(존 주소는 존 설정의 포트를 따른다 — 한 판씩 돈다)
const CDB = `/tmp/t1086-steps-central-${process.pid}.db`, ZDB = `/tmp/t1086-steps-zone-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } }
process.on('exit', shutdown);

(async () => {
  const t0 = Date.now();
  const cen = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(cen, /central server up on/, { name: 'central' });
  const zon = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_MAX: '4', VILLAGE_DAY_MS: '500', E2E_GIVE: '1' });
  const zu = FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!(await cu).ok || !(await zu).ok) throw new Error('기동 실패');
  await sleep(6000);
  const browser = await require('./e2e-browser').launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e).slice(0, 160)));
  const shots = [];
  const snap = async (name) => { const f = path.join(OUT, `${TAG}-${BR}-${VW}x${VH}-${name}.png`); try { await page.screenshot({ path: f }); shots.push(path.basename(f)); } catch (e) {} };
  const nx = () => page.evaluate(() => (window.__t1064Next ? window.__t1064Next() : null));
  const onbS = () => page.evaluate(() => window.__onbState || null);
  //   ★계량기는 **서버에 물어** 읽는다 — 대본 상태 한 통은 납품마다 오지 않는다(훅 · 빈터 · 권함 때만 · 1차 판이 이걸 "안 찼다"로 잘못 읽었다)
  const srvContrib = async () => { await page.evaluate(() => window.__sendPrimary({ type: 'onboarding_state' })); await sleep(350); return ((await onbS()) || {}).contrib | 0; };
  const notes = () => page.evaluate(() => (window.__notices || []).slice());
  const tp = (x, y) => page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
  const presses = [];
  const extra = [];   // 센 것 밖에 누른 것(사진을 위해 판 닫기 등) — 따로 적는다
  const log = [];
  const boardOpen = () => page.evaluate(() => { const p = document.getElementById('boardPane'); return !!(p && !p.classList.contains('hidden')); });
  const note = (k, v) => { log.push([k, v]); };

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  let info = null;
  for (let i = 0; i < 80 && !info; i++) { info = await page.evaluate(() => (window.__onbInfo ? window.__onbInfo() : null)); if (!info) await sleep(700); }
  const V = info ? info.villages.find((v) => v.vid === info.recommend) : null;
  if (!V) throw new Error('시작 화면 마을 없음');
  await page.evaluate(() => window.__onbAny());
  for (let i = 0; i < 240; i++) { if (await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs()))) break; await sleep(500); }
  const OFF = await page.evaluate(() => { const c = conns.get(primaryZoneId); return { x: (c && c.meta && c.meta.worldOffsetX) || 0, y: (c && c.meta && c.meta.worldOffsetY) || 0 }; });
  await sleep(1500);
  await snap('s0-arrive');
  const knob = await page.evaluate(() => (typeof uiCfg !== 'undefined' && uiCfg) ? { nextStep: uiCfg.nextStep, firstJoin: uiCfg.firstJoin || null } : null);
  note('knob', knob);
  // 마을 안 — 촌장 첫 인사
  await tp(V.cx * 32 + 16, V.cy * 32 + 16);
  for (let i = 0; i < 40; i++) { const g = await page.evaluate(() => window.__onbGreet || null); if (g && g.kind === 'greet') break; await sleep(500); }
  async function ensureBoard(vid, tries) {
    const skip = []; let lastItem = null, same = 0;
    for (let i = 0; i < (tries || 25); i++) {
      await page.evaluate((v) => window.__sendPrimary({ type: 'village_board', vid: v }), vid);
      await sleep(400);
      const b0 = await page.evaluate(() => window.__evLastBoard || null);
      if (b0 && b0.rows && b0.rows.length) return b0;
      await page.evaluate(([v, sk]) => window.__sendPrimary({ type: '__e2e_village_short', vid: v, skip: sk }), [vid, skip.slice()]);
      await sleep(900);
      const nl = await page.evaluate(() => (window.__notices || []).filter((t) => /\(문턱 /.test(t)).slice(-1)[0] || '');
      const m = /\s(\S+) [-\d.]+→[-\d.]+ \(문턱/.exec(nl);
      const it = m ? m[1] : null;
      if (it && it === lastItem) same++; else { lastItem = it; same = 1; }
      if (it && same >= 2 && !skip.includes(it)) { skip.push(it); lastItem = null; same = 0; }
    }
    return await page.evaluate(() => window.__evLastBoard || null);
  }
  //   의뢰 하나를 다 채운다 — 게시판 판의 그 줄 「납품」 단추를 **진짜로** 누른다(그 줄의 품목을 싣는다 · Shift N 은 서버가 고른다 —
  //     보상으로 쌓인 다른 물건이 더 급한 의뢰에 먼저 가면 그 의뢰가 안 찬다 · 1차 판 실측). 전 · 후 같은 단추라 누른 수를 견줄 수 있다.
  async function deliverOnce() {
    for (let round = 0; round < 8; round++) {
      await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: false }));
      await sleep(300);
      await ensureBoard(V.vid, 25);
      await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
      await sleep(500);
      const b = await ensureBoard(V.vid, 2);
      const row = b && b.rows && b.rows[0];
      const give = row && (row.give || [])[0];
      if (!give) continue;
      await page.evaluate(([it, n]) => window.__sendPrimary({ type: '__e2e_give', items: { [it]: n } }), [give, Math.max(1, Math.ceil(row.remain)) + 3]);
      await sleep(900);
      await page.evaluate((v) => window.__sendPrimary({ type: 'village_board', vid: v }), V.vid);   // 판을 지금 짐으로 다시 그린다(단추가 선다)
      await sleep(700);
      const c0 = await srvContrib();
      //   ★물건을 준 **그 의뢰의 줄**을 누른다 — 줄 차례는 급한 순이라 다시 그리면 바뀐다(첫 줄을 누르면 남의 줄을 눌렀다 · 1차 판 실측)
      const sel = `#boardPane .bp-row[data-bp-item="${row.item}"] .bp-give`;
      const hasBtn = await page.evaluate((q) => { const b = document.querySelector(q); return !!(b && !b.disabled); }, sel);
      if (!hasBtn) { note('noRowBtn', presses.length); continue; }
      await page.click(sel);
      presses.push('게시판 납품');
      let c1 = c0;
      for (let i = 0; i < 12 && c1 === c0; i++) { await sleep(250); c1 = await srvContrib(); }
      if (c1 > c0) return true;
      note('rowNotDone', [presses.length, (await notes()).filter((t) => /납품|의뢰/.test(t)).slice(-2)]);
    }
    return false;
  }
  const isOffer = async () => {
    const n = await nx();
    if (n && n.stage === 'join') return 'panel';
    const ns = await notes();
    //   종전 권함은 알림 한 줄("… 받아들이겠으면 채팅에 "/소속" …") — 빈터 때 촌장 말("이만하면 우리 마을 사람일세.")과 가르는 것은 `/소속` 이다
    return ns.some((t) => /\/소속/.test(t)) ? 'notice' : '';
  };
  let lotAt = 0, offerAt = 0, offerHow = '', n = 0;
  await page.evaluate(() => { window.__notices = []; });
  for (n = 1; n <= 16 && !offerAt; n++) {
    const okD = await deliverOnce();
    if (!okD) { note('deliverFail', n); break; }
    await sleep(700);
    const s = await onbS();
    if (n === 1) { await snap('s1-first'); note('panel1', await nx()); note('boardOpen1', await boardOpen()); }   // 납품 뒤 그대로(서버가 게시판을 다시 보내 판이 열려 있다)
    if (!lotAt && s && s.lotOk) { lotAt = s.contrib | 0; if (n > 1) { await snap('s3-lot'); } note('panelLot', await nx()); }
    const how = await isOffer();
    if (how) { offerAt = (s && s.contrib) | 0; offerHow = how; if (n > 1) await snap('s4-offer'); note('panelOffer', await nx()); }
  }
  note('deliveries', presses.filter((x) => x === '게시판 납품').length);
  // 마을 가입
  const joinP0 = presses.length;
  const knobOn = !!(knob && knob.firstJoin);
  let joined = false;
  if (offerAt) {
    await page.evaluate(() => { window.__notices = []; });
    if (knobOn && (await nx() || {}).btn === 'join') { await page.click('#onbNextBtn'); presses.push('단추 마을 가입'); }
    else {
      for (let i = 0; i < 12; i++) { await page.keyboard.press('Enter'); await sleep(250); if (await page.evaluate(() => !!(document.getElementById('chatInput') || {}).classList?.contains('active'))) break; }
      presses.push('Enter');
      await page.fill('#chatInput', '/소속'); presses.push('"/소속" 적기');
      await page.keyboard.press('Enter'); presses.push('Enter');
    }
    for (let i = 0; i < 20 && !joined; i++) { await sleep(300); joined = (await notes()).some((t) => /오늘부터 자네는 우리 마을 사람일세/.test(t)); }
    await sleep(600);
    await snap('s5-joined');
    if (await boardOpen()) { await page.keyboard.press('Escape'); extra.push('Esc 게시판 닫기'); await sleep(400); }
    note('panelJoined', await nx());
  }
  const joinPresses = presses.slice(joinP0);
  // 사유지 터 잡기 — 빈터(도착 지점)로 가서 재료를 받고 누른다
  const claimP0 = presses.length;
  await tp(V.arrive.x, V.arrive.y);
  await sleep(1500);
  //   터 값 — 켬 판은 welcome 이 실은 값 · 끔 판은 welcome 에 값이 없어 서버 정본 글자(`zone.js` `CLAIM_COST.personal`)를 읽는다(사본 0)
  const cost = (knob && knob.firstJoin && knob.firstJoin.cost) || (() => { const m = /const CLAIM_COST = \{\s*personal: \{ wood: (\d+), stone: (\d+) \}/.exec(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8')); return m ? { wood: +m[1], stone: +m[2] } : null; })();
  await page.evaluate((c) => window.__sendPrimary({ type: '__e2e_give', items: { wood: c.wood, stone: c.stone } }), cost);
  await sleep(1200);
  note('boardOpenLot', await boardOpen());
  await snap('s6-lot');
  note('panelLotIn', await nx());
  const myC = () => page.evaluate(() => { const c = conns.get(primaryZoneId); const me = myPlayerId || myUsername; let k = 0; if (c && c.claims) for (const cl of c.claims.values()) if (cl.ownerPid === me && cl.kind === 'personal') k++; return k; });
  const k0 = await myC();
  if (knobOn && (await nx() || {}).btn === 'claim') { await page.click('#onbNextBtn'); presses.push('단추 터 잡기'); }
  else { await page.keyboard.press('KeyC'); presses.push('C'); }
  let k1 = k0;
  for (let i = 0; i < 20 && k1 === k0; i++) { await sleep(300); k1 = await myC(); }
  await sleep(600);
  await snap('s7-claimed');
  note('panelClaimed', await nx());
  const claimPresses = presses.slice(claimP0);
  const out = { tag: TAG, browser: BR, vw: VW, vh: VH, village: V.name, knob, lotAt, offerAt, offerHow, joined, claimed: k1 === k0 + 1,
    presses, joinPresses, claimPresses, extra, cost, shots, errs, sec: Math.round((Date.now() - t0) / 1000), log };
  fs.writeFileSync(path.join(OUT, `${TAG}-${BR}-${VW}x${VH}.json`), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ tag: TAG, browser: BR, vw: VW, lotAt, offerAt, offerHow, joined, claimed: out.claimed, presses: presses.length, join: joinPresses, claim: claimPresses, sec: out.sec, errs: errs.length }));
  await browser.close(); shutdown(); process.exit(0);
})().catch((e) => { console.log('예외: ' + (e && e.stack || e)); shutdown(); process.exit(1); });
