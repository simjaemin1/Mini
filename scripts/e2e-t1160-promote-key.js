#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← ★PM land1048: 묶음 표식(없으면 매일 단위로 돌아 test-nightly ⑦ 중복)
// === scripts/e2e-t1160-promote-key.js — **존을 넘어도 게스트 열쇠가 남는다 · 승계는 여전히 지운다** (T1160) ==================
//
// ★왜 [T1160 · T1092 회부 2 · 결함 · 급함] welcome 의 `promoted` 한 칸이 두 뜻이었다:
//     ⓐ 관측 소켓 → 주 소켓 승격(넘기 · 서버 `_promoteWelcome(…, { promoted: true })`)
//     ⓑ 첫 접속의 게스트 → 등록 계정 승계(배치 14 ① — 클라가 죽은 게스트 열쇠를 지운다)
//   클라 welcome 은 `if (msg.promoted) localStorage.removeItem(게스트 열쇠)` 하나라 ⓐ 에도 지웠다 — 게스트가 존을 한 번 넘으면 열쇠가 없고,
//   그 뒤 재접속 · 새로 고침은 **새 게스트**로 선다(몸 · 땅 · 소속을 잃는다). 거꾸로 ⓑ 의 첫 welcome 은 승격 갈래(`if (msg.promoted || msg.back)`)를 타
//   자원 · 땅 · 건물을 안 받았다.
//   고침: 서버 손잡이 `T1160_GUEST_MERGED`(켬 기본 · `=0` 종전 바이트) — 첫 접속 승계는 `guestMerged` 칸 · 클라는 "이 소켓에 승격을 보냈나"(`_promoteSentAt`)로
//   `promoted` 를 가른다(끔 서버의 승계 `promoted` 도 승계로 읽는다).
//
// ★재는 것(실클라 · central + hanbando + nippon · 판 둘 = 서버 손잡이 켬 · 끔 — 클라는 같은 트리):
//   ① 게스트 첫 접속 — 열쇠가 브라우저에 있다(64자 16진) · 내 playerId(anon_…)
//   ② 경계를 승격으로 넘는다 — 주 존 nippon · 승격 welcome(`promoted`)이 이 소켓에 왔다(자명 통과 금지 — 넘기가 실제로 승격 길이었다)
//   ③ ★넘은 뒤 열쇠가 **그대로** 있다(같은 값) — 고치기 전 트리는 여기가 빨강(열쇠 없음)
//   ④ ★재접속(브라우저 컨텍스트를 통째로 닫고 저장소만 들고 다시 게스트로) — **같은 playerId** · 같은 열쇠 — 고치기 전 트리는 새 anon_ 로 빨강
//   ⑤ 승계 — 그 열쇠를 든 채 이름 · 비밀번호로 들어간다 → 같은 playerId · 열쇠가 **지워진다**(배치 14 ① 그대로)
//   ⑥ 승계 첫 welcome 의 칸 — 켬 서버: `guestMerged` 만(`promoted` 칸 없음 → 클라가 승격 갈래를 안 탄다) / 끔 서버: 종전 `promoted`(클라가 `_promoteSentAt` 로 승계로 옮겨 읽는다 — ⑤ 열쇠 지움이 그 증거)
// 실행: node scripts/e2e-t1160-promote-key.js            (판 둘)
//       node scripts/e2e-t1160-promote-key.js --only on   (켬 판만 · `off` = 끔 판만)
'use strict';
process.env.HANDOFF_ACK_MS = process.env.HANDOFF_ACK_MS || '3000'; process.env.HANDOFF_TOKEN_MS = process.env.HANDOFF_TOKEN_MS || '5000';   // e2e-handoff-proto 와 같은 넘기 시한
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
const CPORT = 3010;
const KEY = 'durango_guest_token';
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
const argOnly = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1] : null; })();

// 걸을 길 — e2e-handoff-proto `corridor()` 와 같은 규칙(동쪽 경계 · 물 · 바위 · 자원 없는 띠)
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

// 소켓으로 들어오는 welcome 을 적는다(클라 코드 무접촉 · 열쇠 값은 안 적는다 — 있나 없나만)
const HOOK = () => {
  window.__t1160W = [];
  const W = window.WebSocket;
  window.WebSocket = function (u, p) {
    const ws = p ? new W(u, p) : new W(u);
    ws.addEventListener('message', (ev) => { try { const m = JSON.parse(ev.data); if (m && m.type === 'welcome') window.__t1160W.push({
      observer: !!m.observer, promoted: 'promoted' in m ? !!m.promoted : null, guestMerged: 'guestMerged' in m ? !!m.guestMerged : null, back: !!m.back,
      pid: m.playerId || null, gt: typeof m.guestToken === 'string' && !!m.guestToken, res: Array.isArray(m.resources) ? m.resources.length : -1, zone: (m.zone && m.zone.id) || null }); } catch (e) {} });
    return ws;
  };
  window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
};

async function runCase(tag, knobOn, C) {
  console.log(`\n[판 ${tag} — 서버 T1160_GUEST_MERGED=${knobOn ? '켬(기본)' : '0'}]`);
  const procs = [];
  const boot = (name, file, env) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    p._name = name; p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); }); procs.push(p); return p; };
  const D = `${process.env.TMPDIR || '/tmp'}/e2e-t1160-${process.pid}-${tag}`; fs.mkdirSync(D, { recursive: true });
  const knob = knobOn ? {} : { T1160_GUEST_MERGED: '0' };
  let browser = null;
  try {
    const c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: `${D}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') });
    const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
    const common = Object.assign({ CENTRAL_URL: `http://localhost:${CPORT}`, PUBLIC_HOST: 'localhost', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' }, knob);
    const ups = ZIDS.map((z) => FB.waitUp(boot(z, 'zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${D}/w-${z}.db` }, common)), /zone server up on/, { name: z, capMs: 600000 }));
    const up = cu.ok && (await Promise.all(ups)).every((u) => u.ok);
    ok(up, `[${tag}] 기동 — central · hanbando · nippon`);
    if (!up) return;
    browser = await require('./e2e-browser').launch({ headless: true });
    const newCtx = async (state) => { const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, state ? { storageState: state } : {})); await ctx.addInitScript(HOOK); return ctx; };
    const errs = [];
    const openPage = async (ctx) => { const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120))); return pg; };
    const inWorld = (pg) => pg.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs() && window.__getPrimaryZoneId && window.__getPrimaryZoneId() && window.__getPlayerId && window.__getPlayerId()));
    const enter = async (pg, who, pw) => {
      await pg.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
      await pg.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
      if (who) { await pg.fill('#name', who); await pg.fill('#password', pw); }
      const en = await pg.$('#enter'); if (!en) return false;
      await en.click();
      for (let i = 0; i < 120 && !(await inWorld(pg)); i++) await sleep(500);
      await sleep(1500);
      return inWorld(pg);
    };
    const keyOf = (pg) => pg.evaluate((k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, KEY);
    const pidOf = (pg) => pg.evaluate(() => window.__getPlayerId && window.__getPlayerId());
    const wels = (pg) => pg.evaluate(() => window.__t1160W.slice());

    // ① 게스트 첫 접속
    let ctx = await newCtx(null), page = await openPage(ctx);
    ok(await enter(page), `[${tag}] ① 게스트로 들어갔다`);
    const pid1 = await pidOf(page), key1 = await keyOf(page);
    ok(/^anon_/.test(pid1 || '') && /^[0-9a-f]{64}$/.test(key1 || ''), `[${tag}] ① 내 playerId · 열쇠가 브라우저에 있다`, `${pid1} · 열쇠 ${key1 ? '있음' : '없음'}`);

    // ② 경계를 승격으로 넘는다
    const lx = C.from - HB.worldOffsetX, ly = C.wy - (HB.worldOffsetY || 0);
    for (let i = 0; i < 20; i++) { await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [lx, ly]); await sleep(800);
      const s = await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null)); if (s && Math.hypot(s.x - C.from, s.y - C.wy) <= 120) break; }
    await sleep(2500);
    for (const k of ['s', 'd']) await page.keyboard.down(k);
    const t0 = Date.now(); let tN = 0;
    while (Date.now() - t0 < 70000 && !(tN && Date.now() - tN > 3000)) { await sleep(200); if (!tN && await page.evaluate(() => window.__getPrimaryZoneId() === 'nippon')) tN = Date.now(); }
    for (const k of ['s', 'd']) await page.keyboard.up(k);
    await sleep(4000);   // ACK 창을 지나서 본다
    const W2 = await wels(page);
    const pw2 = W2.filter((w) => !w.observer && w.promoted === true);
    const z2 = await page.evaluate(() => window.__getPrimaryZoneId());
    ok(z2 === 'nippon' && pw2.length >= 1 && pw2.every((w) => w.zone === 'nippon' || w.zone == null), `[${tag}] ② 경계를 승격으로 넘었다 — 주 존 nippon · 승격 welcome(\`promoted\`)`, `주 존 ${z2} · 승격 welcome ${pw2.length}`);
    const key2 = await keyOf(page), pid2 = await pidOf(page);
    ok(key2 === key1 && !!key1, `[${tag}] ③ ★넘은 뒤 게스트 열쇠가 그대로 있다(같은 값)`, `열쇠 ${key2 == null ? '없음' : (key2 === key1 ? '같음' : '다름')} · playerId ${pid2 === pid1 ? '같음' : pid2}`);

    // ④ 재접속 — 컨텍스트를 통째로 닫고 저장소만 들고 다시 게스트로
    const st = await ctx.storageState();
    await ctx.close();
    ctx = await newCtx(st); page = await openPage(ctx);
    ok(await enter(page), `[${tag}] ④ 브라우저를 껐다 켜서 다시 게스트로 들어갔다`);
    const pid4 = await pidOf(page), key4 = await keyOf(page);
    ok(pid4 === pid1 && key4 === key1, `[${tag}] ④ ★재접속해도 같은 사람 — 같은 playerId · 같은 열쇠`, `${pid4} ${pid4 === pid1 ? '=' : '≠'} ${pid1} · 열쇠 ${key4 == null ? '없음' : (key4 === key1 ? '같음' : '다름')}`);

    // ⑤ 승계 — 열쇠를 든 채 이름 · 비밀번호
    const ACC = `t1160${tag}${process.pid % 10000}`, PW = 'pw-t1160';
    const st5 = await ctx.storageState();
    await ctx.close();
    ctx = await newCtx(st5); page = await openPage(ctx);
    ok(await enter(page, ACC, PW), `[${tag}] ⑤ 열쇠를 든 채 이름 · 비밀번호로 들어갔다(승계 요청) — ${ACC}`);
    let pid5 = await pidOf(page); for (let i = 0; i < 20 && pid5 !== ACC && pid5 !== pid1; i++) { await sleep(500); pid5 = await pidOf(page); }
    const key5 = await keyOf(page);
    ok(pid5 === pid1 && key5 == null, `[${tag}] ⑤ ★승계 — 같은 playerId · 게스트 열쇠는 지워졌다`, `${pid5} · 열쇠 ${key5 == null ? '없음' : '남음'}`);
    const W5 = (await wels(page)).filter((w) => !w.observer && w.res >= 0);
    const w5 = W5[W5.length - 1] || null;
    const flagOk = !!w5 && (knobOn ? (w5.guestMerged === true && w5.promoted === null) : (w5.promoted === true && w5.guestMerged === null));
    ok(flagOk, `[${tag}] ⑥ 승계 첫 welcome 칸 — ${knobOn ? '`guestMerged` 만(`promoted` 칸 없음)' : '종전 `promoted`(끔 서버 바이트)'}`, w5 ? `promoted=${w5.promoted} · guestMerged=${w5.guestMerged} · 자원 ${w5.res}` : '-');
    ok(errs.length === 0, `[${tag}] 페이지 오류 0`, errs.slice(0, 3).join(' | '));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    for (const p of procs) { if (process.env.T1160_LOG) fs.writeFileSync(`${D}.${p._name}.log`, p._out); try { p.kill('SIGKILL'); } catch (e) {} }
    await sleep(1500);
    try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  console.log('\n=== 존을 넘어도 게스트 열쇠가 남는다 · 승계는 지운다 (T1160) ===');
  const C = corridor();
  ok(!!C, 'ⓒ 전제: 동쪽 경계에 걸을 길이 있다', C ? `한반도 로컬 y ${C.wy - HB.worldOffsetY}` : '-');
  for (const port of [CPORT].concat(ZIDS.map((z) => ZONES[z].port))) if (!await portFree(port)) { ok(false, `포트 ${port} 가 비어 있다`); process.exit(1); }
  if (C) {
    if (argOnly !== 'off') await runCase('on', true, C);
    if (argOnly !== 'on') await runCase('off', false, C);
  }
  console.log(`\n${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
