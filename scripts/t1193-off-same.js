#!/usr/bin/env node
// === scripts/t1193-off-same.js — 레티나 2배 손잡이(`T1193_HIDPI`) **끔 판 화면 = 종전 화면(PNG 바이트)** · 켬 판 같은 자리 그림 — 계측 자 · 러너 밖 ==========
//
//   서버 한 벌(이 가지 · 마을 · 도적 · 길 · 짐승 끔 — 움직이는 것 0)에 브라우저 컨텍스트를 차례로 붙인다. 컨텍스트마다 **클라 스크립트(`public/**/*.js`)를
//   어느 뿌리에서 줄지**(종전 = `--base` 뿌리 · 이 가지 = 이 뿌리)와 주소 · 화면 배율(deviceScaleFactor)만 다르고, 게스트 신원은 앞 컨텍스트의 저장소를
//   그대로 넘겨(같은 사람 · 같은 이름표) 같은 자리들(태어난 자리 · 산 하네스 자리 둘)에 같은 확대(1 · 1.5 · 2)로 서서 본 캔버스를 찍는다.
//     결정론 — 물 · 바람 시각 고정(`__terrain19.freezeT` · `windOff`) · 비 0(`__rainForce`) · 산 다 구움(굽는 중 0 · 구운 수 5초 그대로) · 찍기 직전 해 몫 한낮
//       (t912-shots 와 같은 식) + **찍는 동안 페이지 시계(`performance.now`)를 멈춘다**(입장 앞에 거는 갈고리 — 멈춘 값 = 그때 시각이라 뛰지 않는다 ·
//       풀면 그 값에서 이어 간다) · 멈춘 뒤 몸 애니 상태(`_charAnim` — 쌓는 시계라 판마다 갈린다)를 첫 판(t = 0)에 세운다(선 몸 = 서기 첫 판).
//       한 자리에서 두 장(1초 사이 · 시계 멈춤 그대로)을 찍어 **그 자리가 제 스스로 같은지**부터 본다(같지 않으면 바이트 견줌에서 뺀다 — 그대로 적는다).
//   견줌(같은 자리 · 같은 확대 · PNG sha256):
//     base(종전 · 배율 2) ↔ off(이 가지 · 주소 없음 · 배율 2) ↔ off0(`?T1193_HIDPI=0`) ↔ base2(종전 다시 · 맨 끝 — 다시 띄운 것만으로 갈리는지 대조)
//     ★판마다 같은 걸음 — 판 끝에 태어난 자리로 돌아가 닫는다(다음 판이 거기서 들어온다) ⇒ 판마다 태어난 자리 → 자리 둘 차례가 같다
//       (차례가 다르면 같은 종전 코드끼리도 산 비탈 나무 몇 그루가 화소 값 몇으로 갈린다 — 먼저 본 자리의 캐시가 다르다 · 첫 대조 판 실측)
//     ★자리마다 몸 배고픔 · 목마름을 채운다(`__e2e_body` · E2E_GIVE) — 20분 뒤 판(base2)의 이름표 밝기가 갈린 첫 판 실측(보고 T1193 §1)
//     base1(종전 · 배율 1) ↔ on1(`?T1193_HIDPI=1` · 배율 1 — 켬이라도 화면 배율 1 이면 종전 길)
//     on(`?T1193_HIDPI=1` · 배율 2)은 견줌 밖 — 뒤판 2배 그림(보고 그림 · 흐림 표)
// 실행: git worktree add --detach /tmp/t1193-base <종전 커밋> && [E2E_BROWSER=webkit] node scripts/t1193-off-same.js --base /tmp/t1193-base [--out /tmp/t1193/same]
//       [--only base,off,...] [--zooms 1,1.5,2] [--spots 태어난자리,산1@1750:74,산2@2150:1959]
//       [--headed] — 머리 있는 브라우저(WebKit = GTK · `xvfb-run -a -s '-screen 0 2400x1600x24'` 밑에서 — 이 상자의 헤드리스 WebKit(WPE)은 몇 분 안에 웹 프로세스가 죽는다)
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', null);
if (!BASE || !fs.existsSync(path.join(BASE, 'public', 'client'))) { console.log('--base <종전 뿌리>(public/client 가 있는 체크아웃)가 있어야 합니다'); process.exit(2); }
const OUT = arg('--out', '/tmp/t1193/same'); fs.mkdirSync(OUT, { recursive: true });
const ZOOMS = arg('--zooms', '1,1.5,2').split(',').map(Number);
const SPOTS = arg('--spots', '태어난자리,산1@1750:74,산2@2150:1959').split(',');
const ALL = [
  { tag: 'base', root: BASE, q: '', dsf: 2 },
  { tag: 'off', root: ROOT, q: '', dsf: 2 },
  { tag: 'off0', root: ROOT, q: '?T1193_HIDPI=0', dsf: 2 },
  { tag: 'base1', root: BASE, q: '', dsf: 1 },
  { tag: 'on1', root: ROOT, q: '?T1193_HIDPI=1', dsf: 1 },
  { tag: 'on', root: ROOT, q: '?T1193_HIDPI=1', dsf: 2 },
  { tag: 'base2', root: BASE, q: '', dsf: 2 },
];
const ONLY = arg('--only', 'base,off,base1,on1,base2');   // 기본 다섯(off0 · on 은 --only 로)
const VARS = ONLY.split(',').map((t) => ALL.find((v) => v.tag === t)).filter(Boolean);
const PAIRS = [['base', 'off'], ['base', 'off0'], ['base', 'base2'], ['base1', 'on1']];
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t1193s-c-${process.pid}.db`, ZDB = `/tmp/t1193s-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const { PNG } = require('pngjs');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
function pxdiff(fa, fb) {
  const a = PNG.sync.read(fs.readFileSync(fa)), b = PNG.sync.read(fs.readFileSync(fb));
  if (a.width !== b.width || a.height !== b.height) return { err: `크기 다름 ${a.width}x${a.height} · ${b.width}x${b.height}` };
  let n = 0, mx = 0; for (let i = 0; i < a.data.length; i += 4) { const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]), Math.abs(a.data[i + 3] - b.data[i + 3])); if (d) { n++; if (d > mx) mx = d; } }
  return { px: n, pct: +(100 * n / (a.width * a.height)).toFixed(3), max: mx };
}

(async () => {
  console.log(`\n=== T1193 끔 판 = 종전 화면 · 브라우저 ${BR} · 판 ${VARS.map((v) => v.tag).join(' · ')} · 자리 ${SPOTS.join(' · ')} · 확대 ${ZOOMS.join(' · ')} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: !process.argv.includes('--headed') });
  const res = { browser: BR, base: BASE, zooms: ZOOMS, vars: {}, shots: {}, cmp: [] };
  let storage = null, spawnCell = null;
  for (const V of VARS) {
    const t0 = Date.now();
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: V.dsf }, storage ? { storageState: storage } : {}));
    // 클라 스크립트 — 이 판의 뿌리에서(public 아래 .js · 없으면 서버 그대로)
    let served = 0;
    await ctx.route(/^http:\/\/localhost:3010\/[^?#]*\.js(\?[^#]*)?$/, (route) => {
      const u = new URL(route.request().url()); const f = path.join(V.root, 'public', decodeURIComponent(u.pathname));
      if (!fs.existsSync(f)) return route.continue();
      served++; return route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: fs.readFileSync(f) });
    });
    // 페이지 시계 갈고리 — 찍는 동안만 멈춘다(멈춘 값 = 그때 시각 · 풀면 그 값에서 이어 간다 — 시계가 뛰지 않아 고아 감시 · 틱 감시가 안 선다)
    await ctx.addInitScript(() => {
      if (window.__t1193Clock) return;
      const P = performance, real = P.now.bind(P); let off = 0, frozen = null;
      P.now = function () { return frozen != null ? frozen : real() + off; };
      window.__t1193Clock = { freeze() { if (frozen == null) frozen = real() + off; return frozen; }, thaw() { if (frozen == null) return; off = frozen - real(); frozen = null; } };
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text().slice(0, 200)); });
    await page.goto(`http://localhost:${CPORT}/${V.q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
    const en = await page.$('#enter'); if (en) await en.click();
    if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log(`  · ${V.tag}: 입장 실패`); process.exit(1); }
    await sleep(3000);
    await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { window.__terrain19.freezeT = 12.25; window.__terrain19.windOff = true; if (window.__rainForce) window.__rainForce({ precip: 0 }); window.__setZoom(1); return true; });
    const info = await page.evaluate(() => ({ hidpi: window.__hidpiDbg ? window.__hidpiDbg() : null, cv: [canvas.width, canvas.height], dpr: window.devicePixelRatio, ua: navigator.userAgent.slice(0, 90),
      me: window.__getSrvAbs ? (({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }))(window.__getSrvAbs()) : null, zone: window.__getPrimaryZoneId() }));
    if (!spawnCell && info.me) { const zm = await page.evaluate(() => window.__getZonesMeta()[window.__getPrimaryZoneId()] || {});
      spawnCell = [Math.floor((info.me.x - (zm.worldOffsetX || 0)) / 32), Math.floor((info.me.y - (zm.worldOffsetY || 0)) / 32)]; }
    console.log(`  · ${V.tag}: 뿌리 ${V.root === BASE ? '종전' : '이 가지'} · 주소 '${V.q}' · 배율 ${V.dsf} → 캔버스 ${info.cv.join('×')} · 손잡이 ${JSON.stringify(info.hidpi)} · 스크립트 ${served}개 · 자리 ${JSON.stringify(info.me)}`);
    const setDayU = (u) => page.evaluate((uu) => { const dr = worldClock.dayPhaseRatio, L = worldClock.dayLengthMs;
      const p = (((uu * dr) - _lonView) % 1 + 1) % 1; worldClock.epoch = worldNow() - p * L; return +(worldPhase() / dr).toFixed(4); }, u);
    const snap = () => page.evaluate(() => ({ n: _mt3BakeN, jobs: _mt3Jobs.size }));
    const settle = async () => { const t1 = Date.now(); await sleep(3000); let last = await snap(), same = 0;
      while (Date.now() - t1 < 600000) { await sleep(1000); const s = await snap(); if (s.jobs === 0 && s.n === last.n) same++; else same = 0; last = s; if (same >= 5) return Date.now() - t1; } return -1; };
    const tp = (x, y) => page.evaluate(([a, b]) => { window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }); return true; }, [x, y]);
    const tpTo = async (cx, cy) => {   // t912-shots 와 같은 식 — 막힌 칸이면 둘레(반경 8칸)를 가까운 칸부터
      const ring = [[0, 0]]; for (let r = 1; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
      for (const [dx, dy] of ring) {
        const x = (cx + dx) * 32 + 16, y = (cy + dy) * 32 + 16;
        await tp(x, y);
        for (let i = 0; i < 8; i++) { await sleep(700);
          const d = await page.evaluate(([lx, ly]) => { const a = window.__getSrvAbs ? window.__getSrvAbs() : null; const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
            return a ? Math.hypot(a.x - (lx + (z2.worldOffsetX || 0)), a.y - (ly + (z2.worldOffsetY || 0))) : 1e9; }, [x, y]);
          if (d <= 64) return [cx + dx, cy + dy]; }
      }
      return null;
    };
    const frames = (n) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    const shot = async (f) => { const durl = await page.evaluate(() => document.getElementById('canvas').toDataURL('image/png'));
      const b = Buffer.from(String(durl).split(',')[1], 'base64'); fs.writeFileSync(f, b); return sha(b); };
    res.vars[V.tag] = { root: V.root === BASE ? 'base' : 'branch', q: V.q, dsf: V.dsf, info, served };
    for (let nm of SPOTS) {
      const at0 = nm.includes('@') ? nm.split('@')[1].split(':').map(Number) : spawnCell;
      nm = nm.split('@')[0];
      if (!at0) { console.log(`  · ${nm}: 자리 없음`); continue; }
      await page.evaluate(() => { window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: 100, quiet: true }); return true; });   // 몸 상태를 판마다 같게(배고픔 · 목마름 — t926 대본과 같은 문)
      const got = await tpTo(at0[0], at0[1]);
      if (!got) { console.log(`  · ${V.tag} ${nm}: 텔레포트 못 닿음`); continue; }
      await sleep(6000);
      for (const zm of ZOOMS) {
        await page.evaluate((v) => { window.__setZoom(v); needsRedraw = true; return true; }, zm);
        const st = await settle();
        const u = await setDayU(0.5); await sleep(1500);
        const k = `${nm}-z${zm}`, fa = path.join(OUT, `${BR}-${V.tag}-${k}.png`), fb = path.join(OUT, `${BR}-${V.tag}-${k}-b.png`);
        await page.evaluate(() => { window.__t1193Clock.freeze(); return true; }); await frames(3);
        await page.evaluate(() => { for (const st of _charAnim.values()) { st.t = 0; st.one = null; st.oneT = 0; st.lastT = performance.now(); } needsRedraw = true; return true; });
        await frames(3);
        const ha = await shot(fa); await sleep(1000); const hb = await shot(fb);
        await page.evaluate(() => { window.__t1193Clock.thaw(); return true; });
        (res.shots[k] = res.shots[k] || {})[V.tag] = { a: ha, b: hb, self: ha === hb, f: fa, fb, cell: got, settleMs: st, dayU: u };
        console.log(`    ${V.tag} ${k}: ${ha}${ha === hb ? ' (두 장 같음)' : ` ≠ ${hb} (두 장 다름 ${JSON.stringify(pxdiff(fa, fb))})`} · 다 구움 ${st}ms · 칸 ${got.join(',')}`);
      }
      await page.evaluate(() => { window.__setZoom(1); return true; });
    }
    res.vars[V.tag].errs = errs; res.vars[V.tag].sec = Math.round((Date.now() - t0) / 1000);
    if (errs.length) console.log(`  · ${V.tag} 오류 ${errs.length}: ${JSON.stringify(errs.slice(0, 5))}`);
    if (spawnCell) { await tpTo(spawnCell[0], spawnCell[1]); await sleep(3000); }   // 다음 판도 태어난 자리에서 들어온다(같은 걸음)
    storage = await ctx.storageState();
    await ctx.close(); await sleep(3000);
  }
  // 견줌
  let same = 0, diff = 0, skip = 0;
  for (const [A, B] of PAIRS) for (const k of Object.keys(res.shots)) {
    const a = res.shots[k][A], b = res.shots[k][B]; if (!a || !b) continue;
    const r = { pair: `${A}↔${B}`, k, a: a.a, b: b.a };
    if (!a.self || !b.self) { r.verdict = '제 스스로 다름(견줌 밖)'; skip++; }
    else if (a.a === b.a) { r.verdict = '바이트 같음'; same++; }
    else { r.verdict = '다름'; r.px = pxdiff(a.f, b.f); diff++; }
    res.cmp.push(r);
    console.log(`  ${r.pair} ${k}: ${r.verdict}${r.px ? ' ' + JSON.stringify(r.px) : ''}`);
  }
  res.sum = { same, diff, skip };
  console.log(`  → 바이트 같음 ${same} · 다름 ${diff} · 견줌 밖 ${skip}`);
  fs.writeFileSync(path.join(OUT, `${BR}-res.json`), JSON.stringify(res, null, 1));
  console.log(`  → ${path.join(OUT, `${BR}-res.json`)}`);
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
