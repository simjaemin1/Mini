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
// ★재는 것(실클라 · central + hanbando + nippon · 판 셋):
//   ⓟ 규약 판 다름(닛폰만 `E2E_HANDOFF_PROTO=2` — `E2E_GIVE=1` 문 뒤) — 사람이 **알림**을 받는다("판이 다르다") · 주 존은 한반도 그대로 ·
//      클라에 `handoff` 가 **안 왔다**(유령 0) · 보낸 존 로그 `까닭=규약` · 받는 존 로그 "규약 판 다름" · ACK timeout 0
//   ⓢ 비밀 어긋남 — 알림("안 문") · 유령 0(클라 `handoff` 0 · ACK timeout 0) · 보낸 존 `까닭=문` · 받는 존 "안 문 거절"
//   ⓞ 같은 판 — 넘어간다(주 존 nippon · 알림 0 · 두 존 로그에 "판 모름" 0) — 자가 넘기 자체를 막지 않았다는 대조군
//   ⓣ 튕김 0 — 실패한 판에서 동쪽으로 걷는 동안 서버 x 가 뒤로 끌린 가장 큰 폭 ≤ 64px(종전: 실패마다 겹침 띠 256px 를 선으로 되끌었다)
//   ⓒ 자명 통과 금지 — 판마다 걸음이 **실제로 선에 닿았다**(선 32px 안까지 걸었다)
// 실행: node scripts/e2e-handoff-proto.js
'use strict';
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

async function runCase(tag, envOf, chromium, C) {
  const procs = [];
  const boot = (name, file, env) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    p._name = name; p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); }); procs.push(p); return p; };
  const D = `/tmp/e2e-hp-${process.pid}-${tag}`; fs.mkdirSync(D, { recursive: true });
  const r = { tag };
  try {
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
    await page.addInitScript(() => { window.__hpN = []; window.__hpH = 0; const W = window.WebSocket; window.WebSocket = function (u, p) { const ws = p ? new W(u, p) : new W(u);
      ws.addEventListener('message', (ev) => { try { const m = JSON.parse(ev.data); if (m && m.type === 'notice') window.__hpN.push(String(m.text || '')); if (m && m.type === 'handoff') window.__hpH++; } catch (e) {} }); return ws; };
      window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); });
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
      if (q.sx != null) { maxSx = Math.max(maxSx, q.sx); if (prevSx != null && q.z === 'hanbando') maxBack = Math.max(maxBack, prevSx - q.sx); prevSx = q.sx; }
      if (!tSeam && ((q.sx != null && q.sx >= C.seam - 32) || q.z === 'nippon')) tSeam = Date.now();
    }
    for (const k of ['s', 'd']) await page.keyboard.up(k);
    await sleep(4000);   // ACK 3초 창을 지나서 본다(유령이면 이 사이에 보낸 존이 몸을 지운다)
    const tail = await page.evaluate(() => ({ z: window.__getPrimaryZoneId(), n: window.__hpN.slice(), h: window.__hpH }));
    r.maxBack = Math.round(maxBack);   // 동쪽으로 걷는 동안 서버 x 가 한 표본에 뒤로 간 가장 큰 폭 — 되끌림(튕김)
    r.reached = !!tSeam; r.maxOver = Math.round(maxSx - C.seam); r.z = tail.z; r.handoffMsgs = tail.h; r.notices = tail.n.filter((t) => /못 넘어간다|모른다/.test(t));
    r.recover = clog.filter((l) => /\[recover\]/.test(l)).length;
    await browser.close();
  } finally {
    for (const p of procs) { r['log_' + p._name] = p._out; try { p.kill('SIGKILL'); } catch (e) {} }
    await sleep(1500);
    try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {}
  }
  return r;
}

(async () => {
  console.log('\n=== 경계에서 말없이 튕기지 않는다 · 인계 규약 판 (T564) ===');
  // 소스 — 판 칸 · 응답 코드 검사가 자리에 있다(글자 넷)
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/const HANDOFF_PROTO = /.test(Z) && /proto: HANDOFF_PROTO,/.test(Z) && /ok: true, proto: HANDOFF_PROTO/.test(Z), 'ⓢ0 인계 규약 판 — 요청 · 응답에 칸 하나씩(`HANDOFF_PROTO`)');
  ok(/if \(res\.statusCode >= 400\)/.test(Z), 'ⓢ0 존↔존 `postJSON` 이 응답 코드를 본다(404 를 성공으로 안 읽는다)');
  const C = corridor();
  ok(!!C, 'ⓒ 전제: 동쪽 경계에 걸을 길이 있다', C ? `한반도 로컬 y ${C.wy - HB.worldOffsetY}` : '-');
  for (const port of [3010].concat(ZIDS.map((z) => ZONES[z].port))) if (!await portFree(port)) { ok(false, `포트 ${port} 가 비어 있다`); process.exit(1); }
  const { chromium } = require('playwright');
  const SEC_A = 'e2e-hp-secret-aaaaaaaaaaaa', SEC_B = 'e2e-hp-secret-bbbbbbbbbbbb';
  const cases = [
    ['proto', (k) => (k === 'nippon' ? { E2E_GIVE: '1', E2E_HANDOFF_PROTO: '2' } : {})],
    ['secret', (k) => ({ CENTRAL_SECRET: k === 'nippon' ? SEC_B : SEC_A })],
    ['same', () => ({})],
  ];
  const R = {};
  for (const [tag, envOf] of cases) { console.log(`\n[판 ${tag}]`); R[tag] = await runCase(tag, envOf, chromium, C);
    const x = R[tag]; console.log(`  · 기동 ${x.up} · 선에 닿음 ${x.reached} · 선 넘은 서버 x ${x.maxOver} · 되끌림 ${x.maxBack}px · 주 존 ${x.z} · handoff 수신 ${x.handoffMsgs} · 알림 ${JSON.stringify(x.notices)} · recover ${x.recover}`); }
  const L = (x, z) => String(x['log_' + z] || '');
  const cnt = (s, re) => (s.match(re) || []).length;
  console.log('\n[ⓟ 규약 판 다름]');
  { const x = R.proto;
    ok(x.up && x.reached, 'ⓒ ⓟ 걸음이 선에 닿았다(서버 권위 · 선 32px 안)', `선 넘은 서버 x ${x.maxOver}`);
    ok(x.notices.some((t) => /판이 다르다/.test(t)), 'ⓟ ★사람이 알림을 받는다 — "서버 판이 다르다"', x.notices[0] || '(없음)');
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
  console.log('\n[ⓞ 같은 판 — 대조군]');
  { const x = R.same;
    ok(x.up && x.z === 'nippon' && x.handoffMsgs >= 1, 'ⓞ ★넘어간다 — 주 존 nippon', `주 존 ${x.z} · handoff ${x.handoffMsgs}`);
    ok(x.notices.length === 0 && x.recover === 0, 'ⓞ 알림 0 · [recover] 0', JSON.stringify(x.notices));
    ok(cnt(L(x, 'hanbando') + L(x, 'nippon'), /판 모름|✗ 넘기 실패|안 문 거절|토큰 모름/g) === 0, 'ⓞ 두 존 로그에 판 모름 · 실패 · 거절 줄 0');
    ok((x.errs || []).length === 0 && (R.proto.errs || []).length === 0 && (R.secret.errs || []).length === 0, 'ⓔ 클라 pageerror 0(판 셋)'); }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); process.exit(1); });
