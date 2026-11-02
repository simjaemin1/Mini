#!/usr/bin/env node
// (@regress 없음 — 재는 자 · T1064 첫 5분 화면 감사 · 제품 무변)
// === scripts/t1064-first-five-shots.js — 새 게스트의 첫 5분을 사진으로 · 화면 글자를 표로 ===========================
//
// ★왜 [재민 11-01 · 카드 T1064] "막막하다 · 뭘 해야 할지 모르겠다 · 마을 앞에 스폰되면 제대로 보여 주는 게 없다."
//   첫 5분에 화면이 **무엇을 말하는가**를 잰다 — 사람처럼 로비 「아무 곳이나(추천)」 원클릭으로 들어와
//   **아무것도 누르지 않고** 서 있는다(새 사람이 화면만 보고 아는 것 = 화면이 말한 것).
//   입장(서버 권위 좌표가 온 순간)에서 0 · 10 · 30 · 60 · 180 · 300 초에 사진 한 장 + 화면 글자 한 벌(DOM)을 남긴다.
//
// ★남기는 것(판 하나 = 브라우저 하나 × 창 크기 하나):
//   <out>/<tag>-<browser>-<W>x<H>-<초>s.png  — 사진(로비는 `-lobby`)
//   <out>/<tag>-<browser>-<W>x<H>.json       — 사진마다: 보이는 글자 칸(자리 · 크기 · 글자 크기 · 색) · 겹친 글자 칸 쌍 ·
//                                              알림 꼬리 · 대본 상태(`__onbGet`) · 촌장 말 · 게이트 · 내 자리 · 몸 · 말풍선
//   캔버스에 그린 글자(머리 위 이름 · 말풍선)는 DOM 이 아니라 사진으로만 본다(보고 §1 은 눈으로 판정).
//
// 실행:
//   node scripts/t1064-first-five-shots.js --out /tmp/t1064 --tag before --vw 1440 --vh 900
//   E2E_BROWSER=webkit node scripts/t1064-first-five-shots.js --out /tmp/t1064 --tag before --vw 1280 --vh 720
//   (선택) --times 0,10,30,60,180,300 · --env K=V(존에 싣는 env · 되돌림 판 `--env T1064_NEXT_STEP=0`) · --headed
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');            // ★T349 기동 기다리기 정본
const FixClock = require('./fixture-clock.js');  // ★[T214] 입장 기다리기 정본

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : d; };
const OUT = arg('out', '/tmp/t1064-shots');
const TAG = arg('tag', 'shot');
const VW = +arg('vw', 1440), VH = +arg('vh', 900);
const TIMES = String(arg('times', '0,10,30,60,180,300')).split(',').map(Number);
const BROWSER = (process.env.E2E_BROWSER || 'chromium').toLowerCase();
const HEADED = process.argv.includes('--headed');
const ENVX = {};
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--env' && process.argv[i + 1]) { const [k, ...v] = process.argv[i + 1].split('='); ENVX[k] = v.join('='); }
fs.mkdirSync(OUT, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t1064-central-${process.pid}.db`, ZDB = `/tmp/t1064-zone-${process.pid}.db`;
for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

// 화면 글자 한 벌 — 보이는 글자 칸(제 글자가 있는 요소) · 겹침(조상 · 자손 사이는 뺀다) · 대본 · 알림 · 말풍선
const PROBE = () => {
  const els = [];
  const vis = (el) => {
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return null;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return null;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null;
    }
    return r;
  };
  for (const el of document.querySelectorAll('body *')) {
    if (/^(SCRIPT|STYLE|CANVAS|SVG|PATH|OPTION)$/i.test(el.tagName)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    if (!own) continue;
    const r = vis(el); if (!r) continue;
    const cs = getComputedStyle(el);
    els.push({ el, tag: el.tagName.toLowerCase(), id: el.id || null, cls: (typeof el.className === 'string' && el.className) ? el.className.slice(0, 40) : null,
      text: own.slice(0, 120), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      fs: parseFloat(cs.fontSize), color: cs.color });
  }
  // 가린 글자 — 글자 칸 한가운데에 맨 위로 선 요소가 그 글자(또는 그 조상 · 자손)가 아니면 다른 것이 덮었다(아이콘 · 판 · 지도)
  for (const x of els) {
    const cx = x.x + x.w / 2, cy = x.y + x.h / 2;
    const hit = (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) ? document.elementFromPoint(cx, cy) : null;
    if (hit && hit.tagName !== 'CANVAS' && hit !== x.el && !x.el.contains(hit) && !hit.contains(x.el)) {   // 캔버스는 맨 밑이다(글자 칸이 눌림을 안 받으면 캔버스가 잡힌다 — 가림이 아니다)
      x.coveredBy = (hit.id ? '#' + hit.id : '') + (typeof hit.className === 'string' && hit.className ? '.' + hit.className.split(/\s+/)[0] : '') || hit.tagName.toLowerCase();
    }
  }
  const ov = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;   // 조상 · 자손(한 칸 안의 글자)
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 2 && iy > 2) ov.push({ a: i, b: j, area: ix * iy, at: a.text.slice(0, 30), bt: b.text.slice(0, 30) });
  }
  const g = (k) => { try { return k(); } catch (e) { return null; } };
  return {
    vw: innerWidth, vh: innerHeight,
    texts: els.map(({ el, ...x }) => x), overlaps: ov,
    notices: g(() => (window.__notices || []).slice(-8)),
    onb: g(() => (window.__onbGet ? window.__onbGet() : null)), greet: g(() => window.__onbGreet || null),
    near: g(() => window.__evNearVid), me: g(() => (window.__getSrvAbs ? window.__getSrvAbs() : null)),
    gauges: g(() => (window.__getGauges ? window.__getGauges() : null)),
    vbub: g(() => [...villageBubbles.entries()].map(([k, v]) => [k, v.lines, Math.round(v.until - performance.now())])),
    sbub: g(() => [...speechBubbles.entries()].slice(0, 6).map(([k, v]) => [k, v.text, Math.round(v.until - performance.now())])),
    next: g(() => (window.__t1064Next ? window.__t1064Next() : null)),
    uiCfg: g(() => (typeof uiCfg !== 'undefined' ? { nextStep: uiCfg.nextStep } : null)),
  };
};

(async () => {
  console.log(`\n=== T1064 첫 5분 화면 — ${TAG} · ${BROWSER} · ${VW}×${VH} ===`);
  const cen = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(cen, /central server up on/, { name: 'central' });
  const zon = boot('zone', 'zone.js', Object.assign({ PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1' }, ENVX));
  const zu = FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
  const c0 = await cu, z0 = await zu;
  if (!c0.ok || !z0.ok) { console.log('  ✗ 기동 실패', JSON.stringify([c0, z0]).slice(0, 200)); shutdown(); process.exit(1); }
  await sleep(6000);
  const browser = await require('./e2e-browser').launch({ headless: !HEADED });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e).slice(0, 160)));
  const stem = `${TAG}-${BROWSER}-${VW}x${VH}`;
  const rec = { tag: TAG, browser: BROWSER, vw: VW, vh: VH, env: ENVX, at: new Date().toISOString(), shots: [] };
  const shot = async (name, t) => {
    const f = path.join(OUT, `${stem}-${name}.png`);
    await page.screenshot({ path: f });
    const p = await page.evaluate(PROBE).catch((e) => ({ err: String(e && e.message || e).slice(0, 160) }));
    rec.shots.push({ name, t, file: path.basename(f), wall: new Date().toISOString(), ...p });
    console.log(`  · [${name}] ${path.basename(f)} · 글자 칸 ${p.texts ? p.texts.length : '-'} · 겹침 ${p.overlaps ? p.overlaps.length : '-'} · 알림 ${JSON.stringify((p.notices || []).slice(-2)).slice(0, 120)}`);
  };
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 60; i++) { if (await page.evaluate(() => !!(window.__onbInfo && window.__onbInfo()))) break; await sleep(700); }
  await sleep(1500);
  await shot('lobby', null);
  await page.evaluate(() => window.__onbAny());
  let inWorld = false;
  for (let i = 0; i < 240 && !inWorld; i++) { inWorld = await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs())); if (!inWorld) await sleep(500); }
  if (!inWorld) { const w = await FixClock.waitInWorld(page, { timeoutMs: 60000 }); inWorld = !!(w && w.ok); }
  const t0 = Date.now();
  rec.enteredAt = new Date(t0).toISOString();
  console.log(`  · 입장 ${inWorld ? '○' : '✗'} — 이 순간이 0초`);
  for (const T of TIMES) {
    const wait = t0 + T * 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    await shot(`${String(T).padStart(3, '0')}s`, T);
  }
  rec.pageErrors = errs;
  fs.writeFileSync(path.join(OUT, `${stem}.json`), JSON.stringify(rec, null, 1));
  console.log(`\n  남김: ${path.join(OUT, stem)}-*.png · ${stem}.json · 페이지 오류 ${errs.length}`);
  await browser.close(); shutdown(); process.exit(inWorld ? 0 : 1);
})().catch((e) => { console.log('  ✗ 자 예외: ' + (e && e.stack || e)); shutdown(); process.exit(1); });
