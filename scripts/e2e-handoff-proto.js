#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 세 밤 분할(T238) · 지금 A 20 · B 20 · C 19 → C(적은 쪽)
// === scripts/e2e-handoff-proto.js — 경계에서 **말없이 튕기지 않는다** (T564) ==========================
//
// ★왜 [T564 2026-09-30 · 재민 실기 "닛폰으로 넘어가면 튕겨 나온다"] — 두 호스트(서울 한반도 · 도쿄 닛폰)에서 넘기가 안 되면
//   사람은 경계에서 되밀리기만 했다(알림 0). 로컬 재현(`scripts/t564-bounce-lab.js`)으로 가른 판:
//     · 이웃 주소를 못 찾음/거절(ZONE_HOST_<ID> 빠짐 · 포트 닫힘) → `handoff_prepare` 실패 → 몸은 남고 **예측만 선을 넘었다 되밀림**(튕김 · 알림 0)
//     · 안 문 비밀 어긋남 → 받는 존 404 `{"error":…}` 를 보낸 존이 **성공으로 읽음**(응답 코드 안 봄) → 넘어가라 → 받는 존은 토큰 모름 →
//       3초 뒤 ACK 없음 → 보낸 존이 몸을 지움 → **몸 없는 유령**(클라는 닛폰을 걷는 줄 안다)
//     · 옛 서울(68336c45) ↔ 새 도쿄(main) — 넘어간다(규약의 뜻은 같다)
//   ⇒ 고친 것: `postJSON` 이 응답 코드를 본다 · 넘기 실패마다 로그 `까닭=` 한 줄 + 사람에게 알림 · 인계 규약 판(`HANDOFF_PROTO`)을
//     `handoff_prepare` 요청·응답에 한 칸씩 — 다르면 409 + 알림 · 받는 존은 안 문 거절 · 모르는 승격 토큰을 로그로 말한다.
//
// ★재는 것(실클라 · central + hanbando + nippon · 판 넷 — ★[T1077] ⓗ 하나 더):
//   ⓟ 규약 판 다름(닛폰만 `E2E_HANDOFF_PROTO=2` — `E2E_GIVE=1` 문 뒤) — 사람이 **알림**을 받는다("판이 다르다") · 주 존은 한반도 그대로 ·
//      클라에 `handoff` 가 **안 왔다**(유령 0) · 보낸 존 로그 `까닭=규약` · 받는 존 로그 "규약 판 다름" · ACK timeout 0
//   ⓢ 비밀 어긋남 — 알림("안 문") · 유령 0(클라 `handoff` 0 · ACK timeout 0) · 보낸 존 `까닭=문` · 받는 존 "안 문 거절"
//   ⓞ 같은 판 — 넘어간다(주 존 nippon · 알림 0 · 두 존 로그에 "판 모름" 0) — 자가 넘기 자체를 막지 않았다는 대조군 · ★[T1077] 까닭 줄 0(헛경보 0)
//   ⓗ ★[T1077 · ★재민 11-02 실기 "경계에서 연결 끊김으로 멈춘다"] **central 의 닛폰 주소** — 존↔존 주소는 맞고(인계 통과) central `/zones` 만 닛폰을
//      닛폰이 없는 자리로 준다(central env 에 `ZONE_HOST_NIPPON` 이 없어 26존 표 `ZONE_HOSTS` 로 떨어진 판 — 라이브는 서울 주소:3021(닫힘) · 여기선
//      `nippon.invalid`(RFC 2606 — 이름이 안 풀린다 = 브라우저가 그 주소에 못 붙는다는 같은 꼴)).
//      재현: 클라에 `handoff` 가 왔다 · 보낸 존 로그 `⚠ ACK timeout`(3초 시한이 몸을 지운다) · 서버 알림 0. 고침(⑤): 배너 `why` 맨 앞
//      "<닛폰 표시 이름> 서버에 연결하지 못했습니다"(하십시오체 · `__connState().hoFail`) — 고치기 전 트리는 여기가 빨강(자명 통과 금지 증인)
//   ⓣ 튕김 0 — 실패한 판에서 동쪽으로 걷는 동안 서버 x 가 뒤로 끌린 가장 큰 폭 ≤ 64px(종전: 실패마다 겹침 띠 256px 를 선으로 되끌었다)
//   ⓒ 자명 통과 금지 — 판마다 걸음이 **실제로 선에 닿았다**(선 32px 안까지 걸었다)
// 실행: node scripts/e2e-handoff-proto.js
//   ★[T1092 2026-11-03 · ★재민 11-02 실기 "경계에서 끊김 · 멈춤"] 판 `back` — **브라우저만** 받는 존에 못 붙는다(클라 소켓 주소를 닫힌 포트로 돌린다 ·
//      서버끼리 인계는 맞다 · 까닭 무관 꼴). 고침(서버 손잡이 `T1092_HANDOFF_BACK` 켬): 보낸 존이 ACK 시한에 받는 존 토큰을 놓게 하고 사람을 넘기 전 자리로
//      돌려놓는다 — 주 존 한반도 · 들어가 있음(ready) · 까닭 한 줄 "<닛폰 표시 이름> 쪽으로 넘어가지 못했습니다. 저쪽 서버에 닿지 않습니다." · 몸이 걷는다 ·
//      기다리는 동안 받는 존에 이름 · 열쇠로 다시 붙지 않는다 · 보낸 존 `⚠ ACK timeout` 0. 고치기 전 트리는 멈춤(주 존 닛폰 · 배너) — 빨강 증인 · 사진 한 장.
//   ★[T1125 2026-11-03 · ★재민 11-03 실기 "닛폰으로 넘긴 뒤 약 40초 먹통"] 판 `slow` — 받는 존(닛폰) 브라우저 소켓만 **느린 길**(하네스 안 TCP 대리 `lib-slow-link` ·
//      내려가는 쪽 초당 상한 + 왕복 150 ms = 카드 ④ · 길 = 카드 ⑨ 잣대 200 KB/s). 고침(서버 손잡이 넷 — `T1125_WS_DEFLATE` · `T1125_WEL_HEAD` · `T1125_LEAN_PROMOTE` ·
//      `T1125_KEEP_PRED` 켬 기본 후보 · 클라 `_t1125Hold` · 예측 유지): 넘어간다 · 주 존 닛폰 · 들어가 있음 · [recover] 끊기 0 · 손님 열쇠로 다시 붙기 0 · 압축 협상 ·
//      머리(`welcome_head`)가 섰다 · 승격 welcome 에 지형 · 표 일곱 0 · 넘기 순간 받는 존 틱 이음 · 그림 틀 · 내 몸 멈춤 < 200 ms(카드 ⑨).
//      고치기 전 트리는 여기가 빨강(승격 welcome 631 KB · 틱 이음 3초 남짓 — 자명 통과 금지 증인). 라이브 몫 길(1.7 MB ÷ 40초 ≈ 42.5 KB/s — 종전 끊기 · 다시 붙기)은 표 모드.
//      ★[T1125 추신 ⑥ ⑧ ⑨] 같은 판에서 승격 welcome 이 지형 · 표 일곱 없이 오고(`T1125_LEAN_PROMOTE`) · 넘기 순간 그림 틀 사이 · 멈춰 선 때가 200 ms 안(예측 유지 `T1125_KEEP_PRED`).
//   ★[T1125] `--slow-table` = 판 `slow` 만 길 둘(카드 200 KB/s · 위 42.5 KB/s) × 손잡이 여섯(끔 · 압축만 · 머리만 · 둘다 · 둘다+가볍게 · 전부)으로 돌려 먹통 초 · 넘기 순간 멈춤 표를 낸다(단언 0 · `--json <파일>` ·
//      거르개 `--kbps 42.5` · `--knobs 끔,둘다,전부`).
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
process.env.HANDOFF_ACK_MS = process.env.HANDOFF_ACK_MS || '3000'; process.env.HANDOFF_TOKEN_MS = process.env.HANDOFF_TOKEN_MS || '5000';   // ★[PM 11-03] 이 하네스는 종전 넘기 시한(3초 · 5초)으로 잰다 — 제품 기본은 12초 · 15초(server/zone.js HANDOFF_ACK_MS)
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
const CS = CH.CHUNK_SIZE;
const ZIDS = ['hanbando', 'nippon'];
const HB = ZONES.hanbando;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });

// 걸을 길 — e2e-zone-cross `corridor(+1)` 과 같은 규칙
const ownerAt = (wx, wy) => ZIDS.find((z) => { const Z = ZONES[z], x = wx - Z.worldOffsetX, y = wy - (Z.worldOffsetY || 0); return x >= 0 && y >= 0 && x < Z.zoneWidth && y < Z.zoneHeight; });
const blockedW = (wx, wy) => { const z = ownerAt(wx, wy); if (!z) return true; const Z = ZONES[z]; return !!(T.isWaterCellLocal(z, wx - Z.worldOffsetX, wy - (Z.worldOffsetY || 0)) || T.isRockCellLocal(z, wx - Z.worldOffsetX, wy - (Z.worldOffsetY || 0))); };
function entsN(zid, x0, y0, x1, y1) {
  const Z = ZONES[zid], ox = Z.worldOffsetX, oy = Z.worldOffsetY || 0; let n = 0;
  for (let cy = Math.floor((y0 - oy) / CS); cy <= Math.floor((y1 - oy) / CS); cy++) for (let cx = Math.floor((x0 - ox) / CS); cx <= Math.floor((x1 - ox) / CS); cx++) {
    if (cx < 0 || cy < 0 || cx * CS >= Z.zoneWidth || cy * CS >= Z.zoneHeight) continue;
    let a = []; try { a = (CH.generateChunkResources(zid, Z.biome, cx, cy, CS, null, 0) || []).concat(CH.overflowInto(zid, Z.biome, cx, cy, CS, null, 0) || []); } catch (e) {}
    for (const e of a) { const ax = ox + e.x, ay = oy + e.y; if (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) n++; }
  }
  return n;
}
function corridor() {
  const seam = HB.worldOffsetX + HB.zoneWidth, WALK = 360;
  for (let k = 0; k < 120; k++) {
    const ly = Math.floor(HB.zoneHeight / 2) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 512, wy = (HB.worldOffsetY || 0) + ly;
    let clean = true;
    for (let x = seam - WALK - 64; x <= seam + WALK + 64 && clean; x += 16) for (let dy = -48; dy <= 48; dy += 16) if (blockedW(x, wy + dy)) { clean = false; break; }
    if (!clean || entsN('hanbando', seam - WALK - 96, wy - 80, seam + WALK + 96, wy + 80) || entsN('nippon', seam - WALK - 96, wy - 80, seam + WALK + 96, wy + 80)) continue;
    return { seam, wy, from: seam - WALK };
  }
  return null;
}

async function runCase(tag, envOf, chromium, C, opt) {   // ★[T1092] opt = { redirect: [옛, 새] 클라 소켓 주소 바꾸기 · back: 되돌림 판 읽기 · shot: 사진 }
  const procs = [];
  const boot = (name, file, env) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    p._name = name; p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); }); procs.push(p); return p; };
  const D = `/tmp/e2e-hp-${process.pid}-${tag}`; fs.mkdirSync(D, { recursive: true });
  const r = { tag };
  let link = null;   // ★[T1125] 느린 길(받는 존 브라우저 소켓만)
  try {
    if (opt && opt.slow) link = await require('./lib-slow-link').slowLink({ listen: opt.slow.port, target: ZONES.nippon.port, kbps: opt.slow.kbps, rttMs: opt.slow.rttMs });
    const c = boot('central', 'central.js', Object.assign({ PORT: '3010', DB_PATH: `${D}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') }, envOf('central')));
    const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
    const common = { CENTRAL_URL: 'http://localhost:3010', PUBLIC_HOST: 'localhost', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' };
    const ups = ZIDS.map((z) => FB.waitUp(boot(z, 'zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${D}/w-${z}.db` }, common, envOf(z))), /zone server up on/, { name: z, capMs: 600000 }));
    r.up = cu.ok && (await Promise.all(ups)).every((u) => u.ok);
    if (!r.up) return r;
    const browser = await chromium.launch({ executablePath: require('playwright').chromium.executablePath() });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const clog = []; page.on('console', (m) => { const t = m.text(); if (/\[handoff\]|\[recover\]/.test(t)) clog.push(t); });
    r.errs = []; page.on('pageerror', (e) => r.errs.push(String(e.message).slice(0, 120)));
    // 소켓으로 들어오는 알림 · handoff 를 적는다(클라 코드 무접촉)
    //   ★[T1092] `rd` = [옛, 새] — 그 글자를 품은 소켓 주소를 바꾼다(받는 존 `wsUrl` 을 닫힌 포트로 · 클라만). 받는 존 쪽 소켓 주소는 `__hpU` 에 적는다.
    //   ★[T1125] 바꾼 주소의 소켓마다 `__hpS` 한 줄 — 압축 협상(`extensions`) · 머리(`welcome_head`) 수 · 주 welcome 받은 때 · 그 뒤 첫 틱 때 · 넘기(`handoff`) 받은 때 `__hpHt`
    await page.addInitScript((rd) => { window.__hpN = []; window.__hpH = 0; window.__hpB = 0; window.__hpU = []; window.__hpS = []; window.__hpHt = 0; const W = window.WebSocket; window.WebSocket = function (u, p) {
      let S = null;
      if (rd && String(u).indexOf(rd[0]) >= 0) { u = String(u).split(rd[0]).join(rd[1]); window.__hpU.push(String(u)); S = { u: String(u).replace(/token=[^&]+/g, 'token=…'), ext: '', head: 0, welAt: 0, tick1: 0, at: performance.now(), closedAt: 0, tk: [] }; window.__hpS.push(S); }
      const ws = p ? new W(u, p) : new W(u);
      if (S) { ws.addEventListener('open', () => { S.ext = String(ws.extensions || ''); }); ws.addEventListener('close', () => { S.closedAt = performance.now(); }); }
      ws.addEventListener('message', (ev) => { try { const m = JSON.parse(ev.data); if (m && m.type === 'notice') window.__hpN.push(String(m.text || '')); if (m && m.type === 'handoff') { window.__hpH++; if (!window.__hpHt) window.__hpHt = performance.now(); } if (m && m.type === 'handoff_back') window.__hpB++;
        if (S && m) { if (m.type === 'welcome_head') S.head++; else if (m.type === 'welcome' && !m.observer) { S.welAt = performance.now(); S.welBytes = String(ev.data).length; S.welHt = !!m.hardcodedTerrain; S.welTb = !!m.recipes; } else if (m.type === 'tick') { if (S.welAt && !S.tick1) S.tick1 = performance.now(); S.tk.push(performance.now()); if (S.tk.length > 20000) S.tk.splice(0, 5000); } } } catch (e) {} }); return ws; };
      // ★[T1125 ⑨] 그림 틀마다 [때 · 내 예측 자리 x · y] — 넘기 순간 화면 멈춤(틀 사이) · 멈춰 선 때 · 튐을 잰다(제품 코드 무접촉 · 읽기 훅 `__getMyAbs`)
      window.__hpF = []; const _f = () => { const q = window.__getMyAbs && window.__getMyAbs(); window.__hpF.push([performance.now(), q ? q.x : NaN, q ? q.y : NaN]); if (window.__hpF.length > 40000) window.__hpF.splice(0, 10000); requestAnimationFrame(_f); }; requestAnimationFrame(_f);
      window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); }, (opt && opt.redirect) || null);
    await page.goto('http://localhost:3010/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
    const en = await page.$('#enter'); if (en) await en.click();
    for (let i = 0; i < 120 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs() && window.__getPrimaryZoneId && window.__getPrimaryZoneId()))); i++) await sleep(500);
    const lx = C.from - HB.worldOffsetX, ly = C.wy - (HB.worldOffsetY || 0);
    for (let i = 0; i < 20; i++) { await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [lx, ly]); await sleep(800);
      const s = await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null)); if (s && Math.hypot(s.x - C.from, s.y - C.wy) <= 120) break; }
    await sleep(2500);
    for (const k of ['s', 'd']) await page.keyboard.down(k);
    const t0 = Date.now(); let tSeam = 0, maxSx = -Infinity, prevSx = null, maxBack = 0;
    while (Date.now() - t0 < 70000 && !(tSeam && Date.now() - tSeam > 9000)) {
      await sleep(150);
      const q = await page.evaluate(() => { const s = window.__getSrvAbs ? window.__getSrvAbs() : null; const p = window.__getMyAbs(); return { z: window.__getPrimaryZoneId(), sx: s ? s.x : null, x: p ? p.x : null }; });
      if (opt && opt.shotBack && !r.shotBack && await page.evaluate(() => (window.__hpB || 0) >= 1)) { await sleep(400); try { fs.mkdirSync(path.dirname(opt.shotBack), { recursive: true }); await page.screenshot({ path: opt.shotBack }); r.shotBack = opt.shotBack; } catch (e) { r.shotBack = 'X'; } }   // ★[T1092] 돌아온 순간 사진(까닭 줄이 떠 있을 때)
      if (opt && opt.slow && opt.slow.midShot && !r.midShot && await page.evaluate(() => !!(window.__hpHt && window.__netStalled && window.__netStalled()))) { await sleep(800); try { fs.mkdirSync(path.dirname(opt.slow.midShot), { recursive: true }); await page.screenshot({ path: opt.slow.midShot }); r.midShot = opt.slow.midShot; r.midBanner = await page.evaluate(() => { const e = document.getElementById('netLost'); return e ? `${e.dataset.state}|${(e.querySelector('.nl-txt') || {}).textContent || ''}|${(e.querySelector('.nl-why') || {}).textContent || ''}` : ''; }); } catch (e) { r.midShot = 'X'; } }   // ★[T1125] 넘긴 뒤 딱지가 선 순간(먹통 한가운데) 사진
      if (q.sx != null) { maxSx = Math.max(maxSx, q.sx); if (prevSx != null && q.z === 'hanbando') maxBack = Math.max(maxBack, prevSx - q.sx); prevSx = q.sx; }
      if (!tSeam && ((q.sx != null && q.sx >= C.seam - 32) || q.z === 'nippon')) tSeam = Date.now();
    }
    for (const k of ['s', 'd']) await page.keyboard.up(k);
    await sleep(4000);   // ACK 3초 창을 지나서 본다(유령이면 이 사이에 보낸 존이 몸을 지운다)
    if (opt && opt.slow) {   // ★[T1125] 느린 길 — 닛폰에 들어가 첫 틱이 설 때까지(상한 opt.slow.capMs) · 먹통 = 넘기 받은 때 → 그 첫 틱
      const sq = async () => page.evaluate(() => ({ z: window.__getPrimaryZoneId(), ph: window.__connState ? window.__connState().phase : '', s: window.__hpS.slice(), ht: window.__hpHt, now: performance.now() }));
      let x = await sq(); const tw = Date.now();
      while (Date.now() - tw < opt.slow.capMs && !(x.z === 'nippon' && x.ph === 'ready' && x.s.some((y) => y.tick1 && !y.closedAt))) { await sleep(500); x = await sq();
        if (opt.slow.midShot && !r.midShot && await page.evaluate(() => !!(window.__netStalled && window.__netStalled()))) { await sleep(800); try { fs.mkdirSync(path.dirname(opt.slow.midShot), { recursive: true }); await page.screenshot({ path: opt.slow.midShot }); r.midShot = opt.slow.midShot; r.midBanner = await page.evaluate(() => { const e = document.getElementById('netLost'); return e ? `${e.dataset.state}|${(e.querySelector('.nl-txt') || {}).textContent || ''}|${(e.querySelector('.nl-why') || {}).textContent || ''}` : ''; }); } catch (e) { r.midShot = 'X'; } } }
      const live = x.s.filter((y) => y.tick1 && !y.closedAt).pop();
      // ★[T1125 ⑨] 넘기 순간 — 그림 틀 사이 최대(ms) · 멈춰 선 최대(넘기 받은 때 → welcome 뒤 0.8초 · 자리가 그대로인 이음) · 튐 최대(welcome 앞 0.2초 → 뒤 0.8초 · 틀 하나 사이 자리 차)
      const F = await page.evaluate(() => window.__hpF.slice());
      const m9 = { tickGapMax: null, frameMax: null, stallMax: null, jumpMax: null };
      if (live && x.ht) {   // 틱 이음 최대 = 받는 존 소켓(관측 → 승격) 틱이 안 온 가장 긴 사이(넘기 앞 0.5초 → 승격 뒤 첫 틱 + 2초) — 화면의 세계가 멈춘 때
        const T = [].concat(...x.s.map((y) => y.tk || [])).filter((t) => t >= x.ht - 500 && t <= live.tick1 + 2000).sort((p1, p2) => p1 - p2);
        for (let i = 1; i < T.length; i++) m9.tickGapMax = Math.max(m9.tickGapMax || 0, T[i] - T[i - 1]);
        const a0 = live.welAt - 200, a1 = live.welAt + 800; let st = 0, prev = null, seen = false;
        for (const f of F) {
          if (prev && f[0] >= a0 && f[0] <= a1) { m9.frameMax = Math.max(m9.frameMax || 0, f[0] - prev[0]); m9.jumpMax = Math.max(m9.jumpMax || 0, Math.hypot(f[1] - prev[1], f[2] - prev[2])); }
          if (prev && f[0] >= x.ht && f[0] <= a1) { seen = true; if (Math.hypot(f[1] - prev[1], f[2] - prev[2]) < 0.01) { st += f[0] - prev[0]; m9.stallMax = Math.max(m9.stallMax || 0, st); } else st = 0; }
          prev = f;
        }
        if (seen && m9.stallMax == null) m9.stallMax = 0;   // 틀은 있었는데 멈춰 선 이음이 하나도 없다 = 0 ms(null 은 틀 0 일 때만)
        for (const k of Object.keys(m9)) if (m9[k] != null) m9[k] = Math.round(m9[k]);
      }
      r.slow = Object.assign({ z: x.z, ph: x.ph, sockets: x.s.length, freezeMs: (live && x.ht) ? Math.round(live.tick1 - x.ht) : null, head: x.s.reduce((a, y) => a + y.head, 0),
        ext: x.s.map((y) => y.ext), down: link ? link.stats.down : null, linkConns: link ? link.stats.conns : null,
        welKB: live && live.welBytes ? Math.round(live.welBytes / 1024 * 10) / 10 : null, welHt: live ? !!live.welHt : null, welTb: live ? !!live.welTb : null }, m9);
      if (opt.shot) { try { fs.mkdirSync(path.dirname(opt.shot), { recursive: true }); await page.screenshot({ path: opt.shot }); r.shot = opt.shot; } catch (e) { r.shot = 'X ' + e.message; } }
    }
    const tail = await page.evaluate(() => ({ z: window.__getPrimaryZoneId(), n: window.__hpN.slice(), h: window.__hpH,
      cs: window.__connState ? window.__connState() : null,   // ★[T1077] 배너 상태 · 넘김 실패 까닭
      why: ((document.querySelector('#netLost .nl-why') || {}).textContent || ''), on: !!(document.getElementById('netLost') && document.getElementById('netLost').classList.contains('on')) }));
    r.cs = tail.cs; r.why = tail.why; r.bannerOn = tail.on;
    r.maxBack = Math.round(maxBack);   // 동쪽으로 걷는 동안 서버 x 가 한 표본에 뒤로 간 가장 큰 폭 — 되끌림(튕김)
    r.reached = !!tSeam; r.maxOver = Math.round(maxSx - C.seam); r.z = tail.z; r.handoffMsgs = tail.h; r.notices = tail.n.filter((t) => /못 넘어간다|넘어가지 못했습니다|모른다|모릅니다/.test(t));
    r.recover = clog.filter((l) => /\[recover\]/.test(l)).length;
    r.cut = clog.filter((l) => /\[recover\].*(강제 close|좀비|primary 재연결)/.test(l)).length;   // ★[T1125] 감시견이 끊은 줄(틱 · pong · 재연결) — 딱지 줄(예측 정지)은 안 센다
    if (opt && opt.back) {   // ★[T1092] 되돌림 판 — 사람이 옛 존(한반도)에 들어가 있나(시도 하나가 날던 중이면 끝날 때까지) · 사진 · 몸이 걷나
      const st = async () => page.evaluate(() => ({ z: window.__getPrimaryZoneId(), ph: window.__connState ? window.__connState().phase : '',
        on: !!(document.getElementById('netLost') && document.getElementById('netLost').classList.contains('on')), b: window.__hpB, n: window.__hpN.slice(), u: window.__hpU.slice() }));
      let q = await st(); for (let i = 0; i < 40 && !(q.z === 'hanbando' && q.ph === 'ready'); i++) { await sleep(250); q = await st(); }
      r.back = q;
      if (opt.shot) { try { fs.mkdirSync(path.dirname(opt.shot), { recursive: true }); await page.screenshot({ path: opt.shot }); r.shot = opt.shot; } catch (e) { r.shot = 'X ' + e.message; } }
      const s0 = await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null));
      for (const k of ['w', 'a']) await page.keyboard.down(k);
      await sleep(1500);
      for (const k of ['w', 'a']) await page.keyboard.up(k);
      await sleep(600);
      const s1 = await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null));
      r.backMove = (s0 && s1) ? Math.round(s0.x - s1.x) : null;
    }
    await browser.close();
  } finally {
    if (link) { try { await link.close(); } catch (e) {} }
    for (const p of procs) { r['log_' + p._name] = p._out; try { p.kill('SIGKILL'); } catch (e) {} }
    await sleep(1500);
    try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {}
  }
  return r;
}

(async () => {
  console.log('\n=== 경계에서 말없이 튕기지 않는다 · 인계 규약 판 (T564) ===');
  // 소스 — 판 칸 · 응답 코드 검사가 자리에 있다(글자 넷)
  //   ★[T964] 소스 절 몸통은 `scripts/lib-e2e-src.js` `SECTIONS.handoffProto`(정본 한 벌)로 옮겼다 — 빠른 상설 `test-e2e-src` 가 같은 함수를 부른다(사본 0 · 글자 · 말 무변).
  require('./lib-e2e-src').SECTIONS.handoffProto(ok);
  const C = corridor();
  ok(!!C, 'ⓒ 전제: 동쪽 경계에 걸을 길이 있다', C ? `한반도 로컬 y ${C.wy - HB.worldOffsetY}` : '-');
  for (const port of [3010].concat(ZIDS.map((z) => ZONES[z].port))) if (!await portFree(port)) { ok(false, `포트 ${port} 가 비어 있다`); process.exit(1); }
  const { chromium } = require('playwright');
  const SEC_A = 'e2e-hp-secret-aaaaaaaaaaaa', SEC_B = 'e2e-hp-secret-bbbbbbbbbbbb';
  const cases = [
    ['proto', (k) => (k === 'nippon' ? { E2E_GIVE: '1', E2E_HANDOFF_PROTO: '2' } : {})],
    ['secret', (k) => ({ CENTRAL_SECRET: k === 'nippon' ? SEC_B : SEC_A })],
    ['same', () => ({})],
    // ★[T1077] central 만 닛폰 주소가 틀렸다(존 둘은 PUBLIC_HOST=localhost 그대로 — 존↔존 인계는 맞다)
    ['host', (k) => (k === 'central' ? { ZONE_HOSTS: JSON.stringify({ hanbando: 'localhost', nippon: 'nippon.invalid' }) } : { T1092_HANDOFF_BACK: '0' })],   // ★[PM land1039] ⓗ 는 T1092 앞 꼴(ACK 시한 · 배너)을 재현하는 판 — T1092 켬 기본 뒤엔 존을 끔으로(되돌림 꼴은 판 back 이 잰다)
  ];
  // ★[T1125] 느린 길 — 카드 ④ 왕복 150 ms · 길 = 1.7 MB ÷ 40초(카드 ★재민 11-03 의 welcome 바이트 · 먹통 초) ≈ 42.5 KB/s · 표 모드는 카드 200 KB/s 도
  const SLOW = 3998, SLOW_CARD = 200, SLOW_KBPS = 1700 / 40, SLOW_RTT = 150, SLOW_CAP = 90000;   // 카드 ④ ⑨ 200 KB/s · 라이브 몫 1.7 MB ÷ 40초
  const slowOpt = (kbps, shot) => ({ redirect: [`:${ZONES.nippon.port}/`, `:${SLOW}/`], slow: { port: SLOW, kbps, rttMs: SLOW_RTT, capMs: SLOW_CAP, midShot: shot.replace(/\.png$/, '-mid.png') }, shot });
  if (process.argv.includes('--slow-table')) {   // 단언 0 — 먹통 초 표(길 둘 × 손잡이 여섯)
    ok(await portFree(SLOW), `ⓒ 전제: 느린 길 대리 포트 ${SLOW} 가 비어 있다`);
    //   손잡이 줄 — ②③ 넷(끔 · 압축만 · 머리만 · 둘 다 — ⑥⑧ 끔) + 추신 ⑥⑧ 둘(⑥ 승격 welcome 가볍게 · 전부 = ⑧ 예측 유지까지)
    const OFF68 = { T1125_LEAN_PROMOTE: '0', T1125_KEEP_PRED: '0' };
    const KN = [['끔', Object.assign({ T1125_WS_DEFLATE: '0', T1125_WEL_HEAD: '0' }, OFF68)], ['압축만', Object.assign({ T1125_WS_DEFLATE: '1', T1125_WEL_HEAD: '0' }, OFF68)],
      ['머리만', Object.assign({ T1125_WS_DEFLATE: '0', T1125_WEL_HEAD: '1' }, OFF68)], ['둘다', Object.assign({ T1125_WS_DEFLATE: '1', T1125_WEL_HEAD: '1' }, OFF68)],
      ['둘다+가볍게', { T1125_WS_DEFLATE: '1', T1125_WEL_HEAD: '1', T1125_LEAN_PROMOTE: '1', T1125_KEEP_PRED: '0' }], ['전부', { T1125_WS_DEFLATE: '1', T1125_WEL_HEAD: '1', T1125_LEAN_PROMOTE: '1', T1125_KEEP_PRED: '1' }]];
    const T = [], av = (k) => { const i = process.argv.indexOf(k); return i > 0 ? String(process.argv[i + 1]).split(',') : null; }, onlyK = av('--kbps'), onlyN = av('--knobs');   // 거르개(예 `--kbps 42.5 --knobs 끔`)
    for (const kbps of [SLOW_CARD, SLOW_KBPS]) for (const [kn, env] of KN) {
      if ((onlyK && !onlyK.some((v) => Math.abs(+v - kbps) < 0.05)) || (onlyN && !onlyN.includes(kn))) continue;
      const tag = `tb${Math.round(kbps)}-${T.length}`; console.log(`\n[표 ${kbps.toFixed(1)} KB/s · ${kn}]`);
      const x = await runCase(tag, (k) => (k === 'central' ? {} : env), chromium, C, slowOpt(kbps, `/tmp/e2e-handoff-proto-shots/slow-${Math.round(kbps)}-${T.length}.png`));
      const q = x.slow || {}, NP = String(x.log_nippon || '');
      const row = { kbps: +kbps.toFixed(1), knobs: kn, z: q.z, ph: q.ph, freezeMs: q.freezeMs, cut: x.cut, rejoin: (NP.match(/WS CONN attempt: observer=false url=\/\?[^\n]*guest_token=/g) || []).length,
        sockets: q.sockets, head: q.head, deflate: (q.ext || []).some((e) => /permessage-deflate/.test(e)), downKB: q.down != null ? Math.round(q.down / 1024) : null, reached: x.reached, errs: (x.errs || []).length, shot: x.shot, midShot: x.midShot || null, midBanner: x.midBanner || null,
        welKB: q.welKB, welHt: q.welHt, welTb: q.welTb, tickGapMax: q.tickGapMax, frameMax: q.frameMax, stallMax: q.stallMax, jumpMax: q.jumpMax };
      T.push(row); console.log('  ·', JSON.stringify(row));
    }
    console.log('\n=== 먹통 초 표(T1125 ④ · 넘기 받은 때 → 닛폰 첫 틱 · 왕복 150 ms · 하네스 꼴 세계) ===');
    console.log('길 KB/s | 손잡이 | 먹통 ms | 끊기 | 손님 열쇠 다시 붙기 | 닛폰 소켓 | 머리 | 압축 | 내려간 KB | 승격 welcome KB | 틱 이음 최대 ms | 틀 최대 ms | 멈춤 최대 ms | 튐 최대 px | 끝');
    for (const t of T) console.log(`${t.kbps} | ${t.knobs} | ${t.freezeMs} | ${t.cut} | ${t.rejoin} | ${t.sockets} | ${t.head} | ${t.deflate ? 'O' : 'X'} | ${t.downKB} | ${t.welKB} | ${t.tickGapMax} | ${t.frameMax} | ${t.stallMax} | ${t.jumpMax} | ${t.z}·${t.ph}`);
    const ji = process.argv.indexOf('--json'); if (ji > 0) { fs.mkdirSync(path.dirname(process.argv[ji + 1]), { recursive: true }); fs.writeFileSync(process.argv[ji + 1], JSON.stringify({ card: 'T1125', made: new Date().toISOString().slice(0, 10), rttMs: SLOW_RTT, rows: T }, null, 1) + '\n'); }
    process.exit(0);
  }
  const R = {};
  for (const [tag, envOf] of cases) { console.log(`\n[판 ${tag}]`); R[tag] = await runCase(tag, envOf, chromium, C);
    const x = R[tag]; console.log(`  · 기동 ${x.up} · 선에 닿음 ${x.reached} · 선 넘은 서버 x ${x.maxOver} · 되끌림 ${x.maxBack}px · 주 존 ${x.z} · handoff 수신 ${x.handoffMsgs} · 알림 ${JSON.stringify(x.notices)} · recover ${x.recover}`); }
  // ★[T1092] 판 back — 받는 존(닛폰) 클라 소켓만 닫힌 포트로(서버끼리 인계는 맞다 · 까닭 무관 꼴)
  { const CLOSED = 3999; ok(await portFree(CLOSED), `ⓒ 전제: 닫힌 포트 ${CLOSED} 에 아무도 없다(브라우저 소켓이 곧 거절된다)`);
    console.log('\n[판 back]'); R.back = await runCase('back', () => ({}), chromium, C, { redirect: [`:${ZONES.nippon.port}/`, `:${CLOSED}/`], back: true, shot: '/tmp/e2e-handoff-proto-shots/back.png', shotBack: '/tmp/e2e-handoff-proto-shots/back-moment.png' });
    const x = R.back; console.log(`  · 기동 ${x.up} · 선에 닿음 ${x.reached} · handoff 수신 ${x.handoffMsgs} · 끝 ${JSON.stringify(x.back ? { z: x.back.z, ph: x.back.ph, on: x.back.on, b: x.back.b } : null)} · 걸음 ${x.backMove} · 사진 ${x.shot}`); }
  // ★[T1125] 판 slow — 받는 존 브라우저 소켓만 느린 길(제품 기본 = 손잡이 둘 켬)
  { ok(await portFree(SLOW), `ⓒ 전제: 느린 길 대리 포트 ${SLOW} 가 비어 있다`);
    console.log('\n[판 slow]'); R.slow = await runCase('slow', () => ({}), chromium, C, slowOpt(SLOW_CARD, '/tmp/e2e-handoff-proto-shots/slow.png'));   // ★[T1125 ⑨] 잣대 길 = 카드 200 KB/s · 왕복 150 ms
    const x = R.slow; console.log(`  · 기동 ${x.up} · 선에 닿음 ${x.reached} · handoff 수신 ${x.handoffMsgs} · 끝 ${JSON.stringify(x.slow || null)} · 끊기 ${x.cut} · 사진 ${x.shot}`); }
  const L = (x, z) => String(x['log_' + z] || '');
  const cnt = (s, re) => (s.match(re) || []).length;
  console.log('\n[ⓟ 규약 판 다름]');
  { const x = R.proto;
    ok(x.up && x.reached, 'ⓒ ⓟ 걸음이 선에 닿았다(서버 권위 · 선 32px 안)', `선 넘은 서버 x ${x.maxOver}`);
    ok(x.notices.some((t) => /판이 다릅니다/.test(t)), 'ⓟ ★사람이 알림을 받는다 — "서버 판이 다르다"', x.notices[0] || '(없음)');
    ok(x.z === 'hanbando' && x.handoffMsgs === 0, 'ⓟ ★유령 0 — 클라에 handoff 가 안 왔고 주 존은 한반도 그대로', `주 존 ${x.z} · handoff ${x.handoffMsgs}`);
    ok(cnt(L(x, 'hanbando'), /✗ 넘기 실패 → nippon .*까닭=규약/g) > 0 && cnt(L(x, 'nippon'), /✗ handoff_prepare 규약 판 다름/g) > 0, 'ⓟ 두 존 로그 한 줄씩이 까닭을 말한다(보낸 쪽 `까닭=규약` · 받는 쪽 "규약 판 다름")');
    ok(cnt(L(x, 'hanbando'), /ACK timeout/g) === 0, 'ⓟ ACK timeout 0(몸을 지우지 않았다)');
    ok(x.maxBack <= 64, 'ⓟ ★튕김 0 — 동쪽으로 걷는 동안 서버 x 가 뒤로 끌린 가장 큰 폭 ≤ 64px(종전 = 겹침 띠 256px 되끌림)', `${x.maxBack}px`); }
  console.log('\n[ⓢ 안 문 비밀 어긋남]');
  { const x = R.secret;
    ok(x.up && x.reached, 'ⓒ ⓢ 걸음이 선에 닿았다', `선 넘은 서버 x ${x.maxOver}`);
    ok(x.notices.some((t) => /안 문/.test(t)), 'ⓢ ★사람이 알림을 받는다 — "안 문이 닫혀 있다"', x.notices[0] || '(없음)');
    ok(x.z === 'hanbando' && x.handoffMsgs === 0, 'ⓢ ★유령 0 — 404 를 성공으로 읽지 않는다(handoff 0 · 주 존 한반도)', `주 존 ${x.z} · handoff ${x.handoffMsgs}`);
    ok(cnt(L(x, 'hanbando'), /✗ 넘기 실패 → nippon .*까닭=문/g) > 0 && cnt(L(x, 'nippon'), /✗ handoff_prepare 안 문 거절 — 비밀 헤더 다름/g) > 0, 'ⓢ 두 존 로그 한 줄씩(`까닭=문` · "안 문 거절 — 비밀 헤더 다름") · 비밀 값은 안 찍힌다');
    ok(!L(x, 'hanbando').includes(SEC_A) && !L(x, 'nippon').includes(SEC_B) && !L(x, 'nippon').includes(SEC_A), 'ⓢ 로그에 비밀 값 0');
    ok(cnt(L(x, 'hanbando'), /ACK timeout/g) === 0, 'ⓢ ACK timeout 0');
    ok(x.maxBack <= 64, 'ⓢ ★튕김 0 — 서버 x 뒤로 끌림 ≤ 64px', `${x.maxBack}px`); }
  console.log('\n[ⓑ 브라우저만 받는 존에 못 붙는다 — T1092]');
  { const x = R.back, q = x.back || {}, WHY = `${ZONES.nippon.displayName} 쪽으로 넘어가지 못했습니다. 저쪽 서버에 닿지 않습니다.`;
    ok(x.up && x.reached, 'ⓒ ⓑ 걸음이 선에 닿았다', `선 넘은 서버 x ${x.maxOver}`);
    ok(x.handoffMsgs >= 1 && cnt(L(x, 'nippon'), /⇐ handoff_prepare/g) >= 1 && (q.u || []).length >= 1, 'ⓑ [상황] 서버끼리 인계는 됐다(받는 존 handoff_prepare · 클라 handoff) · 클라 받는 존 소켓은 닫힌 포트로 갔다',
      `handoff ${x.handoffMsgs} · 받는 존 소켓 ${(q.u || []).length}`);
    ok(cnt(L(x, 'hanbando'), /↩ \[T1092\] 넘기 실패/g) >= 1 && cnt(L(x, 'hanbando'), /⚠ ACK timeout/g) === 0 && cnt(L(x, 'nippon'), /⇐ \[T1092\] handoff drop token=\S+ — 안 쓴 토큰을 놓았다/g) >= 1,
      'ⓑ ★보낸 존이 몸을 안 지운다 — `↩ [T1092]` · `⚠ ACK timeout` 0 · 받는 존 "안 쓴 토큰을 놓았다"', `↩ ${cnt(L(x, 'hanbando'), /↩ \[T1092\]/g)} · ACK timeout ${cnt(L(x, 'hanbando'), /⚠ ACK timeout/g)}`);
    ok(q.z === 'hanbando' && q.ph === 'ready' && !q.on && q.b >= 1, 'ⓑ ★★옛 존에 머문다 — 주 존 한반도 · 들어가 있음 · 배너 없음(`handoff_back` 받음)', `주 존 ${q.z} · ${q.ph} · 배너 ${q.on} · back ${q.b}`);
    ok((q.n || []).includes(WHY), 'ⓑ ★까닭 한 줄(하십시오체) — "' + WHY + '"', JSON.stringify((q.n || []).filter((t) => !/텔레포트/.test(t)).slice(0, 3)));
    ok(x.backMove != null && x.backMove > 16, 'ⓑ ★몸이 걷는다 — 돌아온 뒤 서쪽 입력에 서버 x 가 줄었다', `${x.backMove}px`);
    ok(!(q.u || []).some((u) => /[?&](guest_token|username)=/.test(u)), 'ⓑ 기다리는 동안 받는 존에 이름 · 열쇠로 다시 붙지 않는다(`_t1092Wait` — 몸 둘 막기)', JSON.stringify((q.u || []).map((u) => u.replace(/token=[^&]+/g, 'token=…').slice(0, 60))));
    ok((x.errs || []).length === 0, 'ⓔ ⓑ 클라 pageerror 0', JSON.stringify(x.errs || [])); }
  console.log('\n[ⓞ 같은 판 — 대조군]');
  { const x = R.same;
    ok(x.up && x.z === 'nippon' && x.handoffMsgs >= 1, 'ⓞ ★넘어간다 — 주 존 nippon', `주 존 ${x.z} · handoff ${x.handoffMsgs}`);
    ok(x.notices.length === 0 && x.recover === 0, 'ⓞ 알림 0 · [recover] 0', JSON.stringify(x.notices));
    ok(cnt(L(x, 'hanbando') + L(x, 'nippon'), /판 모름|✗ 넘기 실패|안 문 거절|토큰 모름/g) === 0, 'ⓞ 두 존 로그에 판 모름 · 실패 · 거절 줄 0');
    ok(!!x.cs && !x.cs.hoFail, 'ⓞ ★[T1077] 넘어간 판엔 까닭 줄 0(헛경보 0)', x.cs ? JSON.stringify(x.cs.hoFail || '') : '(상태 없음)');
    ok((x.errs || []).length === 0 && (R.proto.errs || []).length === 0 && (R.secret.errs || []).length === 0 && (R.host.errs || []).length === 0, 'ⓔ 클라 pageerror 0(판 넷)'); }
  console.log('\n[ⓗ central 의 닛폰 주소 — T1077]');
  { const x = R.host, NM = `${ZONES.nippon.displayName} 서버에 연결하지 못했습니다`;
    ok(x.up && x.reached, 'ⓒ ⓗ 걸음이 선에 닿았다', `선 넘은 서버 x ${x.maxOver}`);
    ok(x.handoffMsgs >= 1 && cnt(L(x, 'nippon'), /⇐ handoff_prepare/g) >= 1, 'ⓗ [재현] 서버끼리 인계는 됐다 — 받는 존이 handoff_prepare 를 받았고 클라에 handoff 가 왔다(존↔존 주소는 맞다)', `handoff ${x.handoffMsgs}`);
    ok(cnt(L(x, 'hanbando'), /⚠ ACK timeout/g) >= 1, 'ⓗ ★[재현] 보낸 존 로그 `⚠ ACK timeout` — 사람이 받는 존에 못 붙어 3초 시한이 몸을 지웠다', `${cnt(L(x, 'hanbando'), /⚠ ACK timeout/g)}번`);
    ok(x.notices.length === 0, 'ⓗ [재현] 서버 알림 0 — 서버는 이 실패를 모른다(사람에게 말할 자리는 클라뿐)', JSON.stringify(x.notices));
    ok(x.z === 'nippon' && !!x.cs && x.cs.phase !== 'ready' && x.bannerOn, 'ⓗ [상황] 주 존은 닛폰으로 넘어간 채 들어가지 못했다 — 배너가 섰다', `주 존 ${x.z} · ${x.cs ? x.cs.phase : '-'} · 배너 ${x.bannerOn}`);
    ok(!!x.cs && x.cs.hoFail === NM && x.why.startsWith(NM), 'ⓗ ★★⑤ 화면에 까닭 한 줄 — "<닛폰 표시 이름> 서버에 연결하지 못했습니다"(하십시오체 · 배너 why 맨 앞)', JSON.stringify(x.why)); }
  console.log('\n[ⓛ 느린 길 — 넘긴 뒤 먹통(T1125)]');
  { const x = R.slow, q = x.slow || {}, rejoin = cnt(L(x, 'nippon'), /WS CONN attempt: observer=false url=\/\?[^\n]*guest_token=/g);
    ok(x.up && x.reached && x.handoffMsgs >= 1, 'ⓒ ⓛ 걸음이 선에 닿았고 넘기(handoff)가 왔다', `handoff ${x.handoffMsgs}`);
    ok(q.z === 'nippon' && q.ph === 'ready', 'ⓛ ★★넘어가 들어간다 — 주 존 닛폰 · 들어가 있음', `주 존 ${q.z} · ${q.ph}`);
    ok(x.cut === 0, 'ⓛ ★받는 중인 소켓을 감시견이 끊지 않는다 — [recover] 끊기 줄 0(틱 · pong 좀비 · 재연결)', `${x.cut}`);
    ok(rejoin === 0, 'ⓛ ★닛폰에 손님 열쇠로 다시 붙기 0(라이브 = 네 번)', `${rejoin}`);
    ok(q.freezeMs != null && q.freezeMs < 10000, 'ⓛ ★먹통(넘기 받은 때 → 닛폰 첫 틱) < 틱 감시 창 10초', `${q.freezeMs} ms · 길 ${SLOW_CARD} KB/s · 왕복 ${SLOW_RTT} ms`);
    ok((q.ext || []).some((e) => /permessage-deflate/.test(e)), 'ⓛ 받는 존 소켓이 압축을 협상했다(permessage-deflate)', JSON.stringify(q.ext || []));
    ok(q.head >= 1, 'ⓛ 큰 welcome 앞에 머리(welcome_head)가 섰다', `${q.head}`);
    // ★[T1125 ⑥ ⑨ · PM 추신] 눈치 못 채는 넘기 — 승격 welcome 엔 지형 · 표 일곱이 없다(같은 소켓이 관측 welcome 으로 받았다 · 클라가 가진 서명) · 넘기 순간 그림 틀 · 멈춤 < 200 ms
    ok(q.welHt === false && q.welTb === false, 'ⓛ ★⑥ 승격 welcome 이 가볍다 — 지형 · 표 일곱 0(몸 · 짐 · 자리 · 시계만)', `${q.welKB} KB · 지형 ${q.welHt} · 표 ${q.welTb}`);
    ok(q.tickGapMax != null && q.tickGapMax < 200, 'ⓛ ★★⑨ 넘기 순간 화면의 세계가 멈춘 최대 < 200 ms — 받는 존 소켓 틱 이음 최대(관측 → 승격 · 넘기 앞 0.5초 → 승격 뒤 첫 틱 + 2초)', `${q.tickGapMax} ms`);
    ok(q.frameMax != null && q.frameMax < 200 && q.stallMax != null && q.stallMax < 200, 'ⓛ ★⑨ 그림 틀 사이 최대 · 내 몸이 멈춰 선 최대 < 200 ms(넘기 받은 때 → welcome 뒤 0.8초)',
      `틀 ${q.frameMax} ms · 멈춤 ${q.stallMax} ms · 튐 ${q.jumpMax} px`);
    ok((x.errs || []).length === 0, 'ⓔ ⓛ 클라 pageerror 0', JSON.stringify(x.errs || [])); }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); process.exit(1); });
