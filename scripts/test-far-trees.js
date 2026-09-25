#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @pixel     ← ★프레임을 화소로 잰다(`page.screenshot` → `PNG.sync.read`) — 렌더 층을 만지므로.
// === scripts/test-far-trees.js — 원경 나무 층 [T380] ==========================
//
// ★무엇을 재나 (카드 T380 ③)
//   ⓐ **손잡이 기본 끔 = 방송 0** — 클라가 요청을 **보냈는데도** 서버가 `far_trees` 를 0통 보낸다
//      (요청 0통이면 자명 통과다 — 그래서 요청 수를 **먼저** assert 한다).
//   ⓑ **겹침 0** — 원경이 준 자리와 **개체가 선 자리**의 교집합이 0. 서버가 활성 청크를
//      보내는 쪽에서 빼므로, 이 수가 0 이 아니면 그 가드가 샌 것이다.
//   ⓒ **원경 자리 = 색인 답** — 하네스가 `chunk.generateChunkResources` + `overflowInto` 로
//      **다시 계산**해 부분집합인지 본다(서버가 지형으로 거른 몫은 수로 적는다).
//   ⓓ **화소** — 층을 끄면 프레임이 달라진다(=이 층이 실제로 그린다) · 다시 켜면 **원래대로**.
//   ⓔ **세계 무변** — 개체 수·id 집합이 요청 전후로 같다(활성화 0 · `resources` 무접촉).
//   ⓕ **부하 표** — 청크당 µs · 캐시 적중률 · 청크 수 · 나무 수 · 클라 그리기 ms.
//   ⓖ ★[T384] **띠는 서버 없이 켜진다** — 손잡이 끔 서버에서도 650~1,500 띠를 그린다(ⓐ5).
//      "끔 비트 동일" 은 이제 **원경(ⓑ)에만** 남는다(ⓐ4). 띠의 자는 "띠 안 나무 수 = 모은 수 =
//      그린 수 + 화면 밖 + 상한" 항등식이고, 하네스가 같은 상자로 `conns` 를 **다시 센다**.
//      대조군(`__farOff(1)`)은 띠도 끈다(ⓐ6 · ⓑ9).
//
// ★자명 통과 금지
//   · ⓐ 는 "요청을 보냈다"를 먼저 세운다(안 보냈으면 0통은 아무것도 증명 못 한다).
//   · ⓒ 는 좌표를 **일부러 1px 비틀어** 대조가 깨지는지 본다(늘 통과하는 자가 아니다).
//   · ⓓ 는 "끄면 다르다"와 "켜면 원래대로" **둘 다** 본다(한쪽만 보면 잡음도 통과한다).
//
// ★자리 — `임업3`(57382, 61114). **숲이 제일 빽빽한 곳 중 하나**를 고른다(5×5 청크 5,142그루).
//   빈 들에서 재면 원경 층이 0그루를 그려도 전부 초록이 된다.
//
// 실행: node scripts/test-far-trees.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T344/T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const HEADED = process.argv.includes('--headed');
const AT = { x: 57382, y: 61114, name: '임업3' };

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 110)); });
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill(); } catch (e) {} } procs.length = 0; }

// ★세계를 두 팔에서 **같게** 만든다 — 존 래퍼가 게임 시계를 못 박는다(e2e-fogray 선례).
const WRAP = '/tmp/zone-wrap-fartree.js';
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.3);
require(path.join(ROOT,'server','zone.js'));`);

async function bootWorld(db, farOn) {
  killAll();
  await sleep(1500);
  const c = boot('central', path.join(ROOT, 'server', 'central.js'),
    { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  if (!cu.ok) { say(cu.why); return false; }
  const z = boot('zone', WRAP, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: db,
    CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
    T380_FAR_TREES: farOn ? '1' : '' });
  const zp = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  const r = await zp;
  if (!r.ok) { say(r.why); return false; }
  await sleep(20000);
  return true;
}

// 페이지를 열고 숲 한가운데로 옮긴다. 원경 층은 **요청을 스스로** 보낸다(첫 그리기에서).
async function enter(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const clog = []; page.on('console', (m) => clog.push(m.text())); page.on('pageerror', (e) => clog.push('PAGEERROR ' + e.message));
  // ★수신을 **페이지가 열리기 전에** 건다 — `far_trees` 는 입장 직후에 온다(놓치면 0통으로 보인다).
  await page.addInitScript(() => {
    window.__t380Spy = { req: 0, trees: 0, done: 0, doneAfterTrees: 0 };
    const OS = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      try { if (typeof d === 'string' && d.indexOf('far_trees_req') >= 0) window.__t380Spy.req++; } catch (e) {}
      return OS.apply(this, arguments);
    };
    const OA = WebSocket.prototype.addEventListener;
    const _wire = (ws) => {
      if (ws.__t380Spied) return; ws.__t380Spied = true;
      OA.call(ws, 'message', (ev) => {
        const d = ev.data;
        if (typeof d !== 'string') return;
        if (d.lastIndexOf('{"type":"far_trees"', 0) === 0) window.__t380Spy.trees++;
        else if (d.lastIndexOf('{"type":"far_trees_done"', 0) === 0) {
          window.__t380Spy.done++;
          if (window.__t380Spy.trees > 0) window.__t380Spy.doneAfterTrees++;   // 조각을 받은 **뒤의** 끝 표식
        }
      });
    };
    const OW = window.WebSocket;
    window.WebSocket = function (...a) { const ws = new OW(...a); _wire(ws); return ws; };
    window.WebSocket.prototype = OW.prototype;
    Object.assign(window.WebSocket, OW);
  });
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  const entered = await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId()),
    { timeout: 90000 }).then(() => true).catch(() => false);
  // ★[T98 §4-c · `test-harness-lint ⑤d`] `@pixel` 하네스는 **하늘과 바람을 끈다** —
  //   안 끄면 렌더 층이 늘 때마다 프레임이 흔들리고, 그 흔들림이 판정을 삼킨다
  //   (1차 판 실측: 같은 팔 두 프레임이 7,200화소 달랐다 — 이 층이 낸 차이와 구분이 안 됐다).
  if (entered) await page.evaluate(() => {
    if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 });
    if (window.__terrain19) window.__terrain19.windOff = true;
  });
  return { page, clog, entered };
}
async function goTo(page, x, y) {
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [x, y]);
  await sleep(6000);   // 청크가 켜지고 개체가 오는 동안 — 아래 판정이 **개체 수**로 다시 확인한다
}
const shot = async (page, f) => { fs.mkdirSync('/tmp/t380-shots', { recursive: true }); await page.screenshot({ path: f }); return f; };
function pxDiff(a, b) {
  const { PNG } = require('pngjs');
  const A = PNG.sync.read(fs.readFileSync(a)), B = PNG.sync.read(fs.readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return { n: -1, mx: -1 };
  let n = 0, mx = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    if (d) { n++; if (d > mx) mx = d; }
  }
  return { n, mx };
}

(async () => {
  say('=== 원경 나무 층 — 방송 0 · 겹침 0 · 색인 답 · 부하 (T380 2026-09-23) ===');
  const { chromium } = require('playwright');

  // ══ 팔 ⓐ — 손잡이 **끔**(기본) ═══════════════════════════════════════════════
  if (!await bootWorld('/tmp/t380-off.db', false)) { say('  ★팔 ⓐ 세계를 못 세웠다'); process.exit(1); }
  let browser = await chromium.launch({ headless: !HEADED });
  {
    const { page, clog, entered } = await enter(browser);
    ok(entered, 'ⓐ1 입장(손잡이 끔)');
    if (!entered) { for (const l of clog.slice(-10)) say('    ' + l.slice(0, 150)); await browser.close(); killAll(); say(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
    await goTo(page, AT.x, AT.y);
    const spy = await page.evaluate(() => window.__t380Spy);
    const dbg = await page.evaluate(() => (window.__farDbg ? window.__farDbg() : null));
    // ★전제 먼저 — 요청을 안 보냈으면 "방송 0" 은 아무것도 증명 못 한다.
    ok(spy.req >= 1, `ⓐ2 ★전제 — 클라가 원경을 **요청했다** (far_trees_req ${spy.req}통)`);
    ok(spy.trees === 0 && spy.done === 0, `ⓐ3 ★손잡이 끔 = **방송 0** (far_trees ${spy.trees}통 · done ${spy.done}통)`);
    // ★[T384] "끔 비트 동일" 절은 **ⓑ 원경에만** 남는다 — 띠(ⓐ)는 서버 답 없이 클라 혼자 켠다.
    ok(!!dbg && dbg.on === false && dbg.far === 0 && dbg.chunks === 0,
       `ⓐ4 ★손잡이 끔 = **원경(ⓑ) 0그루** (on=${dbg && dbg.on} · 원경 ${dbg && dbg.far} · 받은 청크 ${dbg && dbg.chunks})`);
    // ── ⓐ5 띠는 **기본 켬** — 띠 안 나무 수 = 층이 모은 수 = 그린 수 + 화면 밖 + 상한 ─────────
    //   ★하네스가 **같은 상자**(층이 그 프레임에 쓴 중심·viewR·tileR)로 `conns` 를 **다시 센다** —
    //     층의 계수기를 그대로 믿으면 그게 자명 통과다.
    //   ⚠숲 한복판이면 띠가 **수백 그루**여야 한다 — 청크가 아직 덜 켜진 프레임을 재면 22그루로도
    //     항등식은 맞는다(T384 둘째 판 실측). 그러면 "띠가 켜졌다"를 빈 들에서 잰 셈이다.
    //     ⇒ 띠가 찰 때까지 **기다린다**(고정 초 아님 · 족보 ㊽).
    const bandFull = await page.waitForFunction(() => window.__farDbg && window.__farDbg().near >= 500, { timeout: 90000 }).then(() => true).catch(() => false);
    const band = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
      const d = window.__farDbg();
      let mine = 0;
      for (const c of conns.values()) {
        if (!c.meta || !c.resources) continue;
        const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
        for (const r of c.resources.values()) {
          if (r.type !== 'tree') continue;
          const dx = Math.abs(ox + r.x - d.cx), dy = Math.abs(oy + r.y - d.cy);
          if (dx <= d.viewR && dy <= d.viewR) continue;
          if (dx > d.tileR || dy > d.tileR) continue;
          mine++;
        }
      }
      res({ d, mine });
    })));
    const bd = band.d;
    ok(bandFull && bd.near >= 500 && band.mine === bd.near && bd.drawn > 0 && bd.drawn + bd.culled + bd.capCut === bd.near + bd.far,
       `ⓐ5 ★띠는 **서버 없이** 켜진다 — 띠 안 나무 ${band.mine} = 층이 모은 ${bd.near} = 그린 ${bd.drawn} + 화면 밖 ${bd.culled} + 상한 ${bd.capCut}`);
    // ── ⓐ6 대조군 — `__farOff(1)` 은 띠도 끈다 · 나무 그리기 호출이 그만큼 준다 ───────────────
    //   ⚠두 프레임으로 재면 렌더가 한 판 밀린 순간 0 이 나온다(T384 셋째 판: 0 → 42 로 **거꾸로**).
    //     ⇒ 여덟 프레임을 재서 **프레임당**으로 나눈다(`__natDbg` 는 매 프레임 새로 쓰인다).
    const drawDelta0 = () => page.evaluate(() => new Promise((res) => {
      const n0 = window.__natDbg.treeDraw.n; let k = 0;
      const step = () => { if (++k < 8) requestAnimationFrame(step); else res((window.__natDbg.treeDraw.n - n0) / 8); };
      requestAnimationFrame(step);
    }));
    const onN = await drawDelta0();
    await page.evaluate(() => window.__farOff(1)); await sleep(600);
    const offD = await page.evaluate(() => window.__farDbg());
    const offN = await drawDelta0();
    await page.evaluate(() => window.__farForce(1)); await sleep(600);
    ok(offD.drawn === 0 && offD.near === 0 && onN - offN >= bd.drawn * 0.9,
       `ⓐ6 대조군 — 끄면 띠 0그루 · 나무 그리기 호출 프레임당 ${onN.toFixed(1)} → ${offN.toFixed(1)}(준 ${(onN - offN).toFixed(1)} ≥ 띠 ${bd.drawn})`);
    await page.close();
  }
  await browser.close();

  // ══ 팔 ⓑ — 손잡이 **켬** ═══════════════════════════════════════════════════
  if (!await bootWorld('/tmp/t380-on.db', true)) { say('  ★팔 ⓑ 세계를 못 세웠다'); process.exit(1); }
  browser = await chromium.launch({ headless: !HEADED });
  const { page, clog, entered } = await enter(browser);
  ok(entered, 'ⓑ1 입장(손잡이 켬)');
  if (!entered) { for (const l of clog.slice(-10)) say('    ' + l.slice(0, 150)); await browser.close(); killAll(); say(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
  await goTo(page, AT.x, AT.y);
  // ★§0 — 화면 반경(1,500px)만 물으면 **보낼 청크가 0개**다: 그 상자는 통째로 활성 청크이기 때문이다
  //   (`ceil(1200/1024)=2` ⇒ 5×5 청크 ⇒ 어느 방향으로든 최소 2,048px). 그래서 첫 답은 **빈 답**이고,
  //   그 빈 답이 곧 "손잡이가 켜져 있다"는 악수다. 자료가 정말 필요한 곳은 **큰지도 배율**이다.
  const gotDone = await page.waitForFunction(() => window.__t380Spy.done >= 1, { timeout: 60000 }).then(() => true).catch(() => false);
  ok(gotDone, 'ⓑ2 ★화면 반경은 **빈 답**이 온다(그 상자는 통째로 활성 청크다 — 보낼 것이 없다)');
  const spy0 = await page.evaluate(() => window.__t380Spy);
  ok(spy0.trees === 0, `ⓑ3 ★겹침 0 은 **보내는 쪽에서** 선다 — 화면 반경 요청에 far_trees ${spy0.trees}통`);
  // 큰지도 배율 — 여기가 자료가 **정말 없는** 곳이다.
  // ★[T384] 큰지도 반경은 **제품이 묻는 길**(`_farWant` — 80-bigmap 이 부르는 그것)로 묻는다.
  //   T380 판은 날 요청(`r: 6000`)을 한 번 보냈는데, 클라가 4초마다 보내는 화면 반경 요청(1,500)이
  //   서버 큐를 **갈아 끼워** 흐름을 끊었다(서버는 새 요청마다 큐를 새로 짠다). 그리고 끝 판정이
  //   `done >= 2` 였는데 **그 둘을 화면 반경 악수 두 번이 채울 수 있었다** — T384 첫 판이 그 모양을 냈다(ⓑ4 녹색 · ⓑ5 조각 0통).
  //   T380 이 통과한 것은 흐름이 4초 안에 끝난 **운**이었다(족보 130 — 끝 표식이 무엇의 끝인지 묻지 않았다).
  //   ⇒ 제품 길로 묻고, **조각을 받은 뒤의** 끝 표식을 기다린다.
  await page.evaluate(() => _farWant(6000));
  const gotFar = await page.waitForFunction(() => window.__t380Spy.doneAfterTrees >= 1, { timeout: 120000 }).then(() => true).catch(() => false);
  ok(gotFar, 'ⓑ4 큰지도 반경(6,000px · `_farWant`) — 조각을 받은 **뒤의** 끝 표식이 왔다');
  await sleep(1000);
  const spy = await page.evaluate(() => window.__t380Spy);
  const dbg = await page.evaluate(() => window.__farDbg());
  ok(spy.trees >= 1, `ⓑ5 손잡이 켬 = 방송 **온다** (far_trees ${spy.trees}통 · 청크 ${dbg.chunks})`);

  // ── ⓑ4 겹침 0 — 원경 자리 ∩ 개체 자리 = ∅ ────────────────────────────────
  const ov = await page.evaluate(() => {
    const ent = new Set();
    for (const c of conns.values()) for (const r of c.resources.values())
      if (r.type === 'tree') ent.add(Math.round(r.x) + ',' + Math.round(r.y));
    let far = 0, hit = 0;
    for (const [k, n] of Object.entries(window.__farPts())) { far += n.length / 5;
      for (let i = 0; i + 4 < n.length; i += 5) if (ent.has(n[i] + ',' + n[i + 1])) hit++; }
    return { ent: ent.size, far, hit };
  }).catch(() => null);
  ok(!!ov && ov.far > 0 && ov.hit === 0, `ⓑ6 ★겹침 0 — 원경 ${ov ? ov.far : '?'}그루 ∩ 개체 ${ov ? ov.ent : '?'}그루 = ${ov ? ov.hit : '?'}`);

  // ── ⓑ5 원경 자리 = 색인 답(하네스가 다시 계산한다) ───────────────────────
  const cells = await page.evaluate(() => window.__farPts());
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const terr = require(path.join(ROOT, 'server', 'terrain'));
  if (terr.setZonesMeta) terr.setZonesMeta(ZONES);
  const chunk = require(path.join(ROOT, 'server', 'chunk'));
  const Z = ZONES.hanbando, cs = chunk.CHUNK_SIZE;
  const keys = Object.keys(cells).filter((k) => cells[k].length).slice(0, 6);
  let sub = 0, subMiss = 0, dropped = 0, checked = 0;
  for (const k of keys) {
    const i = k.indexOf('_'); const cx = +k.slice(0, i), cy = +k.slice(i + 1);
    const mine = new Set();
    const add = (list) => { for (const r of list) if (r.type === 'tree') mine.add(Math.round(r.x) + ',' + Math.round(r.y)); };
    add(chunk.generateChunkResources('hanbando', Z.biome, cx, cy, cs, null, 0));
    add(chunk.overflowInto('hanbando', Z.biome, cx, cy, cs, null, 0));
    const pts = cells[k];
    for (let j = 0; j + 4 < pts.length; j += 5) { checked++; if (mine.has(pts[j] + ',' + pts[j + 1])) sub++; else subMiss++; }
    dropped += mine.size - (pts.length / 5);
  }
  ok(checked > 0 && subMiss === 0,
     `ⓑ7 ★원경 자리 = 색인 답 — 청크 ${keys.length}개 · ${checked}그루 전부 색인에 있다(빗나감 ${subMiss}) · 서버가 지형으로 거른 몫 ${dropped}`);
  // 반례 — 1px 비틀면 이 자가 잡는가(늘 통과하는 자가 아니다)
  let cxMiss = 0;
  if (keys.length) {
    const k = keys[0]; const i = k.indexOf('_'); const cx = +k.slice(0, i), cy = +k.slice(i + 1);
    const mine = new Set();
    const add = (list) => { for (const r of list) if (r.type === 'tree') mine.add(Math.round(r.x) + ',' + Math.round(r.y)); };
    add(chunk.generateChunkResources('hanbando', Z.biome, cx, cy, cs, null, 0));
    add(chunk.overflowInto('hanbando', Z.biome, cx, cy, cs, null, 0));
    const pts = cells[k];
    for (let j = 0; j + 4 < pts.length; j += 5) if (!mine.has((pts[j] + 1) + ',' + pts[j + 1])) cxMiss++;
  }
  ok(cxMiss > 0, `ⓑ8 자명 통과 금지 — 좌표를 1px 비틀면 대조가 깨진다(빗나감 ${cxMiss})`);

  // ── ⓑ9 화소 — 끄면 달라진다 · **잡음 자를 먼저 세운다** ───────────────────
  // ★1차 판이 여기서 자명 통과였다: 그냥 "A≠B" 를 봤더니 **세계가 살아 있어서**(NPC 40명 ·
  //   바람 · 밤낮) 어떤 두 프레임도 3만 화소쯤 달랐다. 그 자로는 이 층이 한 그루도 안 그려도 통과한다.
  //   ⇒ **같은 팔 두 프레임**으로 잡음을 먼저 재고, 끔과의 차이가 그 몇 배인지로 판정한다
  //     (e2e-fogray 의 `≥3 이어야 통이 일한 것` 과 같은 문법).
  // ★띠가 찰 때까지 기다린다(ⓐ5 와 같은 이유 — 덜 켜진 프레임을 재면 3그루로도 통과한다 · T384 넷째 판 실측).
  await page.waitForFunction(() => window.__farDbg().near >= 500, { timeout: 90000 }).catch(() => {});
  const A1 = await shot(page, '/tmp/t380-shots/A1_on.png');
  await sleep(800);
  const A2 = await shot(page, '/tmp/t380-shots/A2_on.png');
  const noise = pxDiff(A1, A2);
  await page.evaluate(() => window.__farOff(1)); await sleep(800);
  const B = await shot(page, '/tmp/t380-shots/B_off.png');
  const offDbg = await page.evaluate(() => window.__farDbg());
  const dAB = pxDiff(A2, B);
  const ratio = dAB.n / Math.max(1, noise.n);
  ok(offDbg.drawn === 0 && offDbg.near === 0 && offDbg.far === 0, `ⓑ9 대조군 — 끄면 **띠도 원경도** 한 그루 안 그린다 (drawn ${offDbg.drawn} · 띠 ${offDbg.near} · 원경 ${offDbg.far})`);
  // ★★화소만으로는 이 층을 못 잰다 — **안개가 대부분을 덮기 때문**이다(그게 규격 그대로라는 뜻이다).
  //   실측: 띠에서 1,437그루를 그려도 화면에 남는 차이는 잡음의 두 배 남짓이다.
  //   ⇒ 그림이 **실제로 돌았나**는 `40-r2-sprites` 의 제 계수기(`__natDbg.treeDraw.n`)로 잰다 —
  //     **내가 만든 자가 아니라** 나무를 그리는 함수가 제 손으로 세는 수다(자명 통과가 안 된다).
  const drawDelta = () => page.evaluate(() => new Promise((res) => {   // 여덟 프레임 · 프레임당(ⓐ6 과 같은 자)
    const n0 = window.__natDbg.treeDraw.n; let k = 0;
    const step = () => { if (++k < 8) requestAnimationFrame(step); else res((window.__natDbg.treeDraw.n - n0) / 8); };
    requestAnimationFrame(step);
  }));
  const dOff = await drawDelta();
  await page.evaluate(() => window.__farForce(1)); await sleep(800);
  const backDbg = await page.evaluate(() => window.__farDbg());
  const dOn = await drawDelta();
  ok(backDbg.drawn > 0, `ⓑ11 되돌림 — 다시 켜면 그린다 (drawn ${backDbg.drawn})`);
  ok(backDbg.drawn >= 100 && dOn - dOff >= backDbg.drawn * 0.9 && dOn > dOff,
     `ⓑ10 ★이 층이 **실제로 스프라이트를 돌린다** — 나무 그리기 호출이 프레임당 ${dOff.toFixed(1)} → ${dOn.toFixed(1)}`
     + ` (늘어난 ${(dOn - dOff).toFixed(1)} ≒ 층이 그린 ${backDbg.drawn})`);
  say(`  · 화소(참고) — 켬↔켬 잡음 ${noise.n} · 켬↔끔 ${dAB.n}(${ratio.toFixed(1)}배 · 최대 Δ${dAB.mx})`
    + ' — **안개가 덮는 몫이 커서** 화소 차이는 작다(3단계 규격 그대로)');

  // ── ⓑ9 세계 무변 — 개체 수·id 집합이 요청 전후로 같다 ────────────────────
  const world = await page.evaluate(() => {
    let n = 0; const h = [];
    for (const c of conns.values()) for (const r of c.resources.values()) { n++; if (h.length < 5) h.push(r.id); }
    return { n, h };
  });
  await page.evaluate(() => _farWant(9000));   // 제품 길(ⓑ4 와 같은 이유)
  await sleep(6000);
  const world2 = await page.evaluate(() => {
    let n = 0; const h = [];
    for (const c of conns.values()) for (const r of c.resources.values()) { n++; if (h.length < 5) h.push(r.id); }
    return { n, h };
  });
  ok(world.n === world2.n && world.h.join() === world2.h.join(),
     `ⓑ12 ★세계 무변 — 개체 ${world.n} → ${world2.n} (원경을 더 넓게 물어도 **개체 0 · 활성화 0**)`);

  // ── ⓑ10 부하 표 ──────────────────────────────────────────────────────────
  const fin = await page.evaluate(() => window.__farDbg());
  const d2 = fin.done || {};
  ok(d2.perChunkUs > 0, `ⓑ13 부하 — 청크당 ${d2.perChunkUs}µs · 계산 ${d2.calc}청크 · 캐시 적중 ${(d2.hitRate * 100).toFixed(1)}% (적중 ${d2.hit}/빗 ${d2.miss}) · 보낸 청크 ${d2.chunks} · 나무 ${d2.trees}`);
  say(`  · 클라 그리기 ${fin.ms}ms/f · 이번 프레임 그린 수 ${fin.drawn} (띠 ${fin.near} · 원경 ${fin.far}) · 요청 반경 ${fin.reqR}px`);

  await browser.close(); killAll();
  say(`\n결과: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { say('★예외: ' + (e && e.stack || e)); killAll(); process.exit(1); });
