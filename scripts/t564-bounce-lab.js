#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T564 실험대 · 제품 무변)
// =============================================================================
// "닛폰으로 넘어가면 튕겨 나온다"(재민 실기 09-30 · 라이브 서울 한반도 ↔ 도쿄 닛폰)를 **로컬에서 판마다 재현**해
// 어느 문에서 끊기나를 표로 낸다. 판 = 존마다 (코드 판 · env) 조합 — 두 호스트의 어긋남을 한 기계에서 흉내 낸다.
//   · 코드 판: `root`(레포 워크트리 경로 — 옛 판은 `git worktree add <dir> <커밋>`)
//   · env: 비밀(`CENTRAL_SECRET`) 어긋남 · 이웃 주소(`ZONE_HOST_NIPPON`) 어긋남 등
// 한 판마다: central + hanbando · nippon · jungwon_n 을 띄우고(e2e-zone-cross 와 같은 포트 · 같은 env) 실클라로
//   동쪽 경계 곁 걸을 길에 선 뒤 **키보드로 동쪽으로 걷는다**(D초). 표본 100ms: 주 존 · 월드 x(예측) · 서버 x.
//   답: 넘었나 · 튕겼나(선을 넘었다가 다시 한반도 쪽으로 · 또는 선 앞에서 멎음) · [recover] · 클라 handoff 줄 · 존 로그의 인계 줄.
// 쓰는 법: node scripts/t564-bounce-lab.js <판 json> <출력 디렉터리>
//   판 json = [{ "name": "…", "roots": { "central": "/path", "hanbando": "/path", … }, "env": { "*": {…}, "hanbando": {…} } }, …]
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FB = require('./fixture-boot');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
const CS = CH.CHUNK_SIZE;
const PLANS = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3] || '/tmp/t564-lab'; fs.mkdirSync(OUT, { recursive: true });
const WALK_MS = +(process.env.LAB_WALK_MS || 60000);   // 최대 — 선에 닿은 뒤 AFTER_MS 더 걷고 끝(부하 아래 걸음이 느려도 선 너머를 충분히 본다)
const AFTER_MS = +(process.env.LAB_AFTER_MS || 15000);
const ZIDS = ['hanbando', 'nippon', 'jungwon_n'];
const HB = ZONES.hanbando;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 걸을 길 — e2e-zone-cross `corridor(+1)` 과 같은 규칙(선 양쪽 360px 가 물·바위·개체 없음)
const ownerAt = (wx, wy) => ZIDS.find((z) => { const Z = ZONES[z], x = wx - Z.worldOffsetX, y = wy - (Z.worldOffsetY || 0); return x >= 0 && y >= 0 && x < Z.zoneWidth && y < Z.zoneHeight; });
const blockedW = (wx, wy) => { const z = ownerAt(wx, wy); if (!z) return true; const Z = ZONES[z]; const x = wx - Z.worldOffsetX, y = wy - (Z.worldOffsetY || 0); return !!(T.isWaterCellLocal(z, x, y) || T.isRockCellLocal(z, x, y)); };
function ents(zid, x0, y0, x1, y1) {
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
    if (!clean) continue;
    if (ents('hanbando', seam - WALK - 96, wy - 80, seam + WALK + 96, wy + 80) || ents('nippon', seam - WALK - 96, wy - 80, seam + WALK + 96, wy + 80)) continue;
    return { seam, wy, from: seam - WALK };
  }
  return null;
}

(async () => {
  const C = corridor(); if (!C) { console.error('걸을 길 없음'); process.exit(2); }
  const { chromium } = require('playwright');
  const rows = [];
  for (const plan of PLANS) {
    console.log(`\n=== 판 ${plan.name} ===`);
    const procs = [];
    const boot = (name, root, file, env) => { const p = spawn(process.execPath, [path.join(root, 'server', file)], { cwd: root, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
      p._name = name; p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); }); procs.push(p); return p; };
    const D = `/tmp/t564-lab-${process.pid}-${rows.length}`; fs.mkdirSync(D, { recursive: true });
    const R = (k) => (plan.roots && plan.roots[k]) || ROOT;
    const E = (k) => Object.assign({}, (plan.env && plan.env['*']) || {}, (plan.env && plan.env[k]) || {});
    const c = boot('central', R('central'), 'central.js', Object.assign({ PORT: '3010', DB_PATH: `${D}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') }, E('central')));
    const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
    const common = { CENTRAL_URL: 'http://localhost:3010', PUBLIC_HOST: 'localhost', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' };
    const ups = {};
    for (const z of ZIDS) ups[z] = FB.waitUp(boot(z, R(z), 'zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${D}/w-${z}.db` }, common, E(z))), /zone server up on/, { name: z, capMs: 600000 });
    const upOk = cu.ok && (await Promise.all(ZIDS.map((z) => ups[z]))).every((r) => r.ok);
    const row = { name: plan.name, up: upOk };
    if (upOk) {
      const browser = await chromium.launch({ executablePath: require('playwright').chromium.executablePath() });
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const clog = []; page.on('console', (m) => { const t = m.text(); if (/handoff|promote|kicked|welcome|recover|orphan|고아|notice|경계|넘/i.test(t)) clog.push(`${Date.now()} ${t.slice(0, 200)}`); });
      // 알림 문구를 받아 적는다 — 소켓에 들어오는 `notice` 를 그대로(클라 코드 무접촉 · 화면에 뜨는 그 글)
      await page.addInitScript(() => { window.__labN = []; const W = window.WebSocket; window.WebSocket = function (u, p) { const ws = p ? new W(u, p) : new W(u);
        ws.addEventListener('message', (ev) => { try { const m = JSON.parse(ev.data); if (m && m.type === 'notice') window.__labN.push(String(m.text || '')); } catch (e) {} }); return ws; };
        window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); });
      await page.goto('http://localhost:3010/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
      const en = await page.$('#enter'); if (en) await en.click();
      for (let i = 0; i < 120 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs() && window.__getPrimaryZoneId && window.__getPrimaryZoneId()))); i++) await sleep(500);
      const lx = C.from - HB.worldOffsetX, ly = C.wy - (HB.worldOffsetY || 0);
      for (let i = 0; i < 20; i++) { await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [lx, ly]); await sleep(800);
        const s = await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null)); if (s && Math.hypot(s.x - C.from, s.y - C.wy) <= 120) break; }
      await sleep(3000);
      const pts = [];
      for (const k of ['s', 'd']) await page.keyboard.down(k);
      const t0 = Date.now();
      let tSeam = 0;
      while (Date.now() - t0 < WALK_MS && !(tSeam && Date.now() - tSeam > AFTER_MS)) {
        await sleep(100);
        const q = await page.evaluate(() => { const p = window.__getMyAbs(), s = window.__getSrvAbs ? window.__getSrvAbs() : null; return { t: Date.now(), z: window.__getPrimaryZoneId(), x: p ? Math.round(p.x) : null, sx: s ? Math.round(s.x) : null, id: window.__getPlayerId ? window.__getPlayerId() : null }; });
        pts.push(q);
        if (!tSeam && ((q.x != null && q.x >= C.seam - 32) || q.z === 'nippon')) tSeam = Date.now();
      }
      row.reachedSeam = !!tSeam;
      for (const k of ['s', 'd']) await page.keyboard.up(k);
      await sleep(1500);
      const tail = await page.evaluate(() => ({ z: window.__getPrimaryZoneId(), x: Math.round(window.__getMyAbs().x), id: window.__getPlayerId ? window.__getPlayerId() : null, n: window.__labN || [] }));
      const xs = pts.map((q) => q.sx != null ? q.sx : q.x).filter((v) => v != null);
      const maxX = Math.max(...xs), firstNip = pts.findIndex((q) => q.z === 'nippon');
      const back = firstNip >= 0 && pts.slice(firstNip).some((q) => q.z === 'hanbando');
      const zonesSeen = [...new Set(pts.map((q) => q.z))];
      row.crossed = tail.z === 'nippon';
      { let mb = 0; for (let i = 1; i < pts.length; i++) if (pts[i].sx != null && pts[i - 1].sx != null && pts[i].z === 'hanbando') mb = Math.max(mb, pts[i - 1].sx - pts[i].sx); row.maxBack = mb; }   // 걷는 동안 서버 x 되끌림 최대(튕김)
      row.maxOver = maxX - C.seam;
      row.bounce = back || (!row.crossed && maxX >= C.seam - 64);
      row.stuckAtSeam = !row.crossed && maxX < C.seam + 8 && maxX >= C.seam - 64;
      row.sameId = pts.length && tail.id === pts[0].id;
      row.zones = zonesSeen.join('→');
      row.recover = clog.filter((l) => /\[recover\]/.test(l)).length;
      row.clientHandoff = clog.filter((l) => /\[handoff\]/.test(l)).length;
      row.notices = tail.n.filter((t) => /경계|넘|존|판/.test(t)).slice(0, 3);
      await browser.close();
      fs.writeFileSync(path.join(OUT, `${plan.name}.trace.json`), JSON.stringify({ C, pts, tail, clog }, null, 0));
    }
    const grab = (p) => p._out.split('\n').filter((l) => /handoff|ACK|prepare|promote|kick|규약|인계|넘기/i.test(l)).slice(0, 40);
    row.logs = {}; for (const p of procs) if (p._name !== 'central') { row.logs[p._name] = grab(p); fs.writeFileSync(path.join(OUT, `${plan.name}.${p._name}.log`), p._out); }
    for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
    await sleep(1500);
    try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {}
    const short = Object.assign({}, row); delete short.logs;
    console.log(JSON.stringify(short, null, 0));
    for (const [z, ls] of Object.entries(row.logs)) for (const l of ls.slice(0, 8)) console.log(`   [${z}] ${l.slice(0, 180)}`);
    rows.push(row);
  }
  fs.writeFileSync(path.join(OUT, 'rows.json'), JSON.stringify(rows, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
